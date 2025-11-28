let stream;
let mode = null; // "Q" or "A"
let detectedProblems = []; // Qで読み取ったお題一覧（最大7個）
const detectedList = document.getElementById("detected-list");

async function startCamera() {
  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment" }
  });
  document.getElementById("camera").srcObject = stream;
}

document.getElementById("q-mode").onclick = () => {
  mode = "Q";
  document.getElementById("status-text").innerText = "Qモード：お題読み取り";
};

document.getElementById("a-mode").onclick = () => {
  mode = "A";
  document.getElementById("status-text").innerText = "Aモード：答え探索";
};

document.getElementById("delete-all").onclick = () => {
  detectedProblems = [];
  detectedList.innerHTML = "";
  document.getElementById("status-text").innerText = "削除しました";
};

document.getElementById("capture-btn").onclick = async () => {
  if (!mode) return;

  const video = document.getElementById("camera");
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0);

  const imageData = canvas.toDataURL("image/jpeg");

  if (mode === "Q") {
    processQ(imageData);
  } else {
    processA(imageData);
  }
};

function processQ(image) {
  if (detectedProblems.length >= 7) return;

  const div = document.createElement("div");
  div.style.marginBottom = "8px";
  div.innerHTML =
    `<span style="color:red; font-size:20px;">---</span><br>
     <img src="${image}" style="width:100px; height:auto; border:1px solid #ddd;">`;
  detectedList.appendChild(div);

  detectedProblems.push({
    num: "---",
    img: image
  });

  document.getElementById("status-text").innerText =
    "Q読み取り追加（※Cloud Vision未実装版）";
}

function processA(image) {
  document.getElementById("status-text").innerText =
    "Aモード読み取り（※Cloud Vision未実装版）";
}

startCamera();
