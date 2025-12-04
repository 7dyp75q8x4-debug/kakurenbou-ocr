// script.js — 修正版（フルファイル）
/* =====================================================
   基本要素 / 状態
===================================================== */
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

/* -------------------------
 safe logging helper
--------------------------*/
function safeLog(...args){ console.log("[app]", ...args); }

/* =====================================================
   APIキー入力（初回のみ） - ページロードで必ず呼ぶ
   ※ 既に localStorage に保存されている時は再入力不要
===================================================== */
async function ensureApiKey() {
    if (visionApiKey && visionApiKey.trim()) {
        return;
    }
    // loop until key entered or user cancels (user cancels will alert and stop)
    const key = prompt("Google Vision API キーを入力してください（キャンセルするとOCRは動作しません）");
    if (key && key.trim()) {
        visionApiKey = key.trim();
        localStorage.setItem("vision_api_key", visionApiKey);
        safeLog("Vision API key saved.");
    } else {
        alert("APIキーが入力されませんでした。後で localStorage.removeItem('vision_api_key') で再入力できます。");
    }
}

/* =====================================================
   カメラ起動
===================================================== */
async function startCamera() {
    if (!video) return;
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false
        });
        video.srcObject = stream;
        await video.play().catch(e => { console.warn("video.play() blocked:", e); });
        // set canvas size to actual video dims
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
        safeLog("Camera started:", canvas.width, canvas.height);
    } catch (e) {
        console.error("startCamera failed:", e);
        alert("カメラの起動に失敗しました: " + (e && e.message ? e.message : e));
    }
}

/* =====================================================
   モード切替（UI 更新 + 状態）
===================================================== */
function setMode(mode) {
    currentMode = mode === "A" ? "A" : "Q";
    if (currentMode === "Q") {
        qBtn?.classList.add("active");
        aBtn?.classList.remove("active");
    } else {
        aBtn?.classList.add("active");
        qBtn?.classList.remove("active");
    }
    safeLog("Mode set to", currentMode);
}

/* =====================================================
   Vision API 呼び出しユーティリティ
===================================================== */
async function callVisionAPI(base64) {
    if (!visionApiKey) {
        safeLog("No Vision API key; skipping call.");
        return null;
    }
    const url = `https://vision.googleapis.com/v1/images:annotate?key=${visionApiKey}`;
    const body = {
        requests: [{
            image: { content: base64 },
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
    } catch (e) {
        console.error("callVisionAPI error:", e);
        return null;
    }
}

function parse3Digits(textAnnotations) {
    if (!textAnnotations || !Array.isArray(textAnnotations)) return [];
    const out = [];
    for (let i = 1; i < textAnnotations.length; i++) {
        const t = (textAnnotations[i].description || "").trim();
        if (!/^\d{3}$/.test(t)) continue;
        const v = textAnnotations[i].boundingPoly?.vertices || [];
        const x = v[0]?.x || 0;
        const y = v[0]?.y || 0;
        const x1 = v[1]?.x ?? x;
        const y2 = v[2]?.y ?? y;
        const w = Math.max((x1 - x), 20);
        const h = Math.max((y2 - y), 20);
        out.push({ number: t, x, y, w, h });
    }
    return out;
}

async function detectNumbersFromCanvas(canvasEl) {
    const dataUrl = canvasEl.toDataURL("image/jpeg", 0.85);
    const base64 = dataUrl.split(",")[1];
    const json = await callVisionAPI(base64);
    const textAnn = json?.responses?.[0]?.textAnnotations;
    if (!textAnn) return [];
    return parse3Digits(textAnn);
}

/* =====================================================
   ヘルパー：ビデオフレームをキャンバスに描く
===================================================== */
function captureVideoToCanvas(videoEl) {
    const c = document.createElement("canvas");
    c.width = videoEl.videoWidth || canvas.width || 1280;
    c.height = videoEl.videoHeight || canvas.height || 720;
    const cx = c.getContext("2d");
    cx.drawImage(videoEl, 0, 0, c.width, c.height);
    return c;
}

/* =====================================================
   Qモード処理（お題の読み取り表示）
===================================================== */
async function runQModeScan() {
    if (!video || !video.videoWidth) return;
    const frame = captureVideoToCanvas(video);
    const detected = await detectNumbersFromCanvas(frame);
    safeLog("Q detected:", detected);
    // show in q-results (clear then add)
    const list = document.getElementById("q-results");
    list.innerHTML = "";
    lastQNumbers = [];
    const margin = 60;
    detected.forEach(item => {
        lastQNumbers.push(item.number);
        const sx = Math.max(item.x - margin, 0);
        const sy = Math.max(item.y - margin, 0);
        const sw = item.w + margin * 2;
        const sh = item.h + margin * 2;
        const cut = document.createElement("canvas");
        cut.width = sw; cut.height = sh;
        cut.getContext("2d").drawImage(frame, sx, sy, sw, sh, 0, 0, sw, sh);
        const wrapper = document.createElement("div");
        wrapper.className = "quest-item";
        const img = document.createElement("img");
        img.className = "quest-thumb";
        img.src = cut.toDataURL();
        const txt = document.createElement("div");
        txt.className = "quest-text";
        txt.innerText = item.number;
        wrapper.appendChild(img);
        wrapper.appendChild(txt);
        list.appendChild(wrapper);
    });
}

/* =====================================================
   Aモード処理（探索：Qで読み取った番号に一致するものを追加）
   - 重複防止（answerHistory）
   - タイトなトリミング
===================================================== */
async function runAModeScan() {
    if (!video || !video.videoWidth) return;
    if (!lastQNumbers || lastQNumbers.length === 0) {
        safeLog("A mode: no Q items to search for.");
        return;
    }
    const frame = captureVideoToCanvas(video);
    const detected = await detectNumbersFromCanvas(frame);
    safeLog("A detected:", detected);
    const tightTop = 40, tightBottom = 100, tightSide = 25;
    const list = document.getElementById("a-results");
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
        const wrapper = document.createElement("div");
        wrapper.className = "a-item";
        const img = document.createElement("img");
        img.className = "quest-thumb";
        img.src = cut.toDataURL();
        const txt = document.createElement("div");
        txt.className = "quest-text";
        txt.style.color = "black";
        txt.innerText = item.number;
        wrapper.appendChild(img);
        wrapper.appendChild(txt);
        list.appendChild(wrapper);
    });
}

