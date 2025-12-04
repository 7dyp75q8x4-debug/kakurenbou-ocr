//------------------------------------------------------------
// 基本要素
//------------------------------------------------------------
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const qBtn = document.getElementById("qMode");
const aBtn = document.getElementById("aMode");
const camBtn = document.getElementById("camera-btn");
const clearBtn = document.getElementById("clear-btn");

let currentMode = "Q";
let stream = null;
let lastQNumbers = [];
let answerHistory = new Set();

let visionApiKey = localStorage.getItem("vision_api_key");


//------------------------------------------------------------
// APIキー入力（初回のみ）
//------------------------------------------------------------
async function ensureApiKey() {
    if (!visionApiKey) {
        const key = prompt("Google Vision API キーを入力してください");
        if (key && key.trim()) {
            visionApiKey = key.trim();
            localStorage.setItem("vision_api_key", visionApiKey);
        } else {
            alert("APIキーが必要です");
        }
    }
}


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

        // 取得できたサイズでキャンバス調整
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;

    } catch (err) {
        console.error("Camera error:", err);
        alert("カメラを開始できませんでした");
    }
}


//------------------------------------------------------------
// モード切替
//------------------------------------------------------------
function setMode(mode) {
    currentMode = mode;

    if (mode === "Q") {
        qBtn.classList.add("active");
        aBtn.classList.remove("active");
    } else {
        aBtn.classList.add("active");
        qBtn.classList.remove("active");
    }
}


// Q/A ボタンイベント
qBtn.addEventListener("click", () => setMode("Q"));
aBtn.addEventListener("click", () => setMode("A"));


//------------------------------------------------------------
// Vision API 呼び出し
//------------------------------------------------------------
async function callVisionAPI(base64) {
    const url = `https://vision.googleapis.com/v1/images:annotate?key=${visionApiKey}`;

    const body = {
        requests: [
            {
                image: { content: base64 },
                features: [{ type: "TEXT_DETECTION", maxResults: 50 }]
            }
        ]
    };

    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });

    return res.json();
}


//------------------------------------------------------------
// 3桁抽出
//------------------------------------------------------------
function parse3Digits(textAnnotations) {

    if (!textAnnotations || !Array.isArray(textAnnotations)) return [];

    const out = [];

    for (let i = 1; i < textAnnotations.length; i++) {
        const t = textAnnotations[i].description.trim();
        if (/^\d{3}$/.test(t)) {

            const v = textAnnotations[i].boundingPoly.vertices || [];

            const x = v[0]?.x || 0;
            const y = v[0]?.y || 0;
            const w = Math.max((v[1]?.x || x) - x, 10);
            const h = Math.max((v[2]?.y || y) - y, 10);

            out.push({ number: t, x, y, w, h });
        }
    }

    return out;
}


//------------------------------------------------------------
// OCR 実行
//------------------------------------------------------------
async function detectNumbers(bitmap) {
    const dataUrl = bitmap.toDataURL("image/jpeg", 0.85);
    const base64 = dataUrl.split(",")[1];

    // キー未設定なら OCR しない（重要）
    if (!visionApiKey) {
        console.warn("Vision API key not set — skipping OCR.");
        return [];
    }

    const resp = await callVisionAPI(base64);

    const textAnn = resp?.responses?.[0]?.textAnnotations;
    if (!textAnn) return [];

    return parse3Digits(textAnn);
}


//------------------------------------------------------------
// Qモード処理（重要な修正点：class 名を CSS に合わせた）
//------------------------------------------------------------
async function runQModeScan() {

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const results = await detectNumbers(canvas);

    lastQNumbers = results.map(r => r.number);

    const list = document.getElementById("q-results");
    list.innerHTML = "";

    // --- ここで CSS に合わせたクラス名を付与 ---
    results.forEach(item => {
        const wrapper = document.createElement("div");
        wrapper.className = "quest-item";        // <- CSS 側と一致させる（重要）

        const cut = document.createElement("canvas");
        cut.width = item.w + 60;
        cut.height = item.h + 60;

        cut.getContext("2d").drawImage(
            canvas,
            Math.max(item.x - 30, 0),
            Math.max(item.y - 30, 0),
            cut.width,
            cut.height,
            0, 0, cut.width, cut.height
        );

        const img = document.createElement("img");
        img.className = "quest-thumb";          // <- CSS と一致
        img.src = cut.toDataURL();

        const txt = document.createElement("div");
        txt.className = "quest-text";           // <- CSS と一致
        txt.innerText = item.number;
        // 保険でスタイルを明示（赤）
        txt.style.color = "red";
        txt.style.fontWeight = "bold";

        wrapper.appendChild(img);
        wrapper.appendChild(txt);
        list.appendChild(wrapper);
    });
}


