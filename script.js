/* =====================================================
   全体変数 / 要素取得
   （基礎はあなたの「正しい」コードを維持）
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

// ★ 追加：Aで切り抜いて保存した画像を保持（number -> dataURL）
const savedANumbers = new Map();

let visionApiKey = localStorage.getItem("vision_api_key");

// 撮影間隔（1秒）
const INTERVAL_MS = 1000;

/* =====================================================
   APIキー入力（そのまま）
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
   iPhone用：超広角カメラのdeviceId取得（そのまま）
===================================================== */
async function getUltraWideCameraId() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(d => d.kind === "videoinput");

    const ultra = videoDevices.find(d =>
        d.label.includes("0.5") ||
        d.label.toLowerCase().includes("ultra") ||
        d.label.includes("超広角")
    );

    return ultra?.deviceId || videoDevices[0]?.deviceId || null;
}

/* =====================================================
   カメラ起動（横画面16:9 + 超広角優先、あなたの既存ロジック維持）
===================================================== */
async function startCamera() {
    try {
        const deviceId = await getUltraWideCameraId();

        const isLandscape = window.innerWidth > window.innerHeight;

        const constraints = {
            video: {
                deviceId: deviceId ? { exact: deviceId } : undefined,
                facingMode: { ideal: "environment" },
                width: isLandscape
                    ? { ideal: 1920 }
                    : { ideal: 1280 },
                height: isLandscape
                    ? { ideal: 1080 }
                    : { ideal: 720 },
                aspectRatio: isLandscape
                    ? { exact: 16 / 9 }
                    : undefined,
                advanced: [
                    { zoom: 0 }
                ]
            },
            audio: false
        };

        stream = await navigator.mediaDevices.getUserMedia(constraints);

        video.srcObject = stream;
        await video.play().catch(()=>{});

        canvas.width = video.videoWidth || (isLandscape ? 1920 : 1280);
        canvas.height = video.videoHeight || (isLandscape ? 1080 : 720);

    } catch (e) {
        console.error("Camera start error:", e);
        alert("カメラを開始できませんでした: " + (e?.message || e));
    }
}

/* =====================================================
   向きが変わったら再起動（16:9維持）
===================================================== */
window.addEventListener("orientationchange", async () => {
    if (stream) {
        stream.getTracks().forEach(t => t.stop());
    }
    await startCamera();
});

/* =====================================================
   モード切替（そのまま）
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
   Vision API 呼び出し（そのまま）
===================================================== */
async function callVisionTextDetection(base64Image) {
    if (!visionApiKey) {
        console.warn("Vision API key not set — skipping OCR.");
        return null;
    }
    const url = `https://vision.googleapis.com/v1/images:annotate?key=${visionApiKey}`;
    const body = {
        requests: [
            {
                image: { content: base64Image },
                features: [{ type: "TEXT_DETECTION", maxResults: 50 }]
            }
        ]
    };
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
        return await res.json();
    } catch (e) {
        console.error("Vision API call failed:", e);
        return null;
    }
}

/* =====================================================
   3桁抽出（そのまま）
===================================================== */
function parseTextAnnotationsFor3Digit(textAnn) {
    if (!textAnn || !Array.isArray(textAnn)) return [];
    const out = [];
    for (let i = 1; i < textAnn.length; i++) {
        const ta = textAnn[i];
        if (!ta?.description) continue;
        const txt = ta.description.trim();
        if (!/^\d{3}$/.test(txt)) continue;

        const verts = ta.boundingPoly?.vertices || [];
        const x0 = verts[0]?.x || 0;
        const y0 = verts[0]?.y || 0;
        const x1 = verts[1]?.x || x0;
        const y2 = verts[2]?.y || y0;
        const w = Math.max(x1 - x0, 8);
        const h = Math.max(y2 - y0, 8);

        out.push({ number: txt, x: x0, y: y0, w, h });
    }
    return out;
}

/* canvas → OCR（そのまま） */
async function detectThreeDigitFromCanvas(c) {
    const dataUrl = c.toDataURL("image/jpeg", 0.9);
    const base64 = dataUrl.split(",")[1];
    const resp = await callVisionTextDetection(base64);
    if (!resp?.responses?.[0]) return [];
    const textAnn = resp.responses[0].textAnnotations;
    if (!textAnn) return [];
    return parseTextAnnotationsFor3Digit(textAnn);
}

/* フレームコピー（そのまま） */
function captureVideoFrameToCanvas() {
    const c = document.createElement("canvas");
    c.width = video.videoWidth || canvas.width;
    c.height = video.videoHeight || canvas.height;
    c.getContext("2d").drawImage(video, 0, 0, c.width, c.height);
    return c;
}

/* =====================================================
   Qモード（変更点：保存済み画像は dataURL を使って表示する）
===================================================== */
async function runQModeScan() {
    if (!video.videoWidth) return;

    const frame = captureVideoFrameToCanvas();
    const detected = await detectThreeDigitFromCanvas(frame);

    const uniqueMap = new Map();
    detected.forEach(item => {
        if (!uniqueMap.has(item.number)) uniqueMap.set(item.number, item);
    });
    const uniqueDetected = [...uniqueMap.values()];

    lastQNumbers = uniqueDetected.map(d => d.number);
    qResultsEl.innerHTML = "";
    const margin = 60;

    uniqueDetected.forEach(item => {
        const sx = Math.max(item.x - margin, 0);
        const sy = Math.max(item.y - margin, 0);
        const sw = item.w + margin * 2;
        const sh = item.h + margin * 2;

        const cut = document.createElement("canvas");
        cut.width = sw;
        cut.height = sh;
        cut.getContext("2d").drawImage(frame, sx, sy, sw, sh, 0, 0, sw, sh);

        const wrapper = document.createElement("div");
        wrapper.className = "quest-item";

        const img = document.createElement("img");
        img.className = "quest-thumb";
        img.src = cut.toDataURL();

        const txt = document.createElement("div");
        txt.className = "quest-text";
        txt.innerText = item.number;
        txt.style.color = "red";

        wrapper.appendChild(img);
        wrapper.appendChild(txt);
        qResultsEl.appendChild(wrapper);
    });

    // ★ ここで「保存済み」の画像付きデータをそのまま表示する（再トリミングしない）
    autoShowFromSaved(frame);
}

/* =====================================================
   Aモード（変更点：見つけたらトリミングして dataURL を savedANumbers に保存）
===================================================== */
async function runAModeScan() {
    if (!video.videoWidth) return;
    if (lastQNumbers.length === 0) return;

    const frame = captureVideoFrameToCanvas();
    const detected = await detectThreeDigitFromCanvas(frame);

    const uniqueMap = new Map();
    detected.forEach(item => {
        if (!uniqueMap.has(item.number)) uniqueMap.set(item.number, item);
    });
    const uniqueDetected = [...uniqueMap.values()];

    // 元のコードのトリミング値をそのまま使う（あなた指定の比率を維持）
    const tightTop = 40;
    const tightBottom = 100;
    const tightSide = 25;

    uniqueDetected.forEach(item => {
        if (!lastQNumbers.includes(item.number)) return;
        if (answerHistory.has(item.number)) return;
        answerHistory.add(item.number);

        const sx = Math.max(item.x - tightSide, 0);
        const sy = Math.max(item.y - tightTop, 0);
        const sw = item.w + tightSide * 2;
        const sh = item.h + tightTop + tightBottom;

        // 切り抜きして dataURL を作る（これを保存）
        const cut = document.createElement("canvas");
        cut.width = sw;
        cut.height = sh;
        cut.getContext("2d").drawImage(frame, sx, sy, sw, sh, 0, 0, sw, sh);
        const dataUrl = cut.toDataURL();

        // ★ 保存（number -> dataURL）
        savedANumbers.set(item.number, dataUrl);

        // 画面表示（元どおり）
        const wrapper = document.createElement("div");
        wrapper.className = "quest-item";

        const img = document.createElement("img");
        img.className = "quest-thumb";
        img.src = dataUrl;

        const txt = document.createElement("div");
        txt.className = "quest-text";
        txt.innerText = item.number;
        txt.style.color = "black";

        wrapper.appendChild(img);
        wrapper.appendChild(txt);
        aResultsEl.appendChild(wrapper);
    });
}

