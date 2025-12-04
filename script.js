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
const trashBtn = document.querySelector(".blue-btn");

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
   左パネル要素
===================================================== */
const qResults = document.getElementById("q-results");  // ★ Qモード結果
const aResults = document.getElementById("a-results");  // ★ Aモード結果

// お題保存用
let questList = [];   // ["284","166",...]


/* =====================================================
   カメラ → Canvas
===================================================== */
const ocrCanvas = document.createElement("canvas");
const ocrCtx = ocrCanvas.getContext("2d");


/* =====================================================
   長押し OCR
===================================================== */
function startOCRLoop() {
    if (ocrInterval) return;

    cameraBtn.classList.add("pressing");

    if (isQMode) runQModeScan();
    else runAModeScan();

    ocrInterval = setInterval(() => {
        if (isQMode) runQModeScan();
        else runAModeScan();
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
   Qモード（お題読み取り）
===================================================== */
async function runQModeScan() {
    if (!visionApiKey) return;

    const video = document.getElementById("camera");
    if (!video.videoWidth) return;

    ocrCanvas.width = video.videoWidth;
    ocrCanvas.height = video.videoHeight;
    ocrCtx.drawImage(video, 0, 0, ocrCanvas.width, ocrCanvas.height);

    const base64 = ocrCanvas.toDataURL("image/jpeg").replace(/^data:image\/jpeg;base64,/, "");
    const detected = await detectNumberPanels(base64);

    qResults.innerHTML = "";  // Qの表示クリア
    questList = [];           // お題もリセット

    const margin = 60;

    detected.forEach(item => {
        // お題保存
        questList.push(item.number);

        // トリミング
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
        qResults.appendChild(div);
    });
}


/* =====================================================
   Aモード（探索）
===================================================== */
async function runAModeScan() {
    if (!visionApiKey) return;
    if (questList.length === 0) return; // お題がないと探索不可

    const video = document.getElementById("camera");
    if (!video.videoWidth) return;

    ocrCanvas.width = video.videoWidth;
    ocrCanvas.height = video.videoHeight;
    ocrCtx.drawImage(video, 0, 0, ocrCanvas.width, ocrCanvas.height);

    const base64 = ocrCanvas.toDataURL("image/jpeg").replace(/^data:image\/jpeg;base64,/, "");
    const detected = await detectNumberPanels(base64);

    const margin = 60;

    detected.forEach(item => {
        if (!questList.includes(item.number)) return; // ★ 一致したものだけ表示

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
        txt.style.color = "black";   // ★ 黒字
        txt.innerText = item.number;

        div.appendChild(img);
        div.appendChild(txt);
        aResults.appendChild(div);
    });
}


/* =====================================================
   Vision API を使って 3桁数字抽出
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
   ゴミ箱：Q/A 全削除
===================================================== */
trashBtn.addEventListener("click", () => {
    qResults.innerHTML = "";
    aResults.innerHTML = "";
    questList = [];
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
