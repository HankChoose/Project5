import json
from channels.generic.websocket import AsyncWebsocketConsumer

rooms = {}  # {room_name: {'owner': None or channel_name}}

class ShareScreenConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.room_name = self.scope['url_route']['kwargs']['room_name']
        self.room_group_name = f"sharescreen_{self.room_name}"

        if self.room_name not in rooms:
            rooms[self.room_name] = {'owner': None}

        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()

        if rooms[self.room_name]['owner'] is None:
            self.is_owner = True
            rooms[self.room_name]['owner'] = self.channel_name
            await self.send(json.dumps({'type': 'role', 'role': 'owner'}))
        else:
            self.is_owner = False
            await self.send(json.dumps({'type': 'role', 'role': 'viewer'}))

    async def disconnect(self, close_code):
        if self.is_owner:
            rooms[self.room_name]['owner'] = None
            await self.channel_layer.group_send(
                self.room_group_name,
                {'type': 'owner_left'}
            )

        await self.channel_layer.group_discard(self.room_group_name, self.channel_name)

    async def receive(self, text_data):
        data = json.loads(text_data)
        msg_type = data.get('type')

        if msg_type == 'offer' and not self.is_owner:
            return  # viewer 不能发 offer

        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'signal_message',
                'sender': self.channel_name,
                'message': data
            }
        )

    async def signal_message(self, event):
        if event['sender'] != self.channel_name:
            await self.send(text_data=json.dumps(event['message']))

    async def owner_left(self, event):
        await self.send(text_data=json.dumps({'type': 'owner_left'}))
