const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const qBtn = document.getElementById("qMode");
const aBtn = document.getElementById("aMode");
const camBtn = document.getElementById("camera-btn");
const clearBtn = document.getElementById("clear-btn");

const qResults = document.getElementById("q-results");
const aResults = document.getElementById("a-results");

let currentMode = "Q";
let stream = null;

let lastQNumbers = [];
let answerHistory = new Set();
const savedANumbers = new Map();

let visionApiKey = null;

const INTERVAL_MS = 1000;

// ================== APIキー ==================
async function askForApiKeyIfNeeded() {
    visionApiKey = localStorage.getItem("vision_api_key");
    if (visionApiKey) return;

    const key = prompt("Vision API Key を入力してください");
    if (!key || !key.trim()) {
        alert("APIキーが必要です");
        return askForApiKeyIfNeeded();
    }
    visionApiKey = key.trim();
    localStorage.setItem("vision_api_key", visionApiKey);
}

// ================== カメラ ==================
async function startCamera() {
    try {
        if (stream) stream.getTracks().forEach(t => t.stop());

        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: { ideal: "environment" },
                aspectRatio: { exact: 16 / 9 },
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            },
            audio: false
        });

        video.srcObject = stream;
        await video.play().catch(()=>{});

        canvas.width = video.videoWidth || 1920;
        canvas.height = video.videoHeight || 1080;

    } catch (e) {
        alert("カメラを開始できません。Chromeの許可を確認してください");
        console.error(e);
    }
}

window.addEventListener("orientationchange", startCamera);

// ================== モード ==================
function setMode(mode) {
    currentMode = mode;
    qBtn.classList.toggle("active", mode === "Q");
    aBtn.classList.toggle("active", mode === "A");
}

qBtn.onclick = () => setMode("Q");
aBtn.onclick = () => setMode("A");

// ================== 正規化 ==================
function normalizeNumber(raw) {
    if (!raw) return "";
    const map = {"０":"0","１":"1","２":"2","３":"3","４":"4","５":"5","６":"6","７":"7","８":"8","９":"9"};
    let s = String(raw);
    s = s.replace(/[\uFF10-\uFF19]/g, c => map[c] ?? c);
    return s.replace(/[^\d]/g, "");
}

// ================== Vision ==================
async function callVision(img) {
    if (!visionApiKey) return null;

    const res = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${visionApiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            requests: [{
                image: { content: img },
                features: [{ type: "TEXT_DETECTION", maxResults: 50 }]
            }]
        })
    }).catch(()=>null);

    return res ? res.json() : null;
}

// ================== 3桁抽出 ==================
function parseDigits(texts) {
    if (!Array.isArray(texts)) return [];

    const out = [];

    for (let i = 1; i < texts.length; i++) {
        const t = texts[i];
        const num = normalizeNumber(t?.description);
        if (!/^\d{3}$/.test(num)) continue;

        const v = t.boundingPoly?.vertices || [];
        const x = v[0]?.x || 0;
        const y = v[0]?.y || 0;
        const w = Math.max((v[1]?.x || x) - x, 8);
        const h = Math.max((v[2]?.y || y) - y, 8);

        out.push({ number:num, x, y, w, h });
    }
    return out;
}

// ================== キャプチャ ==================
function captureFrame() {
    const c = document.createElement("canvas");
    c.width = video.videoWidth || canvas.width;
    c.height = video.videoHeight || canvas.height;
    c.getContext("2d").drawImage(video, 0, 0, c.width, c.height);
    return c;
}

// ================== OCR ==================
async function detectFromCanvas(c) {
    const base64 = c.toDataURL("image/jpeg", 0.9).split(",")[1];
    const resp = await callVision(base64);
    return parseDigits(resp?.responses?.[0]?.textAnnotations);
}

