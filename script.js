let mode = "Q";

/* モード切替 */
document.getElementById("qMode").onclick = () => {
    mode = "Q";
    document.getElementById("status").textContent = "Qモード：お題読取り待機";
};

document.getElementById("aMode").onclick = () => {
    mode = "A";
    document.getElementById("status").textContent = "Aモード：解答探索";
};

/* ゴミ箱 */
document.getElementById("trash").onclick = () => {
    document.getElementById("candidates").innerHTML = "";
    document.getElementById("status").textContent = "クリア";
};

/* カメラ起動 */
async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "environment" },
            audio: false
        });
        document.getElementById("camera").srcObject = stream;
    } catch (e) {
        alert("カメラが使用できません");
    }
}

startCamera();
