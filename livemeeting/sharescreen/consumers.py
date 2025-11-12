import json
from channels.generic.websocket import AsyncWebsocketConsumer

class ScreenConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.room_name = self.scope['url_route']['kwargs']['room_name']
        self.room_group_name = f'screen_{self.room_name}'

        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )

    # 接收浏览器发来的 WebRTC 信令
    async def receive(self, text_data):
        data = json.loads(text_data)
        # 广播给同房间的其他用户
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'signal_message',
                'message': data
            }
        )

    async def signal_message(self, event):
        await self.send(text_data=json.dumps(event['message']))