/* =====================================================
   captureFrame（ワンショット）
===================================================== */
async function captureFrameOnce() {
    if (currentMode === "Q") {
        await runQModeScan();
    } else {
        await runAModeScan();
    }
}

/* =====================================================
   長押し撮影ロジック（多重起動防止・色変化・touch event handling）
===================================================== */
let pressTimer = null;
let isPressing = false;
const LONG_PRESS_INTERVAL = 1000; // 1秒ごと（要求通り）

function startPress(e) {
    if (e) {
        // prevent page scroll / other touch behaviors and stop propagation
        if (typeof e.preventDefault === "function") e.preventDefault();
        if (typeof e.stopPropagation === "function") e.stopPropagation();
    }
    if (isPressing) return; // already running
    isPressing = true;
    camBtn?.classList.add("pressing");
    // immediate shot
    captureFrameOnce();
    // intervaled shots
    pressTimer = setInterval(() => {
        if (isPressing) captureFrameOnce();
    }, LONG_PRESS_INTERVAL);
}

function endPress(e) {
    if (e) {
        if (typeof e.preventDefault === "function") e.preventDefault();
        if (typeof e.stopPropagation === "function") e.stopPropagation();
    }
    isPressing = false;
    camBtn?.classList.remove("pressing");
    if (pressTimer) {
        clearInterval(pressTimer);
        pressTimer = null;
    }
}

/* =====================================================
   イベント登録
===================================================== */
function registerUIEvents() {
    // Q/A buttons
    qBtn?.addEventListener("click", () => {
        setMode("Q");
    });
    aBtn?.addEventListener("click", () => {
        setMode("A");
    });

    // single click (short press) support: click will do one capture
    camBtn?.addEventListener("click", (e) => {
        // allow click only if not part of touch longpress (touchstart will have handled)
        captureFrameOnce();
        // brief visual feedback
        camBtn.classList.add("pressing");
        setTimeout(()=> camBtn.classList.remove("pressing"), 120);
    });

    // long-press: mouse
    camBtn?.addEventListener("mousedown", (e) => {
        startPress(e);
    });
    window.addEventListener("mouseup", (e) => {
        // stop regardless of where released
        endPress(e);
    });
    camBtn?.addEventListener("mouseleave", (e) => {
        // if pointer leaves the button, stop pressing
        endPress(e);
    });

    // long-press: touch (mobile) — IMPORTANT: preventDefault + stopPropagation
    camBtn?.addEventListener("touchstart", (e) => {
        startPress(e);
    }, { passive: false });
    // touchend on window to catch finger lift outside the button
    window.addEventListener("touchend", (e) => {
        endPress(e);
    }, { passive: false });

    // clear/trash
    clearBtn?.addEventListener("click", () => {
        document.getElementById("q-results").innerHTML = "";
        document.getElementById("a-results").innerHTML = "";
        lastQNumbers = [];
        answerHistory.clear();
        safeLog("Cleared Q/A results and memory.");
    });
}

/* =====================================================
   初期化シーケンス
===================================================== */
window.addEventListener("DOMContentLoaded", async () => {
    await ensureApiKey();
    await startCamera();
    registerUIEvents();
    setMode("Q");
    safeLog("Init complete");
});

/* =====================================================
   デバッグヘルプ（必要ならここにログやUIフラグを追加）
===================================================== */
