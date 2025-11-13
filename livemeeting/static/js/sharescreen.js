const roomName = "{{ room_name }}"; // Django 模板传入
const ws_scheme = window.location.protocol === "https:" ? "wss" : "ws";
const ws = new WebSocket(`${ws_scheme}://${window.location.host}/ws/sharescreen/${roomName}/`);

let localStream = null;
let isOwner = false;
const viewerPCs = {}; // owner 保存所有 viewer 的 RTCPeerConnection

const localVideo = document.getElementById("localVideo");
const viewerVideos = document.getElementById("viewerVideos");
const startBtn = document.getElementById("startBtn");

ws.onopen = () => console.log("🟢 WebSocket connected");

ws.onmessage = async (event) => {
    const data = JSON.parse(event.data);
    console.log("📩 收到消息:", data);

    if (data.type === "role") {
        isOwner = data.role === "owner";
        console.log("✅ 你的身份:", data.role);
        startBtn.style.display = isOwner ? "block" : "none";
    }

    if (data.type === "offer" && !isOwner) {
        // viewer 收到 offer
        const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
        pc.ontrack = (e) => {
            const vid = document.createElement("video");
            vid.srcObject = e.streams[0];
            vid.autoplay = true;
            vid.playsInline = true;
            viewerVideos.appendChild(vid);
        };
        pc.onicecandidate = (e) => {
            if (e.candidate) ws.send(JSON.stringify({ type: "candidate", candidate: e.candidate }));
        };

        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        ws.send(JSON.stringify({ type: "answer", answer: answer }));
    }

    if (data.type === "answer" && isOwner) {
        const pc = viewerPCs[data.sender];
        if (pc) await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
    }

    if (data.type === "candidate") {
        const pc = isOwner ? viewerPCs[data.target] : window.viewerPC;
        if (pc) await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    }

    if (data.type === "new_viewer_joined" && isOwner) {
        console.log("👋 新 viewer 加入:", data.viewer_id);
        await sendOfferToViewer(data.viewer_id);
    }
};

startBtn.onclick = async () => {
    if (!isOwner) return;
    localStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    localVideo.srcObject = localStream;
    console.log("🎬 本地屏幕已获取");
};

// Owner 给新 viewer 发送 offer
async function sendOfferToViewer(viewerId) {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    viewerPCs[viewerId] = pc;

    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    pc.onicecandidate = (e) => {
        if (e.candidate) ws.send(JSON.stringify({ type: "candidate", candidate: e.candidate, target: viewerId }));
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    ws.send(JSON.stringify({ type: "offer", offer: offer, target: viewerId }));
    console.log("📤 已发送 offer 给 viewer:", viewerId);
}
