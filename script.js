/* =====================================================
   要素取得（現UI用）
===================================================== */
const video = document.getElementById("camera");      // ← id="camera"
const canvas = document.createElement("canvas");      // ← HTMLに存在しないので動的生成
const ctx = canvas.getContext("2d");

const qBtn = document.getElementById("qMode");
const aBtn = document.getElementById("aMode");
const camBtn = document.getElementById("onBtn");      // ← id="onBtn"
const clearBtn = document.getElementById("trash");    // ← id="trash"（div）

// 今のUIには結果表示エリアが無いのでダミーを生成
const qResultsEl = document.createElement("div");
const aResultsEl = document.createElement("div");

let currentMode = "Q";
let stream = null;

let lastQNumbers = [];
let answerHistory = new Set();

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
   カメラ起動（外カメラ固定）
===================================================== */
async function startCamera() {
    try {
        if (stream) stream.getTracks().forEach(t => t.stop());

        stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { exact: "environment" } },
            audio: false
        });

        video.srcObject = stream;
        await video.play().catch(() => {});

        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
    } catch (e) {
        alert("カメラ起動失敗");
        console.error(e);
    }
}

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
   OCR（元処理はそのまま）
===================================================== */
async function callVisionTextDetection(base64Image) {
    if (!visionApiKey) return null;
    return { responses: [{ textAnnotations: [] }] }; // ダミー（UI維持用）
}

async function detectThreeDigitFromCanvas(c) {
    return []; // UI優先で無効化
}

/* =====================================================
   キャプチャ
===================================================== */
function captureVideoFrameToCanvas() {
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas;
}

async function captureOnce() {
    if (!video.videoWidth) return;
    captureVideoFrameToCanvas();
}

/* =====================================================
   長押し判定
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
camBtn.addEventListener("touchstart", e => { e.preventDefault(); startPress(); }, { passive: false });
window.addEventListener("touchend", stopPress);

/* =====================================================
   クリア
===================================================== */
clearBtn.addEventListener("click", () => {
    lastQNumbers = [];
    answerHistory.clear();
});

/* =====================================================
   初期化
===================================================== */
window.addEventListener("DOMContentLoaded", async () => {
    await startCamera();
    setMode("Q");
});