# SkillSwap

> **Teach what you know. Learn what you love.**

SkillSwap is a full-stack skill-exchange platform that connects people based on what they can teach and what they want to learn — with no money involved. Users build profiles, discover compatible partners through a rule-based matching algorithm, establish connections, and chat in real time.

---

## Table of Contents

1. [Overview](#-overview)
2. [Problem Statement](#-problem-statement)
3. [Solution](#-solution)
4. [Features](#-features)
5. [How Matching Works](#-how-matching-works)
6. [Real-Time Chat Architecture](#-real-time-chat-architecture)
7. [System Architecture](#-system-architecture)
8. [Tech Stack](#-tech-stack)
9. [Project Structure](#-project-structure)
10. [Prerequisites](#-prerequisites)
11. [Installation & Setup](#-installation--setup)
12. [Environment Variables](#-environment-variables)
13. [Running the Project](#-running-the-project)
14. [API Reference](#-api-reference)
15. [Database Schema](#-database-schema)
16. [Security Notes](#-security-notes)
17. [Current Limitations](#-current-limitations)
18. [Future Improvements](#-future-improvements)

---

## 🚀 Overview

SkillSwap is a web application where users list skills they can teach and skills they want to learn. The platform calculates a compatibility score between users, lets them send and accept connection requests, and provides a real-time chat system so connected users can coordinate their skill exchange.

The frontend is a single-page application written in plain HTML, CSS, and vanilla JavaScript. It works in two modes:

- **Demo mode** — a localStorage-based simulation that requires no backend, useful for exploring the UI without an account.
- **Authenticated mode** — full integration with the FastAPI backend, with real user accounts, persistent data, and live WebSocket messaging.

---

## 🎯 Problem Statement

People routinely have expertise in one area while wanting to develop skills in another. Traditional learning options cost money, and informal knowledge sharing is hard to organise. There is no simple way to find someone who teaches exactly what you want to learn and simultaneously wants to learn what you teach.

---

## 💡 Solution

SkillSwap pairs users whose skill sets are complementary. The workflow is straightforward:

1. **Register** — create an account with full name, email, and password.
2. **Build your profile** — add a bio, location, and choose an emoji avatar.
3. **Add teach skills** — list up to 5 skills you can share with others.
4. **Add learn skills** — list up to 5 skills you want to pick up.
5. **Discover matches** — the platform calculates compatibility scores with other users and presents ranked results.
6. **Connect** — send a connection request to someone you'd like to swap skills with.
7. **Accept** — the other user accepts your request (or you accept theirs).
8. **Chat** — open a real-time chat with any accepted connection directly from the dashboard.
9. **Exchange** — coordinate your skill-swap sessions over chat.

---

## ✨ Features

### Authentication
- User registration with full name, email, and password
- Password validation: minimum 6 characters, must contain at least one letter and one digit
- Login with email and password
- JWT access tokens (HS256, 24-hour expiry)
- Protected endpoints via `Authorization: Bearer <token>` header
- Automatic session restoration on page load (token stored in `localStorage`)
- Graceful session-expiry handling — redirects to login modal

### Profile
- Full name, bio (up to 500 characters), location (up to 120 characters)
- Emoji avatar picker (12 options)
- Email displayed as read-only (cannot be changed after registration)
- Profile editable at any time from the dashboard

### Skills
- Two skill types: **Teach** (what you offer) and **Learn** (what you want)
- Maximum **5 skills per type** per user, enforced server-side
- Duplicate prevention: same name + type combination is rejected per user
- Six categories: Technology, Design, Music, Business, Language, Other
- Category is inferred automatically from the skill name when possible
- Skills added and removed individually with immediate API persistence

### Matching
- Compatibility score calculated between the current user and every other registered user who has at least one skill
- Scores range from 0 to 100 (see [How Matching Works](#-how-matching-works))
- Three labels: **Excellent Match** (≥ 70), **Good Match** (≥ 40), **Low Match** (< 40)
- Users with a score of 0 are excluded from results
- Results sorted highest score first
- "Why you match" explanation shown per card (mutual teach/learn overlap)
- Search by name, skill, or location
- Filter by category (Technology, Design, Music, Language, Business)

### Connections
- Send a connection request to any user visible in matches
- Unique constraint: one connection record per user pair, regardless of direction
- Three states: **pending**, **accepted**, **rejected**
- Accept or decline incoming requests from the dashboard Requests tab
- Accepted connections appear in the Connected tab
- Dashboard stats show total connections, pending requests, and match count

### Messaging (Real-Time Chat)
- **💬 Message** button appears on every accepted connection in the Connected tab
- Chat opens in the existing modal system
- Conversation history loaded from the database on open (newest-first, paginated)
- "Load earlier messages" button for pagination using cursor-based navigation
- Incoming messages marked as read automatically when the chat window opens
- Unread message count shown per conversation in the inbox
- Real-time delivery via WebSocket — messages appear instantly on both sides
- Sender echo: the sender's own bubble appears only after the server confirms receipt (no duplicates)
- REST fallback: if WebSocket is unavailable, messages are sent via `POST /api/v1/messages/send`
- Messages are persisted to MySQL regardless of whether the recipient is online
- Offline recipients see new messages the next time they open the chat

### UX
- Responsive layout — tested down to 480 px wide
- Page loader with progress bar on first load
- Toast notification system (success, error, warning, info)
- Modal overlay used for all dialogs — Escape key and outside-click to dismiss
- Loading, empty, and error states on every dynamic section
- Scroll fade-in animations on feature cards and stats
- Accessible markup: `aria-label`, `role`, `aria-live`, `aria-selected`, visible focus rings
- Mobile hamburger navigation with outside-click dismissal

---

## 🧠 How Matching Works

The matching algorithm is **entirely rule-based** — there is no machine learning or AI involved. Scores are deterministic and reproducible.

### Scoring Rules

| Condition | Points |
|---|---|
| You teach at least one skill the other user wants to learn | +40 |
| The other user teaches at least one skill you want to learn | +40 |
| Any overlap between your combined skills and theirs (teach or learn) | +20 |
| **Maximum possible score** | **100** |

Skill comparisons are **case-insensitive**.

### Score Labels

| Score | Label |
|---|---|
| ≥ 70 | Excellent Match |
| ≥ 40 | Good Match |
| < 40 | Low Match |

Users with a score of exactly 0 are excluded entirely.

### Example

**User A** — Teaches: `Python` · Learns: `Guitar`  
**User B** — Teaches: `Guitar` · Learns: `Python`

| Check | Result | Points |
|---|---|---|
| A teaches Python → B wants to learn Python | ✓ | +40 |
| B teaches Guitar → A wants to learn Guitar | ✓ | +40 |
| Any overlap across all skills (`python`, `guitar`) | ✓ | +20 |
| **Total** | | **100** |

Result: **Excellent Match** — a perfect reciprocal swap.

**Another example**  
**User C** — Teaches: `JavaScript` · Learns: `Music Production`  
**User D** — Teaches: `Guitar` · Learns: `React`

| Check | Result | Points |
|---|---|---|
| C teaches JS → D wants to learn React (not JS) | ✗ | +0 |
| D teaches Guitar → C wants to learn Music Production (not Guitar) | ✗ | +0 |
| Any overlap (JS, Music Production vs Guitar, React) | ✗ | +0 |
| **Total** | | **0** |

Result: **Not shown** — score of 0 is excluded from results.

---

## 💬 Real-Time Chat Architecture

```
Browser (script.js)
   │
   ├── REST calls (apiRequest)  ──►  GET /api/v1/messages/conversation/{id}
   │                                 POST /api/v1/messages/send
   │                                 GET /api/v1/messages/conversations
   │                                 POST /api/v1/messages/mark-read/{id}
   │
   └── WebSocket  ──────────────►  ws://127.0.0.1:8000/api/v1/ws/chat?token=<JWT>
          │
          ▼
     FastAPI (chat_ws.py)
          │
          ├── ConnectionManager (in-memory, dict[user_id → set[WebSocket]])
          │
          ├── chat_service.py  (authorization + validation)
          │        │
          │        └── assert_users_are_connected()
          │               └── get_connection_between() → must be "accepted"
          │
          └── crud_message.py  ──►  SQLAlchemy  ──►  MySQL (messages table)
```

### WebSocket Connection Lifecycle

1. **Client connects** — `ws://127.0.0.1:8000/api/v1/ws/chat?token=<JWT>`  
   JWT is passed as a query parameter because browsers cannot set `Authorization` headers on WebSocket upgrade requests.

2. **Server authenticates** before calling `ws.accept()`. Invalid or expired tokens receive WebSocket close code `4001` and the connection is refused.

3. **Server sends** `{ "type": "connected", "user_id": <int> }` to confirm the session.

4. **Heartbeat** — server sends `{ "type": "ping" }` every 30 seconds; client replies with `{ "type": "pong" }`.

5. **Sending a message** — client sends:
   ```json
   { "type": "send_message", "receiver_id": 3, "content": "Hello!" }
   ```
   Server validates, saves to MySQL, then delivers to:
   - **Receiver** (if online — all active sockets for that user)
   - **Sender** (echo to all sender tabs for sync)

6. **Incoming message frame**:
   ```json
   { "type": "new_message", "message": { "id": 42, "sender_id": 7, "receiver_id": 3, "content": "Hello!", "is_read": false, "created_at": "..." } }
   ```

7. **Error frames**:
   ```json
   { "type": "error", "code": "NOT_CONNECTED", "detail": "..." }
   { "type": "error", "code": "AUTH_FAILED", "detail": "..." }
   { "type": "error", "code": "MESSAGE_TOO_LONG", "detail": "..." }
   { "type": "error", "code": "EMPTY_MESSAGE", "detail": "..." }
   { "type": "error", "code": "SELF_MESSAGE", "detail": "..." }
   ```

8. **Disconnect** — `ConnectionManager.disconnect()` removes the socket from the in-memory map. The server logs the event; the client schedules a reconnect.

### Frontend Reconnect Behaviour

If the WebSocket closes unexpectedly, the frontend attempts reconnection up to **3 times** using exponential back-off (1 s, 2 s, 4 s). After the limit is reached, a toast prompts the user to close and reopen the chat. The WS status badge in the chat header shows the current state: `Connecting…`, `Connected`, `Disconnected`, or `Connection error`.

### Authorization on Every Message

The accepted-connection check runs **on every incoming `send_message` frame**, not just at connection time. If a connection is removed while the WebSocket is open, the next send attempt returns a `NOT_CONNECTED` error frame and the message is not saved.

### Offline Recipient Behaviour

All messages are saved to MySQL before the server attempts real-time delivery. If the recipient has no active WebSocket connection, the message is stored as `is_read = false`. The next time the recipient opens the chat, history is loaded via `GET /api/v1/messages/conversation/{id}` and marks the messages read automatically.

### Pagination

Conversation history uses **cursor-based pagination** (`before_id` query parameter) rather than offset-based paging. The default page size is 50 messages. The "Load earlier messages" button fetches the next page without jumping the scroll position.

### In-Memory WebSocket Limitation

`ConnectionManager` is a module-level singleton that stores connections in a Python `dict`. It works correctly for a **single Uvicorn process**. If Uvicorn is started with multiple workers (`--workers N`), users on different worker processes cannot deliver messages to each other in real time (REST history is unaffected). Horizontal scaling would require a pub/sub layer such as Redis, which is not currently implemented.

---

## 🏗️ System Architecture

```
Browser
  │
  ├── REST API (HTTP/JSON) ──────────────────────────────────────────────┐
  │                                                                       │
  └── WebSocket (ws://) ──────────────────────────────────────────────── ┤
                                                                          │
                                                              ┌───────────▼───────────┐
                                                              │       FastAPI          │
                                                              │    (app/main.py)       │
                                                              └───────────┬───────────┘
                                                                          │
                                          ┌───────────────────────────── ┤
                                          │                               │
                               ┌──────────▼──────────┐       ┌──────────▼──────────┐
                               │   Services / CRUD    │       │   Auth / Security    │
                               │  (business logic,    │       │  (JWT, bcrypt,       │
                               │   authorization)     │       │   HTTPBearer)        │
                               └──────────┬──────────┘       └─────────────────────┘
                                          │
                               ┌──────────▼──────────┐
                               │    SQLAlchemy ORM    │
                               └──────────┬──────────┘
                                          │
                               ┌──────────▼──────────┐
                               │        MySQL         │
                               │  users / skills /    │
                               │  connections /       │
                               │  messages            │
                               └─────────────────────┘
```

**Request logging middleware** records every HTTP request with method, path, status code, and duration using a per-request UUID. Structured global exception handlers catch SQLAlchemy errors and unhandled exceptions, returning consistent JSON error bodies.

---

## 🛠️ Tech Stack

| Layer | Technology | Version | Purpose |
|---|---|---|---|
| Frontend | HTML5 / CSS3 | — | Markup and styling |
| Frontend | Vanilla JavaScript | ES2022+ | UI logic, API calls, WebSocket |
| Backend | Python | 3.14.x | Server-side language |
| Backend | FastAPI | 0.136.3 | REST API + WebSocket framework |
| Backend | Uvicorn | 0.48.0 | ASGI server |
| Database | MySQL | 8.x | Persistent data store |
| ORM | SQLAlchemy | 2.0.49 | Database models and queries |
| Migrations | Alembic | 1.19.0 | Schema versioning |
| Validation | Pydantic v2 | 2.13.4 | Request/response schemas |
| Auth | python-jose | 3.5.0 | JWT encoding/decoding (HS256) |
| Auth | passlib + bcrypt | 1.7.4 | Password hashing |
| DB driver | PyMySQL | 1.2.0 | MySQL Python connector |
| Config | pydantic-settings | 2.14.2 | Environment variable management |

---

## 📁 Project Structure

```
SkillSwap/
├── index.html                  # Single-page application entry point
├── script.js                   # All frontend logic (~2 600 lines, vanilla JS)
├── style.css                   # All styles (~2 100 lines, CSS custom properties)
├── assets/
│   ├── avatars/                # (reserved — avatars are currently emoji)
│   ├── icons/                  # (reserved)
│   └── images/                 # (reserved)
├── backend/
│   ├── .env.example            # Safe template for environment variables
│   ├── alembic.ini             # Alembic configuration
│   ├── requirements.txt        # Python dependencies (pinned versions)
│   ├── alembic/
│   │   ├── env.py              # Alembic runtime environment
│   │   ├── script.py.mako      # Migration file template
│   │   └── versions/
│   │       ├── 0001_initial_schema.py   # users, skills, connections tables
│   │       └── 0002_add_messages.py     # messages table
│   └── app/
│       ├── main.py             # FastAPI app factory, routers, middleware, lifespan
│       ├── api/
│       │   ├── auth.py         # POST /auth/register, POST /auth/login
│       │   ├── users.py        # GET/PUT/DELETE /users/me, GET /users
│       │   ├── skills.py       # CRUD /skills
│       │   ├── matches.py      # GET /matches
│       │   ├── requests.py     # POST /requests/send|accept|reject, GET /requests
│       │   ├── dashboard.py    # GET /dashboard
│       │   ├── messages.py     # REST chat endpoints
│       │   └── chat_ws.py      # WebSocket endpoint + ConnectionManager
│       ├── core/
│       │   ├── config.py       # Settings loaded from .env via pydantic-settings
│       │   ├── database.py     # SQLAlchemy engine and session factory
│       │   └── security.py     # JWT creation/decoding, bcrypt hashing
│       ├── crud/
│       │   ├── crud_user.py
│       │   ├── crud_skill.py
│       │   ├── crud_connection.py
│       │   └── crud_message.py
│       ├── middleware/
│       │   └── logger.py       # Per-request logging middleware
│       ├── models/
│       │   ├── base.py         # DeclarativeBase with auto __tablename__
│       │   ├── user.py
│       │   ├── skill.py
│       │   ├── connection.py
│       │   └── message.py
│       ├── routers/
│       │   └── dependencies.py # get_current_user FastAPI dependency
│       ├── schemas/
│       │   ├── user.py
│       │   ├── skill.py
│       │   ├── match.py
│       │   ├── request.py
│       │   ├── dashboard.py
│       │   └── message.py
│       └── services/
│           ├── user_service.py
│           ├── matching_service.py
│           ├── request_service.py
│           ├── dashboard_service.py
│           └── chat_service.py
├── .gitignore
└── README.md
```

---

## ⚙️ Prerequisites

| Requirement | Notes |
|---|---|
| **Python 3.11 – 3.13** | See [compatibility note](#python-version-note) below |
| **MySQL 8.x** | A running instance with a database created |
| **pip** | Comes with Python |
| **Node.js** (optional) | Only needed if you want to run the static frontend via `npx serve` |
| **VS Code + Live Server** | Recommended for serving the frontend locally |
| **Modern browser** | Chrome, Firefox, Edge, Safari — WebSocket and ES2022 required |

### Python Version Note

The project was developed and tested on **Python 3.14.x**, but `passlib 1.7.4` has a known incompatibility with `bcrypt 4.x` on Python 3.14 that causes a `ValueError` during password hashing. This means **user registration and login via the web UI will fail on Python 3.14** until the dependency is resolved.

**Recommended workaround — use Python 3.11 or 3.12**, which are stable, widely supported, and fully compatible with all pinned dependencies in `requirements.txt`.

If you must use Python 3.14, downgrade bcrypt:
```bash
pip install "bcrypt==4.0.1"
```

---

## 🔧 Installation & Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd SkillSwap
```

### 2. Create the MySQL Database

Log in to MySQL and create the database:

```sql
CREATE DATABASE skillswap CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 3. Create the Python Virtual Environment

```bash
cd backend
python -m venv venv
```

Activate it:

```bash
# Windows (PowerShell)
.\venv\Scripts\Activate.ps1

# Windows (Command Prompt)
.\venv\Scripts\activate.bat

# macOS / Linux
source venv/bin/activate
```

### 4. Install Python Dependencies

```bash
pip install -r requirements.txt
```

### 5. Configure Environment Variables

Copy the example file and fill in your values:

```bash
cp .env.example .env
```

Edit `.env` — see [Environment Variables](#-environment-variables) for all keys.

### 6. Run Database Migrations

From the `backend/` directory (with the virtualenv active):

```bash
python -m alembic upgrade head
```

This applies both migrations:
- `0001_initial_schema` — creates the `users`, `skills`, and `connections` tables
- `0002_add_messages` — creates the `messages` table

> **If the tables already exist** (e.g. created by a previous `Base.metadata.create_all` call), stamp the current state first:
> ```bash
> python -m alembic stamp 0001_initial
> python -m alembic upgrade head
> ```

---

## 🔑 Environment Variables

All variables live in `backend/.env`. A safe template is provided in `backend/.env.example`. **Never commit `.env` to version control** — it is listed in `.gitignore`.

```env
# Database — full SQLAlchemy connection URL
DATABASE_URL=mysql+pymysql://your_username:your_password@localhost:3306/skillswap

# JWT
SECRET_KEY=replace-with-a-secure-random-secret-at-least-32-chars
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440

# App
APP_NAME=SkillSwap API
APP_VERSION=1.0.0
DEBUG=False

# CORS — comma-separated origins allowed to call the API
ALLOWED_ORIGINS=http://localhost:5500,http://127.0.0.1:5500
```

**Generate a secure `SECRET_KEY`:**
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

**`ALLOWED_ORIGINS`** must include the origin from which you serve `index.html`. The defaults match VS Code Live Server's typical ports.

---

## ▶️ Running the Project

### Start the Backend

From the `backend/` directory with the virtualenv active:

```bash
# Development (auto-reload on file changes)
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

# Production-style (single process, no reload)
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

The API is available at `http://127.0.0.1:8000`.  
Interactive docs: `http://127.0.0.1:8000/docs` (Swagger UI)  
Alternative docs: `http://127.0.0.1:8000/redoc`

### Serve the Frontend

Open `index.html` through a local HTTP server — **do not open it as a `file://` URL** because `fetch()` and WebSocket calls to `localhost` require an HTTP origin.

**VS Code Live Server** (recommended):
1. Install the Live Server extension.
2. Right-click `index.html` → **Open with Live Server**.
3. The page opens at `http://127.0.0.1:5500` (or `http://localhost:5500`), which is pre-configured in `ALLOWED_ORIGINS`.

**Alternative — Python HTTP server:**
```bash
cd SkillSwap   # project root
python -m http.server 5500
# visit http://127.0.0.1:5500
```

Both the frontend origin and the WebSocket origin (`ws://127.0.0.1:8000`) must match the `ALLOWED_ORIGINS` setting.

---

## 📡 API Reference

All REST endpoints are prefixed with `/api/v1`. Protected endpoints require `Authorization: Bearer <token>`.

Interactive documentation with request/response schemas is available at `/docs` while the backend is running.

### Authentication

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/auth/register` | No | Register new account → returns token + user |
| `POST` | `/api/v1/auth/login` | No | Login → returns token + user |

### Users

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/users/me` | ✓ | Get current user profile |
| `PUT` | `/api/v1/users/me` | ✓ | Update current user profile |
| `DELETE` | `/api/v1/users/me` | ✓ | Delete account (cascades to all data) |
| `GET` | `/api/v1/users` | ✓ | List all users (public fields only) |
| `GET` | `/api/v1/users/{user_id}` | ✓ | Get user by ID (public fields only) |

### Skills

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/skills` | ✓ | Add a skill (teach or learn) |
| `GET` | `/api/v1/skills` | ✓ | List current user's skills |
| `PUT` | `/api/v1/skills/{skill_id}` | ✓ | Update a skill |
| `DELETE` | `/api/v1/skills/{skill_id}` | ✓ | Delete a skill |

### Matches

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/matches` | ✓ | Get ranked compatibility matches |

### Connection Requests

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/requests/send` | ✓ | Send a connection request |
| `POST` | `/api/v1/requests/accept` | ✓ | Accept a pending request |
| `POST` | `/api/v1/requests/reject` | ✓ | Reject a pending request |
| `GET` | `/api/v1/requests` | ✓ | List all connections for current user |

### Dashboard

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/dashboard` | ✓ | Full dashboard: profile, skills, connections, stats, top matches |

### Messages (Chat)

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/messages/conversation/{other_user_id}` | ✓ | Paginated history (`?limit=50&before_id=N`) |
| `POST` | `/api/v1/messages/send` | ✓ | Send a message (REST path) |
| `GET` | `/api/v1/messages/conversations` | ✓ | Inbox: all conversations with last message + unread count |
| `POST` | `/api/v1/messages/mark-read/{other_user_id}` | ✓ | Mark all received messages as read |

### WebSocket

| Protocol | Path | Description |
|---|---|---|
| `WS` | `/api/v1/ws/chat?token=<JWT>` | Real-time chat — authenticated via query parameter |

### Health

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | No | Server health check → `{ "status": "ok", "version": "1.0.0" }` |

---

## 🗄️ Database Schema

### `users`

| Column | Type | Constraints |
|---|---|---|
| `id` | INT | PK, auto-increment, indexed |
| `full_name` | VARCHAR(120) | NOT NULL |
| `email` | VARCHAR(255) | NOT NULL, UNIQUE, indexed |
| `password_hash` | VARCHAR(255) | NOT NULL |
| `bio` | TEXT | nullable |
| `avatar` | VARCHAR(10) | nullable (stores emoji character) |
| `location` | VARCHAR(120) | nullable |
| `created_at` | DATETIME(tz) | server default `now()` |
| `updated_at` | DATETIME(tz) | server default `now()`, updated on change |

### `skills`

| Column | Type | Constraints |
|---|---|---|
| `id` | INT | PK, auto-increment, indexed |
| `user_id` | INT | FK → `users.id` CASCADE, indexed |
| `name` | VARCHAR(100) | NOT NULL |
| `type` | ENUM(`teach`, `learn`) | NOT NULL |
| `category` | ENUM(`Technology`, `Design`, `Music`, `Business`, `Language`, `Other`) | NOT NULL |
| `created_at` | DATETIME(tz) | server default `now()` |

Unique constraint: `(user_id, name, type)` — prevents duplicate skill entries per user per type.  
Application limit: maximum 5 skills per type per user (enforced in `crud_skill.py`).

### `connections`

| Column | Type | Constraints |
|---|---|---|
| `id` | INT | PK, auto-increment, indexed |
| `sender_id` | INT | FK → `users.id` CASCADE, indexed |
| `receiver_id` | INT | FK → `users.id` CASCADE, indexed |
| `status` | ENUM(`pending`, `accepted`, `rejected`) | NOT NULL, default `pending` |
| `created_at` | DATETIME(tz) | server default `now()` |

Unique constraint: `(sender_id, receiver_id)` — only one connection record per ordered pair.

### `messages`

| Column | Type | Constraints |
|---|---|---|
| `id` | INT | PK, auto-increment, indexed |
| `sender_id` | INT | FK → `users.id` CASCADE, indexed |
| `receiver_id` | INT | FK → `users.id` CASCADE, indexed |
| `content` | TEXT | NOT NULL |
| `is_read` | TINYINT(1) | NOT NULL, default `0` |
| `created_at` | DATETIME(tz) | server default `now()` |

Additional indexes:
- `ix_messages_conversation (sender_id, receiver_id, created_at)` — composite index for efficient conversation queries
- Individual indexes on `sender_id` and `receiver_id`

All tables use `ON DELETE CASCADE` foreign keys — deleting a user removes all their skills, connections, and messages.

---

## 🔒 Security Notes

### Authentication & Authorization
- Passwords are hashed with **bcrypt** via `passlib`. Plain-text passwords are never stored or logged.
- JWTs are signed with HS256 using a server-side `SECRET_KEY`. Tokens expire after 24 hours.
- Every protected endpoint resolves `get_current_user` via `HTTPBearer(auto_error=True)`. Missing or invalid tokens return `401 Unauthorized`.
- Connection-based authorization is enforced at the service layer: sending a message or accessing conversation history between users who do not share an accepted connection returns `403 Forbidden`.
- The WebSocket endpoint validates the JWT **before** calling `ws.accept()`. Failed auth sends close code `4001`.
- Connection authorization is re-checked on every WebSocket `send_message` frame (not only at connect time).

### Input Validation
- All request bodies are validated by Pydantic v2 schemas before reaching service or CRUD code.
- Message content: 1–2000 characters, whitespace stripped.
- Skill names: 1–100 characters.
- User full name: 2–120 characters.
- Email: validated as a proper email address (via `email-validator`).
- Password: minimum 6 characters, must contain at least one letter and one digit.

### XSS Protection
- The frontend uses an `esc()` helper that HTML-encodes `&`, `<`, `>`, `"`, and `'` before every DOM insertion. All user-generated content — message bodies, names, skill names, bios — passes through `esc()`.
- The backend returns JSON; it does not render HTML templates, so server-side XSS is not a concern.

### CORS
- CORS is configured via `CORSMiddleware` with `allow_origins` restricted to the `ALLOWED_ORIGINS` environment variable (defaults: `http://localhost:5500`, `http://127.0.0.1:5500`).

### Environment Secrets
- `SECRET_KEY` and `DATABASE_URL` are read from `.env` at startup. If either is absent, the application raises a `ValueError` and refuses to start — there are no insecure defaults.
- `.env` is listed in `.gitignore` and must never be committed.

### What is Not Implemented
- Rate limiting (no per-IP or per-user throttle on any endpoint)
- HTTPS / TLS (the project runs on plain HTTP for local development)
- CSRF protection (not required for a stateless JWT API)
- Content Security Policy headers

---

## ⚠️ Current Limitations

| Limitation | Detail |
|---|---|
| **WebSocket scales to one process only** | The in-memory `ConnectionManager` does not work across multiple Uvicorn workers. Use `--workers 1` (the default). |
| **passlib/bcrypt on Python 3.14** | `passlib 1.7.4` is incompatible with `bcrypt 4.x` on Python 3.14. Use Python 3.11–3.12 or downgrade bcrypt. |
| **Text chat only** | File sharing, image messaging, voice calls, and video calls are not implemented. |
| **No push notifications** | There is no browser push notification API integration. Offline users see messages only when they open the chat. |
| **No message editing or deletion** | Messages cannot be edited or deleted after being sent. |
| **No rate limiting** | No per-user throttle on message sending or API calls. |
| **No email verification** | Accounts are active immediately after registration with no email confirmation step. |
| **Demo mode is localStorage-only** | The demo mode (no backend) does not persist data across browsers or devices. |
| **Up to 500 users in matching** | `generate_matches` fetches at most 500 users (`get_all_users(db, limit=500)`) for the matching calculation. |

---

## 🔮 Future Improvements

The following features are not implemented but are reasonable next steps:

- **Horizontal scaling** — replace the in-memory `ConnectionManager` with a Redis pub/sub channel to support multiple Uvicorn workers or pods.
- **Message editing and deletion** — `updated_at` / `deleted_at` columns, soft-delete pattern.
- **Read receipts UI** — show a checkmark on sent messages when the recipient has read them.
- **Email verification** — SMTP confirmation on registration.
- **Password reset** — email-based reset flow.
- **Rate limiting** — e.g. `slowapi` middleware to prevent message spam.
- **Conversation search** — full-text search within chat history.
- **Notifications badge** — unread conversation count in the navbar.
- **Pagination for matches** — the current `/matches` endpoint returns all results; cursor pagination would help at scale.
- **HTTPS** — TLS termination via a reverse proxy (nginx, Caddy) for any non-local deployment.
- **Connection removal** — allow users to remove an accepted connection.
- **Skill suggestions** — autocomplete from the known skill categories list.
- **Profile visibility settings** — public/private profiles.

---

## 📄 License

This project was built for a hackathon. Licensing terms are at the discretion of the author.

---

*Built with ❤️ — Teach. Learn. Grow. Repeat.*
