from django.urls import path
from . import views

urlpatterns = [
    path('room/<str:room_name>/', views.room, name='sharescreen-room'),
    path('video/<str:room_name>/', views.video, name='sharescreen-video'),  # 新增
]
