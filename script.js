body {
    margin: 0;
    font-family: sans-serif;
    background: white;

    /* 追加：全要素を選択不可に */
    -webkit-user-select: none;
    user-select: none;
}

/* 全体を左右に分割 */
#container {
    display: flex;
    width: 100vw;
    height: 100vh;
}

/* 左側：検出候補 */
#left-panel {
    flex: 1;
    padding: 16px;
}

#left-panel h2 {
    margin-top: 0;
    font-size: 28px;
    font-weight: bold;
}

#candidates {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

/* 右側：カメラ＋ボタン */
#right-panel {
    width: 45%;
    padding: 10px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
}

/* カメラ映像 */
#camera-wrapper {
    width: 100%;
    aspect-ratio: 1 / 1;
    background: #eee;
    border-radius: 15px;
    overflow: hidden;
}

#camera {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

/* ボタン群 */
#buttons {
    display: flex;
    justify-content: space-around;
    margin-top: 10px;
}

/* Q / A ボタン */
.mode-btn {
    width: 60px;
    height: 40px;
    border-radius: 10px;
    border: none;
    background: #ddd;
    font-size: 18px;
}

/* 撮影ボタン */
#capture {
    width: 60px;
    height: 40px;
    border-radius: 10px;
    border: none;
    background: #ffe066;
    font-size: 20px;
}

/* ゴミ箱ボタン */
#trash {
    width: 100px;
    height: 40px;
    border-radius: 10px;
    border: none;
    background: #87cefa;
    font-size: 18px;
}

/* ステータス表示 */
#status {
    text-align: center;
    margin-top: 5px;
    font-size: 20px;
    font-weight: bold;
}
