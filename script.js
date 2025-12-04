/* Q / A モード切替（UI反応あり） */
const qBtn = document.getElementById("qMode");
const aBtn = document.getElementById("aMode");

function setMode(mode) {
    if (mode === "Q") {
        qBtn.classList.add("active");
        aBtn.classList.remove("active");
    } else {
        aBtn.classList.add("active");
        qBtn.classList.remove("active");
    }
}

// ボタン押下
qBtn.onclick = () => setMode("Q");
aBtn.onclick = () => setMode("A");

// 初期状態を Q にする
setMode("Q");

/* -----------------------------
 Qモード：数字パネル OCR → 左上に表示
--------------------------------*/

// Qモードのときだけ動作
let isQMode = false;

document.getElementById("qMode").addEventListener("click", () => {
    isQMode = true;
});

document.getElementById("aMode").addEventListener("click", () => {
    isQMode = false;
});

// 左側表示エリア
const questPanel = document.getElementById("left-panel");

// カメラ画像からフレームを取り出す Canvas
const ocrCanvas = document.createElement("canvas");
const ocrCtx = ocrCanvas.getContext("2d");

async function runQModeScan() {
    if (!isQMode) return;

    const video = document.getElementById("camera");
    if (!video.videoWidth) return;

    // Canvas に今のカメラ画像を描画
    ocrCanvas.width = video.videoWidth;
    ocrCanvas.height = video.videoHeight;
    ocrCtx.drawImage(video, 0, 0, ocrCanvas.width, ocrCanvas.height);

    const frame = ocrCtx.getImageData(0, 0, ocrCanvas.width, ocrCanvas.height);

    // ▼▼ Vision APIや Tesseract.js をここで呼ぶ（仮の関数にしておく） ▼▼
    const detected = await detectNumberPanels(frame);
    // detected = [{x,y,w,h,number:"279"}, ...]

    questPanel.innerHTML = "";    // 毎回いったんクリア

    detected.forEach(item => {
        const cut = document.createElement("canvas");
        cut.width = item.w;
        cut.height = item.h;
        const cctx = cut.getContext("2d");

        // トリミング
        cctx.drawImage(
            ocrCanvas,
            item.x, item.y, item.w, item.h,
            0, 0, item.w, item.h
        );

        // 表示パネル生成
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

// 0.5秒ごとにQモードスキャン
setInterval(runQModeScan, 500);


/* -----------------------------
 3桁数字パネル検出ダミー
（あなたの OCR に置き換えできるように作ってある）
--------------------------------*/
async function detectNumberPanels(frame) {
    // ★ ここに Vision API や Tesseract.js の結果を入れる
    // return 例）
    // [
    //   { x:120, y:40, w:90, h:90, number:"279" },
    //   { x:260, y:40, w:90, h:90, number:"055" },
    // ]

    return []; // とりあえず空（OCR 部分はあなた側のコードに差し替え）
}
