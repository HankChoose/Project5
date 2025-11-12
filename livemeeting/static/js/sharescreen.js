let localStream;
let pc;
let ws;

export function initShareScreen(roomName) {
    const startBtn = document.getElementById("startBtn");
    const localVideo = document.getElementById("localVideo");
    const remoteVideo = document.getElementById("remoteVideo");

    ws = new WebSocket(`wss://${window.location.host}/ws/sharescreen/${roomName}/`);

    ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "offer") {
            await pc.setRemoteDescription(new RTCSessionDescription(data));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            ws.send(JSON.stringify(pc.localDescription));
        } else if (data.type === "answer") {
            await pc.setRemoteDescription(new RTCSessionDescription(data));
        } else if (data.type === "candidate") {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
    };

    startBtn.onclick = async () => {
        localStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        localVideo.srcObject = localStream;

        pc = new RTCPeerConnection();

        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

        pc.ontrack = (event) => {
            remoteVideo.srcObject = event.streams[0];
        };

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                ws.send(JSON.stringify({ type: "candidate", candidate: event.candidate }));
            }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        ws.send(JSON.stringify(offer));
    };
}
