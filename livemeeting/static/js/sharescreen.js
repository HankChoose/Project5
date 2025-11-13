// sharescreen.js (完整，多 viewer 支持)
// 说明：与后台 Channels 当前的 signal_message 协议兼容。
// 建议：后端稍微改动一行（见下方后端改动）以便把 sender 也回传到客户端，方便 owner 识别来源。

const ws_scheme = window.location.protocol === "https:" ? "wss" : "ws";
const ws = new WebSocket(`${ws_scheme}://${window.location.host}/ws/sharescreen/${ROOM_NAME}/`);

let isOwner = false;
let localStream = null;

// Owner: 为每个 viewer 保存独立的 RTCPeerConnection
// key = viewer_channel_name (viewer id), value = RTCPeerConnection
const pcs = {};

// Viewer: 单一 pc，用于接收 owner 的流
let viewerPc = null;

console.log("🔌 Connecting WebSocket to room:", ROOM_NAME);

ws.onopen = () => console.log("🟢 WebSocket connected");
ws.onclose = () => console.log("🔴 WebSocket disconnected - you may need to reload or rejoin the room");
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

    // type: role / owner_left / new_viewer_joined / offer / answer / candidate
    const t = data.type;

    // 如果后端随 message 一并发了 sender（推荐），把它保存在 data._sender
    // 说明：后端应该把 sender 加入到 message 字段里，或者在外层 event 里保持 sender 字段。
    const sender = data.sender || data._sender || null;

    if (t === "role") {
        isOwner = data.role === "owner";
        console.log("✅ 你的身份:", data.role);
        if (isOwner) {
            await setupOwner();
            // 显示 start 按钮
            const shareBtn = document.getElementById("startBtn");
            if (shareBtn) shareBtn.style.display = "block";
        } else {
            setupViewer();
        }
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
        }
        return;
    }

    if (t === "new_viewer_joined" && isOwner) {
        // data.viewer_id 应该包含 viewer 的 channel_name
        const viewerId = data.viewer_id;
        console.log("👥 新观众加入:", viewerId);
        // owner 为该 viewer 创建并发送 offer
        await createOfferForViewer(viewerId);
        return;
    }

    if (t === "offer") {
        // 收到 offer -> 只有 viewer 会收到 owner 的 offer（owner 不应接收其它人的 offer）
        if (!isOwner) {
            console.log("📥 收到 offer（来自 owner）");
            await handleViewerReceiveOffer(data.offer, sender, data);
        } else {
            console.warn("Owner 不应收到 offer（忽略）");
        }
        return;
    }

    if (t === "answer") {
        // owner 收到 viewer 的 answer；需要把 answer 设置为对应 viewer 的 remote desc
        if (isOwner) {
            // 尝试从 data 或 sender 里找 viewerId
            const viewerId = data.viewer_id || sender || data.from || data._from;
            if (!viewerId) {
                console.warn("无法识别 answer 的来源，没有 viewerId（建议后端在 message 里附带 sender）", data);
                return;
            }
            const pc = pcs[viewerId];
            if (!pc) {
                console.warn("找不到对应 viewer 的 pc:", viewerId);
                return;
            }
            console.log("📥 收到 answer 来自:", viewerId);
            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        } else {
            console.warn("Viewer 不应收到 answer（忽略）");
        }
        return;
    }

    if (t === "candidate") {
        // ICE candidate：可能来自 owner 或 viewer
        // 如果我们是 owner，则 candidate 应该来自 viewer（需要放到对应 pc）
        // 如果我们是 viewer，则 candidate 应该来自 owner（放到 viewerPc）
        if (isOwner) {
            const viewerId = data.viewer_id || sender || data.from || data._from;
            if (!viewerId) {
                console.warn("Owner 收到 candidate 但无法识别来源 viewerId", data);
                return;
            }
            const pc = pcs[viewerId];
            if (!pc) {
                console.warn("Owner 收到 candidate，但对应 pc 不存在（viewer 可能还没完全建立） - 保存或忽略", viewerId);
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
                console.warn("Viewer 收到 candidate，但本地 viewerPc 不存在，忽略或稍后重试");
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

    console.log("未处理的消息类型:", t);
};


// -------------------- Owner flow --------------------

async function setupOwner() {
    console.log("🔧 初始化 owner 环境");
    // 获取屏幕流（不自动调用，点击 Start 时也会二次获取以支持用户主动授权）
    try {
        localStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        console.log("🎥 本地屏幕流已获取 (初始)");
        const localVideo = document.getElementById("localVideo");
        if (localVideo) localVideo.srcObject = localStream;
    } catch (err) {
        console.warn("⚠️ 初始获取屏幕流失败（可能因用户未授权），需点击 Start 触发授权", err);
    }

    // startBtn 事件：在需要时（用户点击）真正开始并向已有 viewer 发 offer
    const shareBtn = document.getElementById("startBtn");
    if (shareBtn) {
        shareBtn.addEventListener("click", async () => {
            try {
                if (!localStream) {
                    localStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
                    const localVideo = document.getElementById("localVideo");
                    if (localVideo) localVideo.srcObject = localStream;
                }
                // 对当前已知的每个 viewer 发起 offer（如果有）
                for (const viewerId of Object.keys(pcs)) {
                    // 如果 pc 已存在并且已经加入 tracks，则跳过
                    if (pcs[viewerId] && pcs[viewerId].signalingState !== "closed") {
                        console.log("跳过已有 pc:", viewerId);
                        continue;
                    }
                    await createOfferForViewer(viewerId);
                }
                // 若还没有 viewer，我们也可以等待 new_viewer_joined 事件来触发单独的 offer
                console.log("📤 Start Sharing: Offers will be created for new viewers on join.");
            } catch (err) {
                console.error("❌ Start sharing 失败:", err);
            }
        });
    }
}

// 为指定 viewer 创建 pc 并发送 offer（owner -> viewer）
async function createOfferForViewer(viewerId) {
    if (!localStream) {
        console.warn("没有本地流(localStream)，无法为 viewer 创建 offer:", viewerId);
        return;
    }
    console.log("✨ 为 viewer 创建新的 RTCPeerConnection:", viewerId);

    // 如果已有旧 pc，先清理
    if (pcs[viewerId]) {
        try { pcs[viewerId].close(); } catch (e) {}
        delete pcs[viewerId];
    }

    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            // 把 candidate 发送到后端，后端再路由到目标 viewer
            ws.send(JSON.stringify({
                type: "candidate",
                candidate: event.candidate,
                target: viewerId,
                // owner 可以额外带上自己的标识（可选）
            }));
        }
    };

    pc.onconnectionstatechange = () => {
        console.log(`[owner -> ${viewerId}] connectionState:`, pc.connectionState);
        if (pc.connectionState === "failed" || pc.connectionState === "closed" || pc.connectionState === "disconnected") {
            // 清理
            try { pc.close(); } catch (e) {}
            delete pcs[viewerId];
            console.log(`[owner] 已移除 pc: ${viewerId}`);
        }
    };

    // 将 localStream 的 tracks 加入到 pc（这样 owner 将屏幕流发给 viewer）
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    pcs[viewerId] = pc;

    // createOffer -> setLocalDescription -> send offer 指定 target
    try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        ws.send(JSON.stringify({
            type: "offer",
            offer: offer,
            target: viewerId,
            // 可以把 owner 自己的 id 放到 message 里，便于 viewer 识别（可选）
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
    // viewerPc 在收到 offer 时实际创建（延迟创建），但也可以先创建以便更早接收 candidate
    viewerPc = createViewerPeerConnection(remoteVideo);
}

function createViewerPeerConnection(remoteVideoEl) {
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            // viewer 的 candidate 发回到后端（后端会把 sender 标注并转发给 owner）
            ws.send(JSON.stringify({
                type: "candidate",
                candidate: event.candidate,
                // 不指定 target -> 后端会 group_send（owner 将收到并且可以通过 sender 字段知道来源）
            }));
        }
    };

    pc.ontrack = (event) => {
        console.log("🎥 viewer 收到远端流");
        if (remoteVideoEl) remoteVideoEl.srcObject = event.streams[0];
    };

    pc.onconnectionstatechange = () => {
        console.log("[viewer] connectionState:", pc.connectionState);
        if (pc.connectionState === "failed" || pc.connectionState === "closed") {
            try { pc.close(); } catch (e) {}
            viewerPc = null;
        }
    };

    return pc;
}

async function handleViewerReceiveOffer(offer, sender, rawData = {}) {
    // sender 这里通常是 owner 的 channel_name（但如果后端没发 sender，我们仍能工作，因为 viewer 不需要 target 来回复 answer）
    console.log("handleViewerReceiveOffer sender:", sender, "rawData:", rawData);

    if (!viewerPc) {
        const remoteVideo = document.getElementById("remoteVideo");
        viewerPc = createViewerPeerConnection(remoteVideo);
    }

    try {
        await viewerPc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await viewerPc.createAnswer();
        await viewerPc.setLocalDescription(answer);

        // 发送 answer：不带 target（后端会 group_send 给房间并带上 sender，这样 owner 能收到）
        ws.send(JSON.stringify({
            type: "answer",
            answer: answer,
            // 你也可以把 viewerId 明确发给后端（如果你能拿到 viewerId）：
            // viewer_id: SOMETHING
        }));
        console.log("📤 viewer 已发送 answer 给 owner");
    } catch (err) {
        console.error("处理 offer 失败:", err);
    }
}


// -------------------- 公共辅助 --------------------

// 在 window 卸载或关闭时清理连接与媒体
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
