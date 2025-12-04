// script.js - 運用版（あなたの HTML/CSS と整合済み）
// 概要: camera id に合わせ、キー入力 → カメラ起動 → Q/A 長押し連写 → Vision API 呼び出し

// ---------- 設定 / 変数 ----------
let visionApiKey = localStorage.getItem("vision_api_key") || null;
const videoEl = document.getElementById("camera"); // HTML にある id="camera"
const qResultsEl = document.getElementById("q-results");
const aResultsEl = document.getElementById("a-results");
const qBtn = document.getElementById("qMode");
const aBtn = document.getElementById("aMode");
const captureBtn = document.querySelector(".yellow-btn");
const trashBtn = document.querySelector(".blue-btn");

let isQMode = true;
let ocrInterval = null;
let stream = null;
let answerHistory = new Set(); // Aモード重複防止
let lastQuestNumbers = []; // Qモードで読み取った数字群（最新読み取り分）
const DEFAULT_INTERVAL_MS = 1000;

// ---------- ユーティリティ ----------
function safeLog(...args){ console.log("[app]", ...args); }
function ensure(el, name){
  if(!el) safeLog(`Missing element: ${name}`);
  return !!el;
}

// ---------- APIキーの入力を促す（DOMContentLoadedで一回） ----------
async function askForApiKeyIfNeeded(){
  if (visionApiKey) return;
  try {
    const k = prompt("Google Vision API キーを入力してください（ページを閉じると保存されます）");
    if (k && k.trim()){
      visionApiKey = k.trim();
      localStorage.setItem("vision_api_key", visionApiKey);
      safeLog("Vision API key saved to localStorage.");
    } else {
      alert("APIキーが入力されませんでした。OCRは動作しません。後でキーを入力してください。");
    }
  } catch(e){
    console.error(e);
  }
}

// ---------- カメラ起動 ----------
async function startCamera(){
  if (!ensure(videoEl, "camera")) return;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    videoEl.srcObject = stream;
    await videoEl.play().catch(()=>{});
    safeLog("Camera started", videoEl.videoWidth, videoEl.videoHeight);
  } catch (e){
    console.error("camera start error:", e);
    alert("カメラを開始できませんでした: " + (e && e.message ? e.message : e));
  }
}

// ---------- Vision API 呼び出し（Base64 image） ----------
async function callVisionTextDetection(base64Image){
  if (!visionApiKey) {
    safeLog("No Vision API key, skipping OCR.");
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
    const json = await res.json();
    return json;
  } catch (e){
    console.error("Vision API call failed:", e);
    return null;
  }
}

// ---------- テキスト検出結果から 3桁数字と座標を返す ----------
function parseTextAnnotationsFor3Digit(textAnnotations){
  if (!textAnnotations || !Array.isArray(textAnnotations)) return [];
  // textAnnotations[0] は全文、以降が個別単語
  const out = [];
  for(let i=1;i<textAnnotations.length;i++){
    const ta = textAnnotations[i];
    if(!ta || !ta.description) continue;
    const t = ta.description.trim();
    if(!/^\d{3}$/.test(t)) continue;
    const verts = (ta.boundingPoly && ta.boundingPoly.vertices) || [];
    // normalize vertices
    const x0 = verts[0]?.x || 0;
    const y0 = verts[0]?.y || 0;
    const x1 = verts[1]?.x || x0;
    const y2 = verts[2]?.y || y0;
    const w = Math.max((x1 - x0), 20);
    const h = Math.max((y2 - y0), 20);
    out.push({ number: t, x: x0, y: y0, w, h });
  }
  return out;
}

// ---------- OCR ラッパー：canvas -> callVision -> parse ----------
async function detectNumberPanelsFromCanvas(canvasEl){
  // canvasEl is a HTMLCanvasElement
  const dataUrl = canvasEl.toDataURL("image/jpeg", 0.8);
  const base64 = dataUrl.split(",")[1];
  const resp = await callVisionTextDetection(base64);
  if(!resp || !resp.responses || !resp.responses[0]) return [];
  const textAnn = resp.responses[0].textAnnotations;
  if(!textAnn) return [];
  return parseTextAnnotationsFor3Digit(textAnn);
}

// ---------- capture current frame into a canvas ----------
function captureVideoFrameToCanvas(srcVideo){
  const c = document.createElement("canvas");
  c.width = srcVideo.videoWidth || 1280;
  c.height = srcVideo.videoHeight || 720;
  const cx = c.getContext("2d");
  cx.drawImage(srcVideo, 0, 0, c.width, c.height);
  return c;
}

