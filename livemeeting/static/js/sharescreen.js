// static/js/sharescreen.js
export function initShareScreen(roomName, { localVideoId, viewerVideosId, startBtnId }) {
    const role = prompt("输入角色: owner 或 viewer").toLowerCase();
    const ws = new WebSocket(`wss://${window.location.host}/ws/${roomName}/`);
    const localVideo = document.getElementById(localVideoId);
    const viewerVideos = document.getElementById(viewerVideosId);
    const startBtn = document.getElementById(startBtnId);

    let localStream;
    const viewers = {}; // owner: viewerId -> RTCPeerConnection
    let viewerPC;       // viewer: RTCPeerConnection

    ws.onopen = () => console.log("🟢 WebSocket connected");

    ws.onmessage = async (msg) => {
        const data = JSON.parse(msg.data);

        if (data.type === "role") {
            console.log("✅ 你的身份:", data.role);
        }

        if (role === "owner") {
            if (data.type === "new_viewer_joined") {
                await handleNewViewer(data.viewer_id);
            }
            if (data.type === "answer") {
                const pc = viewers[data.viewer_id];
                if (pc) await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
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
                ws.send(JSON.stringify({ type: "answer", answer, target: data.sender }));
            }
            if (data.type === "candidate") {
                if (viewerPC) await viewerPC.addIceCandidate(new RTCIceCandidate(data.candidate));
            }
        }
    };

    async function handleNewViewer(viewerId) {
        const pc = new RTCPeerConnection();
        viewers[viewerId] = pc;

        // 添加本地 track
        if (!localStream) return alert("请先开始屏幕共享");
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

        // ICE candidate 收集
        pc.onicecandidate = e => {
            if (e.candidate) {
                ws.send(JSON.stringify({ type: "candidate", candidate: e.candidate, target: viewerId }));
            }
        };

        // 创建 offer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        ws.send(JSON.stringify({ type: "offer", offer, target: viewerId }));
    }

    startBtn.onclick = async () => {
        localStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        localVideo.srcObject = localStream;
        startBtn.style.display = "none"; // 隐藏按钮
    };

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
                ws.send(JSON.stringify({ type: "candidate", candidate: e.candidate }));
            }
        };

        return viewerPC;
    }
}
