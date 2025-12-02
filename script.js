/* === 設定 === */
const API_KEY = "AIzaSyCg8VdPY-34m_wpY69Z2EtCiFJHM4YIZEg";
let currentMode = "none";   // "Q" or "A"
let captureInterval = null;

/* === モード切替 === */
document.getElementById("qMode").onclick = () => {
    currentMode = "Q";
    console.log("Q モード");
};

document.getElementById("aMode").onclick = () => {
    currentMode = "A";
    console.log("A モード");
};

/* === 撮影連写（1秒ごと） === */
document.getElementById("capture").onclick = () => {
    if (currentMode === "none") {
        alert("Q または A を押してモードを選択してください");
        return;
    }

    if (captureInterval) return; // 多重起動防止

    console.log("撮影開始（1秒ごと）");

    captureInterval = setInterval(() => {
        captureAndRecognize();
    }, 1000);
};

/* === 画像キャプチャ → Vision API OCR === */
async function captureAndRecognize() {
    const video = document.getElementById("camera");

    // canvas 作成
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const base64 = canvas.toDataURL("image/jpeg").split(",")[1];

    // Vision API 呼び出し
    const result = await fetch(
        `https://vision.googleapis.com/v1/images:annotate?key=${API_KEY}`,
        {
            method: "POST",
            body: JSON.stringify({
                requests: [
                    {
                        image: { content: base64 },
                        features: [{ type: "TEXT_DETECTION" }]
                    }
                ]
            })
        }
    );

    const json = await result.json();
    const ocr = json.responses?.[0]?.fullTextAnnotation?.text || "";

    // 数字だけ抽出（最大3桁）
    const match = ocr.match(/\d{1,3}/);
    if (!match) return;
    const number = match[0];

    appendResult(number, canvas.toDataURL("image/jpeg"));
}

/* === 左側に追加（画像＋数字） === */
function appendResult(number, imgData) {
    const area = document.getElementById("candidates");

    const box = document.createElement("div");
    box.style.display = "flex";
    box.style.alignItems = "center";
    box.style.gap = "10px";

    // 画像
    const img = document.createElement("img");
    img.src = imgData;
    img.style.width = "80px";
    img.style.borderRadius = "8px";

    // 数字（Q=赤／A=黒）
    const num = document.createElement("div");
    num.textContent = number;
    num.style.fontSize = "26px";
    num.style.fontWeight = "bold";
    num.style.color = currentMode === "Q" ? "red" : "black";

    box.appendChild(img);
    box.appendChild(num);

    area.prepend(box);
}
