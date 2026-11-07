# INSAYCORD — Community Communication & Real-Time Collaboration Platform

INSAYCORD is an independent, production-grade real-time community communication platform built with zero third-party npm dependencies. It provides servers (guilds), categorized text channels, live voice channels with WebRTC audio signaling, RFC 6455 WebSocket messaging, presence tracking, typing indicators, reactions, and moderation.

---

## 1. Core Architectural Capabilities

- **Real-Time Text Channels**: Instant message dispatch and delivery via native RFC 6455 WebSocket server framing.
- **Voice Stage & WebRTC Signaling**: Multi-user voice channel signaling relay (`voice_join`, `voice_leave`, `voice_state_update`, `offer`, `answer`, `ice_candidate`) with speaking visualizers and hardware mic/deafen controls.
- **Community Guilds & Servers**: Multi-server hierarchy with distinct channel topologies (text and voice), custom topics, and member rosters.
- **Role-Based Member Hierarchy**: Hierarchical privileges: `owner`, `admin`, `moderator`, and `member`.
- **Persistent Message Lifecycle**: Full support for message editing, soft/hard deletion, and real-time emoji reaction counters.
- **Moderation & Reporting**: Integrated reporting pipeline for spam, harassment, and policy violations.
- **Hardened Security**: Scrypt key derivation, 256-bit cryptographically secure session cookies (`HttpOnly; SameSite=Lax`), CSP headers, sliding-window rate limiting, and path traversal guards.

---

## 2. Technical Stack

- **Runtime**: Node.js >= 22 (using built-in `node:sqlite` `DatabaseSync`, `crypto`, `http`).
- **Database**: SQLite with Write-Ahead Logging (WAL) and foreign key constraints enabled.
- **Realtime**: Pure Node.js RFC 6455 WebSocket implementation (`packages/core/realtime.js`).
- **Signaling**: WebRTC peer signaling relay over WebSocket.
- **Frontend**: High-performance Vanilla JavaScript and CSS3 design system (Discord-inspired dark UI palette, responsive desktop/tablet/mobile layouts).

---

## 3. Quick Start

### Starting the Server
```bash
npm start
```
The server binds to port `4177` by default (or the port specified by the `PORT` environment variable).
Access the interface at: `http://127.0.0.1:4177`

### Running the QA Verification Test Suite
```bash
npm test
```
Executes the automated integration test suite verifying health checks, authentication, server creation, channel management, real-time messaging, editing, emoji reactions, voice room state queries, moderation reports, and directory traversal security.

---

## 4. Default Seed Accounts

All accounts are pre-seeded with the password: `insaypass123`

- **Alex Rivers (Server Founder)**: `alex_architect` / `insaypass123`
- **Sam Taylor (Systems Admin)**: `sam_systems` / `insaypass123`
- **Jordan Spark (Maker)**: `jordan_maker` / `insaypass123`
- **Demo Collaborator (Guest)**: `demo_user` / `insaypass123`

---

## 5. REST & WebSocket API Specification

### Authentication
- `POST /api/auth/register` — Register a new account.
- `POST /api/auth/login` — Authenticate and receive a session cookie.
- `POST /api/auth/logout` — Invalidate current session and clear cookies.
- `GET /api/auth/me` — Retrieve the authenticated profile.

### Servers & Channels
- `GET /api/servers` — List servers the authenticated user belongs to.
- `POST /api/servers` — Create a new server (auto-creates default general and voice channels).
- `GET /api/servers/:id` — Retrieve server channels, members, and user role.
- `POST /api/servers/:id/channels` — Create a text or voice channel.

### Messages & Reactions
- `GET /api/channels/:id/messages` — Fetch message history with reaction counters.
- `POST /api/channels/:id/messages` — Send a message to a channel (broadcasts via WebSocket).
- `PATCH /api/messages/:id` — Edit an existing message (author only).
- `DELETE /api/messages/:id` — Delete a message (author or server moderator/owner).
- `POST /api/messages/:id/react` — Toggle emoji reaction on a message.

### Voice & Moderation
- `GET /api/voice/rooms/:channelId` — Query active participants in a voice channel.
- `POST /api/reports` — Submit moderation report for objectionable content.
- `GET /health` — Platform health check and version metadata.

---

## 6. License

MIT License. See `LICENSE`.
