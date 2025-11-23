# chat/consumers.py

import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from .models import ChatRoom, Message

class ChatConsumer(AsyncWebsocketConsumer):

    async def connect(self):
        self.room_name = self.scope['url_route']['kwargs']['room_name']
        self.group_name = f"chat_{self.room_name}"

        # Join group
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

        # Send chat history
        messages = await self.get_history()
        for msg in messages:
            await self.send(text_data=json.dumps(msg))

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive(self, text_data):
        data = json.loads(text_data)
        content = data.get('message')
        if not content:
            return

        user = self.scope['user']
        # Save message to database
        message_obj = await self.save_message(user, content)

        # Broadcast message to all users in the group
        await self.channel_layer.group_send(
            self.group_name,
            {
                "type": "chat.message",
                "user": user.username if user.is_authenticated else "guest",
                "message": content,
                "timestamp": message_obj.timestamp.strftime("%H:%M")
            }
        )

    async def chat_message(self, event):
        # Send to current client
        await self.send(text_data=json.dumps({
            "user": event["user"],
            "message": event["message"],
            "timestamp": event["timestamp"]
        }))

    @database_sync_to_async
    def save_message(self, user, content):
        room, _ = ChatRoom.objects.get_or_create(name=self.room_name)
        return Message.objects.create(
            room=room,
            user=user if user.is_authenticated else None,
            content=content
        )

    @database_sync_to_async
    def get_history(self):
        room, _ = ChatRoom.objects.get_or_create(name=self.room_name)
        # Use select_related to avoid lazy load causing async errors
        messages = room.messages.select_related('user').order_by('timestamp').all()
        # Convert to dict for sending in async context
        return [
            {
                "user": msg.user.username if msg.user else "guest",
                "message": msg.content,
                "timestamp": msg.timestamp.strftime("%H:%M")
            }
            for msg in messages
        ]
