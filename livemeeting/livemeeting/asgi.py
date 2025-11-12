import os
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'livemeeting.settings')

django_asgi_app = get_asgi_application()

import chat.routing
import board.routing
import sharescreen.routing  # 新增

application = ProtocolTypeRouter({
    "http": django_asgi_app,
    "websocket": AuthMiddlewareStack(
        URLRouter(
            chat.routing.websocket_urlpatterns +
            board.routing.websocket_urlpatterns +
            sharescreen.routing.websocket_urlpatterns
        )
    ),
})
