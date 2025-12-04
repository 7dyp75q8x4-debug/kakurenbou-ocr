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
const INTERVAL_MS = 1000;  // 長押しは1秒ごとに1回撮影

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
   カメラ起動
===================================================== */
async function startCamera() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false
        });
        video.srcObject = stream;
        await video.play().catch(()=>{});

        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;

    } catch (e) {
        console.error("Camera start error:", e);
        alert("カメラを開始できませんでした: " + (e && e.message ? e.message : e));
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
    if (!visionApiKey) {
        console.warn("Vision API key not set — skipping OCR.");
        return null;
    }
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
        console.error("Vision API call failed:", e);
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

        out.push({
            number: txt,
            x: x0,
            y: y0,
            w: Math.max(x1 - x0, 8),
            h: Math.max(y2 - y0, 8)
        });
    }
    return out;
}

/* canvas → OCR */
async function detectThreeDigitFromCanvas(c) {
    const dataUrl = c.toDataURL("image/jpeg", 0.9);
    const base64 = dataUrl.split(",")[1];
    const resp = await callVisionTextDetection(base64);
    if (!resp?.responses?.[0]) return [];
    return parseTextAnnotationsFor3Digit(resp.responses[0].textAnnotations);
}

/* 動画フレームを一時canvasへコピー */
function captureVideoFrameToCanvas() {
    const c = document.createElement("canvas");
    c.width = video.videoWidth || canvas.width;
    c.height = video.videoHeight || canvas.height;
    c.getContext("2d").drawImage(video, 0, 0, c.width, c.height);
    return c;
}

/* =====================================================
   Qモード（完全・重複排除）
===================================================== */
async function runQModeScan() {
    if (!video.videoWidth) return;

    const frame = captureVideoFrameToCanvas();
    const detected = await detectThreeDigitFromCanvas(frame);

    // ★数字で重複排除（位置ではなく number をキーにする）
    const uniq = new Map();
    for (const d of detected) {
        if (!uniq.has(d.number)) uniq.set(d.number, d);
    }
    const uniqueDetected = Array.from(uniq.values());

    // Q表示を毎回リセット
    qResultsEl.innerHTML = "";
    lastQNumbers = uniqueDetected.map(d => d.number);

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
}

/* =====================================================
   Aモード（重複排除）
===================================================== */
async function runAModeScan() {
    if (!video.videoWidth) return;
    if (!lastQNumbers.length) return;

    const frame = captureVideoFrameToCanvas();
    const detected = await detectThreeDigitFromCanvas(frame);

    const tightTop = 40;
    const tightBottom = 100;
    const tightSide = 25;

    detected.forEach(item => {
        if (!lastQNumbers.includes(item.number)) return;

        const key = `${item.number}_${Math.round(item.x)}_${Math.round(item.y)}`;
        if (answerHistory.has(key)) return;
        answerHistory.add(key);

        const sx = Math.max(item.x - tightSide, 0);
        const sy = Math.max(item.y - tightTop, 0);
        const sw = item.w + tightSide * 2;
        const sh = item.h + tightTop + tightBottom;

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
        txt.style.color = "black";

        wrap.appendChild(img);
        wrap.appendChild(txt);
        aResultsEl.appendChild(wrap);
    });
}

/* =====================================================
   単発キャプチャ
===================================================== */
async function captureOnce() {
    if (currentMode === "Q") await runQModeScan();
    else await runAModeScan();
}

/* =====================================================
   長押し（1秒ごとに1回だけ）
===================================================== */
let ocrInterval = null;

function startPress() {
    if (ocrInterval) return;
    camBtn.classList.add("pressing");

    // ★即時撮影を廃止 → 1秒後から開始
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
window.addEventListener("mouseup", () => stopPress());
camBtn.addEventListener("mouseleave", () => stopPress());

camBtn.addEventListener("touchstart", e => { e.preventDefault(); startPress(); }, { passive: false });
window.addEventListener("touchend", () => stopPress());

camBtn.addEventListener("click", e => e.preventDefault());

/* =====================================================
   ゴミ箱
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
