const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const qBtn = document.getElementById("qMode");
const aBtn = document.getElementById("aMode");
const camBtn = document.getElementById("camera-btn");
const clearBtn = document.getElementById("clear-btn");

let currentMode = "Q";
let stream = null;

let lastQNumbers = [];
let answerHistory = new Set();
const savedANumbers = new Map();

let visionApiKey = null;

const INTERVAL_MS = 1000;

// ---------------- APIキー入力 ----------------
async function askForApiKeyIfNeeded() {
    if (visionApiKey) return;

    visionApiKey = localStorage.getItem("vision_api_key");
    if (visionApiKey) return;

    const key = prompt("Vision API Key を入力してください");
    if (key && key.trim()) {
        visionApiKey = key.trim();
        localStorage.setItem("vision_api_key", visionApiKey);
    }
}

// ---------------- カメラ起動 (Chrome対応) ----------------
async function startCamera() {
    try {
        if (stream) {
            stream.getTracks().forEach(t => t.stop());
        }

        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                aspectRatio: { ideal: 16 / 9 },
                facingMode: { exact: "environment" }
            },
            audio: false
        });

        video.srcObject = stream;
        await video.play();

        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;

        console.log("✅ camera started");

    } catch (e) {
        console.error(e);
        alert("カメラ起動失敗。Chromeの設定 → カメラの権限を確認してください");
    }
}

// ---------------- モード切替 ----------------
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

qBtn.onclick = () => setMode("Q");
aBtn.onclick = () => setMode("A");

// ---------------- 数字正規化 ----------------
function normalizeNumber(raw) {
    if (!raw) return "";
    const zenkaku = { "０":"0","１":"1","２":"2","３":"3","４":"4","５":"5","６":"6","７":"7","８":"8","９":"9" };
    let s = String(raw);
    s = s.replace(/[\uFF10-\uFF19]/g, ch => zenkaku[ch] ?? ch);
    s = s.replace(/[^\d]/g, "");
    return s;
}

// ---------------- Vision API ----------------
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

// ---------------- 3桁抽出 ----------------
function parseTextAnnotationsFor3Digit(textAnn) {
    if (!textAnn || !Array.isArray(textAnn)) return [];

    const out = [];

    for (let i = 1; i < textAnn.length; i++) {
        const ta = textAnn[i];
        if (!ta?.description) continue;

        const num = normalizeNumber(ta.description);
        if (!/^\d{3}$/.test(num)) continue;

        const v = ta.boundingPoly?.vertices || [];
        const x0 = v[0]?.x || 0;
        const y0 = v[0]?.y || 0;
        const x1 = v[1]?.x || x0;
        const y2 = v[2]?.y || y0;

        const w = Math.max(x1 - x0, 8);
        const h = Math.max(y2 - y0, 8);

        out.push({ number: num, x: x0, y: y0, w, h });
    }

    return out;
}

// ---------------- キャプチャ ----------------
function captureVideoFrameToCanvas() {
    const c = document.createElement("canvas");
    c.width = video.videoWidth || canvas.width;
    c.height = video.videoHeight || canvas.height;
    c.getContext("2d").drawImage(video, 0, 0, c.width, c.height);
    return c;
}

// ---------------- OCR ----------------
async function detectThreeDigitFromCanvas(c) {
    const dataUrl = c.toDataURL("image/jpeg", 0.9);
    const base64 = dataUrl.split(",")[1];

    const resp = await callVisionTextDetection(base64);
    if (!resp?.responses?.[0]) return [];

    return parseTextAnnotationsFor3Digit(
        resp.responses[0].textAnnotations
    );
}

// ---------------- Qモード ----------------
async function runQModeScan() {
    const frame = captureVideoFrameToCanvas();
    const detected = await detectThreeDigitFromCanvas(frame);

    const map = new Map();
    detected.forEach(d => { if (!map.has(d.number)) map.set(d.number, d); });

    const unique = [...map.values()];
    lastQNumbers = unique.map(d => d.number);

    const qArea = document.getElementById("q-results");
    qArea.innerHTML = "";

    unique.forEach(item => {
        const wrap = document.createElement("div");
        wrap.className = "quest-item";
        wrap.innerHTML = `<div class="quest-text">${item.number}</div>`;
        qArea.appendChild(wrap);
    });

    syncSavedAnswersToA();
}

// ---------------- Aモード ----------------
async function runAModeScan() {
    const frame = captureVideoFrameToCanvas();
    const detected = await detectThreeDigitFromCanvas(frame);

    const map = new Map();
    detected.forEach(d => { if (!map.has(d.number)) map.set(d.number, d); });

    const unique = [...map.values()];

    unique.forEach(item => {
        const cut = document.createElement("canvas");
        cut.width = item.w;
        cut.height = item.h;

        cut.getContext("2d").drawImage(
            frame,
            item.x, item.y, item.w, item.h,
            0, 0, item.w, item.h
        );

        savedANumbers.set(item.number, cut.toDataURL());
    });
}

// ---------------- 保存済み反映 ----------------
function syncSavedAnswersToA() {
    const aArea = document.getElementById("a-results");

    lastQNumbers.forEach(num => {
        if (!savedANumbers.has(num)) return;
        if (answerHistory.has(num)) return;

        answerHistory.add(num);

        const wrap = document.createElement("div");
        wrap.className = "quest-item";
        wrap.innerHTML = `<div class="quest-text">${num}</div>`;
        aArea.appendChild(wrap);
    });
}

// ---------------- 連写処理 ----------------
async function captureOnce() {
    if (currentMode === "Q") await runQModeScan();
    else await runAModeScan();
}

// ✅ 長押し対応
let ocrInterval = null;
let isPressing = false;

function startPressHandler(e) {
    e.preventDefault();
    if (isPressing) return;
    isPressing = true;

    captureOnce();
    ocrInterval = setInterval(captureOnce, INTERVAL_MS);
}

function endPressHandler() {
    isPressing = false;
    if (ocrInterval) {
        clearInterval(ocrInterval);
        ocrInterval = null;
    }
}

// マウス＆タッチ両対応
camBtn.addEventListener("mousedown", startPressHandler);
camBtn.addEventListener("touchstart", startPressHandler, { passive: false });
document.addEventListener("mouseup", endPressHandler);
camBtn.addEventListener("touchend", endPressHandler);
camBtn.addEventListener("mouseleave", endPressHandler);

// ---------------- クリア ----------------
clearBtn.onclick = () => {
    document.getElementById("q-results").innerHTML = "";
    document.getElementById("a-results").innerHTML = "";
    lastQNumbers = [];
    answerHistory.clear();
};

// ---------------- 初期化 ----------------
window.addEventListener("load", async () => {
    await askForApiKeyIfNeeded();
    await startCamera();
    setMode("Q");
});