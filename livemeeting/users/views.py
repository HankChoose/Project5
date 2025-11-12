#users/views.py

from django.shortcuts import render, redirect
from django.contrib.auth.models import User 
from django.contrib import messages 
from django.contrib.auth import authenticate, login, logout
from board.models import Board  # 导入 Board 模型

# 注册视图
def register_view(request):
    if request.method == "POST" and request.POST.get("action") == "register":
        username = request.POST.get("username")
        password = request.POST.get("password")
        confirm = request.POST.get("confirm")

        if password != confirm:
            messages.error(request, "两次密码不一致！")
            return redirect("/")

        if User.objects.filter(username=username).exists():
            messages.error(request, "用户名已存在！")
            return redirect("/")

        User.objects.create_user(username=username, password=password)
        messages.success(request, "注册成功！请登录。")
        return redirect("/")

    return redirect("/")

# 登录视图
def login_view(request):
    if request.method == "POST" and request.POST.get("action") == "login":
        username = request.POST.get("username")
        password = request.POST.get("password")
        user = authenticate(request, username=username, password=password)
        if user is not None:
            login(request, user)
            messages.success(request, f"欢迎回来，{user.username}！")
            # 检查用户是否已有 Board，如果没有，则创建一个
            if not Board.objects.filter(created_by=user).exists():
                board = Board.objects.create(name=f"{user.username}'s Board", created_by=user)
                messages.success(request, "您的 Board 已自动创建！")
            return redirect("/")
        else:
            messages.error(request, "用户名或密码错误")
            return redirect("/")

    return redirect("/")

# 登出视图
def logout_view(request):
    logout(request)
    return redirect("/")
