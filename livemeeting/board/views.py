# board/views.py
from django.shortcuts import render, get_object_or_404, redirect
from .models import Board
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.contrib import messages
from django.contrib.auth.models import User

# 显示所有可访问的 Boards
def boards_list(request):
    boards = Board.objects.all()
    return render(request, "board/boards_list.html", {"boards": boards})

from django.shortcuts import render, get_object_or_404
from .models import Board

from django.shortcuts import render, get_object_or_404
from .models import Board, BoardUser

from board.models import Board, BoardUserPermission

@login_required
def check_permissions(request, board_id):
    user = request.user
    print(f"Checking permissions for user: {user.username} on board: {board_id}")
    
    # 直接通过 BoardUser 表查询用户权限
    try:
        board_user = BoardUser.objects.get(board_id=board_id, user=user)
        print(f"Permission found: is_authorized={board_user.is_authorized}")
        return JsonResponse({
            'can_edit': board_user.is_authorized  # 直接返回 is_authorized 字段
        })
    except BoardUser.DoesNotExist:
        print(f"No permission found for user: {user.username} on board: {board_id}")
        return JsonResponse({
            'can_edit': False
        })


@login_required
def board_room(request, board_id=None):
    user = request.user
    boards = Board.objects.all()

    # 创建一个包含有权限进入的 board 的 ID 列表
    boards_with_access = [board.id for board in boards if board.users.filter(id=user.id).exists()]

    # 获取当前的 board
    if board_id:
        board = get_object_or_404(Board, id=board_id)
    else:
        board = Board.objects.filter(created_by=user).first()
        if not board:
            board = Board.objects.create(name=f"{user.username}'s Board", created_by=user)

    # 自动将当前用户加入到 Board 的 users 列表中（如果不在其中）
    if user not in board.users.all():
        board.users.add(user)
        board.save()

    print(f"Users for board {board.name}: {[user.username for user in board.users.all()]}")

    # 用户是否有操作权限
    user_has_permission = BoardUser.objects.filter(
        board=board, user=user, is_authorized=True
    ).exists()

    # 🔵 新增：获取当前 Board 所有已授权用户 ID 列表
    authorized_users = list(board.get_authorized_user_ids())

    return render(request, "board/board_room.html", {
        "board": board,
        "boards": boards,
        "user_has_permission": user_has_permission,
        "boards_with_access": boards_with_access,
        "is_host": user == board.created_by,
        "authorized_users": authorized_users,  # 🔵 传给模板
    })



# 处理权限控制，允许 Board 主人给用户授权操作
@login_required
def grant_permission(request, board_id, user_id):
    board = get_object_or_404(Board, id=board_id)
    user = get_object_or_404(User, id=user_id)

    # 只有 Board 主人才有权限授予操作权限
    if request.user == board.created_by:
        # 确保用户没有被授权操作
        board_user, created = BoardUser.objects.get_or_create(board=board, user=user)
        board_user.is_authorized = True
        board_user.save()

        # 撤销其他用户的授权（每次只能有一个用户被授权操作）
        BoardUser.objects.filter(board=board).exclude(user=user).update(is_authorized=False)

        messages.success(request, f"已授权 {user.username} 操作权限。")
    else:
        messages.error(request, "你没有权限授权用户。")

    return redirect("board_room_with_id", board_id=board.id)


# 撤销权限，Board 主人可以撤销用户操作权限
@login_required
def revoke_permission(request, board_id, user_id):
    board = get_object_or_404(Board, id=board_id)
    user = get_object_or_404(User, id=user_id)

    # 只有 Board 主人才有权限撤销授权
    if request.user == board.created_by:
        # 先获取用户授权状态
        try:
            board_user = BoardUser.objects.get(board=board, user=user)
            board_user.is_authorized = False  # 撤销授权
            board_user.save()

            messages.success(request, f"已撤销 {user.username} 的操作权限。")
        except BoardUser.DoesNotExist:
            messages.error(request, f"{user.username} 没有被授权。")
    else:
        messages.error(request, "你没有权限撤销用户操作权限。")

    return redirect("board_room_with_id", board_id=board.id)



# 新的视图：列出所有用户信息
def user_list(request):
    users = User.objects.all()  # 获取所有用户
    return render(request, "board/test.html", {"users": users})

import os
import uuid
from pathlib import Path
from django.views.decorators.csrf import csrf_exempt
from django.conf import settings

TEMP_VIDEO_DIR = Path(settings.MEDIA_ROOT) / "temp_videos"
TEMP_VIDEO_DIR.mkdir(exist_ok=True, parents=True)  # 确保目录存在


@csrf_exempt
def upload_temp_video(request):
    if request.method != "POST":
        return JsonResponse({"error": "Only POST allowed"}, status=405)

    file = request.FILES.get("video")
    if not file:
        return JsonResponse({"error": "No file uploaded"}, status=400)

    # 用 UUID 生成唯一文件名，保留后缀
    ext = os.path.splitext(file.name)[1]
    filename = f"{uuid.uuid4().hex}{ext}"
    save_path = TEMP_VIDEO_DIR / filename

    with open(save_path, "wb+") as f:
        for chunk in file.chunks():
            f.write(chunk)

    video_url = f"{settings.MEDIA_URL}temp_videos/{filename}"
    return JsonResponse({"video_url": video_url})
 