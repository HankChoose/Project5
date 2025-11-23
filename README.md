# LiveMeeting: Collaborative Whiteboard, Chat, and Screen & Video Sharing Application

LiveMeeting is a Django-based web application that allows users to collaborate on whiteboards in real-time, chat, share screens or video during meetings. It is fully responsive and supports mobile devices.

## Core Features

- User registration and login
- Create and join collaborative whiteboard rooms
- Multi-user Permissions and Status: 
    - Room owners can grant or revoke access for participants
    - Participants’ abilities (draw, edit, view, share screen, or share video) are controlled via the toolbar
    - Join or leave the room in real time
- Draw, rectangle, circle, etc., move on a whiteboard
- Real-time group chat
- Whiteboard and chat history persistence
- Screen sharing
- Video sharing
- Mobile-responsive design

## Technologies

- **Python 3.10+**  
- **Django 4.x** — Backend framework, database models, routing  
- **JavaScript** — Frontend interactivity and real-time updates  
- **Django Channels** — WebSocket support for real-time collaboration  
- **Daphne** — ASGI server for handling HTTP and WebSocket connections
- **ASGI** — Asynchronous Server Gateway Interface for real-time communication
- **HTML & CSS** — Page structure and styling  
- **Canvas / SVG** — Whiteboard rendering and interactions  

## Requirements（requirements.txt）

```txt
Django >= 4.2, < 5.3
djangorestframework
daphne
channels >= 4.3.1 # Specifies the latest stable version of Channels 4
#channels_redis   # optional, comment out if not using Redis
```
Install required packages with:

```bash
pip install -r requirements.txt
```

## Getting Started

Clone the repository:

```bash
git clone https://github.com/me50/HankChoose.git
cd HankChoose/livemeeting    # Linux / Mac
cd HankChoose\livemeeting    # Windows
```

Create a virtual environment:

```bash
python -m venv venv
source venv/bin/activate   # Linux / Mac
venv\Scripts\activate      # Windows
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Run database migrations:

```bash
python manage.py makemigrations
python manage.py makemigrations board
python manage.py migrate
```

Create a superuser:

```bash
python manage.py createsuperuser (optional)
```

Run the development server:

```bash
#Run the Django project’s ASGI application with Daphne on port 8000
daphne -p 8000 livemeeting.asgi:application           
```

Access the application:

- Admin interface: http://127.0.0.1:8000/admin
- Main application: http://127.0.0.1:8000/

## Project Structure

```
livemeeting/
├── manage.py
├── requirements.txt
├── README.md
├── livemeeting/               # django project
│   ├── __init__.py
│   ├── asgi.py
│   ├── settings.py
│   ├── urls.py
│   └── wsgi.py
├── board/                     # whiteboard app
│   ├── migrations/
│   ├── __init__.py
│   ├── admin.py
│   ├── apps.py
│   ├── models.py
│   ├── views.py
│   ├── urls.py
│   ├── routing.py
│   └── consumers.py
├── chat/                      # chat app
│   ├── migrations/
│   ├── __init__.py
│   ├── admin.py
│   ├── apps.py
│   ├── models.py
│   ├── views.py
│   ├── urls.py
│   ├── routing.py
│   └── consumers.py
├── sharescreen/               # sharescreen app
│   ├── migrations/
│   ├── __init__.py
│   ├── admin.py
│   ├── apps.py
│   ├── models.py
│   ├── views.py
│   ├── urls.py
│   ├── routing.py
│   └── consumers.py
├── users/                     # users app
│   ├── migrations/
│   ├── __init__.py
│   ├── admin.py
│   ├── apps.py
│   ├── models.py
│   ├── views.py
│   ├── urls.py
├── templates/
│   ├── borad
│   │   └── board_room.html
│   ├── chat
│   │   └── chat_room.html
│   ├── sharescreen
│   │   └── room.html
│   ├── users
│   │   └── register.html
│   ├── base.html
│   ├── index.html
├── static/
│   ├── css/
│   │   └── styles.css
│   └── js/
│       ├── main.js
│       ├── board.js
│       └── chat.js
        └── sharescreen.js


```
## System Architecture Overview
```
System Overview & Real-time Data Flow


┌───────────── Django Backend ──────────────────────┐
│ Models: User, Board, Node, Edge, Message          │
│ Views / API:                                      │
│  • User Authentication (Login/Register)           │
│  • Whiteboard Operations (Add/Move/Connect Nodes) │
│  • Message Send/Receive                           │
│  • Video/Screen Sharing Control                   │
│ WebSocket (Django Channels)                       │
└───────────────────┬───────────────────────────────┘
                    │
                    │ REST API / WebSocket JSON
                    ▼
┌───────────── Frontend JavaScript ────────────────┐
│ Whiteboard: Canvas/SVG                           │
│  • Node creation / Drag / Connect                │
│  • Data changes → API / WebSocket requests       │
│ Chat: Real-time Group messages                   │
│  • Input → WebSocket → backend broadcast         │
│  • Receive → DOM updates                         │
│ Screen / Video  Share                            │
│  • WebRTC or Media API                           │
│  • Stream → DOM video element                    │
│  • Screen / Video: New Page / Mini Window        │
│ UI / Layout                                      │
│  • Responsive layout (mobile/desktop)            │
└───────────────────┬──────────────────────────────┘
                    │
                    ▼
┌───────── User Mobile Responsive Layout ──────────┐
│ Header: Logo / Room Name / User                  │
│ Whiteboard: Main area                            │
│ Chat: Real-time Group messages                   │
│ Screen Sharing: Hidden on mobile devices         │
│ Video: Mini window                               │
│ • Portrait: Modules stacked vertically           │
│ • Landscape: Board users and Room list left,     │
│    Chat + Video right                            │
│ • Non-core modules auto-hide to save space       │
└──────────────────────────────────────────────────┘
```

## Usage

- **Whiteboard**: Draw, move nodes, and connect nodes. Changes are synced in real-time with other participants.
- **Chat**: Send group messages or private messages in rooms. Chat messages persist in the database.
- **Video / Screen Sharing**: Start video calls and share your screen with other participants.
- **Mobile Support**: Mobile-friendly interface; non-core modules hide automatically on small screens.

## Distinctiveness & Complexity

livemeeting is distinct from social networks or e-commerce projects. Its complexity comes from:

- Real-time collaboration via WebSockets
- Whiteboard rendering with Canvas/SVG
- Versioned storage of whiteboard data
- Multi-user Permissions and Status
- Integration of chat, video, and screen sharing
- Mobile responsiveness and touch input handling

This combination of real-time drawing, video communication, chat, and data persistence demonstrates advanced full-stack development skills with Django and JavaScript.

## Author

Haiyin Chen (English name: Hank Chen) – hankchenv@gmail.com

## License

Educational use only; part of CS50W final project.
