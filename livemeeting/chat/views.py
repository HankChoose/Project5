#chat/views.py

from django.shortcuts import render, get_object_or_404
from .models import ChatRoom

def chat_list(request):
    # 获取所有聊天房间
    rooms = ChatRoom.objects.all()
    return render(request, "chat/chat_list.html", {"rooms": rooms})

def chat_room(request, chat_id):
    # 进入某个聊天房间
    room = get_object_or_404(ChatRoom, pk=chat_id)
    messages = room.messages.order_by('timestamp')  # 获取历史消息
    return render(request, "chat/chat_room.html", {"room": room, "messages": messages})
