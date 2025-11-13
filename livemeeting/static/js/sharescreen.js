const roomName = window.location.pathname.split("/").slice(-2, -1)[0];
const ws_scheme = window.location.protocol === "https:" ? "wss" : "ws";
const ws = new WebSocket(`${ws_scheme}://${window.location.host}/ws/sharescreen/${roomName}/`);

let isOwner = false;
let localStream = null;
const viewersPC = {}; // owner 用，每个 viewer 一个 peer connection
let pc = null; // viewer 用，连接到 owner

console.log("🔌 Connecting WebSocket to room:", roomName);

ws.onopen = () => console.log("🟢 WebSocket connected");
ws.onclose = () => console.log("🔴 WebSocket disconnected");

ws.onmessage = async (event) => {
    const data = JSON.parse(event.data);
    console.log("📩 收到 WebSocket 消息:", data);

    if (data.type === "role") {
        isOwner = data.role === "owner";
        console.log(`✅ 你的身份: ${data.role}`);
        if (isOwner) setupOwner();
        else setupViewer();
    }

    if (data.type === "new_viewer_joined" && isOwner) {
        console.log("👋 新 viewer 加入:", data.viewer_id);
        await sendOfferToViewer(data.viewer_id);
    }

    if (data.type === "offer" && !isOwner) {
        console.log("📩 收到 offer，准备创建 answer");
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        ws.send(JSON.stringify({ type: "answer", answer: answer, target: data.sender }));
        console.log("📤 已发送 answer:", answer);
    }

    if (data.type === "answer" && isOwner) {
        const viewerId = data.sender;
        console.log("📩 收到 answer from viewer:", viewerId);
        const viewerPc = viewersPC[viewerId];
        if (viewerPc) {
            await viewerPc.setRemoteDescription(new RTCSessionDescription(data.answer));
        }
    }

    if (data.type === "candidate") {
        const targetPC = isOwner ? viewersPC[data.sender] : pc;
        if (targetPC) {
            try {
                await targetPC.addIceCandidate(new RTCIceCandidate(data.candidate));
                console.log("📩 添加 candidate:", data.candidate);
            } catch (err) {
                console.error("❌ 添加 candidate 失败:", err);
            }
        }
    }

    if (data.type === "owner_left" && !isOwner) {
        alert("📴 主播已离开，屏幕共享结束");
        const video = document.getElementById("remoteVideo");
        if (video) video.srcObject = null;
    }
};

// ====== 函数 ======
function setupOwner() {
    console.log("🎬 你是 owner");
    document.getElementById("shareBtn").style.display = "block";
}

async function startShare() {
    if (!isOwner) return alert("你不是共享者");
    pc = null;
    localStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    document.getElementById("localVideo").srcObject = localStream;
    console.log("🎥 本地屏幕流已获取");

    // 给每个 viewer 创建 PeerConnection 并发送 offer
    for (const viewerId of Object.keys(viewersPC)) {
        await sendOfferToViewer(viewerId);
    }
}

async function sendOfferToViewer(viewerId) {
    const pcViewer = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });
    viewersPC[viewerId] = pcViewer;

    localStream.getTracks().forEach(track => pcViewer.addTrack(track, localStream));

    pcViewer.onicecandidate = (event) => {
        if (event.candidate) {
            ws.send(JSON.stringify({
                type: "candidate",
                candidate: event.candidate,
                target: viewerId
            }));
        }
    };

    const offer = await pcViewer.createOffer();
    await pcViewer.setLocalDescription(offer);
    ws.send(JSON.stringify({ type: "offer", offer: offer, target: viewerId }));
    console.log("📤 已发送 offer 给 viewer:", viewerId);
}

function setupViewer() {
    console.log("👀 你是 viewer，等待 offer...");
    pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });

    pc.ontrack = (event) => {
        console.log("🎥 收到远程流");
        const remoteVideo = document.getElementById("remoteVideo");
        remoteVideo.srcObject = event.streams[0];
    };

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            ws.send(JSON.stringify({ type: "candidate", candidate: event.candidate, target: rooms.owner }));
        }
    };
}

document.getElementById("shareBtn").addEventListener("click", startShare);
