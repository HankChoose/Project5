from django.db import models
from django.conf import settings
from django.utils import timezone

User = settings.AUTH_USER_MODEL

class Board(models.Model):
    name = models.CharField(max_length=200)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)
    last_accessed = models.DateTimeField(auto_now=True)  # Automatically update timestamp
    users = models.ManyToManyField(settings.AUTH_USER_MODEL, related_name="boards", through='BoardUser', blank=True)

    # New field: store operations on the board
    state = models.JSONField(default=list, blank=True)

    # ✅ New field: record the user currently sharing screen
    current_sharescreen = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        null=True, 
        blank=True, 
        on_delete=models.SET_NULL,
        related_name="current_sharescreen_board"
    )

    current_sharevideo_user = models.ForeignKey(
        User,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="current_video_boards"
    )
    current_sharevideo_url = models.URLField(blank=True, null=True)

    def __str__(self):
        return self.name

    def clear_state(self):
        self.state = []
        self.save()
    
    # ✅ Add method here
    def get_authorized_user_ids(self):
        from .models import BoardUser  # Avoid circular import
        return BoardUser.objects.filter(board=self, is_authorized=True).values_list("user_id", flat=True)


class BoardUser(models.Model):
    board = models.ForeignKey(Board, on_delete=models.CASCADE)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    is_authorized = models.BooleanField(default=False)  # Whether the user has permission to operate this board
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


# Keep the existing BoardUserPermission model, and add some properties
class BoardUserPermission(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    board = models.ForeignKey(Board, on_delete=models.CASCADE)
    can_edit = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)  # Permission record creation time
    updated_at = models.DateTimeField(auto_now=True)     # Permission record update time

    def __str__(self):
        return f"{self.user.username} permission on {self.board.name}"

    class Meta:
        unique_together = ['user', 'board']  # Ensure a user can only have one record per board
