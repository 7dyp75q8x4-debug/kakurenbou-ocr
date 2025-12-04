/* カメラ起動 */
async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: "environment"
            },
            audio: false
        });
        document.getElementById("camera").srcObject = stream;
    } catch (err) {
        alert("カメラが使用できません");
    }
}

startCamera();

/* Q / A モード切替（シーソースイッチ） */
const qBtn = document.getElementById("qMode");
const aBtn = document.getElementById("aMode");

function setMode(mode) {
    if (mode === "Q") {
        qBtn.classList.add("active");
        aBtn.classList.remove("active");
    } else {
        aBtn.classList.add("active");
        qBtn.classList.remove("active");
    }
}

qBtn.onclick = () => setMode("Q");
aBtn.onclick = () => setMode("A");

/* ページ読み込み時の初期状態（Qをアクティブ） */
setMode("Q");
