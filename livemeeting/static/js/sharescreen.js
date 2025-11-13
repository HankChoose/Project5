const ws_scheme = window.location.protocol === "https:" ? "wss" : "ws";
const ws = new WebSocket(`${ws_scheme}://${window.location.host}/ws/sharescreen/${ROOM_NAME}/`);

let pc = null;
let localStream = null;
let isOwner = false;

console.log("🔌 Connecting WebSocket to room:", ROOM_NAME);

ws.onopen = () => console.log("🟢 WebSocket connected");
ws.onclose = () => console.log("🔴 WebSocket disconnected");

ws.onmessage = async (event) => {
    const data = JSON.parse(event.data);
    console.log("📩 收到 WebSocket 消息:", data);

    if (data.type === "role") {
        console.log("✅ 你的身份:", data.role);
        isOwner = data.role === "owner";
        if (isOwner) setupOwner();
        else setupViewer();
    }

    if (data.type === "owner_left") {
        alert("📴 主播已离开，屏幕共享结束");
        document.getElementById("remoteVideo").srcObject = null;
    }

    if (data.type === "offer" && !isOwner) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        ws.send(JSON.stringify({ type: "answer", answer: answer }));
        console.log("📤 已发送 answer:", answer);
    }

    if (data.type === "answer" && isOwner) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
    }

    if (data.type === "candidate" && pc) {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    }

    if (data.type === "new_viewer_joined" && isOwner) {
        sendOfferToViewer(data.viewer_id);
    }
};

async function setupOwner() {
    pc = createPeerConnection();
    try {
        localStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        const localVideo = document.getElementById("localVideo");
        localVideo.srcObject = localStream;
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
        console.log("🎥 本地屏幕流已获取");
    } catch (err) {
        console.error("❌ 获取屏幕流失败:", err);
    }
}

function setupViewer() {
    pc = createPeerConnection();
    const remoteVideo = document.getElementById("remoteVideo");
    pc.ontrack = (event) => {
        console.log("🎥 收到远程流");
        remoteVideo.srcObject = event.streams[0];
    };
}

function createPeerConnection() {
    const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            ws.send(JSON.stringify({ type: "candidate", candidate: event.candidate }));
        }
    };

    pc.onconnectionstatechange = () => {
        console.log("🔄 连接状态变化:", pc.connectionState);
    };

    return pc;
}

async function sendOfferToViewer(viewerId) {
    if (!pc || !localStream) return;
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    ws.send(JSON.stringify({ type: "offer", offer: offer, target: viewerId }));
    console.log("📤 已发送 offer 给 viewer:", viewerId);
}

// 页面按钮事件
document.addEventListener("DOMContentLoaded", () => {
    const shareBtn = document.getElementById("startBtn");
    if (shareBtn) {
        shareBtn.style.display = isOwner ? "block" : "none";
        shareBtn.addEventListener("click", async () => {
            if (!isOwner) return alert("你不是共享者");
            try {
                localStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
                document.getElementById("localVideo").srcObject = localStream;
                localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                ws.send(JSON.stringify({ type: "offer", offer: offer }));
                console.log("📤 已发送 offer 给所有 viewer:", offer);
            } catch (err) {
                console.error("❌ 屏幕共享失败:", err);
            }
        });
    }
});
