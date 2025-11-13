// sharescreen.js
// 依赖: 模板里需要定义全局常量 ROOM_NAME（字符串）
// <script>const ROOM_NAME = "{{ room_name }}";</script>
// <script type="module" src="{% static 'js/sharescreen.js' %}"></script>

const ws_scheme = window.location.protocol === "https:" ? "wss" : "ws";
const ws_url = `${ws_scheme}://${window.location.host}/ws/sharescreen/${ROOM_NAME}/`;
let ws;

// RTCPeerConnection 对象
let pc = null; // viewer 的 pc（viewer 用）
const viewersPC = {}; // owner 为每个 viewer 创建的 pc，key = viewer_channel_name
let localStream = null;
let isOwner = false;

console.log("🔌 Connecting WebSocket to room:", ROOM_NAME);

// 初始化并连接 WebSocket
function connectWS() {
    ws = new WebSocket(ws_url);

    ws.onopen = () => console.log("🟢 WebSocket connected");
    ws.onclose = () => console.log("🔴 WebSocket disconnected");
    ws.onerror = (e) => console.error("❌ WebSocket error", e);

    ws.onmessage = async (evt) => {
        let data;
        try {
            data = JSON.parse(evt.data);
        } catch (e) {
            console.warn("非 JSON 消息:", evt.data);
            return;
        }
        console.log("📩 收到 WebSocket 消息:", data);

        // 角色分配
        if (data.type === "role") {
            isOwner = data.role === "owner";
            console.log("✅ 你的身份:", data.role);

            // 清理旧连接，重新创建
            cleanupConnections();
            if (isOwner) {
                await setupOwner();   // owner immediately prepare to share (but not auto-share)
                // 显示按钮
                const b = document.getElementById("startBtn");
                if (b) b.style.display = "block";
            } else {
                setupViewer();
                const b = document.getElementById("startBtn");
                if (b) b.style.display = "none";
            }
            return;
        }

        // owner 离开事件
        if (data.type === "owner_left") {
            alert("📴 主播已离开，屏幕共享结束");
            const rv = document.getElementById("remoteVideo");
            if (rv) rv.srcObject = null;
            // 清理 viewer 端 pc
            cleanupConnections();
            return;
        }

        // new viewer joined (owner 收到)
        if (data.type === "new_viewer_joined" && isOwner) {
            console.log("👋 新 viewer 加入:", data.viewer_id);
            // 给新 viewer 单独发 offer
            sendOfferToViewer(data.viewer_id).catch(console.error);
            return;
        }

        // 信令消息：offer/answer/candidate
        if (data.type === "offer" && !isOwner) {
            // viewer 收到 owner 发来的 offer
            console.log("📩 viewer 收到 offer 来自:", data.sender);
            // 创建 viewer 的 pc（如果还没有）
            if (!pc) setupViewer();
            try {
                await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                // 回送 answer 给 owner（把 target 写成 data.sender）
                ws.send(JSON.stringify({ type: "answer", answer: answer, target: data.sender }));
                console.log("📤 已发送 answer 给 owner:", data.sender);
            } catch (err) {
                console.error("❌ viewer 处理 offer 失败:", err);
            }
            return;
        }

        if (data.type === "answer" && isOwner) {
            // owner 收到 viewer 的 answer
            console.log("📩 owner 收到 answer 来自:", data.sender);
            const viewerId = data.sender;
            const vpc = viewersPC[viewerId];
            if (vpc) {
                try {
                    await vpc.setRemoteDescription(new RTCSessionDescription(data.answer));
                    console.log("✅ owner 为 viewer 设置了 remote answer:", viewerId);
                } catch (err) {
                    console.error("❌ owner setRemoteDescription(answer) 失败:", err);
                }
            } else {
                console.warn("找不到对应 viewer 的 PC:", viewerId);
            }
            return;
        }

        if (data.type === "candidate") {
            // candidate 可以来自 viewer 或 owner
            const sender = data.sender;
            if (isOwner) {
                // owner 接收 viewer 发来的 candidate -> 添加到对应 viewersPC[sender]
                const vpc = viewersPC[sender];
                if (vpc) {
                    try {
                        await vpc.addIceCandidate(new RTCIceCandidate(data.candidate));
                        console.log("📩 owner 添加 candidate 来自 viewer:", sender);
                    } catch (err) {
                        console.error("❌ owner 添加 candidate 失败:", err);
                    }
                } else {
                    console.warn("owner 没有对应 pc (viewer):", sender);
                }
            } else {
                // viewer 接收 owner 的 candidate -> 添加到 viewer 的 pc
                if (pc) {
                    try {
                        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                        console.log("📩 viewer 添加 candidate 来自 owner");
                    } catch (err) {
                        console.error("❌ viewer 添加 candidate 失败:", err);
                    }
                } else {
                    console.warn("viewer 尚未创建 pc，但收到 candidate");
                }
            }
            return;
        }

        // 其他情况直接输出
        console.log("未处理消息:", data);
    };
}

