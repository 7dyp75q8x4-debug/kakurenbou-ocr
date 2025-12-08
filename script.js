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

// Aモードで認識した数字保存（完全履歴）
let savedNumbers = new Set();

let visionApiKey = localStorage.getItem("vision_api_key");
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
   カメラ起動
===================================================== */
async function startCamera() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: "environment" } },
            audio: false
        });
        video.srcObject = stream;
        await video.play().catch(()=>{});
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
    } catch (e) {
        alert("カメラ起動に失敗しました");
    }
}

/* =====================================================
   モード
===================================================== */
function setMode(mode) {
    currentMode = mode;
    qBtn.classList.toggle("active", mode === "Q");
    aBtn.classList.toggle("active", mode === "A");
}

qBtn.onclick = () => setMode("Q");
aBtn.onclick = () => setMode("A");

/* =====================================================
   Vision API
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

/* =====================================================
   3桁抽出
===================================================== */
function parseTextAnnotationsFor3Digit(textAnn) {
    const out = [];
    if (!textAnn) return out;

    for (let i = 1; i < textAnn.length; i++) {
        const t = textAnn[i]?.description?.trim();
        if (!/^\d{3}$/.test(t)) continue;

        const v = textAnn[i].boundingPoly?.vertices || [];
        const x0 = v[0]?.x || 0;
        const y0 = v[0]?.y || 0;
        const x1 = v[1]?.x || x0;
        const y2 = v[2]?.y || y0;

        out.push({ number: t, x: x0, y: y0, w: x1-x0, h: y2-y0 });
    }
    return out;
}

/* =====================================================
   OCR
===================================================== */
async function detectThreeDigitFromCanvas(c) {
    const base64 = c.toDataURL("image/jpeg", 0.95).split(",")[1];
    const r = await callVisionTextDetection(base64);
    return parseTextAnnotationsFor3Digit(r?.responses?.[0]?.textAnnotations);
}

/* =====================================================
   キャプチャ
===================================================== */
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
    const det = await detectThreeDigitFromCanvas(frame);

    const map = new Map();
    det.forEach(d => map.set(d.number, d));
    const list = [...map.values()];
    lastQNumbers = list.map(d => d.number);

    qResultsEl.innerHTML = "";

    list.forEach(item => {
        const cut = cropImage(frame, item, 70, 70, 70);
        renderBlock(qResultsEl, cut, item.number, "red");
    });

    // ★ savedNumbers だけで A 表示
    autoFillAFromQOnly();
}

/* =====================================================
   Aモード
===================================================== */
async function runAModeScan() {
    const frame = captureVideoFrameToCanvas();
    const det = await detectThreeDigitFromCanvas(frame);

    const map = new Map();
    det.forEach(d => map.set(d.number, d));
    const list = [...map.values()];

    list.forEach(item => {
        if (!lastQNumbers.includes(item.number)) return;
        savedNumbers.add(item.number);

        if (answerHistory.has(item.number)) return;
        answerHistory.add(item.number);

        const cut = cropImage(frame, item, 70, 70, 70);
        renderBlock(aResultsEl, cut, item.number, "black");
    });
}

/* =====================================================
   完全一致トリミング関数（旧サイズ）
===================================================== */
function cropImage(frame, item, side, top, bottom) {
    const sx = Math.max(item.x - side, 0);
    const sy = Math.max(item.y - top, 0);
    const sw = item.w + side*2;
    const sh = item.h + top + bottom;

    const c = document.createElement("canvas");
    c.width = sw;
    c.height = sh;
    c.getContext("2d").drawImage(frame, sx, sy, sw, sh, 0, 0, sw, sh);

    return c.toDataURL();
}

/* =====================================================
   描画
===================================================== */
function renderBlock(parent, imgSrc, number, color) {
    const w = document.createElement("div");
    w.className = "quest-item";

    const img = document.createElement("img");
    img.className = "quest-thumb";
    img.src = imgSrc;

    const t = document.createElement("div");
    t.className = "quest-text";
    t.textContent = number;
    t.style.color = color;

    w.appendChild(img);
    w.appendChild(t);
    parent.appendChild(w);
}

/* =====================================================
   QのみでA生成
===================================================== */
function autoFillAFromQOnly() {
    aResultsEl.innerHTML = "";
    lastQNumbers.forEach(n => {
        if (!savedNumbers.has(n)) return;
        if (answerHistory.has(n)) return;

        answerHistory.add(n);

        const w = document.createElement("div");
        w.className = "quest-item";

        const dummy = document.createElement("div");
        dummy.className = "quest-thumb";

        const t = document.createElement("div");
        t.className = "quest-text";
        t.textContent = n;

        w.appendChild(dummy);
        w.appendChild(t);
        aResultsEl.appendChild(w);
    });
}

/* =====================================================
   ボタン
===================================================== */
async function captureOnce() {
    if (currentMode === "Q") runQModeScan();
    else runAModeScan();
}

let ocrInterval = null;
function startPress() {
    if (ocrInterval) return;
    camBtn.classList.add("pressing");
    captureOnce();
    ocrInterval = setInterval(captureOnce, INTERVAL_MS);
}
function stopPress() {
    camBtn.classList.remove("pressing");
    clearInterval(ocrInterval);
    ocrInterval = null;
}

camBtn.onmousedown = e => { e.preventDefault(); startPress(); };
window.onmouseup = stopPress;
camBtn.ontouchstart = e => { e.preventDefault(); startPress(); };
window.ontouchend = stopPress;

/* =====================================================
   クリア
===================================================== */
clearBtn.onclick = () => {
    qResultsEl.innerHTML = "";
    aResultsEl.innerHTML = "";
    lastQNumbers = [];
    answerHistory.clear();
};

hardClearBtn.onclick = () => {
    if (!confirm("完全リセットしますか？")) return;
    qResultsEl.innerHTML = "";
    aResultsEl.innerHTML = "";
    lastQNumbers = [];
    answerHistory.clear();
    savedNumbers.clear();
};

/* =====================================================
   初期化
===================================================== */
addEventListener("DOMContentLoaded", async () => {
    await askForApiKeyIfNeeded();
    await startCamera();
    setMode("Q");
});