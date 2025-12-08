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
const hardClearBtn = document.getElementById("hard-clear-btn");

const qResultsEl = document.getElementById("q-results");
const aResultsEl = document.getElementById("a-results");

let currentMode = "Q";
let stream = null;

let lastQNumbers = [];
let answerHistory = new Set();

// ✅ Aで一度でも見えた数字を全保存
let savedNumbers = new Map(); // number -> {x,y,w,h,imageData}

let visionApiKey = localStorage.getItem("vision_api_key");

const INTERVAL_MS = 1000;

/* =====================================================
   APIキー
===================================================== */
async function askForApiKeyIfNeeded() {
    if (visionApiKey) return;
    const key = prompt("Google Vision API キーを入力してください");
    if (key && key.trim()) {
        visionApiKey = key.trim();
        localStorage.setItem("vision_api_key", visionApiKey);
        return;
    }
    alert("APIキーが必要です。");
    await askForApiKeyIfNeeded();
}

/* =====================================================
   カメラ
===================================================== */
async function startCamera() {
    const deviceId = await getUltraWideCameraId();
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                deviceId: deviceId ? { exact: deviceId } : undefined,
                facingMode: { ideal: "environment" }
            },
            audio: false
        });

        video.srcObject = stream;
        await video.play().catch(()=>{});

        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
    } catch(e) {
        alert("カメラ起動失敗");
        console.error(e);
    }
}

async function getUltraWideCameraId() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videos = devices.filter(d => d.kind === "videoinput");
    return videos[0]?.deviceId || null;
}

/* =====================================================
   OCR
===================================================== */
async function callVisionTextDetection(base64Image) {
    if (!visionApiKey) return null;

    const url = `https://vision.googleapis.com/v1/images:annotate?key=${visionApiKey}`;
    const body = {
        requests: [{
            image: { content: base64Image },
            features: [{ type: "TEXT_DETECTION", maxResults: 100 }]
        }]
    };

    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });

    return await res.json();
}

function parseTextAnnotationsFor3Digit(textAnn) {
    if (!Array.isArray(textAnn)) return [];

    const out = [];
    for (let i = 1; i < textAnn.length; i++) {
        const t = textAnn[i];
        if (!t?.description) continue;

        const txt = t.description.trim();
        if (!/^\d{3}$/.test(txt)) continue;

        const v = t.boundingPoly?.vertices || [];
        const x0 = v[0]?.x || 0;
        const y0 = v[0]?.y || 0;
        const x1 = v[1]?.x || x0;
        const y2 = v[2]?.y || y0;

        out.push({
            number: txt,
            x: x0, y: y0,
            w: Math.max(x1 - x0, 10),
            h: Math.max(y2 - y0, 10)
        });
    }
    return out;
}

async function detectThreeDigitFromCanvas(c) {
    const dataUrl = c.toDataURL("image/jpeg", 0.95);
    const base64 = dataUrl.split(",")[1];
    const resp = await callVisionTextDetection(base64);
    return parseTextAnnotationsFor3Digit(resp?.responses?.[0]?.textAnnotations);
}

function captureVideoFrameToCanvas() {
    const c = document.createElement("canvas");
    c.width = video.videoWidth || 1280;
    c.height = video.videoHeight || 720;
    c.getContext("2d").drawImage(video, 0, 0, c.width, c.height);
    return c;
}

/* =====================================================
   Qモード
===================================================== */
async function runQModeScan() {
    const frame = captureVideoFrameToCanvas();
    const detected = await detectThreeDigitFromCanvas(frame);

    qResultsEl.innerHTML = "";
    lastQNumbers = detected.map(d => d.number);

    const margin = 60;

    detected.forEach(item => {
        const sx = Math.max(item.x - margin, 0);
        const sy = Math.max(item.y - margin, 0);
        const sw = item.w + margin * 2;
        const sh = item.h + margin * 2;

        const cut = document.createElement("canvas");
        cut.width = sw;
        cut.height = sh;
        cut.getContext("2d").drawImage(frame, sx, sy, sw, sh, 0, 0, sw, sh);

        const box = document.createElement("div");
        box.className = "quest-item";

        const img = document.createElement("img");
        img.className = "quest-thumb";
        img.src = cut.toDataURL();

        const txt = document.createElement("div");
        txt.className = "quest-text";
        txt.style.color = "red";
        txt.innerText = item.number;

        box.appendChild(img);
        box.appendChild(txt);
        qResultsEl.appendChild(box);

        // ✅ ここで保存済みと一致したら即A表示
        if (savedNumbers.has(item.number) && !answerHistory.has(item.number)) {
            answerHistory.add(item.number);
            const saved = savedNumbers.get(item.number);
            renderAFromSaved(saved);
        }
    });
}

/* =====================================================
   Aモード
===================================================== */
async function runAModeScan() {
    const frame = captureVideoFrameToCanvas();
    const detected = await detectThreeDigitFromCanvas(frame);

    detected.forEach(item => {
        // ✅ Qに関係なく丸ごと保存
        if (!savedNumbers.has(item.number)) {
            const cut = cropAImage(item, frame);
            savedNumbers.set(item.number, {
                number: item.number,
                image: cut
            });
        }

        // ✅ 今のお題に含まれていたら即表示
        if (lastQNumbers.includes(item.number) && !answerHistory.has(item.number)) {
            answerHistory.add(item.number);
            renderAResult(item, frame, 25, 40, 100);
        }
    });
}

/* =====================================================
   切り抜き
===================================================== */
function cropAImage(item, frame) {
    const side = 25, top = 40, bottom = 100;
    const sx = Math.max(item.x - side, 0);
    const sy = Math.max(item.y - top, 0);
    const sw = item.w + side * 2;
    const sh = item.h + top + bottom;

    const cut = document.createElement("canvas");
    cut.width = sw;
    cut.height = sh;
    cut.getContext("2d").drawImage(frame, sx, sy, sw, sh, 0, 0, sw, sh);
    return cut.toDataURL();
}

function renderAFromSaved(saved) {
    const box = document.createElement("div");
    box.className = "quest-item";

    const img = document.createElement("img");
    img.className = "quest-thumb";
    img.src = saved.image;

    const txt = document.createElement("div");
    txt.className = "quest-text";
    txt.style.color = "black";
    txt.innerText = saved.number;

    box.appendChild(img);
    box.appendChild(txt);
    aResultsEl.appendChild(box);
}

function renderAResult(item, frame, side, top, bottom) {
    const cutUrl = cropAImage(item, frame);
    renderAFromSaved({ number: item.number, image: cutUrl });
}

/* =====================================================
   キャプチャ
===================================================== */
async function captureOnce() {
    if (currentMode === "Q") await runQModeScan();
    else await runAModeScan();
}

/* =====================================================
   押下
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

hardClearBtn.addEventListener("click", () => {
    if (!confirm("新規でかくれんぼを開始しますか？\n全てリセットされます")) return;

    qResultsEl.innerHTML = "";
    aResultsEl.innerHTML = "";
    lastQNumbers = [];
    answerHistory.clear();
    savedNumbers.clear();
});

/* =====================================================
   初期化
===================================================== */
window.addEventListener("DOMContentLoaded", async () => {
    await askForApiKeyIfNeeded();
    await startCamera();
    setMode("Q");
});

function setMode(mode) {
    currentMode = mode;
    qBtn.classList.toggle("active", mode === "Q");
    aBtn.classList.toggle("active", mode === "A");
}