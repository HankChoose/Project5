// sharescreen.js
export async function initShareScreen(roomName) {
    const localVideo = document.getElementById("localVideo");
    const remoteVideosContainer = document.getElementById("remoteVideos");
    const startBtn = document.getElementById("startBtn");

    const wsScheme = window.location.protocol === "https:" ? "wss" : "ws";
    const wsUrl = `${wsScheme}://${window.location.host}/ws/sharescreen/${roomName}/`;
    const socket = new WebSocket(wsUrl);

    let localStream;
    const peers = {}; // key = peer_id, value = RTCPeerConnection

    // 获取本地屏幕流
    async function startLocalScreen() {
        localStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        localVideo.srcObject = localStream;
    }

    startBtn.onclick = startLocalScreen;

    // WebSocket 接收消息
    socket.onmessage = async (event) => {
        const data = JSON.parse(event.data);

        if (data.type === "new-peer") {
            const peerId = data.peer_id;
            if (peerId === socket.id) return;

            const pc = new RTCPeerConnection();
            peers[peerId] = pc;

            // 把本地流添加到 PeerConnection
            if (localStream) {
                localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
            }

            // 创建远端视频标签
            const video = document.createElement("video");
            video.autoplay = true;
            video.id = `remote_${peerId}`;
            video.style = "width:300px;border:1px solid #333;margin:5px;";
            remoteVideosContainer.appendChild(video);

            pc.ontrack = (e) => {
                video.srcObject = e.streams[0];
            };

            // ICE candidate 处理
            pc.onicecandidate = (e) => {
                if (e.candidate) {
                    socket.send(JSON.stringify({
                        type: "ice-candidate",
                        target: peerId,
                        candidate: e.candidate
                    }));
                }
            };

            // 创建 offer
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            socket.send(JSON.stringify({
                type: "offer",
                target: peerId,
                sdp: offer
            }));

        } else if (data.type === "offer") {
            const peerId = data.sender;
            const pc = new RTCPeerConnection();
            peers[peerId] = pc;

            // 本地流
            if (localStream) {
                localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
            }

            // 创建远端视频标签
            const video = document.createElement("video");
            video.autoplay = true;
            video.id = `remote_${peerId}`;
            video.style = "width:300px;border:1px solid #333;margin:5px;";
            remoteVideosContainer.appendChild(video);

            pc.ontrack = (e) => {
                video.srcObject = e.streams[0];
            };

            pc.onicecandidate = (e) => {
                if (e.candidate) {
                    socket.send(JSON.stringify({
                        type: "ice-candidate",
                        target: peerId,
                        candidate: e.candidate
                    }));
                }
            };

            await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            socket.send(JSON.stringify({
                type: "answer",
                target: peerId,
                sdp: answer
            }));

        } else if (data.type === "answer") {
            const pc = peers[data.sender];
            await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));

        } else if (data.type === "ice-candidate") {
            const pc = peers[data.sender];
            if (pc) {
                try {
                    await pc.addIceCandidate(data.candidate);
                } catch (err) {
                    console.error("ICE candidate error:", err);
                }
            }
        }
    };

    socket.onopen = () => {
        console.log("WebSocket connected");
    };
}
