/* =====================================================
   Vision API Key 管理
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
const cameraBtn = document.querySelector(".yellow-btn");

let isQMode = true;      // 初期は Q モード
let ocrInterval = null;  // 長押し OCR タイマー

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
   左側表示パネル
===================================================== */
const questPanel = document.getElementById("left-panel");

const ocrCanvas = document.createElement("canvas");
const ocrCtx = ocrCanvas.getContext("2d");

/* =====================================================
   長押しカメラ OCR（1秒ごと）
===================================================== */
function startOCRLoop() {
    if (!isQMode) return;       // Qモード以外は動かさない
    if (ocrInterval) return;    // 多重起動防止

    runQModeScan();             // 最初の1回
    ocrInterval = setInterval(runQModeScan, 1000); // 1秒ごと
}

function stopOCRLoop() {
    if (ocrInterval) {
        clearInterval(ocrInterval);
        ocrInterval = null;
    }
}

/* PC用 */
cameraBtn.addEventListener("mousedown", startOCRLoop);
cameraBtn.addEventListener("mouseup", stopOCRLoop);
cameraBtn.addEventListener("mouseleave", stopOCRLoop);

/* スマホ用 */
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

    // カメラフレームを Canvas に
    ocrCanvas.width = video.videoWidth;
    ocrCanvas.height = video.videoHeight;
    ocrCtx.drawImage(video, 0, 0);

    const frame = ocrCtx.getImageData(0, 0, ocrCanvas.width, ocrCanvas.height);

    // Vision API / OCR の結果（仮）
    const detected = await detectNumberPanels(frame);

    questPanel.innerHTML = ""; // 毎回クリア

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
        txt.textContent = item.number;

        div.appendChild(img);
        div.appendChild(txt);
        questPanel.appendChild(div);
    });
}

/* =====================================================
   3桁数字パネル検出ダミー
===================================================== */
async function detectNumberPanels(frame) {
    // Vision API 実装前なので空を返す
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

/* =====================================================
   カメラボタンの押下中に色を変える
===================================================== */
function addPressEffect() {
    cameraBtn.classList.add("pressing");
}
function removePressEffect() {
    cameraBtn.classList.remove("pressing");
}

cameraBtn.addEventListener("mousedown", addPressEffect);
cameraBtn.addEventListener("mouseup", removePressEffect);
cameraBtn.addEventListener("mouseleave", removePressEffect);

cameraBtn.addEventListener("touchstart", addPressEffect);
cameraBtn.addEventListener("touchend", removePressEffect);
