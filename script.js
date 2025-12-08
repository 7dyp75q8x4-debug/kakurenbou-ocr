/* =====================================================
   全体変数 / 要素取得
===================================================== */
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");

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

// 「正規化済み数字」→「画像dataURL」
let savedNumbers = new Map();

let visionApiKey = localStorage.getItem("vision_api_key");
const INTERVAL_MS = 1000;

/* =====================================================
   数字の正規化（全角/空白/不可視全部除去）
===================================================== */
function normalizeNumber(str) {
    return str
        .replace(/[^\d]/g, "") // 数字以外除去
        .trim();
}

/* =====================================================
   APIキー
===================================================== */
async function askForApiKeyIfNeeded() {
    if (visionApiKey) return;
    const key = prompt("Google Vision API キーを入力してください");
    if (key) {
        visionApiKey = key.trim();
        localStorage.setItem("vision_api_key", visionApiKey);
    }
}

/* =====================================================
   カメラ
===================================================== */
async function startCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
    await video.play();
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
   OCR
===================================================== */
async function callVisionTextDetection(base64Image) {
    const url = `https://vision.googleapis.com/v1/images:annotate?key=${visionApiKey}`;
    const body = {
        requests: [{
            image: { content: base64Image },
            features: [{ type: "TEXT_DETECTION", maxResults: 50 }]
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
    const out = [];
    for (let i = 1; i < textAnn.length; i++) {
        const t = textAnn[i].description || "";
        const norm = normalizeNumber(t);
        if (!/^\d{3}$/.test(norm)) continue;

        const v = textAnn[i].boundingPoly.vertices;
        const x = v[0].x, y = v[0].y;
        const w = v[1].x - v[0].x;
        const h = v[2].y - v[0].y;
        out.push({ number: norm, x, y, w, h });
    }
    return out;
}

/* =====================================================
   フレーム取得
===================================================== */
function captureFrame() {
    const c = document.createElement("canvas");
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    c.getContext("2d").drawImage(video, 0, 0);
    return c;
}

/* =====================================================
   Qモード
===================================================== */
async function runQ() {
    const frame = captureFrame();
    const base64 = frame.toDataURL("image/jpeg").split(",")[1];
    const data = await callVisionTextDetection(base64);

    const det = parseTextAnnotationsFor3Digit(data.responses[0].textAnnotations);

    qResultsEl.innerHTML = "";
    lastQNumbers = det.map(d => d.number);

    det.forEach(d => {
        const img = document.createElement("img");
        img.className = "quest-thumb";
        qResultsEl.appendChild(img);

        // savedにあれば即Aに表示
        if (savedNumbers.has(d.number) && !answerHistory.has(d.number)) {
            answerHistory.add(d.number);
            renderSavedToA(d.number);
        }
    });
}

/* =====================================================
   Aモード
===================================================== */
async function runA() {
    const frame = captureFrame();
    const base64 = frame.toDataURL("image/jpeg").split(",")[1];
    const data = await callVisionTextDetection(base64);

    const det = parseTextAnnotationsFor3Digit(data.responses[0].textAnnotations);

    det.forEach(d => {
        if (!lastQNumbers.includes(d.number)) return;
        if (answerHistory.has(d.number)) return;

        const cut = document.createElement("canvas");
        cut.width = d.w + 50;
        cut.height = d.h + 140;
        cut.getContext("2d").drawImage(frame,
            d.x - 25, d.y - 40,
            d.w + 50, d.h + 140,
            0, 0,
            d.w + 50, d.h + 140
        );

        const url = cut.toDataURL();
        savedNumbers.set(d.number, url);
        answerHistory.add(d.number);
        renderSavedToA(d.number);
    });
}

/* =====================================================
   A描画
===================================================== */
function renderSavedToA(num) {
    const wrapper = document.createElement("div");
    wrapper.className = "quest-item";

    const img = document.createElement("img");
    img.src = savedNumbers.get(num);
    img.className = "quest-thumb";

    const txt = document.createElement("div");
    txt.innerText = num;
    txt.className = "quest-text";

    wrapper.appendChild(img);
    wrapper.appendChild(txt);
    aResultsEl.appendChild(wrapper);
}

/* =====================================================
   撮影
===================================================== */
function shoot() {
    currentMode === "Q" ? runQ() : runA();
}

/* =====================================================
   ボタン
===================================================== */
let timer = null;
camBtn.onmousedown = () => {
    shoot();
    timer = setInterval(shoot, INTERVAL_MS);
};
window.onmouseup = () => clearInterval(timer);

clearBtn.onclick = () => {
    qResultsEl.innerHTML = "";
    aResultsEl.innerHTML = "";
    lastQNumbers = [];
    answerHistory.clear();
};

/* =====================================================
   初期化
===================================================== */
(async () => {
    await askForApiKeyIfNeeded();
    await startCamera();
    setMode("Q");
})();