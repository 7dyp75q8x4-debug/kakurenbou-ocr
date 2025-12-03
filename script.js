/* === 状態 === */
let currentMode = "none";  
let captureInterval = null;

/* === カメラ起動 === */
navigator.mediaDevices.getUserMedia({ video: true }).then(stream => {
    document.getElementById("camera").srcObject = stream;
});

/* === モード切替 === */
document.getElementById("qMode").onclick = () => {
    currentMode = "Q";
};

document.getElementById("aMode").onclick = () => {
    currentMode = "A";
};

/* === キャプチャボタン === */
document.getElementById("capture").onclick = () => {
    console.log("撮影（ダミー）");
};

/* === ゴミ箱クリア === */
document.getElementById("clear").onclick = () => {
    document.getElementById("candidates").innerHTML = "";
};
