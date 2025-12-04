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
