const ws_scheme = window.location.protocol === "https:" ? "wss" : "ws";
const ws = new WebSocket(`${ws_scheme}://${window.location.host}/ws/sharescreen/${ROOM_NAME}/`);

let isOwner = false;
let localStream = null;
let viewersPC = {};  // viewer_id -> RTCPeerConnection

console.log("🔌 Connecting WebSocket to room:", ROOM_NAME);

ws.onopen = () => console.log("🟢 WebSocket connected");
ws.onclose = () => console.log("🔴 WebSocket disconnected");

ws.onmessage = async (event) => {
    const data = JSON.parse(event.data);
    console.log("📩 收到 WebSocket 消息:", data);

    if (data.type === "role") {
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
        ws.send(JSON.stringify({ type: "answer", answer, target: data.sender }));
        console.log("📤 已发送 answer:", answer);
    }

    if (data.type === "answer" && isOwner && viewersPC[data.sender]) {
        await viewersPC[data.sender].setRemoteDescription(new RTCSessionDescription(data.answer));
        console.log("📩 已设置 answer");
    }

    if (data.type === "candidate") {
        const targetPC = isOwner ? viewersPC[data.sender] : pc;
        if (targetPC) await targetPC.addIceCandidate(new RTCIceCandidate(data.candidate));
    }

    if (data.type === "new_viewer_joined" && isOwner) {
        sendOfferToViewer(data.viewer_id);
    }
};

// ====== Owner 获取屏幕流 ======
async function setupOwner() {
    try {
        localStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        document.getElementById("localVideo").srcObject = localStream;
        console.log("🎥 本地屏幕流已获取");
    } catch (err) {
        console.error("❌ 获取屏幕流失败:", err);
    }
}

// ====== Viewer 设置 RTCPeerConnection ======
function setupViewer() {
    window.pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    pc.ontrack = e => document.getElementById("remoteVideo").srcObject = e.streams[0];
    pc.onicecandidate = e => {
        if (e.candidate) ws.send(JSON.stringify({ type: "candidate", candidate: e.candidate }));
    };
}

// ====== Owner 给新 viewer 发送 offer ======
async function sendOfferToViewer(viewerId) {
    if (!localStream) return;
    if (viewersPC[viewerId]) viewersPC[viewerId].close();

    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    viewersPC[viewerId] = pc;

    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    pc.onicecandidate = e => {
        if (e.candidate) ws.send(JSON.stringify({ type: "candidate", candidate: e.candidate, target: viewerId }));
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    ws.send(JSON.stringify({ type: "offer", offer, target: viewerId }));
    console.log("📤 已发送 offer 给 viewer:", viewerId);
}

// ====== 页面按钮事件 ======
document.addEventListener("DOMContentLoaded", () => {
    const shareBtn = document.getElementById("startBtn");
    if (shareBtn) {
        shareBtn.style.display = isOwner ? "block" : "none";
        shareBtn.onclick = async () => {
            if (!isOwner) return alert("你不是共享者");
            try {
                localStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
                document.getElementById("localVideo").srcObject = localStream;
                Object.values(viewersPC).forEach(pc => {
                    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
                });
                console.log("🎥 本地屏幕流已获取");
            } catch (err) {
                console.error("❌ 屏幕共享失败:", err);
            }
        };
    }
});
