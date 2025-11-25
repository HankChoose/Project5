document.addEventListener('DOMContentLoaded', () => {
  if (typeof BOARD_ID === "undefined") return;
  checkPermissions();

  // === State Variables ===
  let currentTool = null;
  let tool = 'pen';
  let color = '#000000';
  let lineWidth = 2;
  let drawing = false;
  let panMode = false;
  let scale = 1;
  let offsetX = 0, offsetY = 0;
  const undoStack = [];
  const redoStack = [];
  let currentPath = [];
  let shapeStart = null;

  const permissionCheckInterval = 5000;

  function showPermissionNotice(msg, isGranted){
    let notice = document.getElementById("permissionNotice");
    if(!notice){
        notice = document.createElement("div");
        notice.id = "permissionNotice";
        notice.style.position = "fixed";
        notice.style.top = "10px";
        notice.style.right = "10px";
        notice.style.backgroundColor = "#444";
        notice.style.color = "#fff";
        notice.style.padding = "8px 12px";
        notice.style.borderRadius = "4px";
        notice.style.zIndex = 9999;
        notice.style.opacity = 0;
        notice.style.transition = "opacity 0.3s";
        document.body.appendChild(notice);
    }
    notice.textContent = msg;
    notice.style.opacity = 1;
    // 自动淡出
    setTimeout(() => { notice.style.opacity = 0; }, 6000);

    // 立即刷新 toolbar
    updateToolbar();
  }
  // === Permission Check ===
  function checkPermissions() {
    fetch(`/board/check_permissions/${BOARD_ID}/`)
      .then(res => res.json())
      .then(data => {
        const userPermission = data.can_edit;

       if (userPermission && !window.permissionGranted) {
          window.permissionGranted = true;
          showPermissionNotice("You have been granted permission to edit the board!", true);

        } 
        else if (!userPermission && window.permissionGranted) {
          window.permissionGranted = false;
          showPermissionNotice("Your editing permission has been revoked!", false);
        }
      }).catch(err => console.error(err));
  }

  // --- Update user list authorization status (host or non-host) ---
  function updateAuthorizedLabels() {
    document.querySelectorAll('#left-panel ul li').forEach(li => {
      const input = li.querySelector('input[name="user_permission"]');
      const userId = input ? parseInt(input.value) : parseInt(li.dataset.userId);
      const span = li.querySelector('.auth-label');

      // Add/remove "(Authorized)" label
      if (window.authorizedUsers?.includes(userId)) {
        if (!span) {
          const newSpan = document.createElement('span');
          newSpan.className = 'auth-label';
          newSpan.style.color = 'green';
          newSpan.textContent = ' (Authorized)';
          li.appendChild(newSpan);
        }
      } else if (span) {
        span.remove();
      }

      // If host, also update checked status
      if (input) {
        input.checked = window.authorizedUsers?.includes(userId);
      }
    });
  }

  // Show/hide toolbar
  function updateToolbar() {
    const toolbar = document.getElementById('toolbar');
    const canvasWrap = document.getElementById('canvas-wrap');

    if (!toolbar || !canvasWrap) return;

    if (window.permissionGranted || isHost) {
        toolbar.style.display = 'block';
        canvasWrap.style.pointerEvents = 'auto'; // Can do
    } else {
        toolbar.style.display = 'none';
        canvasWrap.style.pointerEvents = 'none'; // Cannot do but can see

        currentTool = null;
        tool = null;
        const canvas = document.getElementById('board-canvas');
        if (canvas) canvas.style.cursor = 'default';
        
        drawing = false;
        panMode = false;
        currentPath = [];
        shapeStart = null;
    }

    // --- Update user authorization labels ---
    updateAuthorizedLabels();
  }

  updateToolbar();  // Initial page render
  updateAuthorizedLabels(); // Initial update of authorized labels
  setInterval(checkPermissions, permissionCheckInterval);


  // --- Unified display of share notice ---
  function showShareNotice(){
      let shareDiv = document.getElementById('shareDiv');
      if(!shareDiv){
          shareDiv = document.createElement('div');
          shareDiv.id = 'shareDiv';
          shareDiv.innerHTML = `Someone started sharing their screen <button id="openShareBtn">Open</button>`;
          shareDiv.style.position = 'fixed';
          shareDiv.style.top = '10px';
          shareDiv.style.right = '10px';
          shareDiv.style.backgroundColor = '#fff';
          shareDiv.style.padding = '10px';
          shareDiv.style.border = '1px solid #888';
          shareDiv.style.zIndex = 9999;
          document.body.appendChild(shareDiv);

          document.getElementById('openShareBtn').addEventListener('click', ()=>{
              window.open(`/sharescreen/room/${BOARD_ID}/`, '_blank');
              shareDiv.remove();
          });
      } else {
          // If already exists, show it
          shareDiv.style.display = 'block';
      }
  }

  function hideShareNotice() {
    const shareDiv = document.getElementById('shareDiv');
    if(shareDiv) shareDiv.style.display = 'none';
  }

  // === Canvas Initialization ===
  const canvas = document.getElementById('board-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = '#000000';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // === WebSocket ===
  if (!window.socket) {
    window.socket = new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws/board/${BOARD_ID}/`);
  }
  socket.onopen = () => console.log('✅ WebSocket connected');
  socket.onclose = () => console.warn('⚠️ WebSocket closed');
  socket.onerror = err => console.error('❌ WebSocket error', err);
  socket.onmessage = e => {

    let payload;
    try { 
        payload = JSON.parse(e.data); 
    } catch(err){ 
        console.error("❌ WebSocket JSON parse error", err, e.data);
        return; 
    }

    let msg = payload;

    if(payload.type === "board.message" && payload.message){
        msg = payload.message; // 🔹 Use local variable
        //console.log("📤 Unpacked board.message:", msg);
    }

function updateOnlineDot(userList){
    // Normalize userList → a set of IDs (strings)
    const idSet = new Set(userList.map(u => String(u.id)));

    document.querySelectorAll("#room-user-list li").forEach(li => {
        const uid = String(li.dataset.userId);
        const dot = li.querySelector(".online-dot");
        const radio = li.querySelector("input[type='radio']");

        const isOnline = idSet.has(uid);

        if (dot) dot.style.backgroundColor = isOnline ? "limegreen" : "gray";

        // radio Never hide, only disable (unclickable) + lower opacity
       
        if (radio) {
            radio.disabled = !isOnline;
            radio.style.opacity = isOnline ? "1" : "0.4";
            radio.style.pointerEvents = isOnline ? "auto" : "none";
        }
       
    });
}



    if(msg.type === "user_list" && Array.isArray(msg.users)){
      updateOnlineDot(msg.users);
    }

    if(msg.type === "init_state") {
      undoStack.length=0; redoStack.length=0;
      const stateList = msg.state || [];
      for(const action of stateList) if(action) undoStack.push(action);
      redrawCanvas();
      // If someone is already sharing screen
      hideShareNotice(); // Hide first
      if(msg.current_sharescreen && Number(msg.current_sharescreen) !== Number(user_id)){
        console.log("msg.current_sharescreen:", msg.current_sharescreen); 
        console.log("user_id:", user_id);  
        
        showShareNotice();
      }else {
            hideShareNotice();
        }

    } else if(['path','erase','rect','circle','clear'].includes(msg.type)) {
      undoStack.push(msg); redrawCanvas();
    } else if(msg.type === 'pan') {
      if(msg.data) {
        offsetX = msg.data.offsetX;
        offsetY = msg.data.offsetY;
        scale = msg.data.scale || scale;
        redrawCanvas();
      }
    } else if(msg.type === "undo") {
      if(msg.action){
        const idx = undoStack.findIndex(a => JSON.stringify(a) === JSON.stringify(msg.action));
        if(idx!==-1) undoStack.splice(idx,1);
        redoStack.push(msg.action);
        redrawCanvas();
      }
    } else if(msg.type==="redo"){
      if(msg.action){
        const idx = redoStack.findIndex(a => JSON.stringify(a)===JSON.stringify(msg.action));
        if(idx!==-1) redoStack.splice(idx,1);
        undoStack.push(msg.action);
        redrawCanvas();
      }
    }
    // === Handle Share Screen messages ===
    if(msg.type === "sharescreen"){
      console.log("🟡 Received sharescreen message!", msg);
      // Avoid opening own window
      if(Number(msg.sender) !== Number(user_id)){ 
        console.log("msg.sender:", msg.sender);  
        console.log("user_id:", user_id);   
        showShareNotice();
      } else if(msg.type === "stopsharescreen") {
          hideShareNotice();
      }
    }
    // ===== Video Sharing =====
    if(msg.type === "share_video" || msg.type === "stop_share_video"){
      handleIncomingVideo(msg);
      return;
    }
    // Handle video sharing
    if(msg.current_sharevideo && Number(msg.current_sharevideo.user_id) !== Number(user_id)){
        showVideoPopup(msg.current_sharevideo.video_url);
    }

  };

  // --- Toolbar bindings ---
  const colorPicker = document.getElementById('color-picker');
  const lineWidthInput = document.getElementById('line-width');
  if(colorPicker) colorPicker.addEventListener('input', e=> color = e.target.value);
  if(lineWidthInput) lineWidthInput.addEventListener('input', e=> lineWidth = Math.max(1, parseInt(e.target.value)||1));

  document.querySelectorAll('#toolbar button[data-tool]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      currentTool = btn.dataset.tool;
      setTool(btn.dataset.tool);
    });
  });

  const undoBtn = document.getElementById('undo-btn');
  const redoBtn = document.getElementById('redo-btn');
  const clearBtn = document.getElementById('clear-btn');
  const zoomInBtn = document.getElementById('zoom-in-btn');
  const zoomOutBtn = document.getElementById('zoom-out-btn');
  const panBtn = document.getElementById('pan-btn');
  const shareBtn = document.getElementById('btnShare');
  const closeBtn = document.getElementById("btnCloseShare");
  const videoShareBtn = document.getElementById("btnShareVideo");

  if(undoBtn) undoBtn.addEventListener('click', undo);
  if(redoBtn) redoBtn.addEventListener('click', redo);
  if(clearBtn) clearBtn.addEventListener('click', ()=>{
    undoStack.push({type:'clear'}); redoStack.length=0;
    redrawCanvas();
    sendToSocket({type:'clear'});
  });

  if(zoomInBtn) zoomInBtn.addEventListener('click', ()=>{
    scale *= 1.2; redrawCanvas();
    sendToSocket({type:'pan', data:{offsetX, offsetY, scale}});
  });

  if(zoomOutBtn) zoomOutBtn.addEventListener('click', ()=>{
    scale /= 1.2; redrawCanvas();
    sendToSocket({type:'pan', data:{offsetX, offsetY, scale}});
  });

  if(panBtn) panBtn.addEventListener('click', ()=> setTool('pan'));
  
  // === Share Screen event binding ===
  if (shareBtn){
    shareBtn.addEventListener("click", () => {
      const shareUrl = `/sharescreen/room/${BOARD_ID}/`;

      // Open own window
      window.open(shareUrl, '_blank');

      // Notify others
      const payload = {type: "sharescreen", board_id: BOARD_ID};
      if(socket.readyState === WebSocket.OPEN){
          socket.send(JSON.stringify(payload));
      } else {
          socket.addEventListener("open", () => socket.send(JSON.stringify(payload)), {once:true});
      }
    });
  }

  
  // --- Set Tool ---
  function setTool(t){
    if(tool==='pan' && t!=='pan') { panMode=false; canvas.style.cursor='default'; }
    tool=t;
    if(t==='pan'){ panMode=true; canvas.style.cursor='grab'; }
    else if(t==='pen'){ canvas.style.cursor='url("/static/icons/pen.png") 5 28, auto'; lineWidth=2; }
    else if(t==='eraser'){ canvas.style.cursor='url("/static/icons/eraser.png") 4 4, auto'; lineWidth=15; }
    else if(t==='rect' || t==='circle'){ 
        canvas.style.cursor='crosshair'; 
        lineWidth = 2; // Set default line width for rectangles and circles
    }
  }

  // --- Drawing functions ---
  function drawPathOnContext(ctx, points, strokeColor, w, composite){
    if(!points||points.length===0) return;
    ctx.save();
    if(composite) ctx.globalCompositeOperation=composite;
    ctx.strokeStyle = strokeColor || '#000';
    ctx.lineWidth = w||2;
    ctx.lineCap='round'; ctx.lineJoin='round';
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for(let i=1;i<points.length;i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke(); ctx.restore();
  }

  function drawAction(action){
    if(!action) return;
    const type=action.type;
    const data=action.data;
    if(type==='path') drawPathOnContext(ctx,data.points,data.color,data.lineWidth,'source-over');
    else if(type==='erase') drawPathOnContext(ctx,data.points,null,data.lineWidth,'destination-out');
    else if(type==='rect'){ ctx.save(); ctx.strokeStyle=data.color; ctx.lineWidth=data.lineWidth / scale; ctx.strokeRect(data.x,data.y,data.width,data.height); ctx.restore(); }
    else if(type==='circle'){ ctx.save(); ctx.strokeStyle=data.color; ctx.lineWidth=data.lineWidth / scale; ctx.beginPath(); ctx.arc(data.x,data.y,data.radius,0,Math.PI*2); ctx.stroke(); ctx.restore(); }
    else if(type==='text'){ renderTextToCanvas(data.text); }
    else if(type==='clear') ctx.clearRect(0,0,canvas.width,canvas.height);
  }

  function redrawCanvas(){
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.save();
    ctx.setTransform(scale,0,0,scale,offsetX,offsetY);
    for(let action of undoStack) drawAction(action);
    ctx.restore();
  }

  function sendToSocket(obj){
    if(socket && socket.readyState===WebSocket.OPEN) socket.send(JSON.stringify(obj));
  }

  // --- Undo/Redo ---
  function undo(){
    if(undoStack.length===0) return;
    const action=undoStack.pop();
    redoStack.push(action);
    redrawCanvas();
    sendToSocket({type:'undo', action});
  }

  function redo(){
    if(redoStack.length===0) return;
    const action=redoStack.pop();
    undoStack.push(action);
    redrawCanvas();
    sendToSocket({type:'redo', action});
  }

  // --- Mouse events ---
  let startX=0, startY=0;
  canvas.addEventListener('mousedown', e=>{
    if(tool==='pan'){ panMode=true; drawing=true; startX=e.clientX; startY=e.clientY; canvas.style.cursor='grabbing'; return; }
    if(!currentTool||!tool) return;
    const rect=canvas.getBoundingClientRect();
    const x=(e.clientX-rect.left-offsetX)/scale;
    const y=(e.clientY-rect.top-offsetY)/scale;
    drawing=true; ctx.lineWidth=lineWidth; ctx.strokeStyle=color;
    if(tool==='pen'||tool==='eraser') currentPath=[{x,y}];
    else if(tool==='rect'||tool==='circle') shapeStart={x,y};
  });

  canvas.addEventListener('mousemove', e=>{
    if(!drawing) return;
    const rect=canvas.getBoundingClientRect();
    const x=(e.clientX-rect.left-offsetX)/scale;
    const y=(e.clientY-rect.top-offsetY)/scale;

    if(panMode && tool==='pan'){
      const dx=e.clientX-startX, dy=e.clientY-startY;
      offsetX+=dx; offsetY+=dy; startX=e.clientX; startY=e.clientY;
      redrawCanvas();
      sendToSocket({type:'pan', data:{offsetX, offsetY, scale}});
      return;
    }

    if(tool==='pen'){ currentPath.push({x,y}); redrawCanvas(); ctx.save(); ctx.setTransform(scale,0,0,scale,offsetX,offsetY); drawPathOnContext(ctx,currentPath,color,lineWidth,'source-over'); ctx.restore(); }
    else if(tool==='eraser'){ currentPath.push({x,y}); redrawCanvas(); ctx.save(); ctx.setTransform(scale,0,0,scale,offsetX,offsetY); drawPathOnContext(ctx,currentPath,null,lineWidth,'destination-out'); ctx.restore(); }
    else if(tool==='rect'&&shapeStart){ const w=x-shapeStart.x; const h=y-shapeStart.y; redrawCanvas(); ctx.save(); ctx.setTransform(scale,0,0,scale,offsetX,offsetY); ctx.strokeStyle=color; ctx.lineWidth=lineWidth; ctx.strokeRect(shapeStart.x,shapeStart.y,w,h); ctx.restore(); }
    else if(tool==='circle'&&shapeStart){ const dx=x-shapeStart.x; const dy=y-shapeStart.y; const r=Math.sqrt(dx*dx+dy*dy); redrawCanvas(); ctx.save(); ctx.setTransform(scale,0,0,scale,offsetX,offsetY); ctx.strokeStyle=color; ctx.lineWidth=lineWidth; ctx.beginPath(); ctx.arc(shapeStart.x,shapeStart.y,r,0,Math.PI*2); ctx.stroke(); ctx.restore(); }
  });

  canvas.addEventListener('mouseup', e=>{
    if(!drawing) return; drawing=false;
    if(panMode && tool==='pan'){ panMode=false; canvas.style.cursor='grab'; return; }
    const rect=canvas.getBoundingClientRect();
    const x=(e.clientX-rect.left-offsetX)/scale;
    const y=(e.clientY-rect.top-offsetY)/scale;

    if(tool==='pen' && currentPath.length>=2){ const action={type:'path', data:{points:currentPath.slice(), color, lineWidth}}; undoStack.push(action); redoStack.length=0; sendToSocket(action); currentPath=[]; }
    else if(tool==='eraser' && currentPath.length>=1){ const action={type:'erase', data:{points:currentPath.slice(), lineWidth}}; undoStack.push(action); redoStack.length=0; sendToSocket(action); currentPath=[]; }
    else if(tool==='rect' && shapeStart){ const w=x-shapeStart.x; const h=y-shapeStart.y; const action={type:'rect', data:{x:shapeStart.x, y:shapeStart.y, width:w, height:h, color, lineWidth}}; undoStack.push(action); redoStack.length=0; sendToSocket(action); shapeStart=null; redrawCanvas(); }
    else if(tool==='circle' && shapeStart){ const dx=x-shapeStart.x; const dy=y-shapeStart.y; const r=Math.sqrt(dx*dx+dy*dy); const action={type:'circle', data:{x:shapeStart.x, y:shapeStart.y, radius:r, color, lineWidth}}; undoStack.push(action); redoStack.length=0; sendToSocket(action); shapeStart=null; redrawCanvas(); }
  });

  canvas.addEventListener('mouseleave', ()=>{ if(drawing){drawing=false; currentPath=[]; shapeStart=null; canvas.style.cursor=tool==='pan'?'grab':'crosshair';} });
  

// --- Mobile touch support start ---

let pinchZoom = false;
let startDist = 0;
let pinchCenter = {x:0, y:0};
let lastScale = 1;
let pinchOffset = {x:0, y:0};

// Get distance between two touches
function getDistance(touches){
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx*dx + dy*dy);
}

// Get center point between two touches
function getCenter(touches){
    return {
        x: (touches[0].clientX + touches[1].clientX)/2,
        y: (touches[0].clientY + touches[1].clientY)/2
    };
}

// Get touch coordinates relative to canvas
function getTouchPos(e, idx=0) {
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[idx] || e.changedTouches[0];
    return {
        x: (touch.clientX - rect.left - offsetX) / scale,
        y: (touch.clientY - rect.top - offsetY) / scale
    };
}

// Adjust lineWidth for mobile and scaling
function getAdjustedLineWidth(baseWidth){
    const dpr = window.devicePixelRatio || 1;
    return Math.max(1, baseWidth / scale / dpr);
}

// ---- Undo / Redo / Clear helpers ----
function mobileUndo() {
    if (undoStack.length === 0) return;
    const last = undoStack.pop();
    redoStack.push(last);
    redrawCanvas();
    sendToSocket({ type: 'undo' });
}

function mobileRedo() {
    if (redoStack.length === 0) return;
    const last = redoStack.pop();
    undoStack.push(last);
    redrawCanvas();
    sendToSocket({ type: 'redo' });
}

function mobileClear() {
    undoStack.length = 0;
    redoStack.length = 0;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    offsetX = 0;
    offsetY = 0;
    scale = 1;
    sendToSocket({ type: 'clear' });
}

// 可以绑定到按钮
document.getElementById('undoBtn')?.addEventListener('click', mobileUndo);
document.getElementById('redoBtn')?.addEventListener('click', mobileRedo);
document.getElementById('clearBtn')?.addEventListener('click', mobileClear);

// Touch Start
canvas.addEventListener('touchstart', e => {
    e.preventDefault();

    if(e.touches.length === 2){
        pinchZoom = true;
        startDist = getDistance(e.touches);
        pinchCenter = getCenter(e.touches);

        // 计算缩放中心在画布坐标
        const rect = canvas.getBoundingClientRect();
        const cx = (pinchCenter.x - rect.left - offsetX) / scale;
        const cy = (pinchCenter.y - rect.top - offsetY) / scale;
        pinchOffset = {x: cx, y: cy};

        lastScale = scale;
        return;
    }

    const pos = getTouchPos(e);

    if (tool === 'pan') {
        panMode = true;
        drawing = true;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        canvas.style.cursor = 'grabbing';
        return;
    }

    if (!currentTool || !tool) return;

    drawing = true;
    ctx.lineWidth = getAdjustedLineWidth(lineWidth);
    ctx.strokeStyle = color;
    if (tool === 'pen' || tool === 'eraser') currentPath = [pos];
    else if (tool === 'rect' || tool === 'circle') shapeStart = pos;
});

// Touch Move
canvas.addEventListener('touchmove', e => {
    e.preventDefault();

    if(pinchZoom && e.touches.length === 2){
        const newDist = getDistance(e.touches);
        const newScale = lastScale * (newDist / startDist);

        offsetX -= pinchOffset.x * (newScale - scale);
        offsetY -= pinchOffset.y * (newScale - scale);

        scale = newScale;
        redrawCanvas();
        sendToSocket({type:'pan', data:{offsetX, offsetY, scale}});
        return;
    }

    if (!drawing) return;
    const pos = getTouchPos(e);
    const adjustedLineWidth = getAdjustedLineWidth(lineWidth);

    if (panMode && tool === 'pan') {
        const dx = e.touches[0].clientX - startX;
        const dy = e.touches[0].clientY - startY;
        offsetX += dx;
        offsetY += dy;
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        redrawCanvas();
        sendToSocket({ type: 'pan', data: { offsetX, offsetY, scale } });
        return;
    }

    if (tool === 'pen') {
        currentPath.push(pos);
        redrawCanvas();
        ctx.save();
        ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
        drawPathOnContext(ctx, currentPath, color, adjustedLineWidth, 'source-over');
        ctx.restore();
    } else if (tool === 'eraser') {
        currentPath.push(pos);
        redrawCanvas();
        ctx.save();
        ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
        drawPathOnContext(ctx, currentPath, null, adjustedLineWidth, 'destination-out');
        ctx.restore();
    } else if (tool === 'rect' && shapeStart) {
        const w = pos.x - shapeStart.x;
        const h = pos.y - shapeStart.y;
        redrawCanvas();
        ctx.save();
        ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
        ctx.strokeStyle = color;
        ctx.lineWidth = adjustedLineWidth;
        ctx.strokeRect(shapeStart.x, shapeStart.y, w, h);
        ctx.restore();
    } else if (tool === 'circle' && shapeStart) {
        const dx = pos.x - shapeStart.x;
        const dy = pos.y - shapeStart.y;
        const r = Math.sqrt(dx * dx + dy * dy);
        redrawCanvas();
        ctx.save();
        ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
        ctx.strokeStyle = color;
        ctx.lineWidth = adjustedLineWidth;
        ctx.beginPath();
        ctx.arc(shapeStart.x, shapeStart.y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }
});

// Touch End
canvas.addEventListener('touchend', e => {
    e.preventDefault();

    if(e.touches.length < 2) pinchZoom = false;
    if (!drawing) return;
    drawing = false;

    if (panMode && tool === 'pan') {
        panMode = false;
        canvas.style.cursor = 'grab';
        return;
    }

    const pos = getTouchPos(e);
    const adjustedLineWidth = getAdjustedLineWidth(lineWidth);

    if (tool === 'pen' && currentPath.length >= 2) {
        const action = { type: 'path', data: { points: currentPath.slice(), color, lineWidth: adjustedLineWidth } };
        undoStack.push(action);
        redoStack.length = 0;
        sendToSocket(action);
        currentPath = [];
    } else if (tool === 'eraser' && currentPath.length >= 1) {
        const action = { type: 'erase', data: { points: currentPath.slice(), lineWidth: adjustedLineWidth } };
        undoStack.push(action);
        redoStack.length = 0;
        sendToSocket(action);
        currentPath = [];
    } else if (tool === 'rect' && shapeStart) {
        const w = pos.x - shapeStart.x;
        const h = pos.y - shapeStart.y;
        const action = { type: 'rect', data: { x: shapeStart.x, y: shapeStart.y, width: w, height: h, color, lineWidth: adjustedLineWidth } };
        undoStack.push(action);
        redoStack.length = 0;
        sendToSocket(action);
        shapeStart = null;
        redrawCanvas();
    } else if (tool === 'circle' && shapeStart) {
        const dx = pos.x - shapeStart.x;
        const dy = pos.y - shapeStart.y;
        const r = Math.sqrt(dx * dx + dy * dy);
        const action = { type: 'circle', data: { x: shapeStart.x, y: shapeStart.y, radius: r, color, lineWidth: adjustedLineWidth } };
        undoStack.push(action);
        redoStack.length = 0;
        sendToSocket(action);
        shapeStart = null;
        redrawCanvas();
    }
});

// --- Mobile touch support end ---


  redrawCanvas();

  // ---- Send video share message ----
    function sendVideoShareMessage(video_url) {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type: 'share_video',
                video_url: video_url,
                sender: user_id
            }));
        } else if (socket) {
            socket.addEventListener("open", () => {
                socket.send(JSON.stringify({
                    type: 'share_video',
                    video_url: video_url,
                    sender: user_id
                }));
            }, { once: true });
        }
    }

    // ====== Share Video Button ======
    const shareVideoBtn = document.getElementById('btnShareVideo');
    if (shareVideoBtn) {
        shareVideoBtn.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'video/*';
            input.click();

            input.addEventListener('change', async () => {
                const file = input.files[0];
                if (!file) return;

                const formData = new FormData();
                formData.append('video', file);

                try {
                    const res = await fetch('/board/upload_temp_video/', {
                        method: 'POST',
                        body: formData
                    });
                    const data = await res.json();
                    if (!data.video_url) return alert('Upload failed');

                    const videoURL = data.video_url;

                    // 🔹 Local draggable window
                    createVideoBox(videoURL);

                    // 🔹 Notify other users
                    sendVideoShareMessage(videoURL);

                } catch (err) {
                    console.error("Video upload failed", err);
                    alert("Video upload failed, please try again");
                }
            });
        });
    }

    // ===== WebSocket message handler =====
    function handleIncomingVideo(msg) {
        // Only show popup to other users
        if (msg.type === "share_video" && msg.video_url && Number(msg.sender) !== Number(user_id)) {
            console.log("WebSocket msg.type:", msg.type,);
            console.log("WebSocket msg.video_url", msg.video_url);
            console.log("WebSocket msg.sender:", msg.sender);
            console.log("WebSocket user_id:",user_id);

            showVideoPopup(msg.video_url);
        }

        if (msg.type === "stop_share_video" && msg.sender !== user_id) {
            hideVideoPopup();
        }
    }
    window.handleIncomingVideo = handleIncomingVideo;

    // ================================  
    //         Video Popup (viewer)  
    // ================================
    window.showVideoPopup = function(url) {
        const popup = document.getElementById("videoPopup");
        const video = document.getElementById("sharedVideo");
        popup.style.display = "block";
        video.src = url;
        video.muted = true;  // Mute allows autoplay
        video.play().catch(e => console.warn("Autoplay failed:", e));
    }

    window.hideVideoPopup = function() {
        const popup = document.getElementById("videoPopup");
        const video = document.getElementById("sharedVideo");
        video.pause();
        video.src = "";
        popup.style.display = "none";
    }

    const popupCloseBtn = document.getElementById("videoPopupClose");
    if (popupCloseBtn) {
        popupCloseBtn.onclick = () => hideVideoPopup();
    }

    // ================================  
    //         Draggable Video Window (host)  
    // ================================
    function createVideoBox(videoURL) {
        const videoDiv = document.createElement('div');
        videoDiv.style.position = 'fixed';
        videoDiv.style.top = '50px';
        videoDiv.style.left = '50px';
        videoDiv.style.width = '400px';
        videoDiv.style.height = '300px';
        videoDiv.style.border = '2px solid #333';
        videoDiv.style.backgroundColor = '#000';
        videoDiv.style.zIndex = 9999;
        videoDiv.style.resize = 'both';
        videoDiv.style.overflow = 'hidden';
        videoDiv.style.display = 'flex';
        videoDiv.style.flexDirection = 'column';

        // ===== Title Bar =====
        const titleBar = document.createElement('div');
        titleBar.style.height = '28px';
        titleBar.style.background = '#222';
        titleBar.style.color = '#fff';
        titleBar.style.display = 'flex';
        titleBar.style.alignItems = 'center';
        titleBar.style.padding = '0 10px';
        titleBar.style.cursor = 'move';
        titleBar.textContent = "Shared Video";
        videoDiv.appendChild(titleBar);

        // ===== Video =====
        const video = document.createElement('video');
        video.src = videoURL;
        video.controls = true;
        video.autoplay = true;
        video.muted = true; // 🔹 Mute allows autoplay
        video.style.width = '100%';
        video.style.height = 'calc(100% - 28px)';
        videoDiv.appendChild(video);

        // ===== Close Button =====
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '❌';
        closeBtn.style.position = 'absolute';
        closeBtn.style.top = '2px';
        closeBtn.style.right = '4px';
        closeBtn.style.background = 'transparent';
        closeBtn.style.border = 'none';
        closeBtn.style.color = 'white';
        closeBtn.style.cursor = 'pointer';
        closeBtn.addEventListener('click', () => {
            videoDiv.remove();
            stopSharingVideo(); // 🔹 Notify others
        });
        videoDiv.appendChild(closeBtn);

        document.body.appendChild(videoDiv);

        // Drag binding to title bar
        makeDraggable(videoDiv, titleBar);
    }

    function makeDraggable(box, handle) {
        let dragging = false, offsetX = 0, offsetY = 0;

        handle.addEventListener("mousedown", (e) => {
            dragging = true;
            offsetX = e.clientX - box.offsetLeft;
            offsetY = e.clientY - box.offsetTop;
            document.addEventListener("mousemove", move);
            document.addEventListener("mouseup", stop);
        });

        function move(e) {
            if (!dragging) return;
            box.style.left = (e.clientX - offsetX) + "px";
            box.style.top  = (e.clientY - offsetY) + "px";
        }

        function stop() {
            dragging = false;
            document.removeEventListener("mousemove", move);
            document.removeEventListener("mouseup", stop);
        }
    }

    // ===== Stop sharing video, notify others =====
    async function stopSharingVideo() {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "stop_share_video", sender: user_id }));
        }
    }
});