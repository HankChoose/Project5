const roomName = window.location.pathname.split("/").slice(-2, -1)[0];
const ws_scheme = window.location.protocol === "https:" ? "wss" : "ws";
const ws = new WebSocket(`${ws_scheme}://${window.location.host}/ws/sharescreen/${roomName}/`);

let pc;
let localStream = null;
let isOwner = false;

console.log("🔌 Connecting WebSocket to room:", roomName);

ws.onmessage = async (event) => {
    const data = JSON.parse(event.data);
    console.log("📩 收到 WebSocket 消息:", data);

    if (data.type === "role") {
        console.log("✅ 你的身份:", data.role);
        if (data.role === "owner") {
            isOwner = true;
            setupOwner();
        } else {
            setupViewer();
        }
    } else if (data.type === "offer" && !isOwner) {
        console.log("📩 收到 offer，准备创建 answer");
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        ws.send(JSON.stringify({ type: "answer", answer: answer }));
        console.log("📤 已发送 answer:", answer);
    } else if (data.type === "answer" && isOwner) {
        console.log("📩 收到 answer:", data.answer);
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
    } else if (data.type === "candidate") {
        console.log("📩 收到 candidate:", data.candidate);
        try {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) {
            console.error("❌ 添加 candidate 失败:", e);
        }
    }else if (data.type === "new_viewer_joined" && isOwner) {
        console.log("👋 有新观众加入，重新发送 offer");

        if (pc && localStream) {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            ws.send(JSON.stringify({ type: "offer", offer: offer }));
            console.log("📤 已重新发送 offer 给新观众:", offer);
        }
    } else if (data.type === "owner_left") {
        alert("📴 主播已离开，屏幕共享结束");
        const video = document.getElementById("remoteVideo");
        if (video) video.srcObject = null;
    }
};

ws.onopen = () => console.log("🟢 WebSocket connected");
ws.onclose = () => console.log("🔴 WebSocket disconnected");

async function setupOwner() {
    console.log("🎬 你是 owner，准备获取屏幕流...");
    pc = createPeerConnection();

    try {
        localStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
        document.getElementById("localVideo").srcObject = localStream;

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        ws.send(JSON.stringify({ type: "offer", offer: offer }));
        console.log("📤 已发送 offer:", offer);
    } catch (err) {
        console.error("❌ 获取屏幕失败:", err);
    }
}

function setupViewer() {
    console.log("👀 你是 viewer，等待 offer...");
    pc = createPeerConnection();
    const remoteVideo = document.getElementById("remoteVideo");
    pc.ontrack = (event) => {
        console.log("🎥 收到远程流");
        remoteVideo.srcObject = event.streams[0];
    };
}

function createPeerConnection() {
    const config = {
        iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            // 这里你可以加入 TURN 服务器（如果有）
        ],
    };
    const pc = new RTCPeerConnection(config);

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            const msg = { type: "candidate", candidate: event.candidate };
            ws.send(JSON.stringify(msg));
            console.log("📤 已发送 ICE candidate:", msg);
        }
    };

    pc.onconnectionstatechange = () => {
        console.log("🔄 连接状态变化:", pc.connectionState);
    };

    return pc;
}
