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

        # 初始化状态
        board_state = await self.get_board_state()
        await self.send(text_data=json.dumps({
            "type": "init_state",
            "state": board_state
        }))

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive(self, text_data):
        data = json.loads(text_data)
        allowed_types = ["path","erase","rect","circle","text","clear",
                         "undo","redo","pan"]
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
        await self.send(text_data=json.dumps(event["message"]))

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
