#sharescreen/urls.py

from django.urls import path
from . import views

urlpatterns = [
    path('room/<int:board_id>/', views.room, name='room'),
]