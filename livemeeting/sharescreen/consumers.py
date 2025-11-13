import json
from channels.generic.websocket import AsyncWebsocketConsumer

rooms = {}  # 存储房间状态：room_name -> host channel

class ShareScreenConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.room_name = self.scope["url_route"]["kwargs"]["room_name"]
        self.room_group_name = f"sharescreen_{self.room_name}"

        # 加入房间
        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()

        if self.room_name not in rooms:
            rooms[self.room_name] = self.channel_name
            await self.send(text_data=json.dumps({"type": "you-are-host"}))
        else:
            await self.send(text_data=json.dumps({"type": "host-exists"}))

    async def disconnect(self, close_code):
        if rooms.get(self.room_name) == self.channel_name:
            del rooms[self.room_name]
        await self.channel_layer.group_discard(self.room_group_name, self.channel_name)

    async def receive(self, text_data):
        data = json.loads(text_data)
        await self.channel_layer.group_send(
            self.room_group_name,
            {"type": "signal_message", "data": data, "sender": self.channel_name}
        )

    async def signal_message(self, event):
        if event['sender'] != self.channel_name:
            # 把 sender 注入到 message 里 (客户端会在 data.sender 或 data._sender 里看到)
            msg = event['message'].copy()
            msg['sender'] = event['sender']
            await self.send(json.dumps(msg))
