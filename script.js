const preview = document.getElementById("preview");
const fileInput = document.getElementById("fileInput");

// カメラ起動
document.getElementById("btnCamera").onclick = () => {
    fileInput.click();
};

// 画像読み込み
fileInput.onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
        preview.src = URL.createObjectURL(file);
    }
};

// ゴミ箱ボタン
document.getElementById("btnDelete").onclick = () => {
    preview.src = "";
    fileInput.value = "";
};
