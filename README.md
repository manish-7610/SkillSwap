# SkillSwap

SkillSwap is a full-stack skill-exchange platform where people can teach what they know, learn what they want, connect with compatible users, and communicate in real time.

Built as a hackathon project, it demonstrates a complete web application stack: a vanilla-JS single-page frontend, a FastAPI REST + WebSocket backend, MySQL persistence, JWT authentication, and a deterministic skill-matching algorithm.

---

## ✨ Features

**Authentication & Accounts**
- User registration and login with email + password
- JWT-based authentication (HS256, configurable expiry — default 24 hours)
- Passwords hashed with bcrypt via passlib
- Duplicate-email detection returns `409 Conflict`

**User Profiles**
- Editable display name, bio, and location
- Custom profile photo upload — stored as a base64 data URL (JPEG, PNG, or WebP, max 3 MB)
- Emoji avatar selection as an alternative to a photo
- Full profile persists across sessions

**Skill Management**
- Add skills in two categories: *teach* (what you can offer) and *learn* (what you want)
- Maximum of 5 skills per type per user, enforced on the backend
- Duplicate skill detection (same name + type) returns `409 Conflict`
- Skills can be edited and deleted

**Skill-Based Matching**
- Deterministic scoring algorithm compares your skills against every other user's skills
- Match scores from 0 to 100 with labels: *Excellent Match* (≥ 70), *Good Match* (≥ 40), *Low Match* (< 40)
- Users with a score of 0 (no skill overlap at all) are excluded from results
- Results sorted by score, highest first

**Connections**
- Send connection requests to any matched user
- Accept or reject incoming requests
- Cancel an outgoing pending request
- Only accepted connections unlock real-time messaging
- Authorization checks prevent self-connections, duplicate requests, and accepting your own request

**Real-Time Chat**
- WebSocket connection for live message delivery (no page refresh needed)
- JWT authentication on the WebSocket handshake (query parameter — standard browser limitation)
- 30-second server-side heartbeat (ping/pong) to maintain the connection
- Messages capped at 2 000 characters, validated on both client and server
- Per-user message deletion: *delete for me* (hides from your view only) or *delete for everyone* (hides for both parties; only the original sender can use this)
- Real-time broadcast of "delete for everyone" events to both online participants
- Unread message count tracked per conversation; marked read when the chat window is opened
- Cursor-based pagination for loading older messages (`before_id` parameter)
- REST fallback endpoints for sending messages and fetching history without WebSocket

**Frontend**
- Single-page application — no build step, no framework, plain HTML/CSS/JS
- Responsive layout for desktop and mobile
- Toast notifications for action feedback
- Loading and error states throughout
- Accessible markup: ARIA labels, keyboard navigation, focus management, semantic HTML
- XSS-safe: all user-generated content is rendered via `textContent` / DOM methods, never `innerHTML` with raw user data

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3, Vanilla JavaScript (ES2022+) |
| Backend | Python 3.14, FastAPI 0.136 |
| ASGI server | Uvicorn 0.48 |
| Database | MySQL 8 |
| ORM | SQLAlchemy 2.0 |
| Authentication | JWT via python-jose, passwords via passlib (bcrypt) |
| Schema validation | Pydantic v2 + pydantic-settings |
| Database migrations | Alembic 1.19 |
| Real-time | WebSocket (FastAPI native, single-process) |
| Testing / QA | PowerShell integration test script (`docs/qa_2j.ps1`), Node.js syntax check |

---

## 🏗️ Project Structure

```
SkillSwap/
├── .gitignore
├── .vscode/                    # VS Code workspace settings
├── assets/
│   ├── avatars/                # Reserved for avatar assets
│   ├── icons/                  # Reserved for icon assets
│   └── images/                 # Reserved for image assets
├── backend/
│   ├── alembic/                # Database migration environment
│   │   ├── env.py
│   │   ├── script.py.mako
│   │   └── versions/           # Migration scripts (0001 → 0006)
│   ├── app/
│   │   ├── api/                # FastAPI route handlers (auth, users, skills, matches, requests, dashboard, messages, chat_ws)
│   │   ├── core/               # Config, database engine, security utilities
│   │   ├── crud/               # Database query functions
│   │   ├── middleware/         # Request logging middleware
│   │   ├── models/             # SQLAlchemy ORM models
│   │   ├── routers/            # Shared dependencies (current user injection)
│   │   ├── schemas/            # Pydantic request/response schemas
│   │   ├── services/           # Business logic (matching, chat, requests, dashboard)
│   │   └── main.py             # Application factory and router registration
│   ├── .env.example            # Environment variable template (safe to commit)
│   ├── alembic.ini             # Alembic configuration
│   └── requirements.txt        # Pinned Python dependencies
├── docs/
│   └── qa_2j.ps1               # Integration test / QA script
├── index.html                  # Single-page application entry point
├── script.js                   # All frontend logic (~3 800 lines)
├── style.css                   # All frontend styles (~1 900 lines)
└── README.md
```

