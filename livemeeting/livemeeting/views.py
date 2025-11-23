# livemeeting/livemeeting/views.py

from django.shortcuts import render, redirect
from django.contrib.auth.models import User
from django.contrib.auth import authenticate, login, logout
from django.contrib import messages

def index(request):
    redirect_url = "/board/"  # Fixed target page

    if request.method == "POST":
        action = request.POST.get("action")

        # Register
        if action == "register":
            username = request.POST.get("username")
            password = request.POST.get("password")
            confirm = request.POST.get("confirm")

            if password != confirm:
                messages.error(request, "Passwords do not match!")
                tab = "register"
            elif User.objects.filter(username=username).exists():
                messages.error(request, "Username already exists!")
                tab = "register"
            else:
                # Create user and auto-login
                user = User.objects.create_user(username=username, password=password)
                login(request, user)
                messages.success(request, f"Registration successful! Logged in as {username}.")
                return redirect(redirect_url)

        # Login
        elif action == "login":
            username = request.POST.get("username")
            password = request.POST.get("password")
            user = authenticate(request, username=username, password=password)
            if user:
                login(request, user)
                messages.success(request, f"Welcome {username}!")
                return redirect(redirect_url)
            else:
                messages.error(request, "Invalid username or password!")
                tab = "login"

    # Logout via GET parameter
    if request.GET.get("logout"):
        logout(request)
        messages.info(request, "Logged out successfully.")
        return redirect("index")

    return render(request, "index.html", {"tab": "login"})
