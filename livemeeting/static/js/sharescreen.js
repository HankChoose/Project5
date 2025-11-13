const roomName = window.location.pathname.split("/").slice(-2, -1)[0];
const ws = new WebSocket(`wss://${window.location.host}/ws/sharescreen/${roomName}/`);

let pc = null;
let localStream = null;
let isOwner = false;

ws.onmessage = async (event) => {
    const data = JSON.parse(event.data);
    console.log("WS message:", data);

    if (data.type === "role") {
        isOwner = data.role === "owner";
        console.log(`✅ 你的身份: ${data.role}`);

        if (isOwner) {
            document.getElementById("shareBtn").style.display = "block";
        }
    }

    // 主播离开
    if (data.type === "owner_left") {
        alert("主播已离开，屏幕共享结束。");
        const video = document.getElementById("remoteVideo");
        video.srcObject = null;
    }

    // WebRTC 信令部分
    if (data.type === "offer" && !isOwner) {
        console.log("📩 收到 offer");
        await createPeerConnection();

        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        ws.send(JSON.stringify({
            type: "answer",
            answer: answer
        }));
    } else if (data.type === "answer" && isOwner) {
        console.log("📩 收到 answer");
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
    } else if (data.type === "candidate" && pc) {
        try {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (err) {
            console.error("❌ 添加 candidate 失败:", err);
        }
    }
};

// ====== 函数部分 ======

async function createPeerConnection() {
    pc = new RTCPeerConnection();

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            ws.send(JSON.stringify({
                type: "candidate",
                candidate: event.candidate
            }));
        }
    };

    // viewer 端接收视频流
    pc.ontrack = (event) => {
        console.log("🎥 收到远端视频流");
        const video = document.getElementById("remoteVideo");
        video.srcObject = event.streams[0];
    };

    return pc;
}

async function startShare() {
    if (!isOwner) {
        alert("你不是共享者");
        return;
    }

    try {
        localStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        const video = document.getElementById("localVideo");
        video.srcObject = localStream;

        await createPeerConnection();
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        ws.send(JSON.stringify({
            type: "offer",
            offer: offer
        }));

    } catch (err) {
        console.error("❌ 屏幕共享失败:", err);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("shareBtn").addEventListener("click", startShare);
});
