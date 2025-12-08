/* =====================================================
   全体変数 / 要素取得
===================================================== */
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const qBtn = document.getElementById("qMode");
const aBtn = document.getElementById("aMode");
const camBtn = document.getElementById("camera-btn");
const clearBtn = document.getElementById("clear-btn");

// ★ ガチゴミ箱
const hardClearBtn = document.getElementById("hard-clear-btn");

const qResultsEl = document.getElementById("q-results");
const aResultsEl = document.getElementById("a-results");

let currentMode = "Q";
let stream = null;

let lastQNumbers = [];
let answerHistory = new Set();        // 表示済み管理
const savedANumbers = new Map();      // number -> dataURL

let visionApiKey = localStorage.getItem("vision_api_key");

// 撮影間隔（1秒）
const INTERVAL_MS = 1000;

/* =====================================================
   数字正規化
===================================================== */
function normalizeNumber(raw) {
    if (!raw) return "";
    const zenkaku = {"０":"0","１":"1","２":"2","３":"3","４":"4","５":"5","６":"6","７":"7","８":"8","９":"9"};
    let s = String(raw);
    s = s.replace(/[\uFF10-\uFF19]/g, ch => zenkaku[ch] ?? ch);
    s = s.replace(/[^\d]/g, "");
    return s;
}

/* =====================================================
   APIキー入力
===================================================== */
async function askForApiKeyIfNeeded() {
    if (visionApiKey) return;
    const key = prompt("Google Vision API キーを入力してください");
    if (key && key.trim()) {
        visionApiKey = key.trim();
        localStorage.setItem("vision_api_key", visionApiKey);
        return;
    }
    alert("APIキーが必要です。入力してください。");
    await askForApiKeyIfNeeded();
}

/* =====================================================
   超広角・外カメラ取得
===================================================== */
async function getBackUltraWideCameraId() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(d => d.kind === "videoinput");

    try {
        await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    } catch {}

    const updated = await navigator.mediaDevices.enumerateDevices();
    const cams = updated.filter(d => d.kind === "videoinput");

    const backCams = cams.filter(d =>
        !/front|user|face/i.test(d.label)
    );

    const ultra = backCams.find(d =>
        d.label.includes("0.5") ||
        d.label.toLowerCase().includes("ultra") ||
        d.label.includes("超広角")
    );

    if (ultra) return ultra.deviceId;
    if (backCams[0]) return backCams[0].deviceId;

    return cams[0]?.deviceId || null;
}

/* =====================================================
   カメラ起動
===================================================== */
async function startCamera() {
    try {
        const deviceId = await getBackUltraWideCameraId();
        const isLandscape = window.innerWidth > window.innerHeight;

        const constraints = {
            video: {
                deviceId: deviceId ? { exact: deviceId } : undefined,
                facingMode: { exact: "environment" },
                width: isLandscape ? { ideal: 1920 } : { ideal: 1280 },
                height: isLandscape ? { ideal: 1080 } : { ideal: 720 },
                aspectRatio: isLandscape ? { exact: 16 / 9 } : undefined
            },
            audio: false
        };

        if (stream) {
            stream.getTracks().forEach(t => t.stop());
        }

        stream = await navigator.mediaDevices.getUserMedia(constraints);

        video.srcObject = stream;
        await video.play().catch(()=>{});

        canvas.width = video.videoWidth || (isLandscape ? 1920 : 1280);
        canvas.height = video.videoHeight || (isLandscape ? 1080 : 720);

    } catch (e) {
        console.error("Camera start error:", e);
        alert("外カメラを開始できません: " + (e?.message || e));
    }
}

/* =====================================================
   回転対応
===================================================== */
window.addEventListener("orientationchange", async () => {
    await startCamera();
});

/* =====================================================
   モード切替
===================================================== */
function setMode(mode) {
    currentMode = mode;
    if (mode === "Q") {
        qBtn.classList.add("active");
        aBtn.classList.remove("active");
    } else {
        aBtn.classList.add("active");
        qBtn.classList.remove("active");
    }
}
qBtn.addEventListener("click", () => setMode("Q"));
aBtn.addEventListener("click", () => setMode("A"));

