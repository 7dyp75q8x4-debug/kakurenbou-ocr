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
const hardClearBtn = document.getElementById("hard-clear-btn");

const qResultsEl = document.getElementById("q-results");
const aResultsEl = document.getElementById("a-results");

let currentMode = "Q";               
let stream = null;

let lastQNumbers = [];               
let answerHistory = new Set();       

// ✅ Aモード記録メモリ
let savedAnswerMemory = new Set();

let visionApiKey = localStorage.getItem("vision_api_key");

const INTERVAL_MS = 1000;

/* =====================================================
   ガチゴミ箱（confirm安定版）
===================================================== */
hardClearBtn.addEventListener("click", () => {
    // iOS Chrome対策：同期タイミングで実行
    setTimeout(() => {
        const ok = window.confirm(
            "新規でかくれんぼを開始しますか？\n読み取って保存した数字は全てリセットされます"
        );
        if (!ok) return;

        qResultsEl.innerHTML = "";
        aResultsEl.innerHTML = "";
        lastQNumbers = [];
        answerHistory.clear();
        savedAnswerMemory.clear();
    }, 50);
});

/* =====================================================
   通常クリア
===================================================== */
clearBtn.addEventListener("click", () => {
    qResultsEl.innerHTML = "";
    aResultsEl.innerHTML = "";
    lastQNumbers = [];
    answerHistory.clear();
});

/* ---- 以降はあなたの元コードそのまま ---- */

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
                aspectRatio: isLandscape ? { exact: 16/9 } : undefined
            },
            audio: false
        };

        stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        await video.play().catch(()=>{});

        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
    } catch (e) {
        alert("カメラ起動失敗: " + e.message);
    }
}

window.addEventListener("orientationchange", async () => {
    if (stream) stream.getTracks().forEach(t => t.stop());
    await startCamera();
});

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

async function callVisionTextDetection(base64Image) {
    if (!visionApiKey) return null;
    const url = `https://vision.googleapis.com/v1/images:annotate?key=${visionApiKey}`;
    const body = { requests:[{ image:{content:base64Image},features:[{type:"TEXT_DETECTION",maxResults:50}]}] };
    const res = await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    return await res.json();
}

function parseTextAnnotationsFor3Digit(textAnn) {
    if (!textAnn) return [];
    return textAnn
        .slice(1)
        .filter(t => /^\d{3}$/.test(t.description?.trim()))
        .map(t => {
            const v=t.boundingPoly.vertices;
            return {number:t.description.trim(),x:v[0].x||0,y:v[0].y||0,w:Math.max((v[1].x-v[0].x)||8,8),h:Math.max((v[2].y-v[0].y)||8,8)};
        });
}

function captureVideoFrameToCanvas() {
    const c = document.createElement("canvas");
    c.width  = video.videoWidth;
    c.height = video.videoHeight;
    c.getContext("2d").drawImage(video,0,0,c.width,c.height);
    return c;
}

// 以下 Qモード/Aモード処理は元コードを維持