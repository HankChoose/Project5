let localStream;
let pcs = {};  // 存储多个 PeerConnection，key = userId
let ws;

export async function initShareScreen(roomName, userId) {
    // 获取本地屏幕
    localStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    document.getElementById('localVideo').srcObject = localStream;

    // 连接 WebSocket
    ws = new WebSocket(`wss://${window.location.host}/ws/sharescreen/${roomName}/`);

    ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);
        const from = data.user_id;

        if (from === userId) return; // 不处理自己发送的

        // 如果远端用户离开
        if (data.leave) {
            removeRemoteVideo(from);
            if (pcs[from]) {
                pcs[from].close();
                delete pcs[from];
            }
            return;
        }

        if (!pcs[from]) {
            pcs[from] = createPeerConnection(from);
        }

        if (data.sdp) {
            await pcs[from].setRemoteDescription(data.sdp);
            if (data.sdp.type === 'offer') {
                const answer = await pcs[from].createAnswer();
                await pcs[from].setLocalDescription(answer);
                ws.send(JSON.stringify({ user_id: userId, to: from, sdp: pcs[from].localDescription }));
            }
        }

        if (data.ice) {
            try {
                await pcs[from].addIceCandidate(data.ice);
            } catch (err) {
                console.error('ICE candidate error', err);
            }
        }
    };

    ws.onopen = () => {
        console.log('WebSocket connected');
    };

    ws.onclose = () => {
        console.log('WebSocket closed');
        // 通知其他用户离开
        for (const uid in pcs) {
            pcs[uid].close();
        }
    };

    // 创建 PeerConnection
    function createPeerConnection(remoteId) {
        const pc = new RTCPeerConnection();

        // 添加本地流
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

        // 接收远端流
        pc.ontrack = (event) => {
            let remoteVideo = document.getElementById(`remoteVideo_${remoteId}`);
            if (!remoteVideo) {
                remoteVideo = document.createElement('video');
                remoteVideo.id = `remoteVideo_${remoteId}`;
                remoteVideo.autoplay = true;
                remoteVideo.style.width = '300px';
                remoteVideo.style.border = '1px solid #333';
                document.getElementById('remoteVideos').appendChild(remoteVideo);
            }
            remoteVideo.srcObject = event.streams[0];
        };

        // 发送 ICE candidate
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                ws.send(JSON.stringify({ user_id: userId, to: remoteId, ice: event.candidate }));
            }
        };

        return pc;
    }

    function removeRemoteVideo(remoteId) {
        const video = document.getElementById(`remoteVideo_${remoteId}`);
        if (video) {
            video.srcObject = null;
            video.remove();
        }
    }
}
