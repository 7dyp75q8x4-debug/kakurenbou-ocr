/*******************************************************
 *  元の機能は維持したまま
 *  ・APIキー画面 復活
 *  ・カメラ（外側＋できれば広角 + 16:9）
 *  ・カメラボタン長押し連写
 *******************************************************/

const video = document.getElementById("camera");   // ← あなたのUI
const canvas = document.createElement("canvas");
const ctx = canvas.getContext("2d");

const qBtn = document.getElementById("qMode");
const aBtn = document.getElementById("aMode");
const camBtn = document.getElementById("onBtn");
const clearBtn = document.getElementById("trash");

let currentMode = "Q";
let stream = null;

let lastQNumbers = [];
let answerHistory = new Set();
const savedANumbers = new Map();

let visionApiKey = localStorage.getItem("vision_api_key");
const INTERVAL_MS = 1000;

let ocrInterval = null;
let isPressing = false;

/* =====================================================
   APIキー
===================================================== */
async function askForApiKeyIfNeeded() {
    if (visionApiKey) return;

    const key = prompt("Google Vision API キーを入力してください");
    if (key && key.trim()) {
        visionApiKey = key.trim();
        localStorage.setItem("vision_api_key", visionApiKey);
        return;
    } else {
        await askForApiKeyIfNeeded();
    }
}

/* =====================================================
   外カメラ + 広角 優先
===================================================== */
async function getBackUltraWideCameraId() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter(d => d.kind === "videoinput");

    const backCams = cams.filter(d => !/front|user|face/i.test(d.label));

    const ultra = backCams.find(d =>
        d.label.includes("0.5") ||
        d.label.toLowerCase().includes("ultra") ||
        d.label.includes("超広角")
    );

    if (ultra) return ultra.deviceId;
    if (backCams[0]) return backCams[0].deviceId;
    return cams[0]?.deviceId || null;
}

/* =====================================================
   カメラ起動（16:9 固定）
===================================================== */
async function startCamera() {
    try {
        if (stream) {
            stream.getTracks().forEach(t => t.stop());
        }

        const deviceId = await getBackUltraWideCameraId();
        const isLandscape = true; // 強制横扱い

        const constraints = {
            video: {
                deviceId: deviceId ? { exact: deviceId } : undefined,
                facingMode: { exact: "environment" },
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                aspectRatio: { exact: 16 / 9 }
            },
            audio: false
        };

        stream = await navigator.mediaDevices.getUserMedia(constraints);

        video.srcObject = stream;
        await video.play().catch(() => {});

        canvas.width = video.videoWidth || 1920;
        canvas.height = video.videoHeight || 1080;

    } catch (e) {
        console.error("Camera start failed:", e);
        alert("カメラの起動に失敗しました");
    }
}

/* =====================================================
   モード切替（維持）
===================================================== */
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

qBtn.addEventListener("click", () => setMode("Q"));
aBtn.addEventListener("click", () => setMode("A"));

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

    try {
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
        return await res.json();
    } catch {
        return null;
    }
}

/* =====================================================
   OCR用抽出
===================================================== */
async function detectThreeDigitFromCanvas(c) {
    const dataUrl = c.toDataURL("image/jpeg", 0.9);
    const base64 = dataUrl.split(",")[1];

    const resp = await callVisionTextDetection(base64);
    if (!resp?.responses?.[0]) return [];

    const ann = resp.responses[0].textAnnotations || [];
    const out = [];

    for (let i = 1; i < ann.length; i++) {
        const ta = ann[i];
        if (!ta?.description) continue;

        const num = normalizeNumber(ta.description);
        if (!/^\d{3}$/.test(num)) continue;

        const v = ta.boundingPoly?.vertices || [];
        const x0 = v[0]?.x || 0;
        const y0 = v[0]?.y || 0;
        const x1 = v[1]?.x || x0;
        const y2 = v[2]?.y || y0;

        out.push({
            number: num,
            x: x0,
            y: y0,
            w: Math.max(x1 - x0, 8),
            h: Math.max(y2 - y0, 8)
        });
    }

    return out;
}

/* =====================================================
   フレーム取得
===================================================== */
function captureVideoFrameToCanvas() {
    const c = document.createElement("canvas");
    c.width = video.videoWidth || canvas.width;
    c.height = video.videoHeight || canvas.height;
    c.getContext("2d").drawImage(video, 0, 0, c.width, c.height);
    return c;
}

/* =====================================================
   Qモード
===================================================== */
async function runQModeScan() {
    const frame = captureVideoFrameToCanvas();
    const detected = await detectThreeDigitFromCanvas(frame);

    const map = new Map();
    detected.forEach(d => { if (!map.has(d.number)) map.set(d.number, d); });

    const unique = [...map.values()];
    lastQNumbers = unique.map(d => d.number);

    const area = document.getElementById("left-panel");
    area.innerHTML = "";

    unique.forEach(item => {
        const div = document.createElement("div");
        div.className = "quest-item";
        div.innerHTML = `<div class="quest-text" style="color:red">${item.number}</div>`;
        area.appendChild(div);
    });

    syncSavedAnswersToA();
}

/* =====================================================
   Aモード
===================================================== */
async function runAModeScan() {
    const frame = captureVideoFrameToCanvas();
    const detected = await detectThreeDigitFromCanvas(frame);

    detected.forEach(item => {
        const cut = document.createElement("canvas");
        cut.width = item.w;
        cut.height = item.h;

        cut.getContext("2d").drawImage(
            frame,
            item.x, item.y, item.w, item.h,
            0, 0, item.w, item.h
        );

        savedANumbers.set(item.number, cut.toDataURL());
    });
}

/* =====================================================
   保存済み反映
===================================================== */
function syncSavedAnswersToA() {
    const area = document.getElementById("left-panel");

    lastQNumbers.forEach(num => {
        if (!savedANumbers.has(num)) return;
        if (answerHistory.has(num)) return;

        answerHistory.add(num);

        const div = document.createElement("div");
        div.className = "quest-item";
        div.innerHTML = `<div class="quest-text" style="color:black">${num}</div>`;
        area.appendChild(div);
    });
}

/* =====================================================
   1回キャプチャ
===================================================== */
async function captureOnce() {
    if (currentMode === "Q") {
        await runQModeScan();
    } else {
        await runAModeScan();
    }
}

/* =====================================================
   カメラボタン 長押し連写
===================================================== */
function startPressHandler(e) {
    e.preventDefault();
    if (isPressing) return;
    isPressing = true;

    captureOnce();
    ocrInterval = setInterval(() => {
        captureOnce();
    }, INTERVAL_MS);
}

function endPressHandler() {
    isPressing = false;
    if (ocrInterval) {
        clearInterval(ocrInterval);
        ocrInterval = null;
    }
}

camBtn.addEventListener("mousedown", startPressHandler);
camBtn.addEventListener("touchstart", startPressHandler, { passive:false });
document.addEventListener("mouseup", endPressHandler);
document.addEventListener("touchend", endPressHandler);

/* =====================================================
   ゴミ箱
===================================================== */
clearBtn.addEventListener("click", () => {
    document.getElementById("left-panel").innerHTML = "";
    lastQNumbers = [];
    answerHistory.clear();
});

/* =====================================================
   初期化
===================================================== */
window.addEventListener("DOMContentLoaded", async () => {
    await askForApiKeyIfNeeded();
    await startCamera();
    setMode("Q");
});