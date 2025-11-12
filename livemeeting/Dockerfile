# --------------------------
# Stage 1: Build / Install dependencies
# --------------------------
FROM python:3.11-slim

# 设置工作目录
WORKDIR /app

# 安装系统依赖
RUN apt-get update && \
    apt-get install -y build-essential libpq-dev curl && \
    rm -rf /var/lib/apt/lists/*

# 拷贝依赖文件
COPY requirements.txt /app/

# 安装 Python 依赖
RUN pip install --no-cache-dir -r requirements.txt

# 拷贝整个项目
COPY . /app/

# Django 收集静态文件
RUN python manage.py collectstatic --noinput

# 暴露端口
EXPOSE 8000

# 默认启动命令：运行 Daphne（支持 WebSocket）
CMD ["daphne", "-b", "0.0.0.0", "-p", "8000", "livemeeting.asgi:application"]
