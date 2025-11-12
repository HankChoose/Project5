FROM python:3.11-slim

WORKDIR /app

# 安装系统依赖
RUN apt-get update && \
    apt-get install -y build-essential libpq-dev curl && \
    rm -rf /var/lib/apt/lists/*

# 拷贝依赖文件并安装 Python 包
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# 拷贝项目代码
COPY . /app/

# 暴露端口
EXPOSE 8000

# 默认启动命令：运行 Daphne（支持 WebSocket）
CMD ["daphne", "-b", "0.0.0.0", "-p", "8000", "livemeeting.asgi:application"]