// Owner: 为每个 viewer 创建独立 PC 并发送 offer
async function sendOfferToViewer(viewerId) {
    if (!localStream) {
        console.warn("本地流不存在，无法给 viewer 发送 offer");
        return;
    }

    // 先清理（若已有旧连接）
    if (viewersPC[viewerId]) {
        try { viewersPC[viewerId].close(); } catch (e) {}
        delete viewersPC[viewerId];
    }

    const vpc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    viewersPC[viewerId] = vpc;

    // 把本地屏幕流添加到 vpc
    localStream.getTracks().forEach(track => vpc.addTrack(track, localStream));

    vpc.ontrack = (e) => {
        console.log("（owner side）unexpected ontrack for vpc (viewer should not send tracks)");
    };

    vpc.onicecandidate = (e) => {
        if (e.candidate) {
            // 发送 candidate 给指定 viewer
            ws.send(JSON.stringify({
                type: "candidate",
                candidate: e.candidate,
                target: viewerId
            }));
            console.log("📤 已发送 ICE candidate 给 viewer:", viewerId);
        }
    };

    vpc.onconnectionstatechange = () => {
        console.log("🔄 owner->viewer connection state:", vpc.connectionState, "viewer:", viewerId);
        if (vpc.connectionState === "failed" || vpc.connectionState === "closed") {
            try { vpc.close(); } catch (e) {}
            delete viewersPC[viewerId];
        }
    };

    // 创建 offer
    try {
        const offer = await vpc.createOffer();
        await vpc.setLocalDescription(offer);

        // 把 offer 发给后端，后端会把它转发给对应 viewer（并带上 sender）
        ws.send(JSON.stringify({ type: "offer", offer: offer, target: viewerId }));
        console.log("📤 已发送 offer 给 viewer:", viewerId);
    } catch (err) {
        console.error("❌ owner 发送 offer 失败:", err);
    }
}

// viewer: 创建 pc 并设置接收流
function setupViewer() {
    // 清理旧 pc
    if (pc) {
        try { pc.close(); } catch (e) {}
        pc = null;
    }

    pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });

    pc.ontrack = (event) => {
        console.log("🎥 viewer 收到远程流");
        const rv = document.getElementById("remoteVideo");
        if (rv) rv.srcObject = event.streams[0];
    };

    pc.onicecandidate = (e) => {
        if (e.candidate) {
            // 发送 candidate 给 owner（target 默认为不写，后端 group_send 会广播，包含 sender）
            ws.send(JSON.stringify({ type: "candidate", candidate: e.candidate }));
            console.log("📤 viewer 发送 candidate 给 owner");
        }
    };

    pc.onconnectionstatechange = () => {
        console.log("🔄 viewer connection state:", pc.connectionState);
    };
}

// owner: 预备本地流（但不自动发送给所有——我们在 new_viewer_joined 时单独为 viewer 创建 offer）
async function setupOwner() {
    // 清理旧 viewerPC（通常在切换身份时调用）
    Object.keys(viewersPC).forEach(k => {
        try { viewersPC[k].close(); } catch (e) {}
        delete viewersPC[k];
    });

    try {
        localStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        const lv = document.getElementById("localVideo");
        if (lv) lv.srcObject = localStream;
        console.log("🎥 本地屏幕流已获取（owner）");
    } catch (err) {
        console.error("❌ 获取屏幕流失败:", err);
    }
}

// 清理函数（关闭 pc、停止 tracks、关闭 ws）
function cleanupConnections() {
    try {
        if (pc) { pc.ontrack = null; pc.onicecandidate = null; pc.close(); pc = null; }
    } catch (e) {}
    try {
        Object.keys(viewersPC).forEach(k => {
            try { viewersPC[k].onicecandidate = null; viewersPC[k].close(); } catch (e) {}
            delete viewersPC[k];
        });
    } catch (e) {}

    try {
        if (localStream) {
            localStream.getTracks().forEach(t => t.stop());
            localStream = null;
        }
    } catch (e) {}

    // 关闭 ws（不要反复创建）
    try {
        if (ws && ws.readyState === WebSocket.OPEN) ws.close();
    } catch (e) {}

    console.log("🧹 cleanup: 已关闭 pc/localStream/ws");
}

// 页面关闭/刷新时强制清理
window.addEventListener("beforeunload", () => {
    cleanupConnections();
});

// 页面内 Start 按钮绑定（只给 owner 显示）
document.addEventListener("DOMContentLoaded", () => {
    const startBtn = document.getElementById("startBtn");
    if (startBtn) {
        startBtn.onclick = async () => {
            if (!isOwner) return alert("你不是共享者");
            // owner 手动开始：获取本地屏幕并为已存在的 viewers 逐一创建 offer
            try {
                if (!localStream) {
                    localStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
                    const lv = document.getElementById("localVideo");
                    if (lv) lv.srcObject = localStream;
                }
                // 给当前已在房间的 viewer 发送 offer（rooms 变化由后端 new_viewer_joined 通知 owner）
                // 也可在这里遍历已知 viewers（如果有后端接口暴露），但我们依赖后端通知 new_viewer_joined
                console.log("🎥 owner 点击开始共享，本地屏幕流准备好了");
            } catch (err) {
                console.error("❌ owner 获取屏幕失败:", err);
            }
        };
    }
});

// 启动 WebSocket 连接
connectWS();
