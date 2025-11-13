// sharescreen.js
const roomName = window.location.pathname.split("/").slice(-2, -1)[0];
const ws_scheme = window.location.protocol === "https:" ? "wss" : "ws";
const ws = new WebSocket(`${ws_scheme}://${window.location.host}/ws/sharescreen/${roomName}/`);

let pc = null;
let localStream = null;
let isOwner = false;
const viewersPC = {}; // viewer_id -> RTCPeerConnection

console.log("🔌 Connecting WebSocket to room:", roomName);

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
        if (!isOwner) document.getElementById("remoteVideo").srcObject = null;
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
        console.log("📩 已设置 answer");
    }

    if (data.type === "candidate" && pc) {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        console.log("📩 添加 candidate:", data.candidate);
    }

    if (data.type === "new_viewer_joined" && isOwner) {
        console.log("👋 新 viewer 加入:", data.viewer_id);
        sendOfferToViewer(data.viewer_id);
    }
};

async function setupOwner() {
    try {
        localStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        document.getElementById("localVideo").srcObject = localStream;
        console.log("🎥 本地屏幕流已获取");
    } catch (err) {
        console.error("❌ 获取屏幕流失败:", err);
        return;
    }
}

function setupViewer() {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    pc.ontrack = (event) => document.getElementById("remoteVideo").srcObject = event.streams[0];
    pc.onicecandidate = (e) => { if (e.candidate) ws.send(JSON.stringify({ type:"candidate", candidate:e.candidate })); };
    window.pc = pc; // 全局，方便收到 offer/answer/candidate 时使用
}

// 清理旧连接
function cleanup() {
    if (pc) pc.close();
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    pc = null;
}

// 创建 PeerConnection
function createPeerConnection() {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    pc.onicecandidate = (e) => {
        if (e.candidate) ws.send(JSON.stringify({ type: "candidate", candidate: e.candidate }));
    };
    pc.onconnectionstatechange = () => console.log("🔄 连接状态变化:", pc.connectionState);
    return pc;
}

// owner 给新 viewer 发送 offer
// 当新 viewer 加入或刷新
async function sendOfferToViewer(viewerId) {
    // 如果已有旧连接，先关闭
    if (viewersPC[viewerId]) {
        viewersPC[viewerId].close();
        delete viewersPC[viewerId];
    }

    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    viewersPC[viewerId] = pc;

    // 添加本地屏幕流
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    pc.onicecandidate = (e) => {
        if (e.candidate) ws.send(JSON.stringify({ type: "candidate", candidate: e.candidate, target: viewerId }));
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    ws.send(JSON.stringify({ type: "offer", offer, target: viewerId }));
    console.log("📤 已发送 offer 给 viewer:", viewerId);
}

// 页面按钮
document.addEventListener("DOMContentLoaded", () => {
    const shareBtn = document.getElementById("shareBtn");
    if (shareBtn) {
        shareBtn.style.display = isOwner ? "block" : "none";
        shareBtn.onclick = async () => {
            if (!isOwner) return alert("你不是共享者");
            try {
                localStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
                document.getElementById("localVideo").srcObject = localStream;
                localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                ws.send(JSON.stringify({ type: "offer", offer }));
                console.log("📤 已发送 offer 给所有 viewer");
            } catch (err) {
                console.error("❌ 屏幕共享失败:", err);
            }
        };
    }
});
