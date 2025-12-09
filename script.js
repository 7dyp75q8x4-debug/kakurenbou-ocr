/* =====================================================
   要素取得
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

/* =====================================================
   状態管理
===================================================== */
let currentMode = "Q";
let stream = null;

let lastQNumbers = [];                 // 直近Qのお題
let savedAData = new Map();            // 【完全記憶】Aモード保存領域

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
    const constraints = {
        video: {
            facingMode: "environment",
            aspectRatio: 16 / 9
        },
        audio: false
    };

    stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    await video.play();

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
}

/* =====================================================
   モード切替
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
async function callVision(base64) {
    const url = `https://vision.googleapis.com/v1/images:annotate?key=${visionApiKey}`;
    const body = {
        requests: [{
            image: { content: base64 },
            features: [{ type: "TEXT_DETECTION", maxResults: 50 }]
        }]
    };

    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });

    const json = await res.json();
    return json.responses[0]?.textAnnotations || [];
}

/* =====================================================
   3桁検出
===================================================== */
function extractThreeDigits(list) {
    const out = [];

    for (let i = 1; i < list.length; i++) {
        const t = list[i];
        const txt = t.description?.trim();
        if (!/^\d{3}$/.test(txt)) continue;

        const v = t.boundingPoly.vertices;
        out.push({
            number: txt,
            x: v[0].x, y: v[0].y,
            w: v[1].x - v[0].x,
            h: v[2].y - v[0].y
        });
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
   Qモード（お題）
===================================================== */
async function runQ() {
    const frame = captureFrame();
    const base64 = frame.toDataURL("image/jpeg").split(",")[1];

    const ann = await callVision(base64);
    const detected = extractThreeDigits(ann);

    lastQNumbers = detected.map(d => d.number);

    qResultsEl.innerHTML = "";

    // ここが「保存済A」と突合
    lastQNumbers.forEach(num => {
        if (!savedAData.has(num)) return;

        const data = savedAData.get(num);
        const wrap = document.createElement("div");
        wrap.className = "quest-item";

        const img = document.createElement("img");
        img.src = data.image;

        const txt = document.createElement("div");
        txt.innerText = num;
        txt.style.color = "black";

        wrap.append(img, txt);
        qResultsEl.appendChild(wrap);
    });
}

/* =====================================================
   Aモード（保存）
===================================================== */
async function runA() {
    const frame = captureFrame();
    const base64 = frame.toDataURL("image/jpeg").split(",")[1];

    const ann = await callVision(base64);
    const detected = extractThreeDigits(ann);

    detected.forEach(d => {
        if (savedAData.has(d.number)) return;

        const cut = document.createElement("canvas");
        cut.width = d.w + 40;
        cut.height = d.h + 80;
        cut.getContext("2d").drawImage(
            frame,
            d.x - 20, d.y - 40, d.w + 40, d.h + 80,
            0, 0, cut.width, cut.height
        );

        savedAData.set(d.number, {
            number: d.number,
            image: cut.toDataURL()
        });
    });
}

/* =====================================================
   カメラボタン
===================================================== */
camBtn.addEventListener("click", async () => {
    if (currentMode === "Q") {
        await runQ();
    } else {
        await runA();
    }
});

/* =====================================================
   クリア
===================================================== */
clearBtn.onclick = () => {
    qResultsEl.innerHTML = "";
    aResultsEl.innerHTML = "";
    lastQNumbers = [];
};

/* =====================================================
   初期化
===================================================== */
window.onload = async () => {
    await askForApiKeyIfNeeded();
    await startCamera();
    setMode("Q");
};