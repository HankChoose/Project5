// 绑定函数到全局，供 HTML 调用
export function initShareScreen(roomName) {
    console.log("Initializing share screen for room:", roomName);

    const startBtn = document.getElementById("startBtn");
    const localVideo = document.getElementById("localVideo");
    const remoteVideo = document.getElementById("remoteVideo");

    // 1️⃣ 连接 WebSocket
    const loc = window.location;
    const wsStart = loc.protocol === "https:" ? "wss" : "ws";
    const wsUrl = `${wsStart}://${loc.host}/ws/sharescreen/${roomName}/`;
    const ws = new WebSocket(wsUrl);

    // 2️⃣ 本地屏幕流
    let localStream;
    let pc = new RTCPeerConnection();

    pc.ontrack = (event) => {
        console.log("Received remote track");
        remoteVideo.srcObject = event.streams[0];
    };

    // 按钮点击开始共享
    startBtn.onclick = async () => {
        try {
            localStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
            localVideo.srcObject = localStream;

            // 添加轨道到 PeerConnection
            localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

            // 创建 offer
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            // 发送 offer 给服务器
            ws.send(JSON.stringify({ type: "offer", sdp: offer.sdp }));
        } catch (err) {
            console.error("Error accessing display media:", err);
        }
    };

    // 接收信令消息
    ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);

        if (data.type === "answer") {
            await pc.setRemoteDescription({ type: "answer", sdp: data.sdp });
        } else if (data.type === "candidate") {
            try {
                await pc.addIceCandidate(data.candidate);
            } catch (err) {
                console.error("Error adding ICE candidate:", err);
            }
        }
    };

    // ICE candidate 收集
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            ws.send(JSON.stringify({ type: "candidate", candidate: event.candidate }));
        }
    };
}

// 如果希望直接在 HTML 调用
window.initShareScreen = initShareScreen;
