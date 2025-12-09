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

let currentMode = "Q";
let stream = null;

let lastQNumbers = [];
let answerHistory = new Set();

/* =====================================================
   Vision API 関連はそのまま
===================================================== */
/* ここは変更なし */

/* =====================================================
   トリミング用 共通関数
===================================================== */
function clampCrop(x, y, w, h, imgW, imgH) {
    x = Math.max(0, x);
    y = Math.max(0, y);
    w = Math.min(w, imgW - x);
    h = Math.min(h, imgH - y);
    return { x, y, w, h };
}

/* =====================================================
   Qモード（お題側：以前の動作を再現）
===================================================== */
async function runQModeScan() {
    if (!video.videoWidth) return;

    const frame = captureVideoFrameToCanvas();
    const detected = await detectThreeDigitFromCanvas(frame);

    const uniqueMap = new Map();
    detected.forEach(d => {
        if (!uniqueMap.has(d.number)) uniqueMap.set(d.number, d);
    });
    const unique = [...uniqueMap.values()];

    lastQNumbers = unique.map(d => d.number);
    qResultsEl.innerHTML = "";

    unique.forEach(item => {
        const baseSize = Math.max(item.w, item.h);
        const padding = baseSize * 0.8;

        let x = item.x - padding * 0.6;
        let y = item.y - padding * 0.6;
        let size = baseSize + padding;

        const crop = clampCrop(x, y, size, size, frame.width, frame.height);

        const cut = document.createElement("canvas");
        cut.width = crop.w;
        cut.height = crop.h;
        cut.getContext("2d").drawImage(
            frame,
            crop.x, crop.y, crop.w, crop.h,
            0, 0, crop.w, crop.h
        );

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
}

/* =====================================================
   Aモード（保存側：縦長・証拠用トリミング）
===================================================== */
async function runAModeScan() {
    if (!video.videoWidth) return;
    if (lastQNumbers.length === 0) return;

    const frame = captureVideoFrameToCanvas();
    const detected = await detectThreeDigitFromCanvas(frame);

    const uniqueMap = new Map();
    detected.forEach(d => {
        if (!uniqueMap.has(d.number)) uniqueMap.set(d.number, d);
    });
    const unique = [...uniqueMap.values()];

    unique.forEach(item => {
        const topPad = item.h * 0.6;
        const bottomPad = item.h * 2.2;
        const sidePad = item.w * 0.5;

        let x = item.x - sidePad;
        let y = item.y - topPad;
        let w = item.w + sidePad * 2;
        let h = item.h + topPad + bottomPad;

        const crop = clampCrop(x, y, w, h, frame.width, frame.height);

        const cut = document.createElement("canvas");
        cut.width = crop.w;
        cut.height = crop.h;
        cut.getContext("2d").drawImage(
            frame,
            crop.x, crop.y, crop.w, crop.h,
            0, 0, crop.w, crop.h
        );

        // 保存履歴
        if (!answerHistory.has(item.number)) {
            answerHistory.add(item.number);

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
        }
    });
}

/* =====================================================
   キャプチャ系はそのまま
===================================================== */