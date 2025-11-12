# chat/consumers.py

import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from .models import ChatRoom, Message

class ChatConsumer(AsyncWebsocketConsumer):

    async def connect(self):
        self.room_name = self.scope['url_route']['kwargs']['room_name']
        self.group_name = f"chat_{self.room_name}"

        # 加入组
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

        # 发送历史消息
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
        # 保存消息到数据库
        message_obj = await self.save_message(user, content)

        # 广播消息给组内所有人
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
        # 发送给当前客户端
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
        # 使用 select_related 避免 lazy load 导致 async 报错
        messages = room.messages.select_related('user').order_by('timestamp').all()
        # 转成 dict，方便 async context 发送
        return [
            {
                "user": msg.user.username if msg.user else "guest",
                "message": msg.content,
                "timestamp": msg.timestamp.strftime("%H:%M")
            }
            for msg in messages
        ]
