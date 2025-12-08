/* =====================================================
   要素取得
===================================================== */
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const qBtn = document.getElementById("qMode");
const aBtn = document.getElementById("aMode");
const camBtn = document.getElementById("camera-btn");
const clearBtn = document.getElementById("clear-btn");
const hardClearBtn = document.getElementById("hard-clear-btn");
const qResultsEl = document.getElementById("q-results");
const aResultsEl = document.getElementById("a-results");

/* =====================================================
   状態
===================================================== */
let currentMode = "Q";
let stream = null;
let qNumbers = [];
let savedNumbers = new Map(); // number => dataURL (A時の切り抜き)
let visionApiKey = localStorage.getItem("vision_api_key");
let ocrInterval = null;
const INTERVAL_MS = 1000;

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
    }
    alert("APIキーが必要です");
}

/* =====================================================
   カメラ
===================================================== */
async function getCameraId() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(d => d.kind === "videoinput");
    const ultra = videoDevices.find(d =>
        d.label.includes("0.5") ||
        d.label.toLowerCase().includes("ultra") ||
        d.label.includes("超広角")
    );
    return ultra?.deviceId || videoDevices[0]?.deviceId || null;
}

async function startCamera() {
    try {
        const id = await getCameraId();
        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                deviceId: id ? { exact: id } : undefined,
                facingMode: { ideal: "environment" }
            },
            audio: false
        });
        video.srcObject = stream;
        await video.play().catch(()=>{});
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
    } catch (e) {
        alert("カメラ起動失敗");
        console.error(e);
    }
}

window.addEventListener("orientationchange", async () => {
    if (stream) stream.getTracks().forEach(t => t.stop());
    await startCamera();
});

/* =====================================================
   モード切替
===================================================== */
function setMode(m) {
    currentMode = m;
    if (m === "Q") {
        qBtn.classList.add("active");
        aBtn.classList.remove("active");
    } else {
        aBtn.classList.add("active");
        qBtn.classList.remove("active");
    }
}

qBtn.onclick = () => setMode("Q");
aBtn.onclick = () => setMode("A");

/* =====================================================
   Vision
===================================================== */
async function callVision(base64) {
    if (!visionApiKey) return null;
    const url = `https://vision.googleapis.com/v1/images:annotate?key=${visionApiKey}`;
    const body = {
        requests:[{
            image:{content:base64},
            features:[{type:"TEXT_DETECTION",maxResults:50}]
        }]
    };
    const r = await fetch(url,{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify(body)
    });
    return await r.json();
}

function parse3Digit(texts){
    if(!texts) return [];
    const out=[];
    for(let i=1;i<texts.length;i++){
        const t=texts[i]?.description?.trim();
        if(!/^\d{3}$/.test(t)) continue;
        const v=texts[i].boundingPoly?.vertices||[];
        const x0=v[0]?.x||0, y0=v[0]?.y||0;
        const x1=v[1]?.x||x0, y2=v[2]?.y||y0;
        out.push({
            number:t,
            x:x0,y:y0,
            w:Math.max(x1-x0,8),
            h:Math.max(y2-y0,8)
        });
    }
    return out;
}

/* =====================================================
   Canvas
===================================================== */
function captureFrame(){
    const c=document.createElement("canvas");
    c.width=video.videoWidth||canvas.width;
    c.height=video.videoHeight||canvas.height;
    c.getContext("2d").drawImage(video,0,0,c.width,c.height);
    return c;
}

async function detect(c){
    const base64=c.toDataURL("image/jpeg",0.95).split(",")[1];
    const res=await callVision(base64);
    const texts=res?.responses?.[0]?.textAnnotations;
    return parse3Digit(texts);
}

/* =====================================================
   共通描画
===================================================== */
function renderResult(item, frame, color){
    const mx = 25, mt=40, mb=100;
    const sx=Math.max(item.x-mx,0);
    const sy=Math.max(item.y-mt,0);
    const sw=item.w+mx*2;
    const sh=item.h+mt+mb;
    const cut=document.createElement("canvas");
    cut.width=sw; cut.height=sh;
    cut.getContext("2d").drawImage(frame,sx,sy,sw,sh,0,0,sw,sh);

    const w=document.createElement("div");
    w.className="quest-item";
    const img=document.createElement("img");
    img.className="quest-thumb";
    img.src=cut.toDataURL();
    const txt=document.createElement("div");
    txt.className="quest-text";
    txt.style.color=color;
    txt.innerText=item.number;
    w.appendChild(img);
    w.appendChild(txt);
    return {wrapper:w, imgData:img.src};
}

/* =====================================================
   Qモード
===================================================== */
async function runQ(){
    const frame=captureFrame();
    const found=await detect(frame);
    qNumbers = found.map(f=>f.number);
    qResultsEl.innerHTML="";

    found.forEach(item=>{
        const {wrapper}=renderResult(item,frame,"red");
        qResultsEl.appendChild(wrapper);
    });

    // Qの数字が saved にあれば即A出力
    qNumbers.forEach(num=>{
        if(savedNumbers.has(num)){
            const imgData=savedNumbers.get(num);
            const w=document.createElement("div");
            w.className="quest-item";
            const img=document.createElement("img");
            img.className="quest-thumb";
            img.src=imgData;
            const txt=document.createElement("div");
            txt.className="quest-text";
            txt.style.color="black";
            txt.innerText=num;
            w.appendChild(img); w.appendChild(txt);
            aResultsEl.appendChild(w);
        }
    });
}

/* =====================================================
   Aモード
===================================================== */
async function runA(){
    const frame=captureFrame();
    const found=await detect(frame);
    const seen = new Set();
    found.forEach(item=>{
        const {wrapper, imgData}=renderResult(item,frame,"black");
        aResultsEl.appendChild(wrapper);
        savedNumbers.set(item.number,imgData);
        seen.add(item.number);
    });
}

/* =====================================================
   撮影
===================================================== */
async function captureOnce(){
    if(currentMode==="Q") await runQ();
    else await runA();
}

/* =====================================================
   長押し
===================================================== */
function startPress(){
    if(ocrInterval) return;
    camBtn.classList.add("pressing");
    captureOnce();
    ocrInterval=setInterval(captureOnce,INTERVAL_MS);
}
function stopPress(){
    if(!ocrInterval) return;
    camBtn.classList.remove("pressing");
    clearInterval(ocrInterval);
    ocrInterval=null;
}

camBtn.addEventListener("mousedown",e=>{e.preventDefault();startPress();});
window.addEventListener("mouseup",stopPress);
camBtn.addEventListener("mouseleave",stopPress);
camBtn.addEventListener("touchstart",e=>{e.preventDefault();startPress();},{passive:false});
window.addEventListener("touchend",stopPress);
camBtn.addEventListener("click",e=>e.preventDefault());

/* =====================================================
   クリア系
===================================================== */
clearBtn.onclick=()=>{
    qResultsEl.innerHTML="";
    aResultsEl.innerHTML="";
    qNumbers=[];
};

hardClearBtn.onclick=()=>{
    const ok=confirm("新規でかくれんぼを開始しますか？\n読み取って保存した数字は全てリセットされます");
    if(!ok) return;
    qResultsEl.innerHTML="";
    aResultsEl.innerHTML="";
    qNumbers=[];
    savedNumbers.clear();
};

/* =====================================================
   初期化
===================================================== */
window.addEventListener("DOMContentLoaded",async()=>{
    await askForApiKeyIfNeeded();
    await startCamera();
    setMode("Q");
});