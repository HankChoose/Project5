document.addEventListener('DOMContentLoaded', () => {
  if (typeof BOARD_ID === "undefined") return;
  checkPermissions();

  // === 状态变量 ===
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

  const user_id = "{{ user.id }}";
  const permissionCheckInterval = 5000;

  // === 权限检查 ===
  // === 权限检查 ===
  function checkPermissions() {
    fetch(`/board/check_permissions/${BOARD_ID}/`)
      .then(res => res.json())
      .then(data => {
        const userPermission = data.can_edit;

        if (userPermission && !window.permissionGranted) {
          window.permissionGranted = true;
          updateToolbar(); // 先显示 toolbar
          alert("你已被授权可以操作白板！");
          updateToolbar();
        } 
        else if (!userPermission && window.permissionGranted) {
          window.permissionGranted = false;
          alert("你已被取消操作权限！");
          updateToolbar();
        }
      }).catch(err => console.error(err));
  }

  // 显示/隐藏 toolbar
  function updateToolbar() {
    const toolbar = document.getElementById('toolbar');
    if (!toolbar) return;   // ← 避免 null 报错

    if (window.permissionGranted || isHost) {
        toolbar.style.display = 'block';
    } else {
        toolbar.style.display = 'none';

        // 🚨 核心：普通用户失去权限 → 清空工具
        currentTool = null;
        tool = null;

         // 🔥 核心：把鼠标样式重置
        const canvas = document.getElementById('board-canvas');
        if (canvas) canvas.style.cursor = 'default';  // 或 'default'
        
        // 如果还有拖拽或文本输入，也可以取消
        drawing = false;
        panMode = false;
        currentPath = [];
        shapeStart = null;
    }
  }

  setInterval(checkPermissions, permissionCheckInterval);
  updateToolbar();  // 页面初始渲染


  // === Canvas 初始化 ===
  const canvas = document.getElementById('board-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = '#000000';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // === WebSocket ===
  const socket = new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws/board/${BOARD_ID}/`);

  socket.onopen = () => console.log('✅ WebSocket connected');
  socket.onclose = () => console.warn('⚠️ WebSocket closed');
  socket.onerror = err => console.error('❌ WebSocket error', err);
  socket.onmessage = e => {
    let msg;
    try { msg = JSON.parse(e.data); } catch(err){ return; }
    if(!msg||!msg.type) return;

    if(msg.type === "init_state") {
      undoStack.length=0; redoStack.length=0;
      const stateList = msg.state || [];
      for(const action of stateList) if(action) undoStack.push(action);
      redrawCanvas();
    } else if(['path','erase','rect','circle','text','clear'].includes(msg.type)) {
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
  };

  // --- 工具栏绑定 ---
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

  // --- 设置工具 ---
  function setTool(t){
    if(tool==='pan' && t!=='pan') { panMode=false; canvas.style.cursor='default'; }
    tool=t;
    if(t==='pan'){ panMode=true; canvas.style.cursor='grab'; }
    else if(t==='pen'){ canvas.style.cursor='url("/static/icons/pen.png") 5 28, auto'; lineWidth=2; }
    else if(t==='eraser'){ canvas.style.cursor='url("/static/icons/eraser.png") 4 4, auto'; lineWidth=15; }
    else if(t==='text'){ canvas.style.cursor='text'; canvas.addEventListener('click', createTextInput); }
    else{ canvas.style.cursor='crosshair'; }
  }

  // --- 绘图函数 ---
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

  // --- 鼠标事件 ---
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

  // --- 文本输入 ---
  function createTextInput(e){
    const rect=canvas.getBoundingClientRect();
    const boardX=(e.clientX-rect.left-offsetX)/scale;
    const boardY=(e.clientY-rect.top-offsetY)/scale;
    const textarea=document.createElement('textarea');
    textarea.style.position='absolute';
    textarea.style.left=`${rect.left+(boardX*scale)+offsetX}px`;
    textarea.style.top=`${rect.top+(boardY*scale)+offsetY}px`;
    textarea.style.fontSize='16px'; textarea.style.padding='5px';
    textarea.style.border='1px solid #888'; textarea.style.background='rgba(255,255,255,0.9)';
    textarea.style.zIndex=9999; textarea.style.resize='both'; textarea.style.overflow='auto';
    document.body.appendChild(textarea); textarea.focus();

    let isDragging=false, offsetXDrag, offsetYDrag;
    textarea.addEventListener('mousedown', ev=>{ isDragging=true; offsetXDrag=ev.clientX-textarea.offsetLeft; offsetYDrag=ev.clientY-textarea.offsetTop; document.addEventListener('mousemove', dragTextBox); document.addEventListener('mouseup', ()=>{isDragging=false; document.removeEventListener('mousemove', dragTextBox);}); });
    function dragTextBox(ev){ if(isDragging){ textarea.style.left=`${ev.clientX-offsetXDrag}px`; textarea.style.top=`${ev.clientY-offsetYDrag}px`; } }
    function submitTextInput(){ const textContent=textarea.value; textarea.remove(); undoStack.push({type:'text', data:{text:textContent}}); sendToSocket({type:'text', data:{text:textContent}}); renderTextToCanvas(textContent);}
    textarea.addEventListener('keydown', ev=>{ if(ev.key==='Enter'){ev.preventDefault(); submitTextInput();} else if(ev.key==='Escape'){textarea.remove();} });
    textarea.addEventListener('blur', submitTextInput);
    canvas.removeEventListener('click', createTextInput);
  }

  function renderTextToCanvas(text){
    const padding=10, fontSize=16, lineHeight=20;
    ctx.save(); ctx.setTransform(scale,0,0,scale,offsetX,offsetY);
    ctx.fillStyle='#000'; ctx.font=`${fontSize}px Arial`;
    const words=text.split(/\s+/); let x=padding, y=padding+fontSize;
    for(let word of words){
      const testLine=word;
      if(x+ctx.measureText(testLine).width>canvas.width-padding){ x=padding; y+=lineHeight; }
      ctx.fillText(word,x,y); x+=ctx.measureText(word+' ').width;
      if(y>canvas.height-padding) break;
    }
    ctx.restore();
  }

  redrawCanvas();
});
