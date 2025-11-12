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
            # 如果用户没有创建任何 Board，则创建一个新的 Board
            board = Board.objects.create(name=f"{user.username}'s Board", created_by=user)

    # 自动将当前用户加入到 Board 的 users 列表中（如果不在其中）
    if user not in board.users.all():
        board.users.add(user)
        board.save()

    # 确保我们可以看到 board 的用户
    print(f"Users for board {board.name}: {[user.username for user in board.users.all()]}")
    
    # 添加检查用户是否有权限操作
    user_has_permission = BoardUser.objects.filter(board=board, user=user, is_authorized=True).exists()

    return render(request, "board/board_room.html", {
        "board": board,
        "boards": boards,
        "user_has_permission": user_has_permission,
        "boards_with_access": boards_with_access,  # 传递给模板
        "is_host": user == board.created_by,  # 标识是否是 Board 主人
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

