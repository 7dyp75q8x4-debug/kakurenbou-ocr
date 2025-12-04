//------------------------------------------------------------
// 初期セットアップ（ID を camera に統一済）
//------------------------------------------------------------
const video = document.getElementById("camera");
const canvas = document.createElement("canvas");
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

        // canvas は画面には出さないが内部処理用にサイズを合わせる
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        console.log("Camera started:", canvas.width, canvas.height);

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
// 撮影ボタンから呼ばれる
//------------------------------------------------------------
async function captureFrame() {

    if (!video.videoWidth) return;

    // 内部 canvas に描画
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    if (currentMode === "A") {
        await runAModeScan();
    } else {
        await runQModeScan();
    }
}


//------------------------------------------------------------
// Aモード：数字＋対応するアルファベットのトリミング
//------------------------------------------------------------
async function runAModeScan() {

    // OCR 用にフレームをコピー
    const ocrCanvas = document.createElement("canvas");
    ocrCanvas.width = canvas.width;
    ocrCanvas.height = canvas.height;

    ocrCanvas.getContext("2d").drawImage(video, 0, 0);

    const detected = await detectThreeDigitNumbers(ocrCanvas);

    detected.forEach(item => {

        //--------------------------------------------------------
        // ① 重複防止
        //--------------------------------------------------------
        const key = `${item.number}_${item.x}_${item.y}`;
        if (answerHistory.has(key)) return;
        answerHistory.add(key);

        //--------------------------------------------------------
        // ② 余白をより削ったトリミング
        //--------------------------------------------------------
        const tightTop = 40;
        const tightBottom = 100;
        const tightSide = 25;

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
        // ③ UI に黒字で追加
        //--------------------------------------------------------
        appendAModeResult(item.number, cut.toDataURL());
    });
}


//------------------------------------------------------------
// Qモード
//------------------------------------------------------------
async function runQModeScan() {
    const result = await detectTargetForQuiz(canvas);
    showQModeResult(result);
}


//------------------------------------------------------------
// OCR（ユーザー側で実装）
//------------------------------------------------------------
async function detectThreeDigitNumbers(bitmap) {
    return []; // ← あなたの実装に差し替える
}

async function detectTargetForQuiz(bitmap) {
    return null; // ← あなたの実装に差し替える
}


//------------------------------------------------------------
// Aモード結果：UI に追加（黒字）
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
    label.style.color = "black";
    label.style.fontWeight = "bold";

    box.appendChild(img);
    box.appendChild(label);
    list.appendChild(box);
}


//------------------------------------------------------------
// イベント登録（あなたの HTML に合わせて復元）
//------------------------------------------------------------

// Q / A モードボタン
document.getElementById("qMode").addEventListener("click", () => {
    setMode("Q");
    document.getElementById("qMode").classList.add("active");
    document.getElementById("aMode").classList.remove("active");
});

document.getElementById("aMode").addEventListener("click", () => {
    setMode("A");
    document.getElementById("aMode").classList.add("active");
    document.getElementById("qMode").classList.remove("active");
});

// 📷 ボタン
document.querySelector(".yellow-btn").addEventListener("click", async () => {
    const btn = document.querySelector(".yellow-btn");
    btn.classList.add("pressing");

    await captureFrame();

    setTimeout(() => btn.classList.remove("pressing"), 120);
});

// 🚮 ボタン（Aモードの結果クリア）
document.querySelector(".blue-btn").addEventListener("click", () => {
    document.getElementById("a-results").innerHTML = "";
    answerHistory.clear();
});


//------------------------------------------------------------
// 起動
//------------------------------------------------------------
startCamera();
