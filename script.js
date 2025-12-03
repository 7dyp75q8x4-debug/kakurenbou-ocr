/* ゴミ箱（まだ機能なし） */
document.getElementById("trash").onclick = () => {
    console.log("clear requested");
};

/* Q / A モード切替（UI反応のみ） */
document.getElementById("qMode").onclick = () => {
    console.log("Q モード");
};

document.getElementById("aMode").onclick = () => {
    console.log("A モード");
};

/* カメラ起動：16:9でリアカメラ */
async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: "environment",
                aspectRatio: 16 / 9
            },
            audio: false
        });
        document.getElementById("camera").srcObject = stream;
    } catch (err) {
        alert("カメラが使用できません");
    }
}

startCamera();
