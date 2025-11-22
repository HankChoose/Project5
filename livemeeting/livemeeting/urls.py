#livemeeting/livemeeting/urls.py

from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from . import views  # 导入 index 视图

urlpatterns = [
    path('admin/', admin.site.urls),
    path('board/', include('board.urls')),  # 确保这里有 board.urls
    path('chat/', include('chat.urls')),
    path("users/", include("users.urls")),
    path("sharescreen/", include("sharescreen.urls")),
    path('', views.index, name='index'),  # 添加根路径 '/'
]

urlpatterns += static(settings.STATIC_URL, document_root=settings.STATICFILES_DIRS[0])
# 媒体文件（上传的视频、图片等）
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)