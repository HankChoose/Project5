// static/js/sharescreen/sharescreen.js

const ws_scheme = window.location.protocol === "https:" ? "wss" : "ws";
const ws = new WebSocket(`${ws_scheme}://${window.location.host}/ws/sharescreen/${ROOM_NAME}/`);

let pc = null;
let localStream = null;
let isOwner = false;

console.log("🔌 Connecting WebSocket to room:", ROOM_NAME);

ws.onopen = () => console.log("🟢 WebSocket connected");
ws.onclose = () => console.log("🔴 WebSocket disconnected");

ws.onmessage = async (event) => {
    const data = JSON.parse(event.data);
    console.log("📩 Received WebSocket message:", data);

    if (data.type === "role") {
        console.log("✅ Your role:", data.role);
        isOwner = data.role === "owner";
        if (isOwner) setupOwner();
        else setupViewer();
    }
    // === Control UI display ===
    document.getElementById("ownerVideoContainer").style.display = isOwner ? "block" : "none";
    document.getElementById("viewerVideoContainer").style.display = isOwner ? "none" : "block";
    
    // === viewer auto fullscreen ===
    if (!isOwner) {
        const remoteVideo = document.getElementById("remoteVideo");
        // Delayed attempt to fullscreen
        /*
        setTimeout(() => {
            if (remoteVideo.requestFullscreen) {
                remoteVideo.requestFullscreen().catch(err => console.warn("Fullscreen failed:", err));
            }
        }, 1500);
        */
    }

    if (!isOwner && data.type === "answer") {
        const remoteVideo = document.getElementById("remoteVideo");
        if (remoteVideo.srcObject) {
            remoteVideo.play().catch(err => console.warn("Play after answer failed:", err));
        }
}


    if (data.type === "owner_left") {
        alert("📴 The host has left, screen sharing ended");
        document.getElementById("remoteVideo").srcObject = null;
    }

    if (data.type === "offer" && !isOwner) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        ws.send(JSON.stringify({ type: "answer", answer: answer }));
        console.log("📤 Answer sent:", answer);
    }

    if (data.type === "answer" && isOwner) {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
    }

    if (data.type === "candidate" && pc) {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    }

    if (data.type === "new_viewer_joined" && isOwner) {
        sendOfferToViewer(data.viewer_id);
    }
};

// ================= Clear old connections ==================
window.addEventListener("beforeunload", () => {
    console.log("🧹 Page unloading, cleaning up connections");
    try {
        if (pc) {
            pc.close();
            pc = null;
        }
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
        }
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.close(1000, "Page closed");
        }
    } catch (err) {
        console.warn("Cleanup failed:", err);
    }
});
// =========================================================

async function setupOwner() {
    // Recreate a clean peer each time on refresh or reconnect
    if (pc) { try { pc.close(); } catch (e) {} }
    pc = createPeerConnection();

    try {
        localStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        const localVideo = document.getElementById("localVideo");
        localVideo.srcObject = localStream;
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
        console.log("🎥 Local screen stream acquired");
    } catch (err) {
        console.error("❌ Failed to get screen stream:", err);
    }
}

function setupViewer() {
    if (pc) { try { pc.close(); } catch(e) {} }
    pc = createPeerConnection();
    
    const remoteVideo = document.getElementById("remoteVideo");
    remoteVideo.srcObject = null;       // Clear old stream
    remoteVideo.autoplay = true;
    remoteVideo.playsInline = true;
    remoteVideo.muted = true;           // Must be muted to autoplay

    pc.ontrack = (event) => {
        console.log("🎥 Remote stream received");
        remoteVideo.srcObject = event.streams[0];

        // Attempt to play
        remoteVideo.onloadedmetadata = () => {
            remoteVideo.play().catch(err => console.warn("Muted autoplay failed:", err));
        };
    };
}


function createPeerConnection() {
    const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            ws.send(JSON.stringify({ type: "candidate", candidate: event.candidate }));
        }
    };

    pc.onconnectionstatechange = () => {
        console.log("🔄 Connection state changed:", pc.connectionState);
        if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
            console.log("⚠️ Connection closed or failed, cleaning up");
            try { pc.close(); } catch (e) {}
        }
    };

    return pc;
}

async function sendOfferToViewer(viewerId) {
    if (!pc || !localStream) return;
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    ws.send(JSON.stringify({ type: "offer", offer: offer, target: viewerId }));
    console.log("📤 Offer sent to viewer:", viewerId);
}

// Page button events
document.addEventListener("DOMContentLoaded", () => {
    const shareBtn = document.getElementById("startBtn");
    if (shareBtn) {
        shareBtn.style.display = isOwner ? "block" : "none";
        shareBtn.addEventListener("click", async () => {
            if (!isOwner) return alert("You are not the sharer");
            try {
                localStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
                document.getElementById("localVideo").srcObject = localStream;
                localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                ws.send(JSON.stringify({ type: "offer", offer: offer }));
                console.log("📤 Offer sent to all viewers:", offer);
            } catch (err) {
                console.error("❌ Screen sharing failed:", err);
            }
        });
    }
});
