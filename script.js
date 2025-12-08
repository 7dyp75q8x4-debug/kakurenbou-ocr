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
const savedANumbers = new Map();      

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
   カメラ（外カメラ + 縦横固定）
===================================================== */
async function startCamera() {
    try {
        if (stream) stream.getTracks().forEach(t => t.stop());

        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: { exact: "environment" },
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
    }
}

/* =====================================================
   モード
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

qBtn.onclick = () => setMode("Q");
aBtn.onclick = () => setMode("A");

/* =====================================================
   ボタンの押下保険
===================================================== */
qBtn.style.pointerEvents = "auto";
aBtn.style.pointerEvents = "auto";

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
    await startCamera();
    setMode("Q");
});