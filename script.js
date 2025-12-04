console.log("script.js STARTED!");

// localStorage 確認
console.log("localStorage key:", localStorage.getItem("vision_api_key"));

let visionApiKey = localStorage.getItem("vision_api_key");

function askForApiKeyIfNeeded() {
    console.log("askForApiKeyIfNeeded() CALLED");

    if (!visionApiKey) {
        console.log("NO KEY → prompting...");
        visionApiKey = prompt("Google Vision API キーを入力してください（テスト）");
        console.log("prompt result:", visionApiKey);

        if (!visionApiKey) {
            alert("APIキーが必要です（テスト）");
            return;
        }

        localStorage.setItem("vision_api_key", visionApiKey);
        alert("APIキー保存済み（テスト）");
    } else {
        console.log("キーは保存済み：", visionApiKey);
    }
}

askForApiKeyIfNeeded();