// ---------- Q モードスキャン（表示は q-results に最新の分を出す） ----------
async function runQModeScan(){
  if(!videoEl || !videoEl.videoWidth) return;
  const frameCanvas = captureVideoFrameToCanvas(videoEl);

  // call OCR
  const detected = await detectNumberPanelsFromCanvas(frameCanvas);
  safeLog("Q detected:", detected);

  // show only the latest detection set (clear then render)
  qResultsEl.innerHTML = "";
  lastQuestNumbers = [];

  const margin = 60;
  detected.forEach(item => {
    lastQuestNumbers.push(item.number);

    const sx = Math.max(item.x - margin, 0);
    const sy = Math.max(item.y - margin, 0);
    const sw = item.w + margin*2;
    const sh = item.h + margin*2;

    const cut = document.createElement("canvas");
    cut.width = sw; cut.height = sh;
    cut.getContext("2d").drawImage(frameCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

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
    qResultsEl.appendChild(wrapper);
  });
}

// ---------- A モードスキャン（お題と一致するものだけ a-results に追加） ----------
async function runAModeScan(){
  if(!videoEl || !videoEl.videoWidth) return;
  if(!lastQuestNumbers || lastQuestNumbers.length === 0){
    safeLog("No Q items to search for in A mode.");
    return;
  }
  const frameCanvas = captureVideoFrameToCanvas(videoEl);

  const detected = await detectNumberPanelsFromCanvas(frameCanvas);
  safeLog("A detected:", detected);

  // tight crop parameters (tune as needed)
  const tightTop = 40;
  const tightBottom = 100;
  const tightSide = 25;

  detected.forEach(item => {
    // only if matches a Q number
    if (!lastQuestNumbers.includes(item.number)) return;

    // unique key: number + rounded coords (avoid float mismatch)
    const key = `${item.number}_${Math.round(item.x)}_${Math.round(item.y)}`;
    if (answerHistory.has(key)) {
      safeLog("skip duplicate", key);
      return;
    }
    answerHistory.add(key);

    const sx = Math.max(item.x - tightSide, 0);
    const sy = Math.max(item.y - tightTop, 0);
    const sw = item.w + tightSide*2;
    const sh = item.h + tightTop + tightBottom;

    const cut = document.createElement("canvas");
    cut.width = sw; cut.height = sh;
    cut.getContext("2d").drawImage(frameCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

    // append to a-results; text must be black
    const wrapper = document.createElement("div");
    wrapper.className = "quest-item";
    const img = document.createElement("img");
    img.className = "quest-thumb";
    img.src = cut.toDataURL();
    const txt = document.createElement("div");
    txt.className = "quest-text";
    txt.style.color = "black";
    txt.innerText = item.number;

    wrapper.appendChild(img);
    wrapper.appendChild(txt);
    aResultsEl.appendChild(wrapper);
  });
}

// ---------- 長押し (mousedown / touchstart) の開始・停止 ----------
function startOCRLoop(){
  if (ocrInterval) return;
  // immediate run then interval
  if (isQMode) runQModeScan();
  else runAModeScan();
  ocrInterval = setInterval(() => {
    if (isQMode) runQModeScan();
    else runAModeScan();
  }, DEFAULT_INTERVAL_MS);
  captureBtn.classList.add("pressing");
}

function stopOCRLoop(){
  if (ocrInterval) { clearInterval(ocrInterval); ocrInterval = null; }
  captureBtn.classList.remove("pressing");
}

// ---------- イベント登録（注意：要素が存在することをチェック） ----------
function registerEvents(){
  if (!ensure(qBtn, "qMode") || !ensure(aBtn, "aMode") || !ensure(captureBtn, "yellow-btn") || !ensure(trashBtn, "blue-btn")) {
    safeLog("Missing some UI elements; events not fully registered.");
  }

  qBtn.addEventListener("click", () => {
    isQMode = true;
    qBtn.classList.add("active");
    aBtn.classList.remove("active");
    safeLog("Switched to Q");
  });

  aBtn.addEventListener("click", () => {
    isQMode = false;
    aBtn.classList.add("active");
    qBtn.classList.remove("active");
    safeLog("Switched to A");
  });

  // click for single shot
  captureBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    if (isQMode) await runQModeScan();
    else await runAModeScan();
    // brief visual
    captureBtn.classList.add("pressing");
    setTimeout(()=>captureBtn.classList.remove("pressing"), 120);
  });

  // long press start/stop
  captureBtn.addEventListener("mousedown", (e) => { e.preventDefault(); startOCRLoop(); });
  window.addEventListener("mouseup", stopOCRLoop);
  captureBtn.addEventListener("mouseleave", stopOCRLoop);

  // touch support
  captureBtn.addEventListener("touchstart", (e)=>{ e.preventDefault(); startOCRLoop(); }, {passive:false});
  window.addEventListener("touchend", stopOCRLoop);

  // trash: clears both Q and A results and memory
  trashBtn.addEventListener("click", () => {
    qResultsEl.innerHTML = "";
    aResultsEl.innerHTML = "";
    lastQuestNumbers = [];
    answerHistory.clear();
    safeLog("Cleared Q/A results and memory.");
  });
}

// ---------- 初期化シーケンス ----------
window.addEventListener("DOMContentLoaded", async () => {
  await askForApiKeyIfNeeded();   // prompt for API key (if not saved)
  await startCamera();            // start camera after key prompt
  registerEvents();              // wire up buttons
  safeLog("Initialization complete.");
});

// ---------- デバッグのヒント ----------
/*
 - Safari ではカメラの挙動や許可ダイアログの扱いが厳しいです（サイトをHTTPSでホストして下さい）。
 - ブラウザのコンソール（開発者ツール）を開いてエラーや safeLog を確認してください。
 - APIキーは localStorage に保存されます。再入力したければ localStorage.removeItem('vision_api_key').
*/

//------------------------------------------------------------
// イベント接続
//------------------------------------------------------------

// カメラボタン
document.getElementById("camera-btn").addEventListener("click", () => {
    captureFrame();
});

// A / Q モードボタン
document.getElementById("mode-a").addEventListener("click", () => {
    setMode("A");

    document.getElementById("mode-a").classList.add("active");
    document.getElementById("mode-q").classList.remove("active");
});

document.getElementById("mode-q").addEventListener("click", () => {
    setMode("Q");

    document.getElementById("mode-q").classList.add("active");
    document.getElementById("mode-a").classList.remove("active");
});
