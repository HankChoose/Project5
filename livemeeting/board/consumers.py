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

        # 发送初始化 state
        board_state = await self.get_board_state()
        await self.send(text_data=json.dumps({
            "type": "init_state",
            "state": board_state
        }))

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.group_name, self.channel_name)
        # 如果创建者退出，清空 Board
        # await self.clear_if_owner_exit()

    async def receive(self, text_data):
        data = json.loads(text_data)
        print("WS received:", data)  # 🟢 加这一行看看是否收到消息
        allowed_types = ["path","erase","rect","circle","text","clear",
                         "undo","redo","pdf_upload","pdf_transform"]
        if data.get("type") not in allowed_types:
            return

        # 广播消息给组内其他用户
        await self.channel_layer.group_send(
            self.group_name,
            {
                "type": "board.message",
                "message": data
            }
        )

       # 同步数据库
        if data["type"] in ["undo", "redo"]:
            await self.apply_undo_redo(data["type"])
        elif data["type"] == "clear":
            await self.apply_clear()
        else:
            await self.save_action_to_db(data)
            print("🟢 Calling save_action_to_db")

    async def board_message(self, event):
        await self.send(text_data=json.dumps(event["message"]))

    # ================= 数据库操作 =================
    @database_sync_to_async
    def get_board_state(self):
        board = Board.objects.get(id=self.board_id)
        return board.state or []

    @database_sync_to_async
    def save_action_to_db(self, action):
        board = Board.objects.get(id=self.board_id)
        print("🟢 Before append:", board.state)
        state = board.state or []
        state.append(action)
        board.state = state
        print("save_action_to_db board.state:", board.state)  # 🟢 加这一行看看是否收到消息
        board.save()
        print("🟢 After save:", Board.objects.get(id=self.board_id).state)

    @database_sync_to_async
    def apply_undo(self):
        board = Board.objects.get(id=self.board_id)
        state = board.state or []
        if state:
            state.pop()  # 移除最后一条
            board.state = state
            board.save()

    @database_sync_to_async
    def apply_redo(self):
        # redo 的操作无法在服务器端单独处理
        # redo 会由客户端重新 push 到数据库
        pass

    @database_sync_to_async
    def apply_clear(self):
        board = Board.objects.get(id=self.board_id)
        board.state = []
        board.save()

    @database_sync_to_async
    def clear_if_owner_exit(self):
        user = self.scope["user"]
        board = Board.objects.get(id=self.board_id)
        if user == board.created_by:
            board.state = []
            board.save()
