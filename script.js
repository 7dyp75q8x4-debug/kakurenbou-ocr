/* =====================================================
   ページロード後にすべてを初期化
===================================================== */
window.addEventListener("DOMContentLoaded", () => {

    /* =====================================================
       APIキー入力（毎回必ず聞く）
    ===================================================== */
    let visionApiKey = null;

    function askForApiKey() {
        visionApiKey = null;

        while (!visionApiKey) {
            visionApiKey = prompt("Google Vision API キーを入力してください");
            if (!visionApiKey) alert("APIキーが必要です");
        }
    }

    askForApiKey(); // ← 確実に出る


    /* =====================================================
       要素取得（必ず DOMContentLoaded の中）
    ===================================================== */
    const qBtn = document.getElementById("qMode");
    const aBtn = document.getElementById("aMode");
    const cameraBtn = document.querySelector(".yellow-btn");
    const questPanel = document.getElementById("left-panel");
    const video = document.getElementById("camera");

    let isQMode = true;
    let ocrInterval = null;

    /* =====================================================
       Q / A モード切り替え
    ===================================================== */
    function setMode(mode) {
        if (mode === "Q") {
            qBtn.classList.add("active");
            aBtn.classList.remove("active");
            isQMode = true;
        } else {
            aBtn.classList.add("active");
            qBtn.classList.remove("active");
            isQMode = false;
        }
    }

    qBtn.addEventListener("click", () => setMode("Q"));
    aBtn.addEventListener("click", () => setMode("A"));
    setMode("Q"); // 初期状態


    /* =====================================================
       OCR 用 Canvas
    ===================================================== */
    const ocrCanvas = document.createElement("canvas");
    const ocrCtx = ocrCanvas.getContext("2d");


    /* =====================================================
       長押し OCR（1秒）
    ===================================================== */
    function startOCRLoop() {
        if (!isQMode) return;
        if (ocrInterval) return;

        cameraBtn.classList.add("pressing");

        runQModeScan();
        ocrInterval = setInterval(runQModeScan, 1000);
    }

    function stopOCRLoop() {
        if (ocrInterval) {
            clearInterval(ocrInterval);
            ocrInterval = null;
        }
        cameraBtn.classList.remove("pressing");
    }

    cameraBtn.addEventListener("mousedown", startOCRLoop);
    cameraBtn.addEventListener("mouseup", stopOCRLoop);
    cameraBtn.addEventListener("mouseleave", stopOCRLoop);

    cameraBtn.addEventListener("touchstart", e => {
        e.preventDefault();
        startOCRLoop();
    });
    cameraBtn.addEventListener("touchend", stopOCRLoop);


    /* =====================================================
       Qモード OCR 本体
    ===================================================== */
    async function runQModeScan() {
        if (!isQMode) return;
        if (!video.videoWidth) return;

        ocrCanvas.width = video.videoWidth;
        ocrCanvas.height = video.videoHeight;
        ocrCtx.drawImage(video, 0, 0);

        const frame = ocrCtx.getImageData(0, 0, ocrCanvas.width, ocrCanvas.height);

        const detected = await detectNumberPanels(frame);

        questPanel.innerHTML = "";

        detected.forEach(item => {
            const cut = document.createElement("canvas");
            cut.width = item.w;
            cut.height = item.h;
            const cctx = cut.getContext("2d");

            cctx.drawImage(
                ocrCanvas,
                item.x, item.y, item.w, item.h,
                0, 0, item.w, item.h
            );

            const div = document.createElement("div");
            div.className = "quest-item";

            const img = document.createElement("img");
            img.className = "quest-thumb";
            img.src = cut.toDataURL();

            const txt = document.createElement("div");
            txt.className = "quest-text";
            txt.innerText = item.number;

            div.appendChild(img);
            div.appendChild(txt);
            questPanel.appendChild(div);
        });
    }


    /* =====================================================
       ダミー検出
    ===================================================== */
    async function detectNumberPanels(frame) {
        return [];
    }


    /* =====================================================
       カメラ起動
    ===================================================== */
    async function startCamera() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "environment", aspectRatio: 16/9 },
                audio: false
            });
            video.srcObject = stream;
        } catch (err) {
            alert("カメラが使用できません：" + err.message);
        }
    }

    startCamera();
});
