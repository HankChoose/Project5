# board/urls.py

from django.urls import path
from . import views

from django.urls import path
from . import views

urlpatterns = [
    path("", views.board_room, name="board_room"),
    path("<int:board_id>/", views.board_room, name="board_room_with_id"),
    path("<int:board_id>/grant_permission/<int:user_id>/", views.grant_permission, name="grant_permission"),
    path("<int:board_id>/revoke_permission/<int:user_id>/", views.revoke_permission, name="revoke_permission"),
    path('user_list/', views.user_list, name='user_list'),
    path('check_permissions/<int:board_id>/', views.check_permissions, name='check_permissions'),
    path("upload_temp_video/", views.upload_temp_video, name="upload_temp_video"),
]
