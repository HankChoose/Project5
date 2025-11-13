import json
from channels.generic.websocket import AsyncWebsocketConsumer

# rooms 结构:
# rooms = {
#   room_name: {
#       'owner': <channel_name> or None,
#       'viewers': set(<channel_name>, ...)
#   }
# }
rooms = {}

class ShareScreenConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.room_name = self.scope['url_route']['kwargs']['room_name']
        self.room_group_name = f"sharescreen_{self.room_name}"

        # 初始化房间字典
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

            # 通知 owner 有新 viewer（发到 owner 的 channel）
            owner_channel = rooms[self.room_name].get('owner')
            if owner_channel:
                # 通过 channel_layer.send 直接发给 owner（owner 的 consumer 会处理 new_viewer）
                await self.channel_layer.send(owner_channel, {
                    'type': 'new_viewer',
                    'viewer_id': self.channel_name
                })

    async def disconnect(self, close_code):
        # 安全地获取房间
        room = rooms.get(self.room_name)
        if not room:
            return

        if getattr(self, "is_owner", False):
            # owner 离开 -> 通知所有 viewer，并清空房间
            room['owner'] = None
            await self.channel_layer.group_send(self.room_group_name, {'type': 'owner_left'})
            room['viewers'].clear()
        else:
            # viewer 离开 -> 从集合移除
            room['viewers'].discard(self.channel_name)

        # 如果房间没有任何人了，删除房间记录
        if room.get('owner') is None and not room.get('viewers'):
            rooms.pop(self.room_name, None)

        await self.channel_layer.group_discard(self.room_group_name, self.channel_name)

    async def receive(self, text_data):
        """
        接收前端信令消息，格式为 JSON，示例：
        { type: 'offer'|'answer'|'candidate', offer:..., answer:..., candidate:..., target: '<channel_name>' }
        我们会把 sender (当前 channel_name) 插入到 message 中，方便接收方知道来源。
        """
        data = json.loads(text_data)
        # 把发送者 channel 加入 data，方便接收端知道是谁发来的
        data['sender'] = self.channel_name
        msg_type = data.get('type')
        target = data.get('target')  # 可选: 指定 channel_name

        # viewer 不允许发 offer（你之前要求只有 owner 能发 offer）
        if msg_type == 'offer' and not getattr(self, "is_owner", False):
            return

        # 指定发送（点对点）
        if target:
            # 发送到指定 channel（target 必须是 channel_name）
            await self.channel_layer.send(target, {
                'type': 'signal_message',
                'message': data,
                'sender': self.channel_name
            })
        else:
            # 广播给组（除了自己），用于 owner 的 offer 广播或 candidate 广播等
            await self.channel_layer.group_send(self.room_group_name, {
                'type': 'signal_message',
                'message': data,
                'sender': self.channel_name
            })

    # group_send / channel_layer.send 会调用这里（type='signal_message'）
    async def signal_message(self, event):
        # event 包含 'message' 和 'sender'
        # 只把 message 发给不是自己的人（防止回回自身）
        sender = event.get('sender')
        if sender == self.channel_name:
            return
        message = event.get('message') or {}
        await self.send(json.dumps(message))

    async def owner_left(self, event):
        # 通知 viewer owner 离开
        await self.send(json.dumps({'type': 'owner_left'}))

    async def new_viewer(self, event):
        # 这个方法会在 owner 的连接端被调用到（channel_layer.send -> this consumer）
        # 将 new_viewer_joined 事件发给 owner 前端
        await self.send(json.dumps({
            'type': 'new_viewer_joined',
            'viewer_id': event.get('viewer_id')
        }))
