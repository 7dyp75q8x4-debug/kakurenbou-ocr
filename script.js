/* =====================================================
   Vision API Key 管理（ページ開いたら1回だけ走る）
===================================================== */
let visionApiKey = localStorage.getItem("vision_api_key");

async function askForApiKeyIfNeeded() {
    if (!visionApiKey) {
        visionApiKey = prompt("Google Vision API キーを入力してください");
        if (!visionApiKey) {
            alert("APIキーが必要です");
            return;
        }
        localStorage.setItem("vision_api_key", visionApiKey);
        alert("APIキーを保存しました");
    }
}

window.addEventListener("DOMContentLoaded", askForApiKeyIfNeeded);


/* =====================================================
   Q / A モード切替（UI反応あり）
===================================================== */
const qBtn = document.getElementById("qMode");
const aBtn = document.getElementById("aMode");
const cameraBtn = document.querySelector(".yellow-btn"); // 📷 ボタン

let isQMode = true;  // 初期は Q モード
let ocrInterval = null; // 長押しOCRタイマー

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

setMode("Q"); // 初期状態


/* =====================================================
   左側の表示パネル
===================================================== */
const questPanel = document.getElementById("left-panel");

/* カメラ画像 → Canvas */
const ocrCanvas = document.createElement("canvas");
const ocrCtx = ocrCanvas.getContext("2d");


/* =====================================================
   長押しカメラ OCR（1秒ごと）
===================================================== */
function startOCRLoop() {
    if (!isQMode) return; 
    if (ocrInterval) return;

    cameraBtn.classList.add("pressing"); // 色変更

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

/* PC操作 */
cameraBtn.addEventListener("mousedown", startOCRLoop);
cameraBtn.addEventListener("mouseup", stopOCRLoop);
cameraBtn.addEventListener("mouseleave", stopOCRLoop);

/* スマホ操作 */
cameraBtn.addEventListener("touchstart", (e) => {
    e.preventDefault();
    startOCRLoop();
});
cameraBtn.addEventListener("touchend", stopOCRLoop);


/* =====================================================
   Qモード OCR 実行本体
===================================================== */
async function runQModeScan() {
    if (!isQMode) return;

    const video = document.getElementById("camera");
    if (!video.videoWidth) return;

    ocrCanvas.width = video.videoWidth;
    ocrCanvas.height = video.videoHeight;
    ocrCtx.drawImage(video, 0, 0, ocrCanvas.width, ocrCanvas.height);

    const frame = ocrCtx.getImageData(0, 0, ocrCanvas.width, ocrCanvas.height);

    // Vision API を使った検出（まだダミー）
    const detected = await detectNumberPanels(frame);

    questPanel.innerHTML = ""; 

    detected.forEach(item => {
        const cut = document.createElement("canvas");
        cut.width = item.w;
        cut.height = item.h;
        const cctx = cut.getContext("2d");

        cctx.drawImage(
            ocrCanvas,
            item.x, item.y, item.w, item.h,
            0, 0, item.w, item.h
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
   3桁数字パネル検出ダミー（後で Vision API に置き換える）
===================================================== */
async function detectNumberPanels(frame) {
    return []; 
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
