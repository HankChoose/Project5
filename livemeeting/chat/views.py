# chat/views.py

from django.shortcuts import render, get_object_or_404
from .models import ChatRoom

def chat_list(request):
    # Get all chat rooms
    rooms = ChatRoom.objects.all()
    return render(request, "chat/chat_list.html", {"rooms": rooms})

def chat_room(request, chat_id):
    # Enter a specific chat room
    room = get_object_or_404(ChatRoom, pk=chat_id)
    messages = room.messages.order_by('timestamp')  # Get chat history
    return render(request, "chat/chat_room.html", {"room": room, "messages": messages})
