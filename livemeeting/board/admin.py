#board/admin.py
from django.contrib import admin
from .models import Board, Node, Edge
admin.site.register(Board)
admin.site.register(Node)
admin.site.register(Edge)
