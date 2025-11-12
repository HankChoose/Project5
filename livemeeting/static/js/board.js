// static/js/board.js

document.addEventListener('DOMContentLoaded', () => {
  if (typeof BOARD_ID === "undefined") return;

  // PDF.js 全局检查
  if (typeof window.pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/static/js/pdf.worker.js';
    pdfjsLib.GlobalWorkerOptions.disableWorker = false;
    console.log('✅ PDF.js 已加载:', pdfjsLib.version);
  } else {
    console.error('❌ pdfjsLib 未定义，请检查 base.html 中是否加载 pdf.js');
  }

  // 当前登录用户 ID
  const user_id = "{{ user.id }}";  
  const permissionCheckInterval = 5000;  

  // === 权限检查 ===
  function checkPermissions() {
    fetch(`/board/check_permissions/${BOARD_ID}/`)
      .then(res => res.json())
      .then(data => {
        const userPermission = data.can_edit;
        if (userPermission) {
          if (!window.permissionGranted) {
            window.permissionGranted = true;
            alert("你已被授权可以操作白板！");
          }
        } else {
          if (window.permissionGranted) {
            window.permissionGranted = false;
            alert("你已被取消操作权限！");
            location.reload();
          }
        }
      }).catch(err => console.error(err));
  }
  setInterval(checkPermissions, permissionCheckInterval);

  // === Canvas 初始化 ===
  const canvas = document.getElementById('board-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = '#000000';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // === WebSocket 初始化 ===
  const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/board/${BOARD_ID}/`);

  // === 状态变量 ===
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

  // 文本分页
  let currentPage = 0;
  let totalPages = 0;
  let pages = [];

  // PDF 状态
  let pdfDoc = null;
  let currentPdfPage = 1;
  let pdfScale = 1;
  const pdfCanvas = document.createElement('canvas');
  const pdfCtx = pdfCanvas.getContext('2d');

  // --- 工具栏绑定 ---
  const colorPicker = document.getElementById('color-picker');
  const lineWidthInput = document.getElementById('line-width');
  if (colorPicker) colorPicker.addEventListener('input', e => color = e.target.value);
  if (lineWidthInput) lineWidthInput.addEventListener('input', e => lineWidth = Math.max(1, parseInt(e.target.value) || 1));

  document.querySelectorAll('#toolbar button[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => setTool(btn.dataset.tool));
  });

  const undoBtn = document.getElementById('undo-btn');
  const redoBtn = document.getElementById('redo-btn');
  const clearBtn = document.getElementById('clear-btn');
  const zoomInBtn = document.getElementById('zoom-in-btn');
  const zoomOutBtn = document.getElementById('zoom-out-btn');
  const panBtn = document.getElementById('pan-btn');
  const docTool = document.getElementById('doc-tool');
  const docInput = document.getElementById('doc-input');

  if (undoBtn) undoBtn.addEventListener('click', undo);
  if (redoBtn) redoBtn.addEventListener('click', redo);
  if (clearBtn) clearBtn.addEventListener('click', () => {
    undoStack.push({ type: 'clear' });
    redoStack.length = 0;
    redrawCanvas();
    sendToSocket({ type: 'clear' });
  });
  if (zoomInBtn) zoomInBtn.addEventListener('click', () => { scale *= 1.2; redrawCanvas(); sendPdfTransform(); });
  if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => { scale /= 1.2; redrawCanvas(); sendPdfTransform(); });
  if (panBtn) panBtn.addEventListener('click', () => setTool('pan'));

  if (docTool && docInput) {
    docTool.addEventListener('click', () => docInput.click());
    docInput.addEventListener('change', handleDocumentUpload);
  }

  // --- 设置工具 ---
  function setTool(t) {
    if (tool === 'pan' && t !== 'pan') {
      panMode = false;
      canvas.style.cursor = 'default';
    }
    tool = t;
    if (t === 'pan') { panMode = true; canvas.style.cursor = 'grab'; }
    else if (t === 'pen') { canvas.style.cursor = 'url("/static/icons/pen.png") 5 28, auto'; lineWidth=2; }
    else if (t === 'eraser') { canvas.style.cursor = 'url("/static/icons/eraser.png") 4 4, auto'; lineWidth=15; }
    else if (t === 'text') { canvas.style.cursor='text'; canvas.addEventListener('click', createTextInput); }
    else { canvas.style.cursor='crosshair'; }
  }

  // --- 绘图方法 ---
  function drawPathOnContext(ctx, points, strokeColor, w, composite) {
    if (!points || points.length === 0) return;
    ctx.save();
    if (composite) ctx.globalCompositeOperation = composite;
    ctx.strokeStyle = strokeColor || '#000';
    ctx.lineWidth = w || 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
    ctx.restore();
  }

  function drawAction(action) {
    if (!action) return;
    const type = action.type;
    const data = action.data;
    if (type === 'path') drawPathOnContext(ctx, data.points, data.color, data.lineWidth, 'source-over');
    else if (type === 'erase') drawPathOnContext(ctx, data.points, null, data.lineWidth, 'destination-out');
    else if (type === 'rect') { ctx.save(); ctx.strokeStyle=data.color; ctx.lineWidth=data.lineWidth; ctx.strokeRect(data.x,data.y,data.width,data.height); ctx.restore(); }
    else if (type === 'circle') { ctx.save(); ctx.strokeStyle=data.color; ctx.lineWidth=data.lineWidth; ctx.beginPath(); ctx.arc(data.x,data.y,data.radius,0,Math.PI*2); ctx.stroke(); ctx.restore(); }
    else if (type === 'text') { renderTextToPages(data.text); }
    else if (type === 'clear') ctx.clearRect(-offsetX/scale,-offsetY/scale,canvas.width/scale,canvas.height/scale);
  }

  function redrawCanvas() {
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,canvas.width,canvas.height);

    // 绘制 PDF
    if(pdfCanvas){
      ctx.save();
      ctx.setTransform(scale,0,0,scale,offsetX,offsetY);
      ctx.drawImage(pdfCanvas,0,0,pdfCanvas.width*pdfScale,pdfCanvas.height*pdfScale);
      ctx.restore();
    }

    // 绘制用户操作
    ctx.save();
    ctx.setTransform(scale,0,0,scale,offsetX,offsetY);
    for(let action of undoStack) drawAction(action);
    ctx.restore();
  }

  function sendToSocket(obj) {
    if(socket && socket.readyState===WebSocket.OPEN) socket.send(JSON.stringify(obj));
  }
  function undo() {
      if (undoStack.length === 0) return;
      const action = undoStack.pop();
      redoStack.push(action);
      redrawCanvas();
      // 发送 undo 事件给其他用户
      sendToSocket({ type: 'undo' });
  }

  function redo() {
      if (redoStack.length === 0) return;
      const action = redoStack.pop();
      undoStack.push(action);
      redrawCanvas();
      sendToSocket(action); // 重新 push 这条动作到数据库
  }

  // --- 鼠标事件 ---
  let startX=0, startY=0;
  canvas.addEventListener('mousedown', e=>{
    const rect=canvas.getBoundingClientRect();
    const x=(e.clientX-rect.left-offsetX)/scale;
    const y=(e.clientY-rect.top-offsetY)/scale;
    if(tool==='pan'){panMode=true;drawing=true;startX=e.clientX;startY=e.clientY;canvas.style.cursor='grabbing';return;}
    drawing=true; ctx.lineWidth=lineWidth; ctx.strokeStyle=color;
    if(tool==='pen'||tool==='eraser') currentPath=[{x,y}];
    else if(tool==='rect'||tool==='circle') shapeStart={x,y};
  });

  canvas.addEventListener('mousemove', e=>{
    if(!drawing) return;
    const rect=canvas.getBoundingClientRect();
    const x=(e.clientX-rect.left-offsetX)/scale;
    const y=(e.clientY-rect.top-offsetY)/scale;
    if(panMode&&tool==='pan'){offsetX+=e.clientX-startX; offsetY+=e.clientY-startY; startX=e.clientX; startY=e.clientY; redrawCanvas(); sendPdfTransform(); return;}
    if(tool==='pen'){currentPath.push({x,y}); redrawCanvas(); ctx.save(); ctx.setTransform(scale,0,0,scale,offsetX,offsetY); drawPathOnContext(ctx,currentPath,color,lineWidth,'source-over'); ctx.restore(); }
    else if(tool==='eraser'){currentPath.push({x,y}); redrawCanvas(); ctx.save(); ctx.setTransform(scale,0,0,scale,offsetX,offsetY); drawPathOnContext(ctx,currentPath,null,lineWidth,'destination-out'); ctx.restore(); }
    else if(tool==='rect'&&shapeStart){ const w=x-shapeStart.x; const h=y-shapeStart.y; redrawCanvas(); ctx.save(); ctx.setTransform(scale,0,0,scale,offsetX,offsetY); ctx.strokeStyle=color; ctx.lineWidth=lineWidth; ctx.strokeRect(shapeStart.x,shapeStart.y,w,h); ctx.restore();}
    else if(tool==='circle'&&shapeStart){ const dx=x-shapeStart.x; const dy=y-shapeStart.y; const r=Math.sqrt(dx*dx+dy*dy); redrawCanvas(); ctx.save(); ctx.setTransform(scale,0,0,scale,offsetX,offsetY); ctx.strokeStyle=color; ctx.lineWidth=lineWidth; ctx.beginPath(); ctx.arc(shapeStart.x,shapeStart.y,r,0,Math.PI*2); ctx.stroke(); ctx.restore();}
  });

  canvas.addEventListener('mouseup', e=>{
    if(!drawing) return; drawing=false;
    const rect=canvas.getBoundingClientRect();
    const x=(e.clientX-rect.left-offsetX)/scale;
    const y=(e.clientY-rect.top-offsetY)/scale;
    if(panMode&&tool==='pan'){panMode=false; canvas.style.cursor='default'; return;}
    if(tool==='pen'&&currentPath.length>=2){ const action={type:'path', data:{points:currentPath.slice(), color, lineWidth}}; undoStack.push(action); redoStack.length=0; sendToSocket(action); currentPath=[];}
    else if(tool==='eraser'&&currentPath.length>=1){ const action={type:'erase', data:{points:currentPath.slice(), lineWidth}}; undoStack.push(action); redoStack.length=0; sendToSocket(action); currentPath=[];}
    else if(tool==='rect'&&shapeStart){ const w=x-shapeStart.x; const h=y-shapeStart.y; const action={type:'rect', data:{x:shapeStart.x, y:shapeStart.y, width:w, height:h, color, lineWidth}}; undoStack.push(action); redoStack.length=0; sendToSocket(action); shapeStart=null; redrawCanvas(); }
    else if(tool==='circle'&&shapeStart){ const dx=x-shapeStart.x; const dy=y-shapeStart.y; const r=Math.sqrt(dx*dx+dy*dy); const action={type:'circle', data:{x:shapeStart.x, y:shapeStart.y, radius:r, color, lineWidth}}; undoStack.push(action); redoStack.length=0; sendToSocket(action); shapeStart=null; redrawCanvas();}
  });

  canvas.addEventListener('mouseleave', ()=>{if(drawing){drawing=false; currentPath=[]; shapeStart=null; canvas.style.cursor=tool==='pan'?'grab':'crosshair';}});

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
    textarea.addEventListener('mousedown', ev=>{ isDragging=true; offsetXDrag=ev.clientX-textarea.offsetLeft; offsetYDrag=ev.clientY-textarea.offsetTop; document.addEventListener('mousemove', dragTextBox); document.addEventListener('mouseup', ()=>{isDragging=false;document.removeEventListener('mousemove', dragTextBox);});});
    function dragTextBox(ev){ if(isDragging){textarea.style.left=`${ev.clientX-offsetXDrag}px`; textarea.style.top=`${ev.clientY-offsetYDrag}px`; } }
    function submitTextInput(){ const textContent=textarea.value; textarea.remove(); undoStack.push({type:'text', data:{text:textContent}}); sendToSocket({type:'text', data:{text:textContent}}); renderTextToPages(textContent);}
    textarea.addEventListener('keydown', ev=>{if(ev.key==='Enter'){ev.preventDefault(); submitTextInput();} else if(ev.key==='Escape'){textarea.remove();}});
    textarea.addEventListener('blur', submitTextInput);
    canvas.removeEventListener('click', createTextInput);
  }

  // --- 文件上传 ---
  function handleDocumentUpload(e){
    const file = e.target.files[0]; if(!file) return;
    const ext=file.name.split('.').pop().toLowerCase();
    const reader=new FileReader();
    if(ext==='pdf'){ reader.onload=()=>parsePDF(reader.result,true); reader.readAsArrayBuffer(file); }
    else if(ext==='txt'){ reader.onload=()=>handleTextFile(reader.result); reader.readAsText(file); }
    else if(ext==='docx'){ reader.onload=()=>parseDOCX(reader.result); reader.readAsArrayBuffer(file); }
    else alert('仅支持 TXT / PDF / DOCX 文件');
    e.target.value='';
  }

  function handleTextFile(text){ undoStack.push({type:'text',data:{text}}); sendToSocket({type:'text',data:{text}}); renderTextToPages(text); }

  function parseDOCX(arrayBuffer){ mammoth.extractRawText({arrayBuffer}).then(result=>handleTextFile(result.value)).catch(err=>{console.error(err); alert('DOCX 文件解析失败');}); }

  // --- PDF 处理 ---
  async function parsePDF(arrayBuffer, broadcast=false){
    try{
      pdfDoc=await pdfjsLib.getDocument({data:new Uint8Array(arrayBuffer)}).promise;
      totalPages=pdfDoc.numPages; currentPdfPage=1;
      await drawPdfPage(currentPdfPage);

      if(broadcast) sendToSocket({type:'pdf_upload', data:arrayBufferToBase64(arrayBuffer)});
    }catch(err){console.error(err); alert('PDF 文件解析失败'); }
  }

  async function drawPdfPage(pageNum){
    if(!pdfDoc) return;
    const page=await pdfDoc.getPage(pageNum);
    const viewport=page.getViewport({scale:1});
    pdfCanvas.width=viewport.width; pdfCanvas.height=viewport.height;
    await page.render({canvasContext:pdfCtx,viewport}).promise;
    pdfScale=Math.min(canvas.width/pdfCanvas.width, canvas.height/pdfCanvas.height);
    redrawCanvas();
  }

  function sendPdfTransform(){ sendToSocket({type:'pdf_transform', scale, offsetX, offsetY, currentPdfPage}); }

  function arrayBufferToBase64(buffer){ let binary=''; const bytes=new Uint8Array(buffer); for(let i=0;i<bytes.length;i++) binary+=String.fromCharCode(bytes[i]); return btoa(binary); }
  function base64ToArrayBuffer(base64){ const binary=atob(base64); const bytes=new Uint8Array(binary.length); for(let i=0;i<binary.length;i++) bytes[i]=binary.charCodeAt(i); return bytes.buffer; }

  // --- 文本分页 ---
  function renderTextToPages(text){
    const padding=10,fontSize=16,lineHeight=20,maxWidth=canvas.width-padding*2,maxHeight=canvas.height-padding*2;
    const words=text.split(/\s+/); let lines=[],tempPages=[];
    for(let word of words){
      const testLine=lines.length>0?lines[lines.length-1]+' '+word:word;
      ctx.font=`${fontSize}px Arial`;
      if(ctx.measureText(testLine).width>maxWidth){ lines.push(word); if(lines.length*lineHeight>=maxHeight){ tempPages.push(lines.slice()); lines=[]; } } else { lines.push(word); }
    }
    if(lines.length) tempPages.push(lines);
    pages=tempPages; totalPages=pages.length; currentPage=0; drawCurrentPage();
  }

  function drawCurrentPage(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.save(); ctx.setTransform(scale,0,0,scale,offsetX,offsetY);
    ctx.fillStyle='#000'; const padding=10, fontSize=16, lineHeight=20; ctx.font=`${fontSize}px Arial`;
    if(!pages[currentPage]) return;
    let y=padding+fontSize;
    for(let line of pages[currentPage]){ ctx.fillText(line,padding,y); y+=lineHeight; if(y+lineHeight>canvas.height-padding) break; }
    ctx.restore();
    for(let action of undoStack){ if(action.type!=='text') drawAction(action); }
  }

  canvas.addEventListener('wheel', e=>{
    if(!pdfDoc) return;
    if(e.deltaY>0) currentPdfPage=Math.min(currentPdfPage+1,totalPages);
    else currentPdfPage=Math.max(currentPdfPage-1,1);
    drawPdfPage(currentPdfPage);
  });

  // --- WebSocket 事件 ---
  socket.onopen=()=>console.log('✅ WebSocket connected');
  socket.onclose=()=>console.warn('⚠️ WebSocket closed');
  socket.onerror=err=>console.error('❌ WebSocket error',err);
  socket.onmessage=e=>{
    let msg;
    try{ msg=JSON.parse(e.data); } catch(err){ console.warn('invalid ws message',e.data); return; }
    if(!msg||!msg.type) return;
    if (msg.type === "init_state") {
    // 清空堆栈
    undoStack.length = 0;
    redoStack.length = 0;

    // msg.state 应该是一个 action 列表
    const stateList = msg.state || [];

    // 遍历 state，按类型恢复
    (async () => {
        for (const action of stateList) {
            if (!action || !action.type) continue;

            // 如果是 PDF 上传（含 base64 数据），优先解析并渲染 PDF
            if (action.type === 'pdf_upload') {
                try {
                    // 假设 action.data 是 base64 字符串
                    const arr = base64ToArrayBuffer(action.data);
                    await parsePDF(arr, false); // broadcast=false，避免循环发送
                } catch (err) {
                    console.error('init_state: parsePDF failed', err);
                }
                continue;
            }

            // 恢复 PDF 变换（缩放 / 平移 / 当前页）
            if (action.type === 'pdf_transform') {
                // 某些存储形式可能把参数放在 action.data 下，兼容两种写法
                const payload = action.data || action;
                scale = payload.scale ?? scale;
                offsetX = payload.offsetX ?? offsetX;
                offsetY = payload.offsetY ?? offsetY;
                currentPdfPage = payload.currentPdfPage ?? currentPdfPage;
                // 需要重新绘制 PDF 页面（如果 pdfDoc 已经就绪）
                if (pdfDoc) {
                    await drawPdfPage(currentPdfPage);
                }
                continue;
            }

            // 其余类型当作绘图/文本/clear/…恢复到 undoStack
            // 保持原有数据结构（服务器端保存的结构）
            undoStack.push(action);
        }

        // 最后一次性重绘（如果 parsePDF 已经画了 pdfCanvas，redrawCanvas 会把它带上）
        redrawCanvas();
    })();
    } else if(['path','erase','rect','circle','text','clear'].includes(msg.type)){ undoStack.push(msg); redrawCanvas(); }
    else if(msg.type==='pdf_upload'){ parsePDF(base64ToArrayBuffer(msg.data), false); }
    else if(msg.type==='pdf_transform'){ scale=msg.scale; offsetX=msg.offsetX; offsetY=msg.offsetY; currentPdfPage=msg.currentPdfPage; drawPdfPage(currentPdfPage);
    } else if (msg.type === "undo") {
        if (undoStack.length === 0) return;
        const action = undoStack.pop();
        redoStack.push(action);
        redrawCanvas();
    } else if (msg.type === "redo") {
        if (redoStack.length === 0) return;
        const action = redoStack.pop();
        undoStack.push(action);
        redrawCanvas();
    }
  };

  redrawCanvas();
});
