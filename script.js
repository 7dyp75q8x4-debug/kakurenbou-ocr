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
   左側パネル
===================================================== */
const questPanel = document.getElementById("left-panel");

/* Camera → Canvas */
const ocrCanvas = document.createElement("canvas");
const ocrCtx = ocrCanvas.getContext("2d");


/* =====================================================
   長押し OCR
===================================================== */
function startOCRLoop() {
    if (!isQMode) return;
    if (ocrInterval) return;

    cameraBtn.classList.add("pressing");

    runQModeScan();

    ocrInterval = setInterval(() => {
        runQModeScan();
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
   Vision API OCR 本体
===================================================== */
async function runQModeScan() {
    if (!isQMode) return;
    if (!visionApiKey) return;

    const video = document.getElementById("camera");
    if (!video.videoWidth) return;

    // フレーム取得
    ocrCanvas.width = video.videoWidth;
    ocrCanvas.height = video.videoHeight;
    ocrCtx.drawImage(video, 0, 0, ocrCanvas.width, ocrCanvas.height);

    const base64 = ocrCanvas.toDataURL("image/jpeg").replace(/^data:image\/jpeg;base64,/, "");

    // Vision API 呼び出し
    const detected = await detectNumberPanels(base64);

    questPanel.innerHTML = "";

    /* ★★★★★ 差し替えた部分（トリミング改善） ★★★★★ */

    const margin = 60; // ← 余白（ピクセル）

    detected.forEach(item => {

        const sx = Math.max(item.x - margin, 0);
        const sy = Math.max(item.y - margin, 0);
        const sw = item.w + margin * 2;
        const sh = item.h + margin * 2;

        const cut = document.createElement("canvas");
        cut.width = sw;
        cut.height = sh;
        const cctx = cut.getContext("2d");

        cctx.drawImage(
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
   Vision API を使って 3桁数字パネル抽出
===================================================== */
async function detectNumberPanels(base64Image) {

    const url = `https://vision.googleapis.com/v1/images:annotate?key=${visionApiKey}`;

    const body = {
        requests: [
            {
                image: { content: base64Image },
                features: [
                    { type: "TEXT_DETECTION" }
                ]
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

        // ★ 3桁数字だけ抽出
        if (!/^\d{3}$/.test(t)) continue;

        const box = textAnn[i].boundingPoly.vertices;

        const x = box[0].x || 0;
        const y = box[0].y || 0;
        const w = (box[1].x || 0) - x;
        const h = (box[2].y || 0) - y;

        detected.push({ x, y, w, h, number: t });
    }

    return detected;
}


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
