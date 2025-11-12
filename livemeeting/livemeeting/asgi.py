# livemeeting/livemeeting/asgi.py

import os
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'livemeeting.settings')

django_asgi_app = get_asgi_application()

# 导入各 app 的 routing
import chat.routing
import board.routing
from sharescreen.routing import websocket_urlpatterns as sharescreen_routing

application = ProtocolTypeRouter({
    "http": django_asgi_app,
    "websocket": AuthMiddlewareStack(
        URLRouter(
            chat.routing.websocket_urlpatterns +
            board.routing.websocket_urlpatterns +
            sharescreen_routing    # <- 新增 sharescreen
        )
    ),
})
