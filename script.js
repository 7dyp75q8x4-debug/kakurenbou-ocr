/* =====================================================
   要素
===================================================== */
const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

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

let currentQNumbers = [];
let savedNumbers = new Map(); // number => {number, img}

let visionApiKey = localStorage.getItem("vision_api_key");
const INTERVAL_MS = 800;

/* =====================================================
   APIKEY
===================================================== */
async function askForApiKeyIfNeeded() {
    if (visionApiKey) return;
    const key = prompt("Google Vision API キーを入力してください");
    if (!key) return askForApiKeyIfNeeded();
    visionApiKey = key.trim();
    localStorage.setItem("vision_api_key", visionApiKey);
}

/* =====================================================
   Camera
===================================================== */
async function getUltraWideCameraId() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter(d => d.kind === "videoinput");
    const ultra = cams.find(d =>
        d.label.includes("0.5") ||
        d.label.toLowerCase().includes("ultra") ||
        d.label.includes("超広角")
    );
    return ultra?.deviceId || cams[0]?.deviceId || null;
}

async function startCamera() {
    const deviceId = await getUltraWideCameraId();
    stream = await navigator.mediaDevices.getUserMedia({
        video: {
            deviceId: deviceId ? { exact: deviceId } : undefined,
            facingMode: { ideal: "environment" }
        },
        audio: false
    });
    video.srcObject = stream;
    await video.play().catch(()=>{});
}

/* =====================================================
   mode
===================================================== */
function setMode(mode) {
    currentMode = mode;
    qBtn.classList.toggle("active", mode==="Q");
    aBtn.classList.toggle("active", mode==="A");
}
qBtn.onclick = () => setMode("Q");
aBtn.onclick = () => setMode("A");

/* =====================================================
   OCR
===================================================== */
async function callVision(base64) {
    const url = `https://vision.googleapis.com/v1/images:annotate?key=${visionApiKey}`;
    const body = {
        requests: [{
            image: { content: base64 },
            features: [{ type: "TEXT_DETECTION" }]
        }]
    };
    const r = await fetch(url, {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify(body)
    });
    return await r.json();
}

function extract3digit(textAnn) {
    if(!textAnn) return [];
    return textAnn.slice(1)
        .filter(t=>/^\d{3}$/.test(t.description?.trim()))
        .map(t=>{
            const v = t.boundingPoly.vertices;
            return {
                number: t.description.trim(),
                x: v[0].x||0, y: v[0].y||0,
                w: (v[1].x||0)-(v[0].x||0),
                h: (v[2].y||0)-(v[0].y||0)
            };
        });
}

function captureFrame() {
    const c = document.createElement("canvas");
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    c.getContext("2d").drawImage(video,0,0);
    return c;
}

async function detect3digits(canvas) {
    const base64 = canvas.toDataURL("image/jpeg").split(",")[1];
    const res = await callVision(base64);
    return extract3digit(res.responses[0].textAnnotations);
}

/* =====================================================
   render
===================================================== */
function renderResult(targetEl, data, color="black") {
    const wrap = document.createElement("div");
    wrap.className = "quest-item";

    const img = document.createElement("img");
    img.className = "quest-thumb";
    img.src = data.img;

    const txt = document.createElement("div");
    txt.className = "quest-text";
    txt.style.color = color;
    txt.innerText = data.number;

    wrap.appendChild(img);
    wrap.appendChild(txt);
    targetEl.appendChild(wrap);
}

/* =====================================================
   Q mode
===================================================== */
async function runQ() {
    if (!video.videoWidth) return;
    qResultsEl.innerHTML = "";
    currentQNumbers = [];

    const frame = captureFrame();
    const detected = await detect3digits(frame);

    detected.forEach(d=>{
        currentQNumbers.push(d.number);

        const cut = document.createElement("canvas");
        cut.width = d.w+120; cut.height = d.h+120;
        cut.getContext("2d").drawImage(frame, d.x-60,d.y-60,d.w+120,d.h+120,0,0,d.w+120,d.h+120);

        const img = cut.toDataURL();
        renderResult(qResultsEl, {number:d.number,img}, "red");

        // ★ saved と照合し即復元
        if(savedNumbers.has(d.number)){
            renderResult(aResultsEl, savedNumbers.get(d.number), "black");
        }
    });
}

/* =====================================================
   A mode
===================================================== */
async function runA() {
    if (!video.videoWidth) return;

    const frame = captureFrame();
    const detected = await detect3digits(frame);

    detected.forEach(d=>{
        const cut = document.createElement("canvas");
        cut.width = d.w+120;
        cut.height = d.h+120;
        cut.getContext("2d").drawImage(frame,d.x-60,d.y-60,d.w+120,d.h+120,0,0,d.w+120,d.h+120);
        const img = cut.toDataURL();

        const data = { number:d.number, img };

        // 常に保存
        savedNumbers.set(d.number, data);

        // 現在のお題に含まれていれば表示
        if(currentQNumbers.includes(d.number)){
            renderResult(aResultsEl, data, "black");
        }
    });
}

/* =====================================================
   capture button
===================================================== */
async function captureOnce() {
    if(currentMode==="Q") runQ();
    else runA();
}

let timer=null;
camBtn.addEventListener("touchstart",e=>{e.preventDefault();if(timer)return;captureOnce();timer=setInterval(captureOnce,INTERVAL_MS)});
window.addEventListener("touchend",()=>{clearInterval(timer);timer=null});
camBtn.addEventListener("mousedown",()=>{if(timer)return;captureOnce();timer=setInterval(captureOnce,INTERVAL_MS)});
window.addEventListener("mouseup",()=>{clearInterval(timer);timer=null});

/* =====================================================
   clear buttons
===================================================== */
clearBtn.onclick = ()=>{
    qResultsEl.innerHTML="";
    aResultsEl.innerHTML="";
};

hardClearBtn.onclick=()=>{
    if(!confirm("新規でかくれんぼを開始しますか？\n保存した数字は全てリセットされます"))return;
    qResultsEl.innerHTML="";
    aResultsEl.innerHTML="";
    savedNumbers.clear();
    currentQNumbers=[];
};

/* =====================================================
   init
===================================================== */
window.onload=async ()=>{
    await askForApiKeyIfNeeded();
    await startCamera();
    setMode("Q");
};