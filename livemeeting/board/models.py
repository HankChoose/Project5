from django.db import models
from django.conf import settings
from django.utils import timezone

User = settings.AUTH_USER_MODEL

class Board(models.Model):
    name = models.CharField(max_length=200)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)
    last_accessed = models.DateTimeField(auto_now=True)  # 自动更新时间
    users = models.ManyToManyField(settings.AUTH_USER_MODEL, related_name="boards", through='BoardUser', blank=True)

    # 新增字段：保存 board 上的操作记录
    state = models.JSONField(default=list, blank=True)

    def __str__(self):
        return self.name

    def clear_state(self):
        self.state = []
        self.save()


class BoardUser(models.Model):
    board = models.ForeignKey(Board, on_delete=models.CASCADE)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    is_authorized = models.BooleanField(default=False)  # 用户是否有权限操作该白板
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ['board', 'user']

    def __str__(self):
        return f"{self.user.username} - {self.board.name}"


class Node(models.Model):
    board = models.ForeignKey(Board, related_name="nodes", on_delete=models.CASCADE)
    x = models.FloatField()
    y = models.FloatField()
    text = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class Edge(models.Model):
    board = models.ForeignKey(Board, related_name="edges", on_delete=models.CASCADE)
    from_node = models.ForeignKey(Node, on_delete=models.CASCADE, related_name="edges_from")
    to_node = models.ForeignKey(Node, on_delete=models.CASCADE, related_name="edges_to")
    created_at = models.DateTimeField(auto_now_add=True)

# 保留现有的 BoardUserPermission 模型，并且新增一些属性
class BoardUserPermission(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    board = models.ForeignKey(Board, on_delete=models.CASCADE)
    can_edit = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)  # 权限记录的创建时间
    updated_at = models.DateTimeField(auto_now=True)     # 权限更新的时间

    def __str__(self):
        return f"{self.user.username} permission on {self.board.name}"

    class Meta:
        unique_together = ['user', 'board']  # 确保一个用户在同一个Board上只能有一条记录
