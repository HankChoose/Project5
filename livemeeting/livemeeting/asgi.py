import os
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'livemeeting.settings')

django_asgi_app = get_asgi_application()

from chat import routing as chat_routing
from board import routing as board_routing
from sharescreen import routing as sharescreen_routing

application = ProtocolTypeRouter({
    "http": django_asgi_app,
    "websocket": AuthMiddlewareStack(
        URLRouter(
            chat_routing.websocket_urlpatterns +
            board_routing.websocket_urlpatterns +
            sharescreen_routing.websocket_urlpatterns
        )
    ),
})
