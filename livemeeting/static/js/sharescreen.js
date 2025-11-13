const roomName = window.location.pathname.split("/").slice(-2, -1)[0];
const ws_scheme = window.location.protocol === "https:" ? "wss" : "ws";
const ws = new WebSocket(`${ws_scheme}://${window.location.host}/ws/sharescreen/${roomName}/`);

let pc = null;
let localStream = null;
let isOwner = false;

console.log("🔌 Connecting WebSocket to room:", roomName);

ws.onopen = () => console.log("🟢 WebSocket connected");
ws.onclose = () => console.log("🔴 WebSocket disconnected");

ws.onmessage = async (event) => {
    const data = JSON.parse(event.data);
    console.log("📩 收到 WebSocket 消息:", data);

    // 角色分配
    if (data.type === "role") {
        console.log("✅ 你的身份:", data.role);
        isOwner = data.role === "owner";
        if (isOwner) setupOwner();
        else setupViewer();
    }

    // 主播离开
    if (data.type === "owner_left") {
        alert("📴 主播已离开，屏幕共享结束");
        const remoteVideo = document.getElementById("remoteVideo");
        if (remoteVideo) remoteVideo.srcObject = null;
    }

    // 收到 offer (viewer)
    if (data.type === "offer" && !isOwner) {
        console.log("📩 收到 offer，准备创建 answer");
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        ws.send(JSON.stringify({ type: "answer", answer: answer }));
        console.log("📤 已发送 answer:", answer);
    }

    // 收到 answer (owner)
    if (data.type === "answer" && isOwner) {
        console.log("📩 收到 answer:", data.answer);
        try {
            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        } catch (err) {
            console.error("❌ setRemoteDescription 失败:", err);
        }
    }

    // 收到 candidate
    if (data.type === "candidate" && pc) {
        console.log("📩 添加 candidate:", data.candidate);
        try {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (err) {
            console.error("❌ 添加 candidate 失败:", err);
        }
    }

    // 新 viewer 加入 (owner)
    if (data.type === "new_viewer_joined" && isOwner) {
        console.log("👋 新 viewer 加入:", data.viewer_id);
        // 重新发送 offer 给新加入的 viewer
        sendOfferToViewer(data.viewer_id);
    }
};

// ====== 初始化函数 ======
async function setupOwner() {
    console.log("🎬 你是 owner");
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
    console.log("👀 你是 viewer，等待 offer...");
    pc = createPeerConnection();
    const remoteVideo = document.getElementById("remoteVideo");
    pc.ontrack = (event) => {
        console.log("🎥 收到远程流");
        remoteVideo.srcObject = event.streams[0];
    };
}

// ====== PeerConnection 创建 ======
function createPeerConnection() {
    const config = {
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    };
    const pc = new RTCPeerConnection(config);

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            ws.send(JSON.stringify({ type: "candidate", candidate: event.candidate }));
            console.log("📤 已发送 ICE candidate:", event.candidate);
        }
    };

    pc.onconnectionstatechange = () => {
        console.log("🔄 连接状态变化:", pc.connectionState);
    };

    return pc;
}

// ====== owner 手动给新 viewer 发送 offer ======
async function sendOfferToViewer(viewerId) {
    if (!pc || !localStream) return;

    // 先创建新的 offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // 通过 WebSocket 通知后端转发给指定 viewer
    ws.send(JSON.stringify({
        type: "offer",
        offer: offer,
        target: viewerId
    }));
    console.log("📤 已发送 offer 给 viewer:", viewerId, offer);
}

// ====== 页面按钮事件 ======
document.addEventListener("DOMContentLoaded", () => {
    const shareBtn = document.getElementById("shareBtn");
    if (shareBtn) {
        shareBtn.style.display = isOwner ? "block" : "none";
        shareBtn.addEventListener("click", async () => {
            if (!isOwner) return alert("你不是共享者");
            try {
                localStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
                const localVideo = document.getElementById("localVideo");
                localVideo.srcObject = localStream;
                localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
                console.log("🎥 本地屏幕流已获取");

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
