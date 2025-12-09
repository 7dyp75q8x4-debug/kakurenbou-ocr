/****************************************************************
 * UIは変えない
 * ・APIキー画面 必ず出る
 * ・カメラ 必ず起動する
 * ・長押し＋1秒連写 確実に動かす
 ****************************************************************/

let video, canvas, ctx;
let qBtn, aBtn, camBtn, clearBtn;

let currentMode = "Q";
let stream = null;

let lastQNumbers = [];
let answerHistory = new Set();
const savedANumbers = new Map();

let visionApiKey = null;
const INTERVAL_MS = 1000;

let ocrInterval = null;
let isPressing = false;

/* ============================
   DOM安全取得
============================ */
function bindElements() {
  video    = document.getElementById("camera");
  qBtn     = document.getElementById("qMode");
  aBtn     = document.getElementById("aMode");
  camBtn   = document.getElementById("onBtn");
  clearBtn = document.getElementById("trash");

  canvas = document.createElement("canvas");
  ctx = canvas.getContext("2d");
}

/* ============================
   APIキー
============================ */
async function askForApiKeyIfNeeded() {
  visionApiKey = localStorage.getItem("vision_api_key");

  if (!visionApiKey || visionApiKey.length < 10) {
    localStorage.removeItem("vision_api_key");

    const key = prompt("Google Vision API キーを入力してください");
    if (key && key.trim().length > 10) {
      visionApiKey = key.trim();
      localStorage.setItem("vision_api_key", visionApiKey);
    } else {
      alert("APIキーが必要です");
      await askForApiKeyIfNeeded();
    }
  }
}

/* ============================
   カメラ起動（安全版）
============================ */
async function startCamera() {
  try {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
    }

    let constraints = {
      video: {
        facingMode: "environment",
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        aspectRatio: 16/9
      },
      audio: false
    };

    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch {
      // iOS fallback
      stream = await navigator.mediaDevices.getUserMedia({ video:true, audio:false });
    }

    video.srcObject = stream;
    await video.play();

    canvas.width  = video.videoWidth  || 1920;
    canvas.height = video.videoHeight || 1080;

  } catch (e) {
    alert("カメラ起動失敗。ブラウザ設定を確認してください");
    console.error(e);
  }
}

/* ============================
   モード
============================ */
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

function normalizeNumber(raw) {
  if (!raw) return "";
  const z = {"０":"0","１":"1","２":"2","３":"3","４":"4","５":"5","６":"6","７":"7","８":"8","９":"9"};
  let s = String(raw).replace(/[\uFF10-\uFF19]/g, ch=>z[ch]||ch);
  return s.replace(/[^\d]/g,"");
}

/* ============================
   フレーム
============================ */
function captureVideoFrameToCanvas() {
  const c = document.createElement("canvas");
  c.width  = video.videoWidth  || canvas.width;
  c.height = video.videoHeight || canvas.height;
  c.getContext("2d").drawImage(video,0,0,c.width,c.height);
  return c;
}

/* ============================
   OCR
============================ */
async function callVisionTextDetection(base64Image) {
  if (!visionApiKey) return null;

  const url = `https://vision.googleapis.com/v1/images:annotate?key=${visionApiKey}`;

  const body = {
    requests: [{
      image:{content:base64Image},
      features:[{type:"TEXT_DETECTION",maxResults:50}]
    }]
  };

  const res = await fetch(url,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(body)
  });
  return await res.json();
}

async function detectThreeDigitFromCanvas(c) {
  const dataUrl = c.toDataURL("image/jpeg",0.9);
  const base64  = dataUrl.split(",")[1];

  const resp = await callVisionTextDetection(base64);
  if (!resp?.responses?.[0]) return [];

  const textAnn = resp.responses[0].textAnnotations || [];
  const out = [];

  for(let i=1;i<textAnn.length;i++){
    const ta = textAnn[i];
    if(!ta?.description) continue;

    const num = normalizeNumber(ta.description);
    if(!/^\d{3}$/.test(num)) continue;

    const v = ta.boundingPoly?.vertices||[];
    const x0=v[0]?.x||0;
    const y0=v[0]?.y||0;
    const x1=v[1]?.x||x0;
    const y2=v[2]?.y||y0;

    out.push({number:num,x:x0,y:y0,w:(x1-x0)||10,h:(y2-y0)||10});
  }
  return out;
}

/* ============================
   Qモード
============================ */
async function runQModeScan(){
  const frame = captureVideoFrameToCanvas();
  const detected = await detectThreeDigitFromCanvas(frame);

  const map=new Map();
  detected.forEach(d=>{ if(!map.has(d.number)) map.set(d.number,d); });
  const unique=[...map.values()];

  lastQNumbers = unique.map(d=>d.number);

  const area=document.getElementById("left-panel");
  area.innerHTML="";

  unique.forEach(item=>{
    const div=document.createElement("div");
    div.className="quest-item";
    div.innerHTML=`<div class="quest-text" style="color:red">${item.number}</div>`;
    area.appendChild(div);
  });

  syncSavedAnswersToA();
}

/* ============================
   Aモード
============================ */
async function runAModeScan(){
  const frame=captureVideoFrameToCanvas();
  const detected=await detectThreeDigitFromCanvas(frame);

  detected.forEach(item=>{
    const cut=document.createElement("canvas");
    cut.width=item.w;
    cut.height=item.h;

    cut.getContext("2d").drawImage(
      frame,
      item.x,item.y,item.w,item.h,
      0,0,item.w,item.h
    );

    savedANumbers.set(item.number, cut.toDataURL());
  });
}

/* ============================
   同期表示
============================ */
function syncSavedAnswersToA(){
  const area=document.getElementById("left-panel");

  lastQNumbers.forEach(num=>{
    if(!savedANumbers.has(num)) return;
    if(answerHistory.has(num)) return;

    answerHistory.add(num);

    const div=document.createElement("div");
    div.className="quest-item";
    div.innerHTML=`<div class="quest-text" style="color:black">${num}</div>`;
    area.appendChild(div);
  });
}

/* ============================
   撮影実行
============================ */
async function captureOnce(){
  if(currentMode==="Q") await runQModeScan();
  else await runAModeScan();
}

/* ============================
   長押し登録（完全版）
============================ */
function setupLongPress(){
  const start=(e)=>{
    e.preventDefault();
    if(isPressing) return;
    isPressing=true;

    captureOnce();
    ocrInterval=setInterval(captureOnce,INTERVAL_MS);
  };

  const end=()=>{
    if(!isPressing) return;
    isPressing=false;
    if(ocrInterval){
      clearInterval(ocrInterval);
      ocrInterval=null;
    }
  };

  camBtn.addEventListener("mousedown",start);
  camBtn.addEventListener("touchstart",start,{passive:false});
  window.addEventListener("mouseup",end);
  window.addEventListener("touchend",end);
}

/* ============================
   ゴミ箱
============================ */
function setupClear(){
  clearBtn.onclick=()=>{
    document.getElementById("left-panel").innerHTML="";
    lastQNumbers=[];
    answerHistory.clear();
  };
}

/* ============================
   初期化
============================ */
window.addEventListener("load",async()=>{
  bindElements();
  await askForApiKeyIfNeeded();
  await startCamera();

  setMode("Q");

  qBtn.onclick=()=>setMode("Q");
  aBtn.onclick=()=>setMode("A");

  setupLongPress();
  setupClear();
});