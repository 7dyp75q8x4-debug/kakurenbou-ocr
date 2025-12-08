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

// 撮影間隔
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
   iPhone用：超広角カメラ優先
===================================================== */
async function getUltraWideCameraId() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(d => d.kind === "videoinput");

    const ultra = videoDevices.find(d =>
        d.label.includes("0.5") ||
        d.label.toLowerCase().includes("ultra") ||
        d.label.includes("超広角")
    );

    return ultra?.deviceId || videoDevices[0]?.deviceId || null;
}

/* =====================================================
   カメラ起動（横画面時は16:9を強制）
===================================================== */
async function startCamera() {
    try {
        const deviceId = await getUltraWideCameraId();
        const isLandscape = window.innerWidth > window.innerHeight;

        const constraints = {
            video: {
                deviceId: deviceId ? { exact: deviceId } : undefined,
                facingMode: { ideal: "environment" },

                width: isLandscape
                    ? { ideal: 1920 }
                    : { ideal: 1080 },

                height: isLandscape
                    ? { ideal: 1080 }
                    : { ideal: 1920 },

                aspectRatio: isLandscape
                    ? { exact: 16 / 9 }
                    : undefined,

                advanced: [{ zoom: 0 }]
            },
            audio: false
        };

        stream = await navigator.mediaDevices.getUserMedia(constraints);

        video.srcObject = stream;
        await video.play().catch(()=>{});

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

    } catch (e) {
        console.error("Camera error:", e);
    }
}

/* =====================================================
   向きが変わったら再起動
===================================================== */
window.addEventListener("orientationchange", async () => {
    if (stream) stream.getTracks().forEach(t => t.stop());
    await startCamera();
});

/* =====================================================
   モード切替
===================================================== */
function setMode(mode) {
    currentMode = mode;
    qBtn.classList.toggle("active", mode === "Q");
    aBtn.classList.toggle("active", mode === "A");
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
    } catch {
        return null;
    }
}

/* 3桁抽出 */
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

/* =====================================================
   Safari横画面用：16:9に強制トリミング
===================================================== */
function captureVideoFrameToCanvas() {
    const srcW = video.videoWidth;
    const srcH = video.videoHeight;

    const isLandscape = window.innerWidth > window.innerHeight;

    if (!isLandscape) {
        const c = document.createElement("canvas");
        c.width = srcW;
        c.height = srcH;
        c.getContext("2d").drawImage(video, 0, 0, srcW, srcH);
        return c;
    }

    const targetRatio = 16 / 9;
    const srcRatio = srcW / srcH;

    let sx = 0, sy = 0, sw = srcW, sh = srcH;

    if (srcRatio > targetRatio) {
        sw = Math.floor(srcH * targetRatio);
        sx = Math.floor((srcW - sw) / 2);
    } else if (srcRatio < targetRatio) {
        sh = Math.floor(srcW / targetRatio);
        sy = Math.floor((srcH - sh) / 2);
    }

    const c = document.createElement("canvas");
    c.width = sw;
    c.height = sh;

    c.getContext("2d").drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
    return c;
}

/* canvas → OCR */
async function detectThreeDigitFromCanvas(c) {
    const dataUrl = c.toDataURL("image/jpeg", 0.9);
    const base64 = dataUrl.split(",")[1];

    const resp = await callVisionTextDetection(base64);
    if (!resp?.responses?.[0]) return [];

    const textAnn = resp.responses[0].textAnnotations;
    return parseTextAnnotationsFor3Digit(textAnn);
}

/* =====================================================
   Qモード
===================================================== */
async function runQModeScan() {
    if (!video.videoWidth) return;

    const frame = captureVideoFrameToCanvas();
    const detected = await detectThreeDigitFromCanvas(frame);

    const uniqueMap = new Map();
    detected.forEach(i => uniqueMap.set(i.number, i));

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
        txt.textContent = item.number;
        txt.style.color = "red";

        wrapper.appendChild(img);
        wrapper.appendChild(txt);
        qResultsEl.appendChild(wrapper);
    });
}

/* =====================================================
   Aモード
===================================================== */
async function runAModeScan() {
    if (!video.videoWidth) return;
    if (!lastQNumbers.length) return;

    const frame = captureVideoFrameToCanvas();
    const detected = await detectThreeDigitFromCanvas(frame);

    const uniqueMap = new Map();
    detected.forEach(i => uniqueMap.set(i.number, i));
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
        txt.textContent = item.number;
        txt.style.color = "black";

        wrapper.appendChild(img);
        wrapper.appendChild(txt);
        aResultsEl.appendChild(wrapper);
    });
}

/* =====================================================
   単発
===================================================== */
async function captureOnce() {
    if (currentMode === "Q") {
        await runQModeScan();
    } else {
        await runAModeScan();
    }
}

/* =====================================================
   長押し
===================================================== */
let ocrInterval = null;

function startPress() {
    if (ocrInterval) return;
    camBtn.classList.add("pressing");
    captureOnce();
    ocrInterval = setInterval(captureOnce, INTERVAL_MS);
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