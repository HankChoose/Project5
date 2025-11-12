import json
from channels.generic.websocket import AsyncWebsocketConsumer

class ShareScreenConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.room_name = self.scope['url_route']['kwargs']['room_name']
        self.room_group_name = f'sharescreen_{self.room_name}'

        # 加入房间组
        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.room_group_name, self.channel_name)

    # 接收来自客户端的消息并广播
    async def receive(self, text_data):
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'broadcast_message',
                'message': text_data,
            }
        )

    # 向客户端广播消息
    async def broadcast_message(self, event):
        message = event['message']
        await self.send(text_data=message)
