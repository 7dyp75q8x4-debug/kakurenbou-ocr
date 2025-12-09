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

const qResultsEl = document.getElementById("q-results");
const aResultsEl = document.getElementById("a-results");

let currentMode = "Q";
let stream = null;

let lastQNumbers = [];

// ✅ Aモードの保存領域（数字＋画像）
let savedAData = [];    // [{ number, image }]

let visionApiKey = localStorage.getItem("vision_api_key");

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
   外カメラ取得
===================================================== */
async function getBackCameraId() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter(d => d.kind === "videoinput");

    const backCams = cams.filter(d => !/front|user|face/i.test(d.label));
    return backCams[0]?.deviceId || cams[0]?.deviceId || null;
}

/* =====================================================
   カメラ起動（16:9固定）
===================================================== */
async function startCamera() {
    try {
        if (stream) stream.getTracks().forEach(t => t.stop());

        const deviceId = await getBackCameraId();

        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                deviceId: deviceId ? { exact: deviceId } : undefined,
                facingMode: { ideal: "environment" },
                aspectRatio: { exact: 16 / 9 }
            },
            audio: false
        });

        video.srcObject = stream;
        await video.play().catch(() => {});

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

    } catch (e) {
        alert("カメラ起動に失敗しました");
        console.error(e);
    }
}

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
    } catch {
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

    // ✅ A保存データと一致するものを表示
    syncSavedAToQ();
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

    const top = 40;
    const bottom = 100;
    const side = 25;

    unique.forEach(item => {
        if (savedAData.some(d => d.number === item.number)) return;

        const sx = Math.max(item.x - side, 0);
        const sy = Math.max(item.y - top, 0);
        const sw = item.w + side * 2;
        const sh = item.h + top + bottom;

        const cut = document.createElement("canvas");
        cut.width = sw;
        cut.height = sh;
        cut.getContext("2d").drawImage(frame, sx, sy, sw, sh, 0, 0, sw, sh);

        const dataUrl = cut.toDataURL("image/jpeg");

        // ✅ 保存
        savedAData.push({
            number: item.number,
            image: dataUrl
        });

        // ✅ A画面に表示
        const wrap = document.createElement("div");
        wrap.className = "quest-item";

        const img = document.createElement("img");
        img.className = "quest-thumb";
        img.src = dataUrl;

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
   A保存 → Q反映
===================================================== */
function syncSavedAToQ() {
    lastQNumbers.forEach(num => {
        const match = savedAData.find(d => d.number === num);
        if (!match) return;

        const wrap = document.createElement("div");
        wrap.className = "quest-item";

        const img = document.createElement("img");
        img.className = "quest-thumb";
        img.src = match.image;

        const txt = document.createElement("div");
        txt.className = "quest-text";
        txt.innerText = num;
        txt.style.color = "black";

        wrap.appendChild(img);
        wrap.appendChild(txt);
        qResultsEl.appendChild(wrap);
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
   ボタン長押し
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

camBtn.addEventListener("touchstart", e => {
    e.preventDefault();
    startPress();
}, { passive: false });

window.addEventListener("touchend", stopPress);
camBtn.addEventListener("click", e => e.preventDefault());

/* =====================================================
   クリア
===================================================== */
clearBtn.addEventListener("click", () => {
    qResultsEl.innerHTML = "";
    aResultsEl.innerHTML = "";
    lastQNumbers = [];
    savedAData = [];
});

/* =====================================================
   初期化
===================================================== */
window.addEventListener("DOMContentLoaded", async () => {
    await askForApiKeyIfNeeded();
    await startCamera();
    setMode("Q");
});