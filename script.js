/* =====================================================
   全体変数 / 要素取得
   （あなたのベースコードを維持しつつ必要な追加のみ）
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

// ★ 追加：Aモードで一度でも見えた数字を「画像付き」で保存
//      key: 正規化された3桁文字列 -> value: dataURL (切り抜き画像)
const savedANumbers = new Map();

let visionApiKey = localStorage.getItem("vision_api_key");

// 撮影間隔（1秒）
const INTERVAL_MS = 1000;

/* =====================================================
   数字正規化（全角・空白・非数字を取り除く）
===================================================== */
function normalizeNumber(raw) {
    if (!raw) return "";
    // 全角→半角、その他数字以外を除去
    // （念のため、全角数字を半角にする変換を含める）
    const zenkaku = {"０":"0","１":"1","２":"2","３":"3","４":"4","５":"5","６":"6","７":"7","８":"8","９":"9"};
    let s = String(raw);
    s = s.replace(/[\uFF10-\uFF19]/g, ch => zenkaku[ch] ?? ch);
    s = s.replace(/[^\d]/g, ""); // 数字以外を全部取り除く
    return s;
}

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
   カメラ起動（あなたの既存ロジックを維持）
===================================================== */
async function startCamera() {
    try {
        const deviceId = await getUltraWideCameraId();

        const isLandscape = window.innerWidth > window.innerHeight;

        const constraints = {
            video: {
                deviceId: deviceId ? { exact: deviceId } : undefined,
                facingMode: { ideal: "environment" },
                width: isLandscape ? { ideal: 1920 } : { ideal: 1280 },
                height: isLandscape ? { ideal: 1080 } : { ideal: 720 },
                aspectRatio: isLandscape ? { exact: 16 / 9 } : undefined,
                advanced: [ { zoom: 0 } ]
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
    if (stream) stream.getTracks().forEach(t => t.stop());
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
    if (!visionApiKey) return null;

    const url = `https://vision.googleapis.com/v1/images:annotate?key=${visionApiKey}`;
    const body = {
        requests: [{
            image: { content: base64Image },
            features: [{ type: "TEXT_DETECTION", maxResults: 100 }]
        }]
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
   OCR結果 → 3桁抽出（正規化を含む）
===================================================== */
function parseTextAnnotationsFor3Digit(textAnn) {
    if (!textAnn || !Array.isArray(textAnn)) return [];
    const out = [];

    for (let i = 1; i < textAnn.length; i++) {
        const ta = textAnn[i];
        if (!ta?.description) continue;
        const raw = ta.description.trim();
        const norm = normalizeNumber(raw);
        if (!/^\d{3}$/.test(norm)) continue;

        const verts = ta.boundingPoly?.vertices || [];
        const x0 = verts[0]?.x || 0;
        const y0 = verts[0]?.y || 0;
        const x1 = verts[1]?.x || x0;
        const y2 = verts[2]?.y || y0;
        const w = Math.max(x1 - x0, 8);
        const h = Math.max(y2 - y0, 8);

        out.push({ number: norm, x: x0, y: y0, w, h });
    }

    return out;
}

/* =====================================================
   canvas → OCR（そのまま）
===================================================== */
async function detectThreeDigitFromCanvas(c) {
    const dataUrl = c.toDataURL("image/jpeg", 0.95);
    const base64 = dataUrl.split(",")[1];

    const resp = await callVisionTextDetection(base64);
    if (!resp?.responses?.[0]) return [];

    const textAnn = resp.responses[0].textAnnotations;
    if (!textAnn) return [];

    return parseTextAnnotationsFor3Digit(textAnn);
}

/* =====================================================
   フレームコピー（そのまま）
===================================================== */
function captureVideoFrameToCanvas() {
    const c = document.createElement("canvas");
    c.width = video.videoWidth || canvas.width;
    c.height = video.videoHeight || canvas.height;
    c.getContext("2d").drawImage(video, 0, 0, c.width, c.height);
    return c;
}

/* =====================================================
   Qモード（お題読み取りのみ）
   - 最後に savedANumbers と照合して、保存済みがあれば
     その「保存済みトリミング画像(dataURL)」をそのままA欄に表示
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

    // ★ ここで必ず savedANumbers と突合して、あれば保存済み画像 (dataURL) をそのままA欄に表示
    syncSavedAnswersToA();
}

/* =====================================================
   Aモード（探索）
   - ここで「検出した全ての数字」を保存（savedANumbers）
   - 画面に表示するのは lastQNumbers に含まれるもののみ（従来通り）
   - 保存は「トリミング画像の dataURL を保存」するので、後でQ側から呼び出すときは再トリミング不要
===================================================== */
async function runAModeScan() {
    if (!video.videoWidth) return;
    if (/* 要件：Aは探索だけ → 保存は常に行う */ false) {} // noop to indicate intention

    const frame = captureVideoFrameToCanvas();
    const detected = await detectThreeDigitFromCanvas(frame);

    const uniqueMap = new Map();
    detected.forEach(item => {
        if (!uniqueMap.has(item.number)) uniqueMap.set(item.number, item);
    });
    const uniqueDetected = [...uniqueMap.values()];

    const tightTop = 40;
    const tightBottom = 100;
    const tightSide = 25;

    uniqueDetected.forEach(item => {
        // ★ まず：Aで見えた数字は **全部保存**（お題に関係なく）
        const sx = Math.max(item.x - tightSide, 0);
        const sy = Math.max(item.y - tightTop, 0);
        const sw = item.w + tightSide * 2;
        const sh = item.h + tightTop + tightBottom;

        const cut = document.createElement("canvas");
        cut.width = sw;
        cut.height = sh;
        cut.getContext("2d").drawImage(frame, sx, sy, sw, sh, 0, 0, sw, sh);
        const dataUrl = cut.toDataURL();

        // 正規化済みのキーで保存（上書きOK）
        savedANumbers.set(item.number, dataUrl);

        // 次に、もし今のQお題に含まれていれば画面に表示（従来どおり）
        if (!lastQNumbers.includes(item.number)) {
            // 保存はしたが、今は表示しない（お題に含まれないため）
            return;
        }

        // 表示済みならスキップ
        if (answerHistory.has(item.number)) return;
        answerHistory.add(item.number);

        // 表示用
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
   Q読み取り時に savedANumbers と突合して即A欄に表示する関数
   - savedANumbers に該当の dataURL があればそれをそのまま使う
   - answerHistory で二重表示を防ぐ
===================================================== */
function syncSavedAnswersToA() {
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
   クリア（通常） — これは保存は消さない（仕様通り）
===================================================== */
clearBtn.addEventListener("click", () => {
    qResultsEl.innerHTML = "";
    aResultsEl.innerHTML = "";
    lastQNumbers = [];
    answerHistory.clear();
    // savedANumbers は残す（Aで保存した履歴は保持）
});

/* =====================================================
   初期化（そのまま）
===================================================== */
window.addEventListener("DOMContentLoaded", async () => {
    await askForApiKeyIfNeeded();
    await startCamera();
    setMode("Q");
});