from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    # 匹配 ws/sharescreen/<room_name>/
    re_path(r'^ws/sharescreen/(?P<room_name>[-\w]+)/$', consumers.ShareScreenConsumer.as_asgi()),
]
