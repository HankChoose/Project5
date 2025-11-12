from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r'ws/sharescreen/(?P<room_name>\w+)/$', consumers.ScreenConsumer.as_asgi()),
]