/* =====================================================
   Vision API
===================================================== */
async function callVisionTextDetection(base64Image) {
    if (!visionApiKey) return null;

    const url = `https://vision.googleapis.com/v1/images:annotate?key=${visionApiKey}`;
    const body = {
        requests: [{
            image: { content: base64Image },
            features: [{ type: "TEXT_DETECTION", maxResults: 50 }]
        }]
    };

    try {
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
        return await res.json();
    } catch (e) {
        return null;
    }
}

/* =====================================================
   3桁抽出
===================================================== */
function parseTextAnnotationsFor3Digit(textAnn) {
    if (!textAnn || !Array.isArray(textAnn)) return [];
    const out = [];

    for (let i = 1; i < textAnn.length; i++) {
        const ta = textAnn[i];
        if (!ta?.description) continue;

        const num = normalizeNumber(ta.description);
        if (!/^\d{3}$/.test(num)) continue;

        const verts = ta.boundingPoly?.vertices || [];
        const x0 = verts[0]?.x || 0;
        const y0 = verts[0]?.y || 0;
        const x1 = verts[1]?.x || x0;
        const y2 = verts[2]?.y || y0;

        const w = Math.max(x1 - x0, 8);
        const h = Math.max(y2 - y0, 8);

        out.push({ number: num, x: x0, y: y0, w, h });
    }

    return out;
}

/* =====================================================
   OCR
===================================================== */
async function detectThreeDigitFromCanvas(c) {
    const dataUrl = c.toDataURL("image/jpeg", 0.95);
    const base64 = dataUrl.split(",")[1];

    const resp = await callVisionTextDetection(base64);
    if (!resp?.responses?.[0]) return [];

    return parseTextAnnotationsFor3Digit(resp.responses[0].textAnnotations);
}

/* =====================================================
   フレーム取得
===================================================== */
function captureVideoFrameToCanvas() {
    const c = document.createElement("canvas");
    c.width = video.videoWidth || canvas.width;
    c.height = video.videoHeight || canvas.height;
    c.getContext("2d").drawImage(video, 0, 0, c.width, c.height);
    return c;
}

/* =====================================================
   Qモード
===================================================== */
async function runQModeScan() {
    if (!video.videoWidth) return;

    const frame = captureVideoFrameToCanvas();
    const detected = await detectThreeDigitFromCanvas(frame);

    const map = new Map();
    detected.forEach(d => {
        if (!map.has(d.number)) map.set(d.number, d);
    });
    const unique = [...map.values()];

    lastQNumbers = unique.map(d => d.number);

    qResultsEl.innerHTML = "";

    const margin = 60;

    unique.forEach(item => {
        const sx = Math.max(item.x - margin, 0);
        const sy = Math.max(item.y - margin, 0);
        const sw = item.w + margin * 2;
        const sh = item.h + margin * 2;

        const cut = document.createElement("canvas");
        cut.width = sw;
        cut.height = sh;
        cut.getContext("2d").drawImage(frame, sx, sy, sw, sh, 0, 0, sw, sh);

        const wrap = document.createElement("div");
        wrap.className = "quest-item";

        const img = document.createElement("img");
        img.className = "quest-thumb";
        img.src = cut.toDataURL();

        const txt = document.createElement("div");
        txt.className = "quest-text";
        txt.innerText = item.number;
        txt.style.color = "red";

        wrap.appendChild(img);
        wrap.appendChild(txt);
        qResultsEl.appendChild(wrap);
    });

    syncSavedAnswersToA();
}

