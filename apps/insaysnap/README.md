# INSAYSNAP — Camera-First Ephemeral Communication Platform

**Version:** 1.0.0  
**Status:** IMPLEMENTED & VERIFIED  
**Default Port:** 4175  

Insaysnap is an independent camera-first, ephemeral communication platform engineered for authentic, in-the-moment sharing without the pressure of permanent digital footprints.

---

## 1. Key Capabilities

- **Camera-First Capture:** HTML5 camera access via `navigator.mediaDevices.getUserMedia` with fallback canvas rendering and file upload for non-webcam devices.
- **Configurable Snap Duration:** Configurable 1 to 10 seconds view timer.
- **Strict Server-Side Deletion Policy:** Physical unlinking of media files from disk and deletion from SQLite immediately upon viewing consumption or when the timer expires. Disappearing content is never merely hidden in client CSS.
- **Friend Stories (24h):** Stories with automatic 24-hour expiration sweeps and viewing tracking.
- **Memories Vault:** Permanent, private vault where users can deliberately preserve their favorite moments.
- **Snap Streaks & Scores:** Real-time streak tracking (🔥 streak counters) and points incrementation on every exchange.
- **Visual Filters:** Canvas-driven visual filters (Sepia, Vivid, Monochrome, Cyberpunk).
- **Ephemeral Chat:** Direct chat messages with auto-destruct timers.
- **Trust & Moderation:** Reporting queue for disappearing media.

---

## 2. Architecture & Tech Stack

- **Runtime:** Node.js (>=18)
- **Database:** Embedded SQLite via native `DatabaseSync` (`data/insaysnap.db`) with WAL mode.
- **Ephemeral Daemon:** Background task executing every 3 seconds to unlink expired files from disk and purge records.
- **Security:** CSP, X-Frame-Options: DENY, X-Content-Type-Options: nosniff, sliding-window rate limiting.

---

## 3. Running the Application

### Start Production Server
```bash
npm start
```
Available at `http://127.0.0.1:4175`.

### Run Ephemeral Verification Suite
```bash
npm test
```
Executes 11 automated verification tests, verifying true server-side physical file unlinking and database deletion.

---

## 4. Seed Accounts

Password for all seeded accounts: `InsayPassword123!`

- `kai_runner` (Trail runner & dawn snappist)
- `chloe_vibes` (Music producer & beach sunset photographer)
- `demo_user` (Active demo account with sample incoming snap)
