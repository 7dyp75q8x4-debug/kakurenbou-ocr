/* ----------------------------------------------------------
    ★ Vision API 用 API Key 入力（UI変更なしに最小追加）
----------------------------------------------------------- */
let visionApiKey = "";

window.addEventListener("load", () => {
    visionApiKey = prompt("Vision API の API KEY を入力してください");
    if (!visionApiKey) alert("API KEY が未入力です。OCR は動作しません。");
});

/* ----------------------------------------------------------
    ★ カメラ起動
----------------------------------------------------------- */
async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment" } // 背面カメラ
        });
        document.getElementById("camera").srcObject = stream;
    } catch (e) {
        alert("カメラを起動できません: " + e);
    }
}
startCamera();

/* ----------------------------------------------------------
    Q / A モード切替（UI反応）
----------------------------------------------------------- */
const qBtn = document.getElementById("qMode");
const aBtn = document.getElementById("aMode");

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

/* ----------------------------------------------------------
    Qモード：OCR → 数字パネル抽出 → 左上に表示
----------------------------------------------------------- */
let isQMode = true;

// 左側エリア
const questPanel = document.getElementById("left-panel");

// カメラのフレーム取り出し Canvas
const ocrCanvas = document.createElement("canvas");
const ocrCtx = ocrCanvas.getContext("2d");

/* ----------------------------------------------------------
    Vision API OCR 本体
----------------------------------------------------------- */
async function visionOCR(base64img) {
    if (!visionApiKey) return "";

    const body = {
        requests: [
            {
                image: { content: base64img },
                features: [{ type: "TEXT_DETECTION" }]
            }
        ]
    };

    try {
        const res = await fetch(
            `https://vision.googleapis.com/v1/images:annotate?key=${visionApiKey}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            }
        );

        const json = await res.json();
        return json.responses?.[0]?.textAnnotations?.[0]?.description || "";
    } catch (e) {
        console.error("Vision API Error:", e);
        return "";
    }
}

/* ----------------------------------------------------------
    数字パネル検出（3桁数字だけ抽出）
----------------------------------------------------------- */
async function detectNumberPanels() {
    const video = document.getElementById("camera");
    if (!video.videoWidth) return [];

    // カメラフレームを取得
    ocrCanvas.width = video.videoWidth;
    ocrCanvas.height = video.videoHeight;
    ocrCtx.drawImage(video, 0, 0, ocrCanvas.width, ocrCanvas.height);

    const base64 = ocrCanvas.toDataURL("image/jpeg").replace(/^data:image\/jpeg;base64,/, "");

    const text = await visionOCR(base64);
    if (!text) return [];

    // 三桁を正規表現で抽出
    const numbers = text.match(/\d{3}/g) || [];

    // 数字だけ返す（UIはそのまま表示される）
    return numbers.map(num => ({
        number: num,
        x: 0, y: 0, w: 100, h: 100 // ※本当の座標取得はVision APIの境界情報で可能
    }));
}

/* ----------------------------------------------------------
    Qモードで OCR を定期実行
----------------------------------------------------------- */
async function runQModeScan() {
    if (!isQMode) return;

    const detected = await detectNumberPanels();

    questPanel.innerHTML = ""; // クリア

    detected.forEach(item => {
        // トリミング画像（座標はダミー）
        const cut = document.createElement("canvas");
        cut.width = 100;
        cut.height = 100;

        const cctx = cut.getContext("2d");
        cctx.drawImage(ocrCanvas, 0, 0, cut.width, cut.height);

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

// 0.5秒ごとに実行
setInterval(runQModeScan, 500);
