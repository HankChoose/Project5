#board/signals.py

from django.db.models.signals import post_save
from django.dispatch import receiver
from django.contrib.auth.models import User
from .models import Board

@receiver(post_save, sender=User)
def create_board_on_login(sender, instance, created, **kwargs):
    """每次用户登录时检查并创建默认的 Board"""
    if not Board.objects.filter(created_by=instance).exists():
        # 如果用户没有 Board，则创建一个新的 Board
        Board.objects.create(
            name=f"{instance.username}'s Default Board",
            created_by=instance,
            max_boards=1  # 每个用户最多一个 Board
        )
