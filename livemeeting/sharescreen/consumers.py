import json
from channels.generic.websocket import AsyncWebsocketConsumer

rooms = {}  # {room_name: {'owner': channel_name, 'viewers': set()}}

class ShareScreenConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.room_name = self.scope['url_route']['kwargs']['room_name']
        self.room_group_name = f"sharescreen_{self.room_name}"

        # 创建房间字典
        if self.room_name not in rooms:
            rooms[self.room_name] = {'owner': None, 'viewers': set()}

        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()

        # 记录自己身份
        if rooms[self.room_name]['owner'] is None:
            self.is_owner = True
            rooms[self.room_name]['owner'] = self.channel_name
            await self.send(json.dumps({'type': 'role', 'role': 'owner'}))
        else:
            self.is_owner = False
            rooms[self.room_name]['viewers'].add(self.channel_name)
            await self.send(json.dumps({'type': 'role', 'role': 'viewer'}))

    async def disconnect(self, close_code):
        if self.is_owner:
            rooms[self.room_name]['owner'] = None
            # 通知观看者共享者离开
            for viewer in rooms[self.room_name]['viewers']:
                await self.channel_layer.send(viewer, {
                    'type': 'owner_left'
                })
            rooms[self.room_name]['viewers'].clear()
        else:
            rooms[self.room_name]['viewers'].discard(self.channel_name)

        await self.channel_layer.group_discard(self.room_group_name, self.channel_name)

    async def receive(self, text_data):
        data = json.loads(text_data)
        msg_type = data.get('type')

        if self.is_owner:
            # owner 发出的消息转发给所有 viewers
            for viewer in rooms[self.room_name]['viewers']:
                await self.channel_layer.send(viewer, {
                    'type': 'signal_message',
                    'message': data
                })
        else:
            # viewer 发给 owner
            owner = rooms[self.room_name]['owner']
            if owner:
                await self.channel_layer.send(owner, {
                    'type': 'signal_message',
                    'message': data
                })

    async def signal_message(self, event):
        await self.send(text_data=json.dumps(event['message']))

    async def owner_left(self, event):
        await self.send(text_data=json.dumps({'type': 'owner_left'}))
