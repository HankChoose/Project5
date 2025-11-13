import json
from channels.generic.websocket import AsyncWebsocketConsumer

rooms = {}  # {room_name: {'owner': None or channel_name, 'viewers': set()}}

class ShareScreenConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.room_name = self.scope['url_route']['kwargs']['room_name']
        self.room_group_name = f"sharescreen_{self.room_name}"

        if self.room_name not in rooms:
            rooms[self.room_name] = {'owner': None, 'viewers': set()}

        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()

        # ---- 角色分配 ----
        if rooms[self.room_name]['owner'] is None:
            self.is_owner = True
            rooms[self.room_name]['owner'] = self.channel_name
            await self.send(json.dumps({'type': 'role', 'role': 'owner'}))
        else:
            self.is_owner = False
            rooms[self.room_name]['viewers'].add(self.channel_name)
            await self.send(json.dumps({'type': 'role', 'role': 'viewer'}))
            # 通知 owner，有新的 viewer 加入
            await self.channel_layer.send(
                rooms[self.room_name]['owner'],
                {
                    'type': 'new_viewer_joined',
                    'viewer': self.channel_name
                }
            )

    async def disconnect(self, close_code):
        if self.is_owner:
            # owner 离开，通知所有 viewer
            await self.channel_layer.group_send(
                self.room_group_name,
                {'type': 'owner_left'}
            )
            rooms[self.room_name]['owner'] = None
        else:
            if self.room_name in rooms:
                rooms[self.room_name]['viewers'].discard(self.channel_name)

        await self.channel_layer.group_discard(self.room_group_name, self.channel_name)

    async def receive(self, text_data):
        data = json.loads(text_data)
        msg_type = data.get('type')

        if msg_type == 'offer' and not self.is_owner:
            return  # viewer 不允许发 offer

        # 广播消息给同房间内其他成员
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'signal_message',
                'sender': self.channel_name,
                'message': data
            }
        )

    async def signal_message(self, event):
        # 只转发给别人
        if event['sender'] != self.channel_name:
            await self.send(text_data=json.dumps(event['message']))

    async def owner_left(self, event):
        await self.send(text_data=json.dumps({'type': 'owner_left'}))

    async def new_viewer_joined(self, event):
        # 通知 owner（自己）重新发送 offer
        if self.is_owner:
            await self.send(json.dumps({'type': 'new_viewer_joined'}))
