const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const startBtn = document.getElementById("startBtn");

const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
const socket = new WebSocket(`${wsProtocol}://${window.location.host}/ws/sharescreen/${ROOM_NAME}/`);

let peerConnection;
let isHost = false;  // 用于区分角色

const rtcConfig = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
};

socket.onopen = () => console.log("✅ WebSocket connected");

socket.onmessage = async (e) => {
  const data = JSON.parse(e.data);

  if (data.type === "host-exists") {
    // 房间已有主持人
    isHost = false;
    console.log("🎥 你是 Viewer");
  }

  if (data.type === "you-are-host") {
    isHost = true;
    startBtn.style.display = "inline-block";
    console.log("🎬 你是 Host，可以共享屏幕");
  }

  if (data.type === "offer" && !isHost) {
    peerConnection = createPeerConnection();
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    socket.send(JSON.stringify({ type: "answer", answer }));
  }

  if (data.type === "answer" && isHost) {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
  }

  if (data.type === "candidate") {
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (err) {
      console.error("Error adding ICE candidate:", err);
    }
  }
};

function createPeerConnection() {
  const pc = new RTCPeerConnection(rtcConfig);
  pc.onicecandidate = (e) => {
    if (e.candidate) {
      socket.send(JSON.stringify({ type: "candidate", candidate: e.candidate }));
    }
  };
  pc.ontrack = (e) => {
    console.log("🎞 Received remote stream");
    remoteVideo.srcObject = e.streams[0];
  };
  return pc;
}

startBtn.onclick = async () => {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { cursor: "always" },
      audio: false
    });

    localVideo.srcObject = stream;

    peerConnection = createPeerConnection();
    stream.getTracks().forEach((t) => peerConnection.addTrack(t, stream));

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.send(JSON.stringify({ type: "offer", offer }));

    startBtn.disabled = true;
  } catch (err) {
    alert("无法共享屏幕: " + err.message);
  }
};
