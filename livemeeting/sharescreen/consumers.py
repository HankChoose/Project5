import json
from channels.generic.websocket import AsyncWebsocketConsumer

class SharescreenConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.room_name = self.scope['url_route']['kwargs']['room_name']
        self.room_group_name = f'sharescreen_{self.room_name}'

        # 加入房间组
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )

        await self.accept()

    async def disconnect(self, close_code):
        # 离开房间组
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )

    # 接收 WebSocket 消息
    async def receive(self, text_data):
        data = json.loads(text_data)
        # 广播给房间里的其他用户
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'signal_message',
                'message': data,
                'sender_channel': self.channel_name
            }
        )

    # 广播消息给组
    async def signal_message(self, event):
        # 不发给自己
        if event['sender_channel'] == self.channel_name:
            return
        await self.send(text_data=json.dumps(event['message']))