/* =====================================================
   Aモード
===================================================== */
async function runAModeScan() {
    if (!video.videoWidth) return;

    const frame = captureVideoFrameToCanvas();
    const detected = await detectThreeDigitFromCanvas(frame);

    const map = new Map();
    detected.forEach(d => {
        if (!map.has(d.number)) map.set(d.number, d);
    });
    const unique = [...map.values()];

    const tightTop = 40;
    const tightBottom = 100;
    const tightSide = 25;

    unique.forEach(item => {
        const sx = Math.max(item.x - tightSide, 0);
        const sy = Math.max(item.y - tightTop, 0);
        const sw = item.w + tightSide * 2;
        const sh = item.h + tightTop + tightBottom;

        const cut = document.createElement("canvas");
        cut.width = sw;
        cut.height = sh;
        cut.getContext("2d").drawImage(frame, sx, sy, sw, sh, 0, 0, sw, sh);

        savedANumbers.set(item.number, cut.toDataURL());

        if (!lastQNumbers.includes(item.number)) return;
        if (answerHistory.has(item.number)) return;

        answerHistory.add(item.number);

        const wrap = document.createElement("div");
        wrap.className = "quest-item";

        const img = document.createElement("img");
        img.className = "quest-thumb";
        img.src = savedANumbers.get(item.number);

        const txt = document.createElement("div");
        txt.className = "quest-text";
        txt.innerText = item.number;
        txt.style.color = "black";

        wrap.appendChild(img);
        wrap.appendChild(txt);
        aResultsEl.appendChild(wrap);
    });
}

/* =====================================================
   Q後に即反映
===================================================== */
function syncSavedAnswersToA() {
    lastQNumbers.forEach(num => {
        if (!savedANumbers.has(num)) return;
        if (answerHistory.has(num)) return;

        answerHistory.add(num);

        const wrap = document.createElement("div");
        wrap.className = "quest-item";

        const img = document.createElement("img");
        img.className = "quest-thumb";
        img.src = savedANumbers.get(num);

        const txt = document.createElement("div");
        txt.className = "quest-text";
        txt.innerText = num;
        txt.style.color = "black";

        wrap.appendChild(img);
        wrap.appendChild(txt);
        aResultsEl.appendChild(wrap);
    });
}

/* =====================================================
   キャプチャ
===================================================== */
async function captureOnce() {
    if (currentMode === "Q") await runQModeScan();
    else await runAModeScan();
}

/* =====================================================
   長押し
===================================================== */
let ocrInterval = null;

function startPress() {
    if (ocrInterval) return;
    camBtn.classList.add("pressing");
    captureOnce();
    ocrInterval = setInterval(() => {
        captureOnce();
    }, INTERVAL_MS);
}

function stopPress() {
    if (!ocrInterval) return;
    camBtn.classList.remove("pressing");
    clearInterval(ocrInterval);
    ocrInterval = null;
}

camBtn.addEventListener("mousedown", e => { e.preventDefault(); startPress(); });
window.addEventListener("mouseup", stopPress);
camBtn.addEventListener("mouseleave", stopPress);
camBtn.addEventListener("touchstart", e => { e.preventDefault(); startPress(); }, { passive: false });
window.addEventListener("touchend", stopPress);
camBtn.addEventListener("click", e => e.preventDefault());

/* =====================================================
   通常クリア
===================================================== */
clearBtn.addEventListener("click", () => {
    qResultsEl.innerHTML = "";
    aResultsEl.innerHTML = "";
    lastQNumbers = [];
    answerHistory.clear();
});

/* =====================================================
   ✅ ガチゴミ箱（完全リセット）復活
===================================================== */
if (hardClearBtn) {
    hardClearBtn.addEventListener("click", () => {
        const ok = confirm("新規でかくれんぼを開始しますか？\n読み取って保存した数字は全てリセットされます");
        if (!ok) return;

        qResultsEl.innerHTML = "";
        aResultsEl.innerHTML = "";
        lastQNumbers = [];
        answerHistory.clear();
        savedANumbers.clear();
    });
}

/* =====================================================
   初期化
===================================================== */
window.addEventListener("DOMContentLoaded", async () => {
    await askForApiKeyIfNeeded();
    await startCamera();
    setMode("Q");
});