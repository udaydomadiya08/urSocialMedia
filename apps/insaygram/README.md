# INSAYGRAM — Visual Social Networking Platform

**Version:** 1.0.0  
**Status:** IMPLEMENTED & VERIFIED  
**Default Port:** 4173  

Insaygram is an independent, full-stack visual social networking platform built with modern web technologies, zero external heavy dependencies, real relational persistence, secure session authentication, and real-time interaction capabilities.

---

## 1. Key Capabilities

- **Registration & Authentication:** Secure scrypt password hashing, session cookies, Bearer tokens, profile creation.
- **Visual News Feed:** Multi-image post support, video playback, double-tap liking, heart animations, and hashtag auto-linking.
- **Stories with 24-Hour Expiration:** Real-time stories tray with gradient rings, 5-second automatic progression modal, and server-side background expiration sweeps.
- **Reels Short Video:** Vertical video feed with creator attribution, original audio tracks, view counts, and floating interactions.
- **Explore & Discovery:** Grid of visual posts and reels ranked by engagement velocity with real-time tag and creator search.
- **Social Graph:** Follow/unfollow mechanics, follower/following counts, profile view, and personal galleries.
- **Direct Messaging:** Conversation threads, real-time message sending/receiving via native WebSockets, and unread notifications.
- **Trust & Moderation:** Server-side user blocking and structured content reporting.

---

## 2. Architecture & Tech Stack

- **Runtime:** Node.js (>=18)
- **Database:** Embedded SQLite via Node's native `DatabaseSync` (`data/insaygram.db`) with WAL mode, foreign key enforcement, and automated schema migrations.
- **Real-Time Communication:** Zero-dependency RFC 6455 WebSocket engine for instant message delivery and live presence.
- **Media Engine:** Streaming multipart/form-data parser with magic byte validation (JPEG, PNG, GIF, WebP, MP4, WebM) and HTTP range streaming.
- **Security:** Strict Content Security Policy (CSP), X-Frame-Options: DENY, X-Content-Type-Options: nosniff, sliding-window rate limiting (180 req/min), and strict path traversal protection.

---

## 3. Running the Application

### Start Production Server
```bash
npm start
```
Server will be available at `http://127.0.0.1:4173`.

### Run Automated Verification Suite
```bash
npm test
```
Executes 15 comprehensive integration, security, and lifecycle tests.

---

## 4. API Endpoints Reference

| Method | Endpoint | Description | Auth Required |
|---|---|---|---|
| `GET` | `/health` | Server health and mode status | No |
| `POST` | `/api/auth/register` | Register new user account | No |
| `POST` | `/api/auth/login` | Login with username/email & password | No |
| `POST` | `/api/auth/logout` | Terminate active session | Yes |
| `GET` | `/api/auth/me` | Fetch active user context | No / Optional |
| `GET` | `/api/posts` | Retrieve visual posts with pagination | No / Optional |
| `POST` | `/api/posts` | Create new visual post | Yes |
| `POST` | `/api/posts/:id/like` | Toggle post like | Yes |
| `POST` | `/api/posts/:id/save` | Save post to collection | Yes |
| `GET` | `/api/posts/:id/comments`| List comments on a post | No |
| `POST` | `/api/posts/:id/comments`| Post comment | Yes |
| `GET` | `/api/stories` | Retrieve active (unexpired) stories | No / Optional |
| `POST` | `/api/stories` | Publish 24h ephemeral story | Yes |
| `GET` | `/api/reels` | List short-form reels | No |
| `POST` | `/api/reels` | Publish reel video | Yes |
| `GET` | `/api/users/:username` | Fetch user profile and post grid | No / Optional |
| `POST` | `/api/users/:id/follow` | Follow / unfollow creator | Yes |
| `GET` | `/api/messages/conversations` | List DM conversations | Yes |
| `POST` | `/api/messages/:userId` | Send direct message | Yes |
| `POST` | `/api/upload` | Upload media with magic byte check | Yes |
| `POST` | `/api/reports` | Submit content moderation report | Yes |

---

## 5. Seed Demonstration Accounts

All seed accounts use the default password: `InsayPassword123!`

- `mirachen` (Kyoto architectural photographer)
- `noahrivera` (Analog photography / light studies)
- `studioforma` (Minimalist ceramics & industrial design)
- `demo_user` (Active demo account)
