export async function initShareScreen(roomName) {
    const localVideo = document.getElementById("localVideo");
    const remoteVideo = document.getElementById("remoteVideo");
    const startBtn = document.getElementById("startBtn");

    const wsScheme = window.location.protocol === "https:" ? "wss" : "ws";
    const wsUrl = `${wsScheme}://${window.location.host}/ws/sharescreen/${roomName}/`;
    const socket = new WebSocket(wsUrl);

    let pc = null;
    let localStream = null;
    let role = null; // 'owner' or 'viewer'

    // WebSocket 连接
    socket.onopen = () => {
        console.log("✅ WebSocket connected");
    };

    socket.onmessage = async (event) => {
        const data = JSON.parse(event.data);

        // 分配角色
        if (data.type === "role") {
            role = data.role;
            console.log(`🎭 You are ${role}`);
            if (role === "owner") {
                startBtn.style.display = "inline-block";
                startBtn.onclick = startSharing;
            } else {
                startBtn.style.display = "none";
                await setupViewer();
            }
        }

        // WebRTC 信令处理
        if (data.type === "offer" && role === "viewer") {
            await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.send(JSON.stringify({
                type: "answer",
                sdp: answer
            }));
        }

        if (data.type === "answer" && role === "owner") {
            await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        }

        if (data.type === "ice-candidate" && pc) {
            try {
                await pc.addIceCandidate(data.candidate);
            } catch (err) {
                console.error("ICE error:", err);
            }
        }

        if (data.type === "owner_left") {
            remoteVideo.srcObject = null;
            alert("⛔️ 主播已离开，屏幕共享结束");
        }
    };

    // 共享者端逻辑
    async function startSharing() {
        localStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        localVideo.srcObject = localStream;

        pc = new RTCPeerConnection();
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

        pc.onicecandidate = (e) => {
            if (e.candidate) {
                socket.send(JSON.stringify({
                    type: "ice-candidate",
                    candidate: e.candidate
                }));
            }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        socket.send(JSON.stringify({
            type: "offer",
            sdp: offer
        }));
    }

    // 观众端逻辑
    async function setupViewer() {
        pc = new RTCPeerConnection();
        pc.ontrack = (e) => {
            remoteVideo.srcObject = e.streams[0];
            console.log("🎥 Received remote stream");
        };

        pc.onicecandidate = (e) => {
            if (e.candidate) {
                socket.send(JSON.stringify({
                    type: "ice-candidate",
                    candidate: e.candidate
                }));
            }
        };
    }
}
