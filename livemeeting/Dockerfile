FROM python:3.11-slim

WORKDIR /app

# 安装系统依赖
RUN apt-get update && \
    apt-get install -y build-essential libpq-dev curl && \
    rm -rf /var/lib/apt/lists/*

# 拷贝依赖文件并安装 Python 依赖
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# 拷贝整个项目
COPY . /app/

# 生产环境收集静态文件
RUN python manage.py collectstatic --noinput

EXPOSE 8000

# 默认启动命令（Daphne 支持 WebSocket）
CMD ["daphne", "-b", "0.0.0.0", "-p", "8000", "livemeeting.asgi:application"]
