#livemeeting/livemeeting/urls.py

from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from . import views 

urlpatterns = [
    path('admin/', admin.site.urls),
    path('board/', include('board.urls')),
    path('chat/', include('chat.urls')),
    path("users/", include("users.urls")),
    path("sharescreen/", include("sharescreen.urls")),
    path('', views.index, name='index'),
]

urlpatterns += static(settings.STATIC_URL, document_root=settings.STATICFILES_DIRS[0])
# Media files (uploaded videos, images, etc.)
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)