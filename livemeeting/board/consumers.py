import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from .models import Board

class BoardConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.board_id = self.scope['url_route']['kwargs']['board_id']
        self.group_name = f"board_{self.board_id}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        print(f"✅ 用户连接 WebSocket，加入 group: {self.group_name} | channel: {self.channel_name}")
        # 初始化状态
        board_state = await self.get_board_state()
        current_sharescreen = await self.get_current_sharescreen()  # ✅ 获取当前共享用户ID
        await self.send(text_data=json.dumps({
            "type": "init_state",
            "state": board_state,
            "current_sharescreen": current_sharescreen   # ✅ 加上这里
        }))

        current_sharevideo = await self.get_current_sharevideo()
        await self.send(text_data=json.dumps({
            "type": "init_state",
            "state": board_state,
            "current_sharescreen": current_sharescreen,
            "current_sharevideo": current_sharevideo  # 🔹 新增
        }))

    # ========== 用户加入在线列表 ==========
        user_id = self.scope["user"].id
        user_ids = await self.add_user(user_id)
        user_info = await self.get_user_info(user_ids)
        await self.channel_layer.group_send(
            self.group_name,
            {
                "type": "board.message",
                "message": {
                    "type": "user_list",
                    "users": user_info
                }
            }
        )

        # 2️⃣ 直接发送给自己，确保自己的绿点立即显示
        await self.send(text_data=json.dumps({
            "type": "user_list",
            "users": user_info
        }))


    async def disconnect(self, close_code):
        # 先移出 group
        await self.channel_layer.group_discard(self.group_name, self.channel_name)
        print(f"❌ 用户断开 WebSocket，离开 group: {self.group_name} | channel: {self.channel_name}")

        # 检查是否是当前共享屏幕的用户
        current_sharer = await self.get_current_sharescreen()
        user_id = self.scope["user"].id
        if current_sharer == user_id:
            # 清空数据库字段
            await self.clear_current_sharescreen()
            print(f"➡️ 用户 {user_id} 断开，清空 current_sharescreen")

            # 广播给组里的其他人：共享结束
            await self.channel_layer.group_send(
                self.group_name,
                {
                    "type": "board.message",
                    "message": {
                        "type": "stopsharescreen",
                        "board_id": self.board_id,
                    }
                }
            )

        # ========== 用户离开在线列表 ==========
        user_id = self.scope["user"].id
        user_ids = await self.remove_user(user_id)
        user_info = await self.get_user_info(user_ids)
        await self.channel_layer.group_send(
            self.group_name,
            {
                "type": "board.message",
                "message": {
                    "type": "user_list",
                    "users": user_info
                }
            }
        )
    async def receive(self, text_data):
        data = json.loads(text_data)
        allowed_types = ["path","erase","rect","circle","text","clear",
                         "undo","redo","pan", "sharescreen", "stopsharescreen", "share_video", "stop_share_video"]
        if data.get("type") not in allowed_types:
            return
        
        # ========= sharescreen：广播 and 存数据库 =========
        if data["type"] == "sharescreen":
            user_id = self.scope["user"].id
            # 保存到数据库
            await self.set_current_sharescreen(user_id)
            print(f"➡️ sharescreen 消息准备广播: {data}")
            await self.channel_layer.group_send(
                self.group_name,
                {
                    "type": "board.message",
                    "message": {
                        "type": "sharescreen",
                        "board_id": self.board_id,
                        "sender": user_id
                    }
                }
            )
            return
        
        # ========= share video =========
        if data["type"] == "share_video" and data.get("video_url"):
            user_id = self.scope["user"].id
            video_url = data["video_url"]
            await self.set_current_sharevideo(user_id, video_url)
            print(f"➡️ share_video 消息准备广播: {data}")
            await self.channel_layer.group_send(
                self.group_name,
                {
                    "type": "board.message",
                    "message": {
                        "type": "share_video",
                        "sender": user_id,
                        "video_url": video_url
                    }
                }
            )
            return
        # ========= stop share video =========
        if data["type"] == "stop_share_video":
            user_id = self.scope["user"].id
            await self.clear_current_sharevideo()
            await self.channel_layer.group_send(
                self.group_name,
                {
                    "type": "board.message",
                    "message": {"type": "stop_share_video","sender":user_id}
                }
            )
            return
        
        # ========= stop sharescreen =========
        if data["type"] == "stopsharescreen":
            await self.clear_current_sharescreen()
            await self.channel_layer.group_send(
                self.group_name,
                {
                    "type": "board.message",
                    "message":{
                        "type":"stopsharescreen",
                        "sender":user_id
                    }
                }
            )
            return
        
        # 广播消息给组内其他用户
        await self.channel_layer.group_send(
            self.group_name,
            {
                "type": "board.message",
                "message": data
            }
        )

        # 数据库同步
        if data["type"] in ["undo", "redo"]:
            action = data.get("action")
            await self.apply_undo_redo(data["type"], action)
        elif data["type"] == "clear":
            await self.apply_clear()
        elif data["type"] == "pan":
            await self.save_pan(data)
        else:
            await self.save_action_to_db(data)

    async def board_message(self, event):
        payload = {
            "type": "board.message",
            "message": event["message"]
        }
        print(f"📢 广播给 group {self.group_name}: {payload}")
        await self.send(text_data=json.dumps(payload))

    # ================= 数据库操作 =================
    @database_sync_to_async
    def get_board_state(self):
        board = Board.objects.get(id=self.board_id)
        return board.state or []

    @database_sync_to_async
    def save_action_to_db(self, action):
        board = Board.objects.get(id=self.board_id)
        state = board.state or []
        state.append(action)
        board.state = state
        board.save()

    @database_sync_to_async
    def save_pan(self, action):
        board = Board.objects.get(id=self.board_id)
        state = board.state or []
        # 移除旧 pan
        state = [a for a in state if a.get("type") != "pan"]
        state.append(action)
        board.state = state
        board.save()

    @database_sync_to_async
    def apply_clear(self):
        board = Board.objects.get(id=self.board_id)
        board.state = []
        board.save()

    async def apply_undo_redo(self, op_type, action=None):
        board = await database_sync_to_async(Board.objects.get)(id=self.board_id)
        state = board.state or []

        if op_type == "undo":
            if state:
                last_action = state.pop()
                board.state = state
                await database_sync_to_async(board.save)()
                return last_action

        elif op_type == "redo":
            if action:
                state.append(action)
                board.state = state
                await database_sync_to_async(board.save)()
                return action

    # ================= share screen 操作 =================        
    @database_sync_to_async
    def set_current_sharescreen(self, user_id):
        board = Board.objects.get(id=self.board_id)
        from django.contrib.auth import get_user_model
        User = get_user_model()
        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            user = None
        board.current_sharescreen = user
        board.save()
        return user.id if user else None

    @database_sync_to_async
    def get_current_sharescreen(self):
        board = Board.objects.get(id=self.board_id)
        return board.current_sharescreen.id if board.current_sharescreen else None
    
    @database_sync_to_async
    def clear_current_sharescreen(self):
        board = Board.objects.get(id=self.board_id)
        board.current_sharescreen = None
        board.save()

    # ================= share video 数据库操作 =================
    @database_sync_to_async
    def set_current_sharevideo(self, user_id, video_url):
        board = Board.objects.get(id=self.board_id)
        from django.contrib.auth import get_user_model
        User = get_user_model()
        try:
            board.current_sharevideo_user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            board.current_sharevideo_user = None
        board.current_sharevideo_url = video_url
        board.save()

    @database_sync_to_async
    def get_current_sharevideo(self):
        board = Board.objects.get(id=self.board_id)
        if board.current_sharevideo_user:
            return {"user_id": board.current_sharevideo_user.id, "video_url": board.current_sharevideo_url}
        return None

    @database_sync_to_async
    def clear_current_sharevideo(self):
        board = Board.objects.get(id=self.board_id)
        board.current_sharevideo_user = None
        board.current_sharevideo_url = None
        board.save()

    @database_sync_to_async
    def get_current_sharevideo(self):
        board = Board.objects.get(id=self.board_id)
        if board.current_sharevideo_user and board.current_sharevideo_url:
            return {
                "user_id": board.current_sharevideo_user.id,
                "video_url": board.current_sharevideo_url
            }
        return None

    # ========== 在线用户管理（全局字典） ==========
    ONLINE_USERS = {}  # board_id → set(user_ids)

    @classmethod
    def _board_key(cls, board_id):
        return f"board_{board_id}"

    @database_sync_to_async
    def add_user(self, user_id):
        key = self._board_key(self.board_id)
        if key not in self.ONLINE_USERS:
            self.ONLINE_USERS[key] = set()
        self.ONLINE_USERS[key].add(user_id)
        return list(self.ONLINE_USERS[key])

    @database_sync_to_async
    def remove_user(self, user_id):
        key = self._board_key(self.board_id)
        if key in self.ONLINE_USERS and user_id in self.ONLINE_USERS[key]:
            self.ONLINE_USERS[key].remove(user_id)
        return list(self.ONLINE_USERS[key])

    @database_sync_to_async
    def get_users(self):
        key = self._board_key(self.board_id)
        return list(self.ONLINE_USERS.get(key, set()))
    
    @database_sync_to_async
    def get_user_info(self, user_ids):
        from django.contrib.auth import get_user_model
        User = get_user_model()
        users = User.objects.filter(id__in=user_ids)
        return [{"id": u.id, "username": u.username} for u in users]
