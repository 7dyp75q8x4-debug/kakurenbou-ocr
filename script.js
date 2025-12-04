//------------------------------------------------------------
// 基本要素
//------------------------------------------------------------
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

let visionApiKey = localStorage.getItem("vision_api_key");


//------------------------------------------------------------
// APIキー入力（初回のみ）
//------------------------------------------------------------
async function ensureApiKey() {
    if (!visionApiKey) {
        const key = prompt("Google Vision API キーを入力してください");
        if (key && key.trim()) {
            visionApiKey = key.trim();
            localStorage.setItem("vision_api_key", visionApiKey);
        } else {
            alert("APIキーが必要です");
        }
    }
}


//------------------------------------------------------------
// カメラ起動
//------------------------------------------------------------
async function startCamera() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment" },
            audio: false
        });

        video.srcObject = stream;
        await video.play();

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

    } catch (err) {
        console.error("Camera error:", err);
        alert("カメラを開始できませんでした");
    }
}


//------------------------------------------------------------
// モード切替
//------------------------------------------------------------
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


//------------------------------------------------------------
// Vision API 呼び出し
//------------------------------------------------------------
async function callVisionAPI(base64) {
    const url = `https://vision.googleapis.com/v1/images:annotate?key=${visionApiKey}`;

    const body = {
        requests: [
            {
                image: { content: base64 },
                features: [{ type: "TEXT_DETECTION", maxResults: 50 }]
            }
        ]
    };

    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });

    return res.json();
}


//------------------------------------------------------------
// 3桁数字抽出
//------------------------------------------------------------
function parse3Digits(textAnnotations) {

    if (!textAnnotations || !Array.isArray(textAnnotations)) return [];

    const out = [];

    for (let i = 1; i < textAnnotations.length; i++) {
        const t = textAnnotations[i].description.trim();
        if (/^\d{3}$/.test(t)) {

            const v = textAnnotations[i].boundingPoly.vertices;

            const x = v[0]?.x || 0;
            const y = v[0]?.y || 0;
            const w = (v[1]?.x || x) - x;
            const h = (v[2]?.y || y) - y;

            out.push({ number: t, x, y, w, h });
        }
    }

    return out;
}


//------------------------------------------------------------
// OCR 実行
//------------------------------------------------------------
async function detectNumbers(bitmap) {
    const dataUrl = bitmap.toDataURL("image/jpeg", 0.85);
    const base64 = dataUrl.split(",")[1];

    const resp = await callVisionAPI(base64);

    const textAnn = resp?.responses?.[0]?.textAnnotations;
    if (!textAnn) return [];

    return parse3Digits(textAnn);
}


//------------------------------------------------------------
// Qモード：3桁数字を表示
//------------------------------------------------------------
async function runQModeScan() {

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const results = await detectNumbers(canvas);

    lastQNumbers = results.map(r => r.number);

    const list = document.getElementById("q-results");
    list.innerHTML = "";

    results.forEach(item => {
        const box = document.createElement("div");
        box.className = "q-item";

        const cut = document.createElement("canvas");
        cut.width = item.w + 60;
        cut.height = item.h + 60;

        cut.getContext("2d").drawImage(
            canvas,
            item.x - 30,
            item.y - 30,
            cut.width,
            cut.height,
            0, 0, cut.width, cut.height
        );

        const img = document.createElement("img");
        img.src = cut.toDataURL();

        const label = document.createElement("div");
        label.textContent = item.number;

        box.appendChild(img);
        box.appendChild(label);
        list.appendChild(box);
    });
}


//------------------------------------------------------------
// Aモード：Qで出た数字だけトリミングして追加
//------------------------------------------------------------
async function runAModeScan() {
    if (lastQNumbers.length === 0) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const results = await detectNumbers(canvas);

    results.forEach(item => {
        if (!lastQNumbers.includes(item.number)) return;

        const key = `${item.number}_${item.x}_${item.y}`;
        if (answerHistory.has(key)) return;
        answerHistory.add(key);

        const tightTop = 40;
        const tightBottom = 100;
        const tightSide = 25;

        const sx = Math.max(item.x - tightSide, 0);
        const sy = Math.max(item.y - tightTop, 0);
        const sw = item.w + tightSide * 2;
        const sh = item.h + tightTop + tightBottom;

        const cut = document.createElement("canvas");
        cut.width = sw;
        cut.height = sh;

        cut.getContext("2d").drawImage(
            canvas,
            sx, sy, sw, sh,
            0, 0, sw, sh
        );

        appendAModeResult(item.number, cut.toDataURL());
    });
}


//------------------------------------------------------------
// Aモード結果 UI 追加
//------------------------------------------------------------
function appendAModeResult(num, imgData) {
    const list = document.getElementById("a-results");

    const box = document.createElement("div");
    box.className = "a-item";

    const img = document.createElement("img");
    img.src = imgData;

    const label = document.createElement("div");
    label.textContent = num;
    label.style.color = "black";
    label.style.fontWeight = "bold";

    box.appendChild(img);
    box.appendChild(label);
    list.appendChild(box);
}


//------------------------------------------------------------
// 撮影
//------------------------------------------------------------
async function captureFrame() {
    if (currentMode === "Q") {
        await runQModeScan();
    } else {
        await runAModeScan();
    }
}


//------------------------------------------------------------
// 初期起動
//------------------------------------------------------------
(async () => {
    await ensureApiKey();
    await startCamera();
    setMode("Q");
})();


//------------------------------------------------------------
// イベント
//------------------------------------------------------------
qBtn.addEventListener("click", () => setMode("Q"));
aBtn.addEventListener("click", () => setMode("A"));
camBtn.addEventListener("click", () => captureFrame());

clearBtn.addEventListener("click", () => {
    document.getElementById("q-results").innerHTML = "";
    document.getElementById("a-results").innerHTML = "";
    answerHistory.clear();
});