---

## 🔄 How Skill Matching Works

The matching algorithm is deterministic and rule-based — no machine learning is involved.

When you request matches, the backend loads every other user who has at least one skill and calculates a compatibility score for each pair:

| Condition | Points |
|---|---|
| You teach something they want to learn | +40 |
| They teach something you want to learn | +40 |
| Any skill overlap across all your skills | +20 |
| **Maximum possible score** | **100** |

Scores are compared case-insensitively against exact skill names. Users who score 0 (no overlap whatsoever) are excluded from results entirely. The final list is sorted by score descending.

**Score labels:**

| Score range | Label |
|---|---|
| 70 – 100 | Excellent Match |
| 40 – 69 | Good Match |
| 1 – 39 | Low Match |

---

## 💬 Real-Time Chat

Chat is built on two complementary layers.

**REST API** handles persistent operations:
- `POST /api/v1/messages/send` — send a message
- `GET /api/v1/messages/conversation/{user_id}` — paginated history (`limit`, `before_id` cursor)
- `GET /api/v1/messages/conversations` — inbox with unread counts and last-message previews
- `POST /api/v1/messages/mark-read/{user_id}` — mark a conversation as read
- `DELETE /api/v1/messages/{message_id}` — delete for me or for everyone

**WebSocket** (`ws://host/api/v1/ws/chat?token=<jwt>`) handles live delivery:
- JWT is validated before the connection is accepted; invalid tokens are rejected at the HTTP 101 upgrade stage
- The server sends a `ping` frame every 30 seconds; the client replies with `pong`
- A user can have multiple simultaneous connections (e.g. two browser tabs); messages are delivered to all active sockets
- Incoming `send_message` frames are validated, persisted, and pushed to both the sender and the receiver
- `delete_message` frames with `mode: "for_everyone"` are broadcast to both participants immediately; `mode: "for_me"` is confirmed only to the requesting socket
- If the recipient is offline, they receive the messages when they next open the chat via the REST history endpoint

**Authorization:** every message operation (REST and WebSocket) verifies that the two users share an accepted `Connection` record in the database. Messaging users who have not connected is rejected.

> **Note:** the current WebSocket implementation uses a single in-process `ConnectionManager`. This works correctly for single-worker Uvicorn deployments. Multi-worker or multi-instance deployments would require a pub/sub layer (e.g. Redis) — see Future Improvements.

---

## 🔐 Security

| Mechanism | Implementation |
|---|---|
| Password hashing | bcrypt via passlib |
| Authentication tokens | HS256 JWT signed with a secret loaded from `.env` |
| Protected endpoints | `get_current_user` dependency on every non-auth route |
| WebSocket authentication | JWT validated before connection is accepted |
| Connection authorization | Chat verifies accepted connection on every message, not just at connect time |
| Ownership checks | Skill delete/update, connection accept/reject, and message delete all verify the requesting user is the owner |
| Input validation | Pydantic v2 schemas enforce types, lengths, and formats on all request bodies |
| Avatar validation | File type (JPEG/PNG/WebP) and size (≤ 3 MB) enforced server-side |
| Message length | 2 000-character limit enforced in the Pydantic schema and the WebSocket handler |
| Secrets management | `SECRET_KEY` and `DATABASE_URL` are required environment variables; the server refuses to start if either is absent |
| CORS | Configurable via `ALLOWED_ORIGINS` in `.env`; defaults to `localhost:5500` and `127.0.0.1:5500` |
| XSS | Frontend renders user content via DOM text methods, not raw `innerHTML` |

The backend authorization layer is the final security boundary for all data operations.

---

## 🚀 Getting Started

### Prerequisites

- Python 3.11 or later
- MySQL 8 (database must be created before running migrations)
- Node.js (optional — only used by the QA script for a syntax check)
- VS Code with the [Live Server extension](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) (or any static file server)

### 1. Clone the repository

```bash
git clone https://github.com/manish-7610/SkillSwap.git
cd SkillSwap
```

### 2. Set up the backend

```bash
cd backend
```

Create and activate a virtual environment:

```bash
# Windows
python -m venv venv
venv\Scripts\activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

### 3. Configure environment variables

```bash
copy .env.example .env
```

Open `backend/.env` and fill in your values:

```env
DATABASE_URL=mysql+pymysql://username:password@localhost:3306/skillswap
SECRET_KEY=replace-with-a-secure-random-secret-at-least-32-chars
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440
APP_NAME=SkillSwap API
APP_VERSION=1.0.0
DEBUG=False
ALLOWED_ORIGINS=http://localhost:5500,http://127.0.0.1:5500
```

Generate a secure `SECRET_KEY`:

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

### 4. Create the MySQL database

```sql
CREATE DATABASE skillswap CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 5. Run database migrations

From the `backend/` directory:

```bash
alembic upgrade head
```

