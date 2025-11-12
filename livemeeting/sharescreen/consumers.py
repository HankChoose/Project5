import json
from channels.generic.websocket import AsyncWebsocketConsumer
import uuid

class ShareScreenConsumer(AsyncWebsocketConsumer):
    users_in_room = {}  # 全局在线用户：user_id -> channel_name
    host_id = None
    host_channel = None

    async def connect(self):
        self.room_name = self.scope['url_route']['kwargs']['room_name']
        self.room_group_name = f'sharescreen_{self.room_name}'
        self.user_id = str(uuid.uuid4())
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )
        await self.accept()
        # 发送 user_id 给客户端
        await self.send(text_data=json.dumps({"type": "init", "user_id": self.user_id}))

    async def disconnect(self, close_code):
        # 移除在线用户
        if self.user_id in self.users_in_room:
            del self.users_in_room[self.user_id]
        if self.user_id == self.host_id:
            self.host_id = None
            self.host_channel = None
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )

    async def receive(self, text_data):
        data = json.loads(text_data)
        msg_type = data.get("type")

        if msg_type == "start_share":
            # 该用户成为 Host
            self.host_id = self.user_id
            self.host_channel = self.channel_name
            ShareScreenConsumer.host_id = self.host_id
            ShareScreenConsumer.host_channel = self.host_channel
            self.users_in_room[self.user_id] = self.channel_name
        elif msg_type == "join":
            # 新用户加入
            self.users_in_room[self.user_id] = self.channel_name
            # 通知 Host 有新用户
            if self.host_channel:
                await self.channel_layer.send(self.host_channel, {
                    "type": "new_user",
                    "new_user_id": self.user_id,
                    "new_user_channel": self.channel_name
                })
        elif msg_type in ("offer", "answer", "candidate"):
            # 普通信令广播给房间其他人
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    "type": "signal_message",
                    "message": data,
                    "sender_channel": self.channel_name
                }
            )

    async def signal_message(self, event):
        if self.channel_name != event["sender_channel"]:
            await self.send(text_data=json.dumps(event["message"]))

    async def new_user(self, event):
        # 通知 Host 前端创建 offer 给新用户
        await self.send(text_data=json.dumps({
            "type": "new_user",
            "new_user_id": event["new_user_id"]
        }))
