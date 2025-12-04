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

let currentMode = "Q";               // "Q" または "A"
let stream = null;
let lastQNumbers = [];               // 最新のお題リスト
let answerHistory = new Set();       // Aモード結果の重複防止

let visionApiKey = localStorage.getItem("vision_api_key");
const INTERVAL_MS = 1000;            // 連写間隔（長押し時）

/* =====================================================
   APIキー入力（ページ読み込み時に一回）
   ※ 必要になるまで prompt を繰り返す（前回の挙動尊重）
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
   カメラ起動
===================================================== */
async function startCamera() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false
        });
        video.srcObject = stream;
        await video.play().catch(()=>{});
        // 読み取れるサイズで canvas を合わせる
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
    } catch (e) {
        console.error("Camera start error:", e);
        alert("カメラを開始できませんでした: " + (e && e.message ? e.message : e));
    }
}

/* =====================================================
   モード切替 UI と内部状態
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

    // Qに切替えたら Aの履歴は残しておくが、要望があればここで clear も可能
    // （今は answerHistory を消さない。Qボタン押下で消したい場合はここで clear()）
}

/* イベント：ボタン押下でモード切替 */
qBtn.addEventListener("click", () => setMode("Q"));
aBtn.addEventListener("click", () => setMode("A"));

/* =====================================================
   Vision API 呼び出し
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

/* テキスト注釈から 3桁数字を抽出する（boundingPoly を正規化して返す） */
function parseTextAnnotationsFor3Digit(textAnn) {
    if (!textAnn || !Array.isArray(textAnn)) return [];
    const out = [];
    for (let i = 1; i < textAnn.length; i++) {
        const ta = textAnn[i];
        if (!ta || !ta.description) continue;
        const txt = ta.description.trim();
        if (!/^\d{3}$/.test(txt)) continue;
        const verts = (ta.boundingPoly && ta.boundingPoly.vertices) || [];
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

/* canvas -> Vision -> parsed results */
async function detectThreeDigitFromCanvas(c) {
    const dataUrl = c.toDataURL("image/jpeg", 0.9);
    const base64 = dataUrl.split(",")[1];
    const resp = await callVisionTextDetection(base64);
    if (!resp || !resp.responses || !resp.responses[0]) return [];
    const textAnn = resp.responses[0].textAnnotations;
    if (!textAnn) return [];
    return parseTextAnnotationsFor3Digit(textAnn);
}

/* capture current video frame into an ephemeral canvas */
function captureVideoFrameToCanvas() {
    const c = document.createElement("canvas");
    c.width = video.videoWidth || canvas.width;
    c.height = video.videoHeight || canvas.height;
    const cx = c.getContext("2d");
    cx.drawImage(video, 0, 0, c.width, c.height);
    return c;
}

/* =====================================================
   Qモード：検出したお題を q-results に表示（赤）
   それぞれは .quest-item/.quest-thumb/.quest-text を使う
===================================================== */
async function runQModeScan() {
    if (!video || !video.videoWidth) return;
    const frame = captureVideoFrameToCanvas();
    const detected = await detectThreeDigitFromCanvas(frame);
    lastQNumbers = detected.map(d => d.number);

    qResultsEl.innerHTML = "";

    const margin = 60;
    detected.forEach(item => {
        const sx = Math.max(item.x - margin, 0);
        const sy = Math.max(item.y - margin, 0);
        const sw = item.w + margin * 2;
        const sh = item.h + margin * 2;

        const cut = document.createElement("canvas");
        cut.width = sw; cut.height = sh;
        const cctx = cut.getContext("2d");
        cctx.drawImage(frame, sx, sy, sw, sh, 0, 0, sw, sh);

        const wrapper = document.createElement("div");
        wrapper.className = "quest-item";

        const img = document.createElement("img");
        img.className = "quest-thumb";
        img.src = cut.toDataURL();

        const txt = document.createElement("div");
        txt.className = "quest-text";
        txt.innerText = item.number;
        // 保険：Qは赤
        txt.style.color = "red";

        wrapper.appendChild(img);
        wrapper.appendChild(txt);
        qResultsEl.appendChild(wrapper);
    });
}

/* =====================================================
   Aモード：Qのお題に一致するものだけ a-results に追加（黒）
   重複は answerHistory で抑止
===================================================== */
async function runAModeScan() {
    if (!video || !video.videoWidth) return;
    if (!lastQNumbers || lastQNumbers.length === 0) return; // 探索対象が無ければ無視

    const frame = captureVideoFrameToCanvas();
    const detected = await detectThreeDigitFromCanvas(frame);

    // tight crop params (tuneable)
    const tightTop = 40;
    const tightBottom = 100;
    const tightSide = 25;

    detected.forEach(item => {
        if (!lastQNumbers.includes(item.number)) return;

        const key = `${item.number}_${Math.round(item.x)}_${Math.round(item.y)}`;
        if (answerHistory.has(key)) return;
        answerHistory.add(key);

        const sx = Math.max(item.x - tightSide, 0);
        const sy = Math.max(item.y - tightTop, 0);
        const sw = item.w + tightSide * 2;
        const sh = item.h + tightTop + tightBottom;

        const cut = document.createElement("canvas");
        cut.width = sw; cut.height = sh;
        cut.getContext("2d").drawImage(frame, sx, sy, sw, sh, 0, 0, sw, sh);

        // append to A-results (black text)
        const wrapper = document.createElement("div");
        wrapper.className = "quest-item";

        const img = document.createElement("img");
        img.className = "quest-thumb";
        img.src = cut.toDataURL();

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
   撮影（Q/A単発）
===================================================== */
async function captureOnce() {
    if (currentMode === "Q") {
        await runQModeScan();
    } else {
        await runAModeScan();
    }
}

/* =====================================================
   長押し処理（押している間 1 秒ごとに capture）
   長押し中はボタンに .pressing を追加して色変化
===================================================== */
let ocrInterval = null;

function startPress() {
    if (ocrInterval) return;
    camBtn.classList.add("pressing");
    // immediate one-shot
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

/* register pointer/touch events */
camBtn.addEventListener("mousedown", (e)=>{ e.preventDefault(); startPress(); });
window.addEventListener("mouseup", (e)=>{ stopPress(); });
camBtn.addEventListener("mouseleave", (e)=>{ stopPress(); });

camBtn.addEventListener("touchstart", (e)=>{ e.preventDefault(); startPress(); }, {passive:false});
window.addEventListener("touchend", (e)=>{ stopPress(); });

/* single tap also triggers once (some platforms) */
camBtn.addEventListener("click", (e)=>{ e.preventDefault(); /* click suppressed if longpress triggered */ });

/* =====================================================
   ゴミ箱（Q/A表示と履歴をクリア）
===================================================== */
clearBtn.addEventListener("click", () => {
    qResultsEl.innerHTML = "";
    aResultsEl.innerHTML = "";
    lastQNumbers = [];
    answerHistory.clear();
});

/* =====================================================
   初期化シーケンス
   - APIキー入力（必須）
   - カメラ起動
   - 初期モード設定（Q）
===================================================== */
window.addEventListener("DOMContentLoaded", async () => {
    await askForApiKeyIfNeeded();
    await startCamera();
    setMode("Q");
});
