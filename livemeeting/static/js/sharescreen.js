const peers = {}; // 保存每个远端 peer

export function initShareScreen(roomName) {
    const localVideo = document.getElementById("localVideo");
    const remoteVideo = document.getElementById("remoteVideo");

    const ws = new WebSocket(
        `wss://${window.location.host}/ws/sharescreen/${roomName}/`
    );

    let localStream = null;

    document.getElementById("startBtn").onclick = async () => {
        localStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        localVideo.srcObject = localStream;

        ws.send(JSON.stringify({ type: "new-peer" }));
    };

    ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);

        const peerId = data.peer_id || "peer";
        if (!peers[peerId]) {
            peers[peerId] = new RTCPeerConnection();

            // 接收远端 track
            peers[peerId].ontrack = (e) => {
                remoteVideo.srcObject = e.streams[0];
            };

            // 添加本地流到 peer
            if (localStream) {
                localStream.getTracks().forEach(track => {
                    peers[peerId].addTrack(track, localStream);
                });
            }

            // ICE candidates
            peers[peerId].onicecandidate = (e) => {
                if (e.candidate) {
                    ws.send(JSON.stringify({
                        type: "ice-candidate",
                        candidate: e.candidate,
                        peer_id: peerId
                    }));
                }
            };
        }

        if (data.type === "offer") {
            await peers[peerId].setRemoteDescription(data.sdp);
            const answer = await peers[peerId].createAnswer();
            await peers[peerId].setLocalDescription(answer);
            ws.send(JSON.stringify({
                type: "answer",
                sdp: peers[peerId].localDescription,
                peer_id: peerId
            }));
        } else if (data.type === "answer") {
            await peers[peerId].setRemoteDescription(data.sdp);
        } else if (data.type === "ice-candidate") {
            await peers[peerId].addIceCandidate(data.candidate);
        } else if (data.type === "new-peer") {
            // 创建 offer 给新用户
            const offer = await peers[peerId].createOffer();
            await peers[peerId].setLocalDescription(offer);
            ws.send(JSON.stringify({
                type: "offer",
                sdp: peers[peerId].localDescription,
                peer_id: peerId
            }));
        }
    };
}
