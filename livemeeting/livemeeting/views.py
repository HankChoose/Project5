#livemeeting/livemeeting/views.py

from django.shortcuts import render, redirect
from django.contrib.auth.models import User
from django.contrib.auth import authenticate, login, logout
from django.contrib import messages

def index(request):
    redirect_url = "/board/"  # 固定目标页面

    if request.method == "POST":
        action = request.POST.get("action")

        # 注册
        if action == "register":
            username = request.POST.get("username")
            password = request.POST.get("password")
            confirm = request.POST.get("confirm")

            if password != confirm:
                messages.error(request, "两次密码不一致！")
                tab = "register"
            elif User.objects.filter(username=username).exists():
                messages.error(request, "用户名已存在！")
                tab = "register"
            else:
                # 创建用户并自动登录
                user = User.objects.create_user(username=username, password=password)
                login(request, user)
                messages.success(request, f"注册成功，已自动登录，欢迎 {username}!")
                return redirect(redirect_url)

        # 登录
        elif action == "login":
            username = request.POST.get("username")
            password = request.POST.get("password")
            user = authenticate(request, username=username, password=password)
            if user:
                login(request, user)
                messages.success(request, f"欢迎 {username}!")
                return redirect(redirect_url)
            else:
                messages.error(request, "用户名或密码错误！")
                tab = "login"

    # 登出通过 GET 参数
    if request.GET.get("logout"):
        logout(request)
        messages.info(request, "已登出。")
        return redirect("index")

    return render(request, "index.html", {"tab": "login"})
