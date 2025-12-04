/* =====================================================
   Vision API Key（ページ読み込み時に必ず取得）
===================================================== */
let visionApiKey = null;

async function askForApiKey() {
    const key = prompt("Google Vision API キーを入力してください");
    if (!key) {
        alert("APIキーが必要です");
        return askForApiKey(); // 入力されるまでループ
    }
    visionApiKey = key;
}

window.addEventListener("DOMContentLoaded", askForApiKey);


/* =====================================================
   Q / A モード切替（UI反応あり）
===================================================== */
const qBtn = document.getElementById("qMode");
const aBtn = document.getElementById("aMode");
const cameraBtn = document.querySelector(".yellow-btn");
const clearBtn = document.querySelector(".blue-btn");

let isQMode = true;
let ocrInterval = null;

function setMode(mode) {
    if (mode === "Q") {
        qBtn.classList.add("active");
        aBtn.classList.remove("active");
        isQMode = true;
    } else {
        aBtn.classList.add("active");
        qBtn.classList.remove("active");
        isQMode = false;
    }
}

qBtn.onclick = () => setMode("Q");
aBtn.onclick = () => setMode("A");
setMode("Q");


/* =====================================================
   左側パネル（Qモード：検出候補 / Aモード：探索結果）
===================================================== */
const questPanel = document.getElementById("left-panel");

// Qモードで読み取った「お題」保存
let questNumbers = [];

// Aモードで見つけた一致データ保存
let answerResults = [];


/* =====================================================
   Camera → Canvas
===================================================== */
const ocrCanvas = document.createElement("canvas");
const ocrCtx = ocrCanvas.getContext("2d");


/* =====================================================
   長押し OCR（Q / A切替対応版）
===================================================== */
function startOCRLoop() {
    if (ocrInterval) return;

    cameraBtn.classList.add("pressing");

    if (isQMode) {
        runQModeScan();
    } else {
        runAModeScan();
    }

    ocrInterval = setInterval(() => {
        if (isQMode) {
            runQModeScan();
        } else {
            runAModeScan();
        }
    }, 1000);
}

function stopOCRLoop() {
    if (ocrInterval) {
        clearInterval(ocrInterval);
        ocrInterval = null;
    }
    cameraBtn.classList.remove("pressing");
}

/* PC */
cameraBtn.addEventListener("mousedown", startOCRLoop);
cameraBtn.addEventListener("mouseup", stopOCRLoop);
cameraBtn.addEventListener("mouseleave", stopOCRLoop);

/* スマホ */
cameraBtn.addEventListener("touchstart", (e) => {
    e.preventDefault();
    startOCRLoop();
});
cameraBtn.addEventListener("touchend", stopOCRLoop);


/* =====================================================
   Qモード：お題 OCR
===================================================== */
async function runQModeScan() {
    if (!visionApiKey) return;

    const video = document.getElementById("camera");
    if (!video.videoWidth) return;

    ocrCanvas.width = video.videoWidth;
    ocrCanvas.height = video.videoHeight;
    ocrCtx.drawImage(video, 0, 0);

    const base64 = ocrCanvas.toDataURL("image/jpeg").replace(/^data:image\/jpeg;base64,/, "");

    const detected = await detectNumberPanels(base64);

    questPanel.innerHTML = "";
    questNumbers = []; // ←毎回クリアして最新だけ保持

    const margin = 60;

    detected.forEach(item => {
        questNumbers.push(item.number);  // ← お題として保存

        const sx = Math.max(item.x - margin, 0);
        const sy = Math.max(item.y - margin, 0);
        const sw = item.w + margin * 2;
        const sh = item.h + margin * 2;

        const cut = document.createElement("canvas");
        cut.width = sw;
        cut.height = sh;
        cut.getContext("2d").drawImage(
            ocrCanvas,
            sx, sy, sw, sh,
            0, 0, sw, sh
        );

        const div = document.createElement("div");
        div.className = "quest-item";

        const img = document.createElement("img");
        img.className = "quest-thumb";
        img.src = cut.toDataURL();

        const txt = document.createElement("div");
        txt.className = "quest-text";
        txt.innerText = item.number;

        div.appendChild(img);
        div.appendChild(txt);
        questPanel.appendChild(div);
    });
}


/* =====================================================
   Aモード：お題を探索するモード
===================================================== */
async function runAModeScan() {
    if (!visionApiKey) return;
    if (questNumbers.length === 0) return; // お題が無い時は探索しない

    const video = document.getElementById("camera");
    if (!video.videoWidth) return;

    ocrCanvas.width = video.videoWidth;
    ocrCanvas.height = video.videoHeight;
    ocrCtx.drawImage(video, 0, 0);

    const base64 = ocrCanvas.toDataURL("image/jpeg").replace(/^data:image\/jpeg;base64,/, "");
    const detected = await detectNumberPanels(base64);

    const margin = 60;

    detected.forEach(item => {
        // お題と一致した数字だけ表示
        if (!questNumbers.includes(item.number)) return;

        const sx = Math.max(item.x - margin, 0);
        const sy = Math.max(item.y - margin, 0);
        const sw = item.w + margin * 2;
        const sh = item.h + margin * 2;

        const cut = document.createElement("canvas");
        cut.width = sw;
        cut.height = sh;
        cut.getContext("2d").drawImage(
            ocrCanvas,
            sx, sy, sw, sh,
            0, 0, sw, sh
        );

        const div = document.createElement("div");
        div.className = "quest-item";

        const img = document.createElement("img");
        img.className = "quest-thumb";
        img.src = cut.toDataURL();

        const txt = document.createElement("div");
        txt.className = "quest-text";
        txt.innerText = item.number;

        div.appendChild(img);
        div.appendChild(txt);
        questPanel.appendChild(div);
    });
}


/* =====================================================
   Vision API：3桁数字抽出
===================================================== */
async function detectNumberPanels(base64Image) {
    const url = `https://vision.googleapis.com/v1/images:annotate?key=${visionApiKey}`;

    const body = {
        requests: [
            {
                image: { content: base64Image },
                features: [{ type: "TEXT_DETECTION" }]
            }
        ]
    };

    let res;
    try {
        res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
    } catch (e) {
        console.error(e);
        return [];
    }

    const data = await res.json();
    if (!data.responses || !data.responses[0].textAnnotations) return [];

    const textAnn = data.responses[0].textAnnotations;
    let detected = [];

    for (let i = 1; i < textAnn.length; i++) {
        const t = textAnn[i].description.trim();
        if (!/^\d{3}$/.test(t)) continue;

        const box = textAnn[i].boundingPoly.vertices;

        detected.push({
            number: t,
            x: box[0].x || 0,
            y: box[0].y || 0,
            w: (box[1].x || 0) - (box[0].x || 0),
            h: (box[2].y || 0) - (box[0].y || 0)
        });
    }

    return detected;
}


/* =====================================================
   ゴミ箱ボタン：すべてリセット
===================================================== */
clearBtn.addEventListener("click", () => {
    questNumbers = [];
    answerResults = [];
    questPanel.innerHTML = "";
});


/* =====================================================
   カメラ起動
===================================================== */
async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment", aspectRatio: 16 / 9 },
            audio: false
        });
        document.getElementById("camera").srcObject = stream;
    } catch (err) {
        alert("カメラが使用できません：" + err.message);
    }
}

startCamera();
