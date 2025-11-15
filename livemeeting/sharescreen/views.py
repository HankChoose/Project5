#sharescreen/views.py

from django.shortcuts import render

from django.shortcuts import render

def room(request, board_id):
    room_name = f"board_{board_id}"
    return render(request, 'sharescreen/room.html', {
        'room_name': room_name
    })