/* =====================================================
   Q専用：保存済みAと照合して即表示（保存は dataURL なので再トリミング不要）
   - savedANumbers にあれば、そのまま aResults に追加する
   - answerHistory で重複は防止
===================================================== */
function autoShowFromSaved(frame) {
    // 保持している savedANumbers の dataURL を使って表示
    lastQNumbers.forEach(num => {
        if (!savedANumbers.has(num)) return;
        if (answerHistory.has(num)) return;

        answerHistory.add(num);

        const dataUrl = savedANumbers.get(num);

        const wrapper = document.createElement("div");
        wrapper.className = "quest-item";

        const img = document.createElement("img");
        img.className = "quest-thumb";
        img.src = dataUrl;

        const txt = document.createElement("div");
        txt.className = "quest-text";
        txt.innerText = num;
        txt.style.color = "black";

        wrapper.appendChild(img);
        wrapper.appendChild(txt);
        aResultsEl.appendChild(wrapper);
    });
}

/* =====================================================
   単発キャプチャ（そのまま）
===================================================== */
async function captureOnce() {
    if (currentMode === "Q") {
        await runQModeScan();
    } else {
        await runAModeScan();
    }
}

/* =====================================================
   長押し（そのまま）
===================================================== */
let ocrInterval = null;

function startPress() {
    if (ocrInterval) return;
    camBtn.classList.add("pressing");
    captureOnce();
    ocrInterval = setInterval(() => {
        captureOnce();
    }, INTERVAL_MS);
}

function stopPress() {
    if (!ocrInterval) return;
    camBtn.classList.remove("pressing");
    clearInterval(ocrInterval);
    ocrInterval = null;
}

camBtn.addEventListener("mousedown", e => { e.preventDefault(); startPress(); });
window.addEventListener("mouseup", stopPress);
camBtn.addEventListener("mouseleave", stopPress);

camBtn.addEventListener("touchstart", e => { e.preventDefault(); startPress(); }, { passive: false });
window.addEventListener("touchend", stopPress);
camBtn.addEventListener("click", e => e.preventDefault());

/* =====================================================
   クリア（通常）／ガチゴミ箱：両方で savedANumbers を適切に扱う
===================================================== */
clearBtn.addEventListener("click", () => {
    qResultsEl.innerHTML = "";
    aResultsEl.innerHTML = "";
    lastQNumbers = [];
    answerHistory.clear();
    // 通常クリアは「保存」は残す仕様ならここは触らない。
    // もし通常クリアで保存も消したければ uncomment する：
    // savedANumbers.clear();
});

/* ガチゴミ箱（完全リセット） — 確認ダイアログあり */
function hardClearConfirmAndReset() {
    const ok = confirm("新規でかくれんぼを開始しますか？\n読み取って保存した数字は全てリセットされます");
    if (!ok) return;
    qResultsEl.innerHTML = "";
    aResultsEl.innerHTML = "";
    lastQNumbers = [];
    answerHistory.clear();
    savedANumbers.clear();
}

// ガチボタンがページにあるなら紐付け（なければスキップ）
const hardBtn = document.getElementById("hard-clear-btn");
if (hardBtn) {
    hardBtn.addEventListener("click", hardClearConfirmAndReset);
}

/* =====================================================
   初期化（そのまま）
===================================================== */
window.addEventListener("DOMContentLoaded", async () => {
    await askForApiKeyIfNeeded();
    await startCamera();
    setMode("Q");
});