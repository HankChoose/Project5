from django.shortcuts import render

def room(request, room_name):
    return render(request, "sharescreen/room.html", {"room_name": room_name})

def video(request, room_name):
    return render(request, "sharescreen/video.html", {"room_name": room_name})  # 新增
