# consumers.py
import json
from channels.generic.websocket import AsyncWebsocketConsumer

rooms = {}  # {room_name: {'owner': channel_name, 'viewers': set(channel_name)}}

class ShareScreenConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.room_name = self.scope['url_route']['kwargs']['room_name']
        self.room_group_name = f"sharescreen_{self.room_name}"
        
        if self.is_owner:
            rooms[self.room_name]['owner'] = self.channel_name
            # 给已有 viewer 发送 offer
            for viewer in rooms[self.room_name]['viewers']:
                await self.channel_layer.send(self.channel_name, {
                    'type': 'new_viewer',
                    'viewer_id': viewer
                })

        if self.room_name not in rooms:
            rooms[self.room_name] = {'owner': None, 'viewers': set()}

        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()

        # 分配角色
        if rooms[self.room_name]['owner'] is None:
            self.is_owner = True
            rooms[self.room_name]['owner'] = self.channel_name
            await self.send(json.dumps({'type': 'role', 'role': 'owner'}))
        else:
            self.is_owner = False
            rooms[self.room_name]['viewers'].add(self.channel_name)
            await self.send(json.dumps({'type': 'role', 'role': 'viewer'}))
            # 通知 owner 新 viewer
            owner_channel = rooms[self.room_name]['owner']
            if owner_channel:
                await self.channel_layer.send(owner_channel, {
                    'type': 'new_viewer',
                    'viewer_id': self.channel_name
                })

    async def disconnect(self, close_code):
        if self.is_owner:
            # 清理房间
            rooms.pop(self.room_name, None)
            await self.channel_layer.group_send(
                self.room_group_name,
                {'type': 'owner_left'}
            )
        else:
            if self.room_name in rooms:
                rooms[self.room_name]['viewers'].discard(self.channel_name)
        await self.channel_layer.group_discard(self.room_group_name, self.channel_name)

    async def receive(self, text_data):
        data = json.loads(text_data)
        msg_type = data.get('type')
        target = data.get('target')

        # viewer 不允许发送 offer
        if msg_type == 'offer' and not self.is_owner:
            return

        # 转发消息
        if target:
            await self.channel_layer.send(target, {
                'type': 'signal_message',
                'message': data
            })
        else:
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'signal_message',
                    'sender': self.channel_name,
                    'message': data
                }
            )

    async def signal_message(self, event):
        if event.get('sender') != self.channel_name:
            await self.send(json.dumps(event['message']))

    async def owner_left(self, event):
        await self.send(json.dumps({'type': 'owner_left'}))

    async def new_viewer(self, event):
        await self.send(json.dumps({
            'type': 'new_viewer_joined',
            'viewer_id': event['viewer_id']
        }))
