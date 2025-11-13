// sharescreen.js
// 支持：
// - owner 为每个 viewer 创建独立 RTCPeerConnection (pcs[viewerId])
// - viewer 使用单一 peer 接收流
// - 处理 host-exists、role、new_viewer_joined、offer、answer、candidate、owner_left 等消息
// - 发送 candidate/offer/answer 时可带 target（后端将 target 路由到对应 channel_name）
// 说明：后端最好在转发消息时把 sender（channel_name）注入到 message 中，前端会使用 data.sender 识别来源。

const ws_scheme = window.location.protocol === "https:" ? "wss" : "ws";
const ws = new WebSocket(`${ws_scheme}://${window.location.host}/ws/sharescreen/${ROOM_NAME}/`);

let isOwner = false;
let localStream = null;

// owner: 多个 pc，key 为 viewer channel_name（viewerId）
// viewer: 单一 viewerPc
const pcs = {};
let viewerPc = null;

console.log("🔌 Connecting WebSocket to room:", ROOM_NAME);

ws.onopen = () => console.log("🟢 WebSocket connected");
ws.onclose = (e) => console.log("🔴 WebSocket disconnected", e);
ws.onerror = (e) => console.error("⚠️ WebSocket error", e);

ws.onmessage = async (event) => {
    let data;
    try {
        data = JSON.parse(event.data);
    } catch (err) {
        console.warn("非 JSON 消息:", event.data);
        return;
    }
    console.log("📩 收到 WebSocket 消息:", data);

    const t = data.type;
    const sender = data.sender || data._sender || null; // 推荐后端把 sender 注入 message

    // 处理常见类型
    if (t === "role") {
        isOwner = data.role === "owner";
        console.log("✅ 你的身份:", data.role);
        if (isOwner) {
            await setupOwner();
            const shareBtn = document.getElementById("startBtn");
            if (shareBtn) shareBtn.style.display = "block";
        } else {
            setupViewer();
        }
        return;
    }

    if (t === "host-exists") {
        // 后端表示房间已有 host（进入者不能再成为 host）
        // 提示并将页面切换到 viewer 模式或提示用户
        alert("⚠️ 房间已有主持人（host），你将作为观众加入。");
        // 如果你希望自动切换到 viewer 页面或更新 UI，可在此处理
        return;
    }

    if (t === "owner_left") {
        alert("📴 主播已离开，屏幕共享结束");
        const remote = document.getElementById("remoteVideo");
        if (remote) remote.srcObject = null;
        // 清理 viewer 状态
        if (!isOwner) {
            if (viewerPc) {
                viewerPc.close();
                viewerPc = null;
            }
        } else {
            // owner 被告知 owner_left 一般不会发生，但可清理
            for (const k of Object.keys(pcs)) {
                pcs[k].close();
                delete pcs[k];
            }
            if (localStream) {
                localStream.getTracks().forEach(t => t.stop());
                localStream = null;
            }
        }
        return;
    }

    if (t === "new_viewer_joined" && isOwner) {
        const viewerId = data.viewer_id || sender;
        console.log("👥 新观众加入:", viewerId);
        if (viewerId) await createOfferForViewer(viewerId);
        return;
    }

    if (t === "offer") {
        // viewer 收到 owner 的 offer
        if (!isOwner) {
            console.log("📥 viewer 收到 offer");
            await handleViewerReceiveOffer(data.offer, sender, data);
        } else {
            console.warn("Owner 不应收到 offer（忽略）");
        }
        return;
    }

    if (t === "answer") {
        // owner 收到 viewer 的 answer
        if (isOwner) {
            const viewerId = data.viewer_id || sender || data.from || data._from;
            if (!viewerId) {
                console.warn("无法识别 answer 来源（缺 viewerId/sender）", data);
                return;
            }
            const pc = pcs[viewerId];
            if (!pc) {
                console.warn("找不到对应 viewer pc:", viewerId);
                return;
            }
            console.log("📥 owner 收到 answer 来自:", viewerId);
            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        } else {
            console.warn("Viewer 不应收到 answer（忽略）");
        }
        return;
    }

    if (t === "candidate") {
        // ICE candidate：按身份分别处理
        if (isOwner) {
            const viewerId = data.viewer_id || sender || data.from || data._from;
            if (!viewerId) {
                console.warn("Owner 收到 candidate 但无法识别 viewerId", data);
                return;
            }
            const pc = pcs[viewerId];
            if (!pc) {
                console.warn("Owner 收到 candidate，但对应 pc 不存在（viewer 可能还没建立），保存或忽略", viewerId);
                return;
            }
            try {
                await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                console.log(`🧩 已为 viewer ${viewerId} 添加 candidate`);
            } catch (e) {
                console.error("添加 candidate 失败:", e, data);
            }
        } else {
            // viewer
            if (!viewerPc) {
                console.warn("Viewer 收到 candidate，但 viewerPc 不存在，忽略或稍后重试");
                return;
            }
            try {
                await viewerPc.addIceCandidate(new RTCIceCandidate(data.candidate));
                console.log("🧩 viewer 已添加来自 owner 的 candidate");
            } catch (e) {
                console.error("Viewer 添加 candidate 失败:", e);
            }
        }
        return;
    }

    console.warn("未处理的消息类型:", t);
};


// -------------------- Owner flow --------------------

async function setupOwner() {
    console.log("🔧 初始化 owner 环境");
    // 尝试提前获取屏幕媒体（用户可能需要在点击时授权）
    try {
        localStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        console.log("🎥 本地屏幕流已获取 (初始)");
        const localVideo = document.getElementById("localVideo");
        if (localVideo) localVideo.srcObject = localStream;
    } catch (err) {
        console.warn("⚠️ 初始获取屏幕流失败（需用户点击 Start 触发授权）", err);
    }

    const shareBtn = document.getElementById("startBtn");
    if (shareBtn) {
        shareBtn.style.display = "block";
        shareBtn.addEventListener("click", async () => {
            try {
                if (!localStream) {
                    localStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
                    const localVideo = document.getElementById("localVideo");
                    if (localVideo) localVideo.srcObject = localStream;
                }
                // 对当前已知 viewer（如果有）发起 offer（new viewers 会在 join 时触发 createOfferForViewer）
                for (const viewerId of Object.keys(pcs)) {
                    if (pcs[viewerId] && pcs[viewerId].signalingState !== "closed") continue;
                    await createOfferForViewer(viewerId);
                }
                console.log("📤 Start Sharing: offers created for existing viewers; future viewers will be offered on join.");
            } catch (err) {
                console.error("❌ Start sharing 失败:", err);
            }
        });
    }
}

async function createOfferForViewer(viewerId) {
    if (!localStream) {
        console.warn("没有 localStream，无法为 viewer 创建 offer:", viewerId);
        return;
    }
    console.log("✨ 为 viewer 创建新的 RTCPeerConnection:", viewerId);

    if (pcs[viewerId]) {
        try { pcs[viewerId].close(); } catch (e) {}
        delete pcs[viewerId];
    }

    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            ws.send(JSON.stringify({
                type: "candidate",
                candidate: event.candidate,
                target: viewerId
            }));
        }
    };

    pc.onconnectionstatechange = () => {
        console.log(`[owner -> ${viewerId}] connectionState:`, pc.connectionState);
        if (["failed", "closed", "disconnected"].includes(pc.connectionState)) {
            try { pc.close(); } catch (e) {}
            delete pcs[viewerId];
            console.log(`[owner] 已移除 pc: ${viewerId}`);
        }
    };

    // attach tracks
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    pcs[viewerId] = pc;

    try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        ws.send(JSON.stringify({
            type: "offer",
            offer: offer,
            target: viewerId
        }));

        console.log(`📤 已发送 offer 给 viewer: ${viewerId}`);
    } catch (err) {
        console.error("创建/发送 offer 失败:", err);
    }
}


// -------------------- Viewer flow --------------------

function setupViewer() {
    console.log("🔧 初始化 viewer 环境");
    const remoteVideo = document.getElementById("remoteVideo");
    // viewerPc 会在收到 offer 时创建（也可先创建）
    viewerPc = createViewerPeerConnection(remoteVideo);
}

function createViewerPeerConnection(remoteVideoEl) {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            ws.send(JSON.stringify({
                type: "candidate",
                candidate: event.candidate
                // 不指定 target -> 后端会把消息带上 sender 并转发给 owner
            }));
        }
    };

    pc.ontrack = (event) => {
        console.log("🎥 viewer 收到远端流");
        if (remoteVideoEl) remoteVideoEl.srcObject = event.streams[0];
    };

    pc.onconnectionstatechange = () => {
        console.log("[viewer] connectionState:", pc.connectionState);
        if (["failed", "closed"].includes(pc.connectionState)) {
            try { pc.close(); } catch (e) {}
            viewerPc = null;
        }
    };

    return pc;
}

async function handleViewerReceiveOffer(offer, sender, rawData = {}) {
    console.log("handleViewerReceiveOffer sender:", sender, "rawData:", rawData);

    if (!viewerPc) {
        const remoteVideo = document.getElementById("remoteVideo");
        viewerPc = createViewerPeerConnection(remoteVideo);
    }

    try {
        await viewerPc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await viewerPc.createAnswer();
        await viewerPc.setLocalDescription(answer);

        // 把 answer 发回后端；后端应把 sender（viewer 的 channel_name）一并发给 owner，owner 根据 sender 找到对应 pc
        ws.send(JSON.stringify({
            type: "answer",
            answer: answer
            // optional: viewer_id: SOMETHING
        }));

        console.log("📤 viewer 已发送 answer 给 owner");
    } catch (err) {
        console.error("处理 offer 失败:", err);
    }
}


// -------------------- Cleanup --------------------

window.addEventListener("beforeunload", () => {
    try {
        for (const k of Object.keys(pcs)) {
            pcs[k].close();
            delete pcs[k];
        }
        if (viewerPc) {
            viewerPc.close();
            viewerPc = null;
        }
        if (localStream) {
            localStream.getTracks().forEach(t => t.stop());
            localStream = null;
        }
    } catch (e) { /* ignore */ }
});
