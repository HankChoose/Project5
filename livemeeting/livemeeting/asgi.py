#livemeeting/livemeeting/asgi.py

import os
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'livemeeting.settings')

django_asgi_app = get_asgi_application()

# sharescreen/routing.py
from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r'ws/sharescreen/(?P<room_name>\w+)/$', consumers.ShareScreenConsumer.as_asgi()),
]
