# LiveMeeting: Collaborative Whiteboard & Chat Application

LiveMeeting is a Django-based web application that allows users to collaborate on whiteboards in real-time, chat, share screens, and conduct video meetings. It is fully responsive and supports mobile devices.

## Core Features

- User registration and login
- Create and join collaborative whiteboard rooms
- Draw, move, and connect nodes on a whiteboard
- Real-time chat (group and private messages)
- Video conferencing and screen sharing
- Whiteboard and chat history persistence
- Mobile-responsive design

## Technologies

- **Python 3.10+**  
- **Django 4.x** — Backend framework, database models, routing  
- **JavaScript** — Frontend interactivity and real-time updates  
- **Django Channels** — WebSocket support for real-time collaboration  
- **HTML & CSS** — Page structure and styling  
- **Canvas / SVG** — Whiteboard rendering and interactions  

## Requirements

Install required packages with:

```bash
pip install -r requirements.txt
```

Dependencies include:

- Django
- Django Channels
- channels_redis (optional if using Redis backend)
- djangorestframework
- Other packages as listed in `requirements.txt`

## Getting Started

Clone the repository:

```bash
git clone <your-repo-url>
cd livemeeting
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
python manage.py createsuperuser
```

Run the development server:

```bash
python manage.py runserver
# 使用 Daphne 运行 Django ASGI
$env:DJANGO_SETTINGS_MODULE="livemeeting.settings"
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
│   └── consumers.py
├── chat/                      # chat app
│   ├── migrations/
│   ├── __init__.py
│   ├── admin.py
│   ├── apps.py
│   ├── models.py
│   ├── views.py
│   └── consumers.py
├── templates/
│   ├── base.html
│   ├── index.html
│   └── board_room.html
├── static/
│   ├── css/
│   │   └── styles.css
│   └── js/
│       ├── main.js
│       ├── board.js
│       └── chat.js

```
## System Architecture Overview
```
System Overview & Real-time Data Flow


┌───────────── Django Backend ──────────────────────┐
│ Models: User, Board, Node, Edge, Msg              │
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
│  • Data changes → API / WS requests              │
│ Chat: Real-time messages                         │
│  • Input → WS → backend broadcast                │
│  • Receive → DOM updates                         │
│ Video / Screen Share                             │
│  • WebRTC or Media API                           │
│  • Stream → DOM video element                    │
│ UI / Layout                                      │
│  • Responsive layout (mobile/desktop)            │
└───────────────────┬──────────────────────────────┘
                    │
                    ▼
┌───────── User Mobile Responsive Layout ──────────┐
│ Header: Logo / Room Name / User                  │
│ Whiteboard: Main area                            │
│ Chat: Group / Private toggle                     │
│ Video/Screen: Mini windows                       │
│                                                  │
│ • Portrait: Modules stacked vertically           │
│ • Landscape: Board left, Chat + Video right      │
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
- Multi-user permissions and roles
- Integration of chat, video, and screen sharing
- Mobile responsiveness and touch input handling

This combination of real-time drawing, video communication, chat, and data persistence demonstrates advanced full-stack development skills with Django and JavaScript.

## Author

Haiyin Chen (English name: Hank Chen) – hankchenv@gmail.com

## License

Educational use only; part of CS50W final project.
