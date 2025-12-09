/* ========= DOM取得 ========= */
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
let visionApiKey = localStorage.getItem("vision_api_key");

let lastQNumbers = [];
const savedANumbers = new Map();
const answerHistory = new Set();

const INTERVAL_MS = 1000;

/* ========= APIキー ========= */
async function askForApiKeyIfNeeded() {
    if (visionApiKey) return;
    const key = prompt("Google Vision APIキーを入力してください");
    if (key && key.trim()) {
        visionApiKey = key.trim();
        localStorage.setItem("vision_api_key", visionApiKey);
    }
}

/* ========= カメラ起動（16:9 + 超広角優先） ========= */
async function getUltraWideCameraId() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter(d => d.kind === "videoinput");

    const ultra = cams.find(d =>
        d.label.includes("0.5") ||
        d.label.includes("ultra") ||
        d.label.includes("超広角")
    );

    return ultra?.deviceId || cams[0]?.deviceId || null;
}

async function startCamera() {
    try {
        if (stream) stream.getTracks().forEach(t => t.stop());

        const deviceId = await getUltraWideCameraId();

        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                deviceId: deviceId ? { exact: deviceId } : undefined,
                facingMode: { ideal: "environment" },
                width: { ideal: 1280 },
                height: { ideal: 720 },
                aspectRatio: { ideal: 16 / 9 }
            },
            audio: false
        });

        video.srcObject = stream;
        await video.play();

        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;

    } catch (e) {
        alert("カメラ起動失敗: " + e.message);
        console.error(e);
    }
}

/* ========= モード切替 ========= */
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

qBtn.onclick = () => setMode("Q");
aBtn.onclick = () => setMode("A");

/* ========= OCR 基本 ========= */
async function callVision(base64) {
    if (!visionApiKey) return null;

    const res = await fetch(
        `https://vision.googleapis.com/v1/images:annotate?key=${visionApiKey}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                requests: [{
                    image: { content: base64 },
                    features: [{ type: "TEXT_DETECTION", maxResults: 50 }]
                }]
            })
        }
    );
    return await res.json();
}

function extract3Digits(ann) {
    if (!ann) return [];
    const out = [];

    for (let i = 1; i < ann.length; i++) {
        const t = ann[i];
        if (!/^\d{3}$/.test(t.description)) continue;

        const v = t.boundingPoly.vertices;
        const x = v[0].x || 0;
        const y = v[0].y || 0;
        const w = (v[1].x - v[0].x) || 10;
        const h = (v[2].y - v[0].y) || 10;

        out.push({ number: t.description, x, y, w, h });
    }
    return out;
}

function captureFrame() {
    const c = document.createElement("canvas");
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    c.getContext("2d").drawImage(video, 0, 0, c.width, c.height);
    return c;
}

/* ========= Qモード ========= */
async function runQ() {
    const frame = captureFrame();
    const base64 = frame.toDataURL("image/jpeg", 0.9).split(",")[1];
    const res = await callVision(base64);
    if (!res?.responses?.[0]) return;

    const detected = extract3Digits(
        res.responses[0].textAnnotations
    );

    const map = new Map();
    detected.forEach(d => { if (!map.has(d.number)) map.set(d.number, d); });
    const unique = [...map.values()];

    lastQNumbers = unique.map(d => d.number);

    qResultsEl.innerHTML = "";

    unique.forEach(item => {
        const div = document.createElement("div");
        div.className = "quest-item";

        const imgC = document.createElement("canvas");
        const M = 60;

        imgC.width = item.w + M*2;
        imgC.height = item.h + M*2;

        imgC.getContext("2d").drawImage(
            frame,
            Math.max(item.x - M, 0),
            Math.max(item.y - M, 0),
            item.w + M*2,
            item.h + M*2,
            0,
            0,
            imgC.width,
            imgC.height
        );

        const img = document.createElement("img");
        img.className = "quest-thumb";
        img.src = imgC.toDataURL();

        const txt = document.createElement("div");
        txt.className = "quest-text";
        txt.style.color = "red";
        txt.textContent = item.number;

        div.append(img, txt);
        qResultsEl.appendChild(div);
    });

    matchSavedA();
}

/* ========= Aモード（保存） ========= */
async function runA() {
    const frame = captureFrame();
    const base64 = frame.toDataURL("image/jpeg", 0.9).split(",")[1];
    const res = await callVision(base64);
    if (!res?.responses?.[0]) return;

    const detected = extract3Digits(
        res.responses[0].textAnnotations
    );

    detected.forEach(item => {
        const top = 40, side = 25, bottom = 100;

        const cut = document.createElement("canvas");
        cut.width = item.w + side*2;
        cut.height = item.h + top + bottom;

        cut.getContext("2d").drawImage(
            frame,
            Math.max(item.x - side, 0),
            Math.max(item.y - top, 0),
            item.w + side*2,
            item.h + top + bottom,
            0,
            0,
            cut.width,
            cut.height
        );

        savedANumbers.set(item.number, cut.toDataURL());
    });
}

/* ========= A 保存物とQ照合 ========= */
function matchSavedA() {
    aResultsEl.innerHTML = "";

    lastQNumbers.forEach(num => {
        if (!savedANumbers.has(num)) return;
        if (answerHistory.has(num)) return;

        answerHistory.add(num);

        const div = document.createElement("div");
        div.className = "quest-item";

        const img = document.createElement("img");
        img.className = "quest-thumb";
        img.src = savedANumbers.get(num);

        const txt = document.createElement("div");
        txt.className = "quest-text";
        txt.style.color = "black";
        txt.textContent = num;

        div.append(img, txt);
        aResultsEl.appendChild(div);
    });
}

/* ========= 撮影（長押し） ========= */
let timer = null;
let pressing = false;

function startPress(e) {
    e.preventDefault();
    if (pressing) return;
    pressing = true;

    captureOnce();
    timer = setInterval(captureOnce, INTERVAL_MS);
}

function stopPress() {
    pressing = false;
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
}

async function captureOnce() {
    if (currentMode === "Q") await runQ();
    else await runA();
}

camBtn.addEventListener("mousedown", startPress);
camBtn.addEventListener("touchstart", startPress, {passive:false});
window.addEventListener("mouseup", stopPress);
window.addEventListener("touchend", stopPress);

/* ========= クリア ========= */
clearBtn.onclick = () => {
    qResultsEl.innerHTML = "";
    aResultsEl.innerHTML = "";
    lastQNumbers = [];
    answerHistory.clear();
};

/* ========= 初期化 ========= */
window.addEventListener("DOMContentLoaded", async () => {
    await askForApiKeyIfNeeded();
    await startCamera();
    setMode("Q");
});