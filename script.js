/* =========================
  要素
========================= */
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");

const qBtn = document.getElementById("qMode");
const aBtn = document.getElementById("aMode");
const camBtn = document.getElementById("camera-btn");
const clearBtn = document.getElementById("clear-btn");

const qResultsEl = document.getElementById("q-results");
const aResultsEl = document.getElementById("a-results");

/* =========================
  状態
========================= */
let currentMode = "Q";
let stream = null;
let ocrInterval = null;

let lastQNumbers = [];
let savedANumbers = new Map();
let answerHistory = new Set();

let visionApiKey = localStorage.getItem("vision_api_key");

/* =========================
  モード切り替え
========================= */
function setMode(mode) {
    currentMode = mode;

    qBtn.classList.toggle("active", mode === "Q");
    aBtn.classList.toggle("active", mode === "A");
}

qBtn.addEventListener("click", () => setMode("Q"));
aBtn.addEventListener("click", () => setMode("A"));

/* =========================
  APIキー
========================= */
async function askForApiKeyIfNeeded() {
    if (visionApiKey) return;
    const key = prompt("Google Vision API キーを入力してください");
    if (!key) return;
    visionApiKey = key;
    localStorage.setItem("vision_api_key", key);
}

/* =========================
  カメラ起動
========================= */
async function startCamera() {
    try {
        if (stream) stream.getTracks().forEach(t => t.stop());

        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: { exact: "environment" },
                aspectRatio: { ideal: 16 / 9 }
            },
            audio: false
        });

        video.srcObject = stream;
        await video.play();

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

    } catch (e) {
        alert("カメラ起動失敗");
        console.error(e);
    }
}

/* =========================
  キャプチャ
========================= */
function captureFrame() {
    const c = document.createElement("canvas");
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    c.getContext("2d").drawImage(video, 0, 0);
    return c;
}

/* =========================
  OCR（ダミー）
========================= */
async function detectThreeDigitFromCanvas() {
    return []; 
}

/* =========================
  カメラボタン処理
========================= */
function startPress(e) {
    e.preventDefault();
    if (ocrInterval) return;

    camBtn.classList.add("pressing");

    if (currentMode === "Q") {
        runQModeScan();
    } else {
        runAModeScan();
    }

    ocrInterval = setInterval(() => {
        if (currentMode === "Q") runQModeScan();
        else runAModeScan();
    }, 1000);
}

function stopPress() {
    if (!ocrInterval) return;
    clearInterval(ocrInterval);
    ocrInterval = null;
    camBtn.classList.remove("pressing");
}

/* ✅ 確実に動くイベント登録 */
camBtn.onmousedown = startPress;
camBtn.ontouchstart = startPress;

window.onmouseup = stopPress;
window.ontouchend = stopPress;

/* =========================
  Q/Aの中身（ダミー）
========================= */
async function runQModeScan() {
    console.log("Q scan");
}

async function runAModeScan() {
    console.log("A scan");
}

/* =========================
  クリア
========================= */
clearBtn.onclick = () => {
    qResultsEl.innerHTML = "";
    aResultsEl.innerHTML = "";
    lastQNumbers = [];
    answerHistory.clear();
};

/* =========================
  起動
========================= */
window.addEventListener("DOMContentLoaded", async () => {
    await askForApiKeyIfNeeded();
    await startCamera();
    setMode("Q");
});