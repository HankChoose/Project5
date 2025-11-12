# board/urls.py

from django.urls import path
from . import views

from django.urls import path
from . import views

urlpatterns = [
    path("", views.board_room, name="board_room"),  # 默认进入自己的 Board
    path("<int:board_id>/", views.board_room, name="board_room_with_id"),  # 根据 board_id 访问指定 Board
    path("<int:board_id>/grant_permission/<int:user_id>/", views.grant_permission, name="grant_permission"),  # 授权用户
    path("<int:board_id>/revoke_permission/<int:user_id>/", views.revoke_permission, name="revoke_permission"),  # 撤销权限
    path('user_list/', views.user_list, name='user_list'),
    path('check_permissions/<int:board_id>/', views.check_permissions, name='check_permissions'),
]