//------------------------------------------------------------
// Aモード処理（Aは黒、重複防止済み）
//------------------------------------------------------------
async function runAModeScan() {
    if (lastQNumbers.length === 0) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const results = await detectNumbers(canvas);

    results.forEach(item => {
        if (!lastQNumbers.includes(item.number)) return;

        const key = `${item.number}_${Math.round(item.x)}_${Math.round(item.y)}`;
        if (answerHistory.has(key)) return;
        answerHistory.add(key);

        const tightTop = 40;
        const tightBottom = 100;
        const tightSide = 25;

        const sx = Math.max(item.x - tightSide, 0);
        const sy = Math.max(item.y - tightTop, 0);
        const sw = item.w + tightSide * 2;
        const sh = item.h + tightTop + tightBottom;

        const cut = document.createElement("canvas");
        cut.width = sw;
        cut.height = sh;

        cut.getContext("2d").drawImage(
            canvas,
            sx, sy, sw, sh,
            0, 0, sw, sh
        );

        appendAModeResult(item.number, cut.toDataURL());
    });
}


//------------------------------------------------------------
// Aモード結果追加（黒テキスト）
 //（A結果は q 用と異なる見た目でもよければ class を分ける）
 //------------------------------------------------------------
function appendAModeResult(num, imgData) {
    const list = document.getElementById("a-results");

    const wrapper = document.createElement("div");
    wrapper.className = "quest-item"; // レイアウト揃えたいなら同じクラスでも OK

    const img = document.createElement("img");
    img.className = "quest-thumb";
    img.src = imgData;

    const txt = document.createElement("div");
    txt.className = "quest-text";
    txt.innerText = num;
    txt.style.color = "black"; // A は黒
    txt.style.fontWeight = "bold";

    wrapper.appendChild(img);
    wrapper.appendChild(txt);
    list.appendChild(wrapper);
}


//------------------------------------------------------------
// 撮影（Q/A）
 //------------------------------------------------------------
async function captureFrame() {
    if (currentMode === "Q") {
        await runQModeScan();
    } else {
        await runAModeScan();
    }
}


//------------------------------------------------------------
// 初期起動
//------------------------------------------------------------
(async () => {
    await ensureApiKey();
    await startCamera();
    setMode("Q");
})();


//------------------------------------------------------------
// 長押し撮影（色変化）
//------------------------------------------------------------
let pressTimer = null;
let isPressing = false;

function startPress() {
    if (isPressing) return;
    isPressing = true;
    camBtn.classList.add("pressing");

    captureFrame();

    pressTimer = setInterval(() => {
        if (isPressing) captureFrame();
    }, 350);
}

function endPress() {
    if (!isPressing) return;
    isPressing = false;
    camBtn.classList.remove("pressing");
    clearInterval(pressTimer);
}

// PC
camBtn.addEventListener("mousedown", startPress);
camBtn.addEventListener("mouseup", endPress);
camBtn.addEventListener("mouseleave", endPress);

// スマホ
camBtn.addEventListener("touchstart", (e)=>{ e.preventDefault(); startPress(); }, {passive:false});
camBtn.addEventListener("touchend", (e)=>{ e.preventDefault(); endPress(); }, {passive:false});


//------------------------------------------------------------
// クリア
//------------------------------------------------------------
clearBtn.addEventListener("click", () => {
    document.getElementById("q-results").innerHTML = "";
    document.getElementById("a-results").innerHTML = "";
    answerHistory.clear();
});