// ================== Qモード ==================
async function runQMode() {
    if (!video.videoWidth) return;

    const frame = captureFrame();
    const list = await detectFromCanvas(frame);

    const uniq = new Map();
    list.forEach(d => { if (!uniq.has(d.number)) uniq.set(d.number, d); });

    const detected = [...uniq.values()];
    lastQNumbers = detected.map(d => d.number);

    qResults.innerHTML = "";
    aResults.innerHTML = "";

    detected.forEach(d => {
        const cut = document.createElement("canvas");
        const margin = 80;  // ← ここを +10 しました

        const sx = Math.max(d.x - margin, 0);
        const sy = Math.max(d.y - margin, 0);
        const sw = d.w + margin * 2;
        const sh = d.h + margin * 2;

        cut.width = sw;
        cut.height = sh;

        cut.getContext("2d").drawImage(frame, sx, sy, sw, sh, 0, 0, sw, sh);

        const wrap = document.createElement("div");
        wrap.className = "quest-item";

        const img = document.createElement("img");
        img.className = "quest-thumb";
        img.src = cut.toDataURL();

        const txt = document.createElement("div");
        txt.className = "quest-text";
        txt.style.color = "red";
        txt.innerText = d.number;

        wrap.appendChild(img);
        wrap.appendChild(txt);

        qResults.appendChild(wrap);
    });

    syncAnswers();
}

// ================== Aモード ==================
async function runAMode() {
    if (!video.videoWidth) return;

    const frame = captureFrame();
    const list = await detectFromCanvas(frame);

    const uniq = new Map();
    list.forEach(d => { if (!uniq.has(d.number)) uniq.set(d.number, d); });

    const detected = [...uniq.values()];

    detected.forEach(d => {
        const mTop = 60, mBottom = 120, mSide = 45;  // ← ここを +10 しました

        const sx = Math.max(d.x - mSide, 0);
        const sy = Math.max(d.y - mTop, 0);
        const sw = d.w + mSide * 2;
        const sh = d.h + mTop + mBottom;

        const cut = document.createElement("canvas");
        cut.width = sw;
        cut.height = sh;

        cut.getContext("2d").drawImage(frame, sx, sy, sw, sh, 0, 0, sw, sh);

        savedANumbers.set(d.number, cut.toDataURL());
    });

    syncAnswers();
}

// ================== 照合 ==================
function syncAnswers() {
    lastQNumbers.forEach(num => {
        if (!savedANumbers.has(num)) return;
        if (answerHistory.has(num)) return;

        answerHistory.add(num);

        const wrap = document.createElement("div");
        wrap.className = "quest-item";

        const img = document.createElement("img");
        img.className = "quest-thumb";
        img.src = savedANumbers.get(num);

        const txt = document.createElement("div");
        txt.className = "quest-text";
        txt.style.color = "black";
        txt.innerText = num;

        wrap.appendChild(img);
        wrap.appendChild(txt);

        aResults.appendChild(wrap);
    });
}

// ================== 撮影 ==================
async function captureOnce() {
    if (currentMode === "Q") return runQMode();
    return runAMode();
}

// ================== 長押し ==================
let timer = null;
let pressing = false;

function startPress(e) {
    e.preventDefault();
    if (pressing) return;
    pressing = true;

    camBtn.classList.add("pressing");

    captureOnce();
    timer = setInterval(captureOnce, INTERVAL_MS);
}

function endPress() {
    pressing = false;
    camBtn.classList.remove("pressing");

    if (timer) {
        clearInterval(timer);
        timer = null;
    }
}

camBtn.addEventListener("mousedown", startPress);
camBtn.addEventListener("touchstart", startPress, { passive:false });

document.addEventListener("mouseup", endPress);
document.addEventListener("touchend", endPress);
camBtn.addEventListener("mouseleave", endPress);

// ================== クリア ==================
clearBtn.onclick = () => {
    qResults.innerHTML = "";
    aResults.innerHTML = "";
    lastQNumbers = [];
    answerHistory.clear();
};

// ================== 初期化 ==================
window.addEventListener("load", async () => {
    await askForApiKeyIfNeeded();
    await startCamera();
    setMode("Q");
});