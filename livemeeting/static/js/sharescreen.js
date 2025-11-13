const role = prompt("输入角色: owner 或 viewer").toLowerCase(); // 简化测试
const roomId = "testroom";
const ws = new WebSocket(`wss://yourserver.com/ws/${roomId}`);
const localVideo = document.getElementById("localVideo");
const viewerVideos = document.getElementById("viewerVideos");

let localStream;
const viewers = {}; // viewerId -> RTCPeerConnection

ws.onopen = () => console.log("🟢 WebSocket connected");

ws.onmessage = async (msg) => {
    const data = JSON.parse(msg.data);
    // console.log("📩 收到 WebSocket 消息:", data);

    if (data.type === "role") {
        console.log("✅ 你的身份:", data.role);
    }

    if (role === "owner") {
        if (data.type === "new_viewer_joined") {
            await handleNewViewer(data.viewer_id);
        }
        if (data.type === "answer") {
            const pc = viewers[data.viewer_id];
            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        }
        if (data.type === "candidate") {
            const pc = viewers[data.target];
            if (pc) await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
    } else if (role === "viewer") {
        if (data.type === "offer" && data.target === ws.id) {
            const pc = createViewerPC();
            await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            ws.send(JSON.stringify({type: "answer", answer, target: data.sender}));
        }
        if (data.type === "candidate") {
            await viewerPC.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
    }
};

async function handleNewViewer(viewerId) {
    const pc = new RTCPeerConnection();
    viewers[viewerId] = pc;

    // 添加本地 track
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    // 收集 ICE candidate
    pc.onicecandidate = e => {
        if (e.candidate) {
            ws.send(JSON.stringify({type:"candidate", candidate: e.candidate, target: viewerId}));
        }
    };

    // 创建 offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    ws.send(JSON.stringify({type:"offer", offer, target: viewerId}));
}

// owner 获取屏幕
document.getElementById("startShareBtn").onclick = async () => {
    localStream = await navigator.mediaDevices.getDisplayMedia({video:true});
    localVideo.srcObject = localStream;
};

// viewer PeerConnection
let viewerPC;
function createViewerPC() {
    viewerPC = new RTCPeerConnection();

    viewerPC.ontrack = e => {
        console.log("🎥 收到远程流", e.streams);
        const vid = document.createElement("video");
        vid.srcObject = e.streams[0];
        vid.autoplay = true;
        vid.playsInline = true;
        viewerVideos.appendChild(vid);
    };

    viewerPC.onicecandidate = e => {
        if (e.candidate) {
            ws.send(JSON.stringify({type:"candidate", candidate: e.candidate}));
        }
    };

    return viewerPC;
}
