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
let answerHistory = new Set();

let visionApiKey = localStorage.getItem("vision_api_key");

// 撮影間隔（1秒）
const INTERVAL_MS = 1000;

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
   外カメラ（超広角優先・内カメラ除外）
   - 可能な場合ラベルで0.5/ultra/超広角を優先
   - ラベル取得のため一度 getUserMedia を呼んでから enumerateDevices
===================================================== */
async function getBackUltraWideCameraId() {
    try {
        // 権限付与してラベルを取得しやすくする（失敗しても続行）
        await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    } catch (e) {
        // ignore
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter(d => d.kind === "videoinput");

    // back cameras = exclude front/user/face
    const back = cams.filter(d => !/front|user|face/i.test(d.label));

    const ultra = back.find(d =>
        (d.label || "").includes("0.5") ||
        (d.label || "").toLowerCase().includes("ultra") ||
        (d.label || "").includes("超広角")
    );

    if (ultra) return ultra.deviceId;
    if (back[0]) return back[0].deviceId;
    return cams[0]?.deviceId || null;
}

/* =====================================================
   カメラ起動（横画面16:9 + 外カメラ優先）
===================================================== */
async function startCamera() {
    try {
        const deviceId = await getBackUltraWideCameraId();
        const isLandscape = window.innerWidth > window.innerHeight;

        const constraints = {
            video: {
                deviceId: deviceId ? { exact: deviceId } : undefined,
                facingMode: { ideal: "environment" },
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
        alert("カメラを開始できませんでした: " + (e?.message || e));
    }
}

/* =====================================================
   向きが変わったら再起動（16:9維持）
===================================================== */
window.addEventListener("orientationchange", async () => {
    if (stream) {
        stream.getTracks().forEach(t => t.stop());
    }
    await startCamera();
});

/* =====================================================
   モード切替（トグル確実に働くよう click handler）
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
   Vision API 呼び出し
===================================================== */
async function callVisionTextDetection(base64Image) {
    if (!visionApiKey) {
        console.warn("Vision API key not set — skipping OCR.");
        return null;
    }
    const url = `https://vision.googleapis.com/v1/images:annotate?key=${visionApiKey}`;
    const body = {
        requests: [
            {
                image: { content: base64Image },
                features: [{ type: "TEXT_DETECTION", maxResults: 50 }]
            }
        ]
    };
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
        return await res.json();
    } catch (e) {
        console.error("Vision API call failed:", e);
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
        const txt = ta.description.trim();
        if (!/^\d{3}$/.test(txt)) continue;

        const verts = ta.boundingPoly?.vertices || [];
        const x0 = verts[0]?.x || 0;
        const y0 = verts[0]?.y || 0;
        const x1 = verts[1]?.x || x0;
        const y2 = verts[2]?.y || y0;
        const w = Math.max(x1 - x0, 8);
        const h = Math.max(y2 - y0, 8);

        out.push({ number: txt, x: x0, y: y0, w, h });
    }
    return out;
}

/* canvas → OCR */
async function detectThreeDigitFromCanvas(c) {
    const dataUrl = c.toDataURL("image/jpeg", 0.9);
    const base64 = dataUrl.split(",")[1];
    const resp = await callVisionTextDetection(base64);
    if (!resp?.responses?.[0]) return [];
    const textAnn = resp.responses[0].textAnnotations;
    if (!textAnn) return [];
    return parseTextAnnotationsFor3Digit(textAnn);
}

/* フレームコピー */
function captureVideoFrameToCanvas() {
    const c = document.createElement("canvas");
    c.width = video.videoWidth || canvas.width;
    c.height = video.videoHeight || canvas.height;
    c.getContext("2d").drawImage(video, 0, 0, c.width, c.height);
    return c;
}

/* =====================================================
   Qモード（元の表示サイズで出す）
===================================================== */
async function runQModeScan() {
    if (!video.videoWidth) return;

    const frame = captureVideoFrameToCanvas();
    const detected = await detectThreeDigitFromCanvas(frame);

    const uniqueMap = new Map();
    detected.forEach(item => {
        if (!uniqueMap.has(item.number)) uniqueMap.set(item.number, item);
    });
    const uniqueDetected = [...uniqueMap.values()];

    lastQNumbers = uniqueDetected.map(d => d.number);
    qResultsEl.innerHTML = "";
    const margin = 60;

    uniqueDetected.forEach(item => {
        const sx = Math.max(item.x - margin, 0);
        const sy = Math.max(item.y - margin, 0);
        const sw = item.w + margin * 2;
        const sh = item.h + margin * 2;

        const cut = document.createElement("canvas");
        cut.width = sw;
        cut.height = sh;
        cut.getContext("2d").drawImage(frame, sx, sy, sw, sh, 0, 0, sw, sh);

        const wrapper = document.createElement("div");
        wrapper.className = "quest-item";

        const img = document.createElement("img");
        img.className = "quest-thumb";
        img.src = cut.toDataURL();

        const txt = document.createElement("div");
        txt.className = "quest-text";
        txt.innerText = item.number;
        txt.style.color = "red";

        wrapper.appendChild(img);
        wrapper.appendChild(txt);
        qResultsEl.appendChild(wrapper);
    });
}

/* =====================================================
   Aモード（元の振る舞いを維持）
===================================================== */
async function runAModeScan() {
    if (!video.videoWidth) return;
    if (lastQNumbers.length === 0) return;

    const frame = captureVideoFrameToCanvas();
    const detected = await detectThreeDigitFromCanvas(frame);

    const uniqueMap = new Map();
    detected.forEach(item => {
        if (!uniqueMap.has(item.number)) uniqueMap.set(item.number, item);
    });
    const uniqueDetected = [...uniqueMap.values()];

    const tightTop = 40;
    const tightBottom = 100;
    const tightSide = 25;

    uniqueDetected.forEach(item => {
        if (!lastQNumbers.includes(item.number)) return;
        if (answerHistory.has(item.number)) return;
        answerHistory.add(item.number);

        const sx = Math.max(item.x - tightSide, 0);
        const sy = Math.max(item.y - tightTop, 0);
        const sw = item.w + tightSide * 2;
        const sh = item.h + tightTop + tightBottom;

        const cut = document.createElement("canvas");
        cut.width = sw;
        cut.height = sh;
        cut.getContext("2d").drawImage(frame, sx, sy, sw, sh, 0, 0, sw, sh);

        const wrapper = document.createElement("div");
        wrapper.className = "quest-item";

        const img = document.createElement("img");
        img.className = "quest-thumb";
        img.src = cut.toDataURL();

        const txt = document.createElement("div");
        txt.className = "quest-text";
        txt.innerText = item.number;
        txt.style.color = "black";

        wrapper.appendChild(img);
        wrapper.appendChild(txt);
        aResultsEl.appendChild(wrapper);
    });
}

/* =====================================================
   単発キャプチャ
===================================================== */
async function captureOnce() {
    if (currentMode === "Q") {
        await runQModeScan();
    } else {
        await runAModeScan();
    }
}

/* =====================================================
   長押し（1秒間隔）
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

camBtn.addEventListener("click", e => e.preventDefault()); // 防止フォーカス移動

/* =====================================================
   クリア
===================================================== */
clearBtn.addEventListener("click", () => {
    qResultsEl.innerHTML = "";
    aResultsEl.innerHTML = "";
    lastQNumbers = [];
    answerHistory.clear();
});

/* =====================================================
   初期化
===================================================== */
window.addEventListener("DOMContentLoaded", async () => {
    await askForApiKeyIfNeeded();
    await startCamera();
    setMode("Q");
});