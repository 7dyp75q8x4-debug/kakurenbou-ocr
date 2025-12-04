// ------------------------------------------------------------
//  初期セットアップ
// ------------------------------------------------------------
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

let currentMode = "A"; // Aモード/Qモード
let stream = null;

// Aモードの重複防止セット
let answerHistory = new Set();


// ------------------------------------------------------------
//  カメラ起動
// ------------------------------------------------------------
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
        console.error("カメラ起動エラー:", err);
    }
}


// ------------------------------------------------------------
//  モード切替
// ------------------------------------------------------------
function setMode(mode) {
    currentMode = mode;
    console.log("Mode:", mode);

    if (mode === "A") {
        answerHistory.clear(); // Aモード時は毎回リセット
    }
}


// ------------------------------------------------------------
//  撮影ボタン → スキャン処理
// ------------------------------------------------------------
async function captureFrame() {
    if (!video.videoWidth) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    if (currentMode === "A") {
        await runAModeScan();
    } else {
        await runQModeScan();
    }
}


// ------------------------------------------------------------
//  ★ Aモード：画像内の "3桁数字" を検出 → トリミングして保存
// ------------------------------------------------------------
async function runAModeScan() {

    const ocrCanvas = document.createElement("canvas");
    ocrCanvas.width = canvas.width;
    ocrCanvas.height = canvas.height;

    const ocrCtx = ocrCanvas.getContext("2d");
    ocrCtx.drawImage(video, 0, 0, ocrCanvas.width, ocrCanvas.height);

    const bitmap = ocrCanvas;

    // Google Vision API or Tesseract など OCR へ渡す処理（ユーザー環境のまま）
    const detected = await detectThreeDigitNumbers(bitmap);

    detected.forEach(item => {

        // ------------------------------
        // ① 重複防止（数字＋座標）
        // ------------------------------
        const key = item.number + "_" + item.x + "_" + item.y;

        if (answerHistory.has(key)) {
            console.log("重複スキップ:", key);
            return;
        }
        answerHistory.add(key);

        // ------------------------------
        // ② トリミング（縦を大きく取る）
        // ------------------------------
        const marginTop = 120;     // 上方向広め
        const marginBottom = 160;  // 下方向もっと広め（アルファベット部分）
        const marginSide = 40;     // 左右少しだけ

        const sx = Math.max(item.x - marginSide, 0);
        const sy = Math.max(item.y - marginTop, 0);
        const sw = item.w + marginSide * 2;
        const sh = item.h + marginTop + marginBottom;

        const cut = document.createElement("canvas");
        cut.width = sw;
        cut.height = sh;

        cut.getContext("2d").drawImage(
            ocrCanvas,
            sx, sy, sw, sh,
            0, 0, sw, sh
        );

        // ------------------------------
        // ③ UIへ追加（既存レイアウトを絶対に変更しない）
        // ------------------------------
        appendAModeResult(item.number, cut.toDataURL());
    });
}



// ------------------------------------------------------------
//  Qモード（既存のまま、変更無し）
// ------------------------------------------------------------
async function runQModeScan() {
    const result = await detectTargetForQuiz(canvas);
    showQModeResult(result);
}



// ------------------------------------------------------------
//  ダミー：OCR検出関数（実際はユーザーの元の関数）
// ------------------------------------------------------------
async function detectThreeDigitNumbers(bitmap) {
    // 元のコードそのまま使ってください
    return [];
}

async function detectTargetForQuiz(bitmap) {
    // 元のコードそのまま使ってください
    return null;
}


// ------------------------------------------------------------
//  UIへ結果を追加（既存UIを絶対に崩さない）
// ------------------------------------------------------------
function appendAModeResult(number, imgData) {

    const list = document.getElementById("a-results");

    const box = document.createElement("div");
    box.className = "a-item";

    const img = document.createElement("img");
    img.src = imgData;

    const label = document.createElement("div");
    label.textContent = number;
    label.className = "a-label";

    box.appendChild(img);
    box.appendChild(label);
    list.appendChild(box);
}

function showQModeResult(result) {
    // 元のまま
}



// ------------------------------------------------------------
//  初期起動
// ------------------------------------------------------------
startCamera();
