# INSAYBOOK — Community Social Platform

**Version:** 1.0.0  
**Status:** IMPLEMENTED & VERIFIED  
**Default Port:** 4174  

Insaybook is an independent, full-stack social networking and community platform designed around meaningful human connections, local neighborhood groups, public events, community marketplaces, and rich emotional reactions.

---

## 1. Key Capabilities

- **Personal Accounts & Auth:** Scrypt password hashing, session tokens, profile banners, hometown, occupation, and biography.
- **News Feed with Audience Privacy:** Rich posts supporting text and media, scoped to Public, Friends Only, or Private.
- **Multi-Reaction Palette:** Expressive reactions (👍 Like, ❤️ Love, 😂 Haha, 😮 Wow, 😢 Sad, 😡 Angry) with atomic counter tracking.
- **Friends Graph:** Send, receive, accept, decline friend requests, and browse confirmed friend lists.
- **Community Groups Hub:** Public and private group spaces, member joining/leaving, role hierarchy (admin/moderator/member), and group-specific feeds.
- **Community Events:** Event calendars with location, date/time, and real RSVP tracking (Going, Interested, Not Going).
- **Marketplace Foundation:** Buy and sell local goods with price formatting, category filtering, search, and direct seller messaging.
- **Messenger:** Direct messaging with conversation history and live delivery.
- **Trust & Moderation:** Reporting queue and user blocking.

---

## 2. Architecture & Tech Stack

- **Runtime:** Node.js (>=18)
- **Database:** Embedded SQLite via native `DatabaseSync` (`data/insaybook.db`) with WAL mode and relational integrity.
- **Security:** CSP headers, X-Frame-Options: DENY, X-Content-Type-Options: nosniff, sliding-window rate limiting (180 req/min), strict path traversal defenses.
- **Real-Time Communication:** Zero-dependency RFC 6455 WebSocket engine for instant message delivery and live presence.

---

## 3. Running the Application

### Start Server
```bash
npm start
```
Runs at `http://127.0.0.1:4174`.

### Run Automated Tests
```bash
npm test
```
Executes 13 comprehensive integration and unit tests covering all core user journeys.

---

## 4. Seed Demonstration Accounts

Password for all seeded accounts: `InsayPassword123!`

- `ashapatel` (Community organizer & urban agriculture advocate)
- `marcusthompson` (Weekend hiking and outdoor trail scout leader)
- `elenarostova` (Custom woodworker & craft guild founder)
- `demo_user` (Active demo community member)
