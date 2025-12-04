/* Q / A モード切替（UI反応あり） */
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

// ボタン押下
qBtn.onclick = () => setMode("Q");
aBtn.onclick = () => setMode("A");

// 初期状態を Q にする
setMode("Q");
