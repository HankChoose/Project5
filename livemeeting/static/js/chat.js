//static/js/chat.js

document.addEventListener('DOMContentLoaded', () => {
  if (typeof ROOM_NAME === "undefined") return;

  const wsUrl = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/chat/${ROOM_NAME}/`;
  const socket = new WebSocket(wsUrl);

  const messages = document.getElementById('messages');
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('send-btn');

  // Receive message
  socket.onmessage = (e) => {
    const data = JSON.parse(e.data);
    const div = document.createElement('div');
    div.innerText = `[${data.timestamp || ''}] ${data.user || 'guest'}: ${data.message || ''}`;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;  // Automatic scrolling
  };

  // Send message
  function sendMessage() {
    const message = input.value.trim();
    if (!message) return;
    socket.send(JSON.stringify({ message }));
    input.value = '';
    input.focus();
  }

  sendBtn.addEventListener('click', sendMessage);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
});
