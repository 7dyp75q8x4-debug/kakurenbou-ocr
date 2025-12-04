//------------------------------------------------------------
// 初期セットアップ
//------------------------------------------------------------
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

let currentMode = "A";
let stream = null;

// 重複防止
let answerHistory = new Set();


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
    }
}


//------------------------------------------------------------
// モード切替
//------------------------------------------------------------
function setMode(mode) {
    currentMode = mode;
    console.log("Mode:", mode);

    if (mode === "A") {
        answerHistory.clear();
    }
}


//------------------------------------------------------------
// 撮影ボタン
//------------------------------------------------------------
async function captureFrame() {
    if (!video.videoWidth) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    if (currentMode === "A") {
        await runAModeScan();
    } else {
        await runQModeScan();
    }
}


//------------------------------------------------------------
// Aモード：数字＋対応するアルファベットのみを拡大トリミング
//------------------------------------------------------------
async function runAModeScan() {

    const ocrCanvas = document.createElement("canvas");
    ocrCanvas.width = canvas.width;
    ocrCanvas.height = canvas.height;

    const ocrCtx = ocrCanvas.getContext("2d");
    ocrCtx.drawImage(video, 0, 0, ocrCanvas.width, ocrCanvas.height);

    const detected = await detectThreeDigitNumbers(ocrCanvas);

    detected.forEach(item => {

        //--------------------------------------------------------
        // ① 重複防止
        //--------------------------------------------------------
        const key = `${item.number}_${item.x}_${item.y}`;
        if (answerHistory.has(key)) return;
        answerHistory.add(key);

        //--------------------------------------------------------
        // ② トリミングをよりタイトに（数字＋直下のアルファベット）
        //--------------------------------------------------------

        // ● さらに寄せる！
        //   → 数字周辺だけ強調し、上下左右の余分を削るロジック

        const tightTop = 40;        // 上方向（数字の上の余白を少なく）
        const tightBottom = 100;    // 下方向（アルファベット行まで）
        const tightSide = 25;       // 左右余白も削る

        const sx = Math.max(item.x - tightSide, 0);
        const sy = Math.max(item.y - tightTop, 0);
        const sw = item.w + tightSide * 2;
        const sh = item.h + tightBottom + tightTop;

        const cut = document.createElement("canvas");
        cut.width = sw;
        cut.height = sh;

        cut.getContext("2d").drawImage(
            ocrCanvas,
            sx, sy, sw, sh,
            0, 0, sw, sh
        );

        //--------------------------------------------------------
        // ③ UIへ反映（テキストカラーを Aモード＝黒 に修正）
        //--------------------------------------------------------
        appendAModeResult(item.number, cut.toDataURL());
    });
}


//------------------------------------------------------------
// Qモード（変更なし）
//------------------------------------------------------------
async function runQModeScan() {
    const result = await detectTargetForQuiz(canvas);
    showQModeResult(result);
}


//------------------------------------------------------------
// OCR関数（ユーザーの既存実装）
//------------------------------------------------------------
async function detectThreeDigitNumbers(bitmap) {
    return [];
}

async function detectTargetForQuiz(bitmap) {
    return null;
}


//------------------------------------------------------------
// Aモード結果追加（テキスト黒）
//------------------------------------------------------------
function appendAModeResult(number, imgData) {

    const list = document.getElementById("a-results");

    const box = document.createElement("div");
    box.className = "a-item";

    const img = document.createElement("img");
    img.src = imgData;

    const label = document.createElement("div");
    label.textContent = number;
    label.className = "a-label";

    // ★ 黒字に強制！
    label.style.color = "black";
    label.style.fontWeight = "bold";

    box.appendChild(img);
    box.appendChild(label);
    list.appendChild(box);
}


//------------------------------------------------------------
// 初期起動
//------------------------------------------------------------
startCamera();