### 6. Start the backend server

```bash
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

API docs will be available at `http://127.0.0.1:8000/docs`.

### 7. Serve the frontend

Open the project root in VS Code and click **Go Live** (Live Server extension), or use any static file server pointed at the project root.

> **CORS note:** the backend's default `ALLOWED_ORIGINS` allows both `http://localhost:5500` and `http://127.0.0.1:5500`. Use the same origin in your browser that matches your static server's address, or update `ALLOWED_ORIGINS` in your `.env` accordingly.

---

## 📡 API Overview

All routes are prefixed with `/api/v1`. Protected routes require `Authorization: Bearer <token>`.

**Authentication** — `/api/v1/auth`

| Method | Path | Description |
|---|---|---|
| POST | `/auth/register` | Register a new account, returns JWT |
| POST | `/auth/login` | Login, returns JWT |

**Users** — `/api/v1/users`

| Method | Path | Description |
|---|---|---|
| GET | `/users/me` | Get current user profile |
| PUT | `/users/me` | Update profile (name, bio, location, avatar, password) |
| DELETE | `/users/me` | Delete account |
| GET | `/users` | List all users (paginated) |
| GET | `/users/{id}` | Get a user by ID |

**Skills** — `/api/v1/skills`

| Method | Path | Description |
|---|---|---|
| POST | `/skills` | Add a skill (teach or learn) |
| GET | `/skills` | List current user's skills |
| PUT | `/skills/{id}` | Update a skill |
| DELETE | `/skills/{id}` | Delete a skill |

**Matches** — `/api/v1/matches`

| Method | Path | Description |
|---|---|---|
| GET | `/matches` | Get scored, sorted match list for current user |

**Connections** — `/api/v1/requests`

| Method | Path | Description |
|---|---|---|
| POST | `/requests/send` | Send a connection request |
| POST | `/requests/accept` | Accept a pending request |
| POST | `/requests/reject` | Reject a pending request |
| DELETE | `/requests/{id}` | Cancel an outgoing pending request |
| GET | `/requests` | List all connection requests |

**Dashboard** — `/api/v1/dashboard`

| Method | Path | Description |
|---|---|---|
| GET | `/dashboard` | Get full dashboard (stats, skills, connections, matches, pending requests) |

**Messages** — `/api/v1/messages`

| Method | Path | Description |
|---|---|---|
| POST | `/messages/send` | Send a message to a connected user |
| GET | `/messages/conversation/{id}` | Paginated conversation history |
| GET | `/messages/conversations` | Inbox with unread counts |
| POST | `/messages/mark-read/{id}` | Mark a conversation as read |
| DELETE | `/messages/{id}` | Delete a message (for me or for everyone) |

**WebSocket**

| Protocol | Path | Description |
|---|---|---|
| WS | `/api/v1/ws/chat?token=<jwt>` | Real-time chat connection |

---

## 🧪 Testing & QA

The project includes a PowerShell integration test script at `docs/qa_2j.ps1`.

The script requires a running backend and tests the full application flow end-to-end:

- Registration, login, duplicate and invalid-credential handling
- Profile update and persistence
- Skill creation, duplication detection, deletion
- Match retrieval and score validation
- Connection request send, accept, reject, and cancel flows
- Dashboard data accuracy after each state change
- Ownership and authorization checks (cannot modify another user's resources)
- Session persistence (re-login and re-fetch)
- Security regression checks (no hardcoded secrets, correct defaults)

Run the QA script (with the backend running):

```powershell
.\docs\qa_2j.ps1
```

> There is no automated CI/CD pipeline at this time. All testing is manual or via the QA script.

---

## 📸 Screenshots

Screenshots can be added to the `assets/images/` directory and referenced here.

*No screenshots are currently committed to the repository. To add them, place image files in `assets/images/` and update this section with relative Markdown image links.*

---

## 🚧 Future Improvements

The following are ideas for future work — none of these are currently implemented:

- **Push notifications** — alert users to new connection requests and messages when the app is not in focus
- **Group conversations** — extend chat beyond one-to-one messaging
- **Voice / video calls** — using WebRTC or a third-party service
- **Redis-backed WebSocket scaling** — required for multi-worker or multi-server deployments
- **Session scheduling** — allow connected users to propose and manage skill-swap sessions
- **Reporting and moderation** — tools to report inappropriate content or users
- **OAuth login** — Google or GitHub sign-in as an alternative to email/password
- **Production deployment** — Docker Compose configuration, HTTPS, and a reverse proxy setup

---

## 👨‍💻 Author

**Manish Kevat**

- LinkedIn: [manish-kevat-467aa9288](https://www.linkedin.com/in/manish-kevat-467aa9288/)
- GitHub: [manish-7610](https://github.com/manish-7610)
- Email: [mkevatraj@gmail.com](mailto:mkevatraj@gmail.com)

---

## 📄 License

This repository does not currently include a separate license file.
