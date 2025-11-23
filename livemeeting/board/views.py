# board/views.py
from django.shortcuts import render, get_object_or_404, redirect
from .models import Board
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.contrib import messages
from django.contrib.auth.models import User

# Display all accessible Boards
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
    #print(f"Checking permissions for user: {user.username} on board: {board_id}")
    
    # Query user permission directly via BoardUser table
    try:
        board_user = BoardUser.objects.get(board_id=board_id, user=user)
        #print(f"Permission found: is_authorized={board_user.is_authorized}")
        return JsonResponse({
            'can_edit': board_user.is_authorized  # Return is_authorized field directly
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

    # Create a list of board IDs the user has access to
    boards_with_access = [board.id for board in boards if board.users.filter(id=user.id).exists()]

    # Get current board
    if board_id:
        board = get_object_or_404(Board, id=board_id)
    else:
        board = Board.objects.filter(created_by=user).first()
        if not board:
            board = Board.objects.create(name=f"{user.username}'s Board", created_by=user)

    # Automatically add current user to Board's users list (if not already)
    if user not in board.users.all():
        board.users.add(user)
        board.save()

    print(f"Users for board {board.name}: {[user.username for user in board.users.all()]}")

    # Check if user has permission to operate
    user_has_permission = BoardUser.objects.filter(
        board=board, user=user, is_authorized=True
    ).exists()

    # 🔵 New: get list of all authorized user IDs for current Board
    authorized_users = list(board.get_authorized_user_ids())

    return render(request, "board/board_room.html", {
        "board": board,
        "boards": boards,
        "user_has_permission": user_has_permission,
        "boards_with_access": boards_with_access,
        "is_host": user == board.created_by,
        "authorized_users": authorized_users,  # 🔵 Pass to template
    })


# Handle permission control, allow Board owner to grant operation permission to user
@login_required
def grant_permission(request, board_id, user_id):
    board = get_object_or_404(Board, id=board_id)
    user = get_object_or_404(User, id=user_id)

    # Only Board owner can grant permission
    if request.user == board.created_by:
        # Ensure user is not already authorized
        board_user, created = BoardUser.objects.get_or_create(board=board, user=user)
        board_user.is_authorized = True
        board_user.save()

        # Revoke authorization for other users (only one user authorized at a time)
        BoardUser.objects.filter(board=board).exclude(user=user).update(is_authorized=False)

        messages.success(request, f"{user.username} has been granted operation permission.")
    else:
        messages.error(request, "You do not have permission to grant users.")

    return redirect("board_room_with_id", board_id=board.id)


# Revoke permission, Board owner can revoke user's operation permission
@login_required
def revoke_permission(request, board_id, user_id):
    board = get_object_or_404(Board, id=board_id)
    user = get_object_or_404(User, id=user_id)

    # Only Board owner can revoke authorization
    if request.user == board.created_by:
        # Get user's authorization status
        try:
            board_user = BoardUser.objects.get(board=board, user=user)
            board_user.is_authorized = False  # Revoke permission
            board_user.save()

            messages.success(request, f"Operation permission for {user.username} has been revoked.")
        except BoardUser.DoesNotExist:
            messages.error(request, f"{user.username} was not authorized.")
    else:
        messages.error(request, "You do not have permission to revoke user permission.")

    return redirect("board_room_with_id", board_id=board.id)


# New view: list all users
def user_list(request):
    users = User.objects.all()  # Get all users
    return render(request, "board/test.html", {"users": users})

import os
import uuid
from pathlib import Path
from django.views.decorators.csrf import csrf_exempt
from django.conf import settings

TEMP_VIDEO_DIR = Path(settings.MEDIA_ROOT) / "temp_videos"
TEMP_VIDEO_DIR.mkdir(exist_ok=True, parents=True)  # Ensure directory exists


@csrf_exempt
def upload_temp_video(request):
    if request.method != "POST":
        return JsonResponse({"error": "Only POST allowed"}, status=405)

    file = request.FILES.get("video")
    if not file:
        return JsonResponse({"error": "No file uploaded"}, status=400)

    # Generate unique filename using UUID, keep extension
    ext = os.path.splitext(file.name)[1]
    filename = f"{uuid.uuid4().hex}{ext}"
    save_path = TEMP_VIDEO_DIR / filename

    with open(save_path, "wb+") as f:
        for chunk in file.chunks():
            f.write(chunk)

    video_url = f"{settings.MEDIA_URL}temp_videos/{filename}"
    return JsonResponse({"video_url": video_url})
