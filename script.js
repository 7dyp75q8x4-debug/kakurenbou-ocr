/* =====================================================
   全体変数 / 要素取得
===================================================== */
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const qBtn = document.getElementById("qMode");
const aBtn = document.getElementById("aMode");
const camBtn = document.getElementById("camera-btn");
const clearBtn = document.getElementById("clear-btn");

const qResultsEl = document.getElementById("q-results");
const aResultsEl = document.getElementById("a-results");

let currentMode = "Q";
let stream = null;

let lastQNumbers = [];
let answerHistory = new Set();
const savedANumbers = new Map();

let visionApiKey = localStorage.getItem("vision_api_key");

const INTERVAL_MS = 1000;

/* =====================================================
   数字正規化
===================================================== */
function normalizeNumber(raw) {
    if (!raw) return "";
    const zenkaku = {"０":"0","１":"1","２":"2","３":"3","４":"4","５":"5","６":"6","７":"7","８":"8","９":"9"};
    let s = String(raw);
    s = s.replace(/[\uFF10-\uFF19]/g, ch => zenkaku[ch] ?? ch);
    s = s.replace(/[^\d]/g, "");
    return s;
}

/* =====================================================
   APIキー入力
===================================================== */
async function askForApiKeyIfNeeded() {
    if (visionApiKey) return;
    const key = prompt("Google Vision API キーを入力してください");
    if (key && key.trim()) {
        visionApiKey = key.trim();
        localStorage.setItem("vision_api_key", visionApiKey);
        return;
    }
    alert("APIキーが必要です。入力してください。");
    await askForApiKeyIfNeeded();
}

/* =====================================================
   外カメラ + 超広角
===================================================== */
async function getBackUltraWideCameraId() {
    await navigator.mediaDevices.getUserMedia({ video: true, audio: false }).catch(()=>{});
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter(d => d.kind === "videoinput");

    const back = cams.filter(d => !/front|user|face/i.test(d.label));
    const ultra = back.find(d =>
        d.label.includes("0.5") ||
        d.label.toLowerCase().includes("ultra") ||
        d.label.includes("超広角")
    );

    return ultra?.deviceId || back[0]?.deviceId || cams[0]?.deviceId || null;
}

/* =====================================================
   カメラ起動（16:9強制）
===================================================== */
async function startCamera() {
    try {
        const deviceId = await getBackUltraWideCameraId();

        const constraints = {
            video: {
                deviceId: deviceId ? { exact: deviceId } : undefined,
                facingMode: { exact: "environment" },
                width: { exact: 1920 },
                height: { exact: 1080 },
                aspectRatio: { exact: 16 / 9 }
            },
            audio: false
        };

        if (stream) stream.getTracks().forEach(t => t.stop());

        stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        await video.play().catch(()=>{});

        canvas.width = 1920;
        canvas.height = 1080;

    } catch (e) {
        alert("外カメラを開始できません");
        console.error(e);
    }
}

/* =====================================================
   モード切替
===================================================== */
function setMode(mode) {
    currentMode = mode;
    qBtn.classList.toggle("active", mode === "Q");
    aBtn.classList.toggle("active", mode === "A");
}

qBtn.onclick = () => setMode("Q");
aBtn.onclick = () => setMode("A");

/* =====================================================
   Vision API
===================================================== */
async function callVisionTextDetection(base64Image) {
    if (!visionApiKey) return null;

    const url = `https://vision.googleapis.com/v1/images:annotate?key=${visionApiKey}`;

    const body = {
        requests: [{
            image: { content: base64Image },
            features: [{ type: "TEXT_DETECTION", maxResults: 50 }]
        }]
    };

    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    }).catch(()=>null);

    return res ? res.json() : null;
}

/* =====================================================
   OCR抽出
===================================================== */
function parseTextAnnotationsFor3Digit(textAnn) {
    if (!textAnn) return [];
    const out = [];

    for (let i = 1; i < textAnn.length; i++) {
        const ta = textAnn[i];
        const num = normalizeNumber(ta?.description);
        if (!/^\d{3}$/.test(num)) continue;

        const v = ta.boundingPoly.vertices;
        const x0 = v[0].x || 0;
        const y0 = v[0].y || 0;
        const w  = Math.max((v[1].x || x0) - x0, 8);
        const h  = Math.max((v[2].y || y0) - y0, 8);

        out.push({ number: num, x: x0, y: y0, w, h });
    }
    return out;
}

/* =====================================================
   OCR
===================================================== */
async function detectThreeDigitFromCanvas(c) {
    const dataUrl = c.toDataURL("image/jpeg", 0.95);
    const base64 = dataUrl.split(",")[1];
    const resp = await callVisionTextDetection(base64);

    return parseTextAnnotationsFor3Digit(resp?.responses?.[0]?.textAnnotations);
}

/* =====================================================
   フレーム取得
===================================================== */
function captureVideoFrameToCanvas() {
    const c = document.createElement("canvas");
    c.width = 1920;
    c.height = 1080;
    c.getContext("2d").drawImage(video, 0, 0, 1920, 1080);
    return c;
}

/* =====================================================
   Qモード
===================================================== */
async function runQModeScan() {
    const frame = captureVideoFrameToCanvas();
    const detected = await detectThreeDigitFromCanvas(frame);

    const unique = [...new Map(detected.map(d => [d.number, d])).values()];
    lastQNumbers = unique.map(d => d.number);

    qResultsEl.innerHTML = "";

    const margin = 60;

    unique.forEach(item => {
        const cut = crop(frame, item, margin);

        const el = createItem(cut, item.number, "red");
        qResultsEl.prepend(el);
    });

    syncSavedAnswersToA();
}

/* =====================================================
   Aモード
===================================================== */
async function runAModeScan() {
    const frame = captureVideoFrameToCanvas();
    const detected = await detectThreeDigitFromCanvas(frame);

    const unique = [...new Map(detected.map(d => [d.number, d])).values()];

    unique.forEach(item => {
        const cut = crop(frame, item, 25, 40, 100);
        const dataUrl = cut.toDataURL();

        savedANumbers.set(item.number, dataUrl);

        if (!lastQNumbers.includes(item.number)) return;
        if (answerHistory.has(item.number)) return;

        answerHistory.add(item.number);
        aResultsEl.prepend(createItem(cut, item.number, "black"));
    });
}

/* =====================================================
   トリミング（元サイズ復元済み）
===================================================== */
function crop(frame, item, side=60, top=60, bottom=60) {
    const sx = Math.max(item.x - side, 0);
    const sy = Math.max(item.y - top, 0);
    const sw = item.w + side * 2;
    const sh = item.h + top + bottom;

    const c = document.createElement("canvas");
    c.width = sw;
    c.height = sh;
    c.getContext("2d").drawImage(frame, sx, sy, sw, sh, 0, 0, sw, sh);
    return c;
}

/* =====================================================
   要素生成（元レイアウト）
===================================================== */
function createItem(cutCanvas, number, color) {
    const wrap = document.createElement("div");
    wrap.className = "quest-item";

    const img = document.createElement("img");
    img.className = "quest-thumb";
    img.src = cutCanvas.toDataURL();

    const txt = document.createElement("div");
    txt.className = "quest-text";
    txt.innerText = number;
    txt.style.color = color;

    wrap.appendChild(img);
    wrap.appendChild(txt);
    return wrap;
}

/* =====================================================
   Q後：保存済み即反映
===================================================== */
function syncSavedAnswersToA() {
    lastQNumbers.forEach(num => {
        if (!savedANumbers.has(num)) return;
        if (answerHistory.has(num)) return;

        answerHistory.add(num);

        const imgUrl = savedANumbers.get(num);
        const wrap = document.createElement("div");
        wrap.className = "quest-item";

        const img = document.createElement("img");
        img.className = "quest-thumb";
        img.src = imgUrl;

        const txt = document.createElement("div");
        txt.className = "quest-text";
        txt.innerText = num;

        wrap.appendChild(img);
        wrap.appendChild(txt);

        aResultsEl.prepend(wrap);
    });
}

/* =====================================================
   実行
===================================================== */
async function captureOnce() {
    if (currentMode === "Q") await runQModeScan();
    else await runAModeScan();
}

/* =====================================================
   カメラボタン
===================================================== */
let ocrInterval = null;

camBtn.onmousedown = (e) => { e.preventDefault(); startPress(); };
camBtn.ontouchstart = (e) => { e.preventDefault(); startPress(); };
window.onmouseup = stopPress;
window.ontouchend = stopPress;

function startPress() {
    if (ocrInterval) return;
    camBtn.classList.add("pressing");
    captureOnce();
    ocrInterval = setInterval(captureOnce, INTERVAL_MS);
}

function stopPress() {
    if (!ocrInterval) return;
    camBtn.classList.remove("pressing");
    clearInterval(ocrInterval);
    ocrInterval = null;
}

/* =====================================================
   クリア
===================================================== */
clearBtn.onclick = () => {
    qResultsEl.innerHTML = "";
    aResultsEl.innerHTML = "";
    lastQNumbers = [];
    answerHistory.clear();
};

/* =====================================================
   初期化
===================================================== */
window.onload = async () => {
    await askForApiKeyIfNeeded();
    await startCamera();
    setMode("Q");
};