# INSAY Social Platforms Suite

**Six Independent, Production-Grade Social Networks with Zero External Dependencies**

The INSAY Social Platforms Suite is a collection of six independent, fully functional, production-ready social networking applications built on standard Node.js runtime primitives (`node:sqlite` `DatabaseSync`, native `crypto`, `http`, native RFC 6455 WebSockets, and WebRTC audio signaling).

Each platform is independently deployable with its own database, server, frontend design system, REST/WebSocket APIs, and automated test suite.

---

## 1. Product Matrix & Port Mapping

| Platform | Core Identity | Default Port | Storage & DB | Real-Time / Core Engine | Test Suite |
|---|---|---|---|---|---|
| **[INSAYGRAM](./apps/insaygram)** | Visual Social Network (Posts, Stories, Reels, Explore, DMs) | `4173` | SQLite WAL (`insaygram.db`) | RFC 6455 WebSockets | 15 / 15 Passed |
| **[INSAYBOOK](./apps/insaybook)** | Communities, Groups, Events, Marketplace & Feed | `4174` | SQLite WAL (`insaybook.db`) | Polling / Events | 13 / 13 Passed |
| **[INSAYSNAP](./apps/insaysnap)** | Camera-First Ephemeral Media & Server Auto-Destruct | `4175` | SQLite WAL (`insaysnap.db`) | 3s Purge Daemon | 11 / 11 Passed |
| **[INSAYTOK](./apps/insaytok)** | Short-Form Video & Explainable Recommendation Engine | `4176` | SQLite WAL (`insaytok.db`) | Mathematical Scoring | 12 / 12 Passed |
| **[INSAYCORD](./apps/insaycord)** | Community Guilds, Text Channels & WebRTC Voice Rooms | `4177` | SQLite WAL (`insaycord.db`) | WebSockets + WebRTC | 16 / 16 Passed |
| **[INSAYTUBE](./apps/insaytube)** | Long-Form Video, Multi-Algorithm Equalizer & Topic Presets | `4178` | Local-First / Proxy Index | Modular Multi-Algorithm Engine | 42 / 42 Passed |

---

## 2. Quick Start

### Prerequisites
- Node.js >= 22.0.0 (No `npm install` needed — zero runtime dependencies!)

### Launching All 6 Platforms Simultaneously
```bash
npm start
# or: node ecosystem.js
```
The ecosystem supervisor initializes all six platforms concurrently across ports 4173–4178.

### Running Any Platform Independently
```bash
cd apps/insaygram && npm start # Launches Insaygram on port 4173
cd apps/insaybook && npm start # Launches Insaybook on port 4174
cd apps/insaysnap && npm start # Launches Insaysnap on port 4175
cd apps/insaytok && npm start  # Launches Insaytok on port 4176
cd apps/insaycord && npm start # Launches Insaycord on port 4177
cd apps/insaytube && npm start # Launches Insaytube on port 4178
```

---

## 3. Automated Quality Assurance & Verification

To execute the entire 109-test suite across all 6 platforms:
```bash
npm test
```

### Individual Test Commands
```bash
npm run test:gram # Insaygram verification suite (15 tests)
npm run test:book # Insaybook verification suite (13 tests)
npm run test:snap # Insaysnap ephemeral verification suite (11 tests)
npm run test:tok  # Insaytok recommendation verification suite (12 tests)
npm run test:cord # Insaycord real-time verification suite (16 tests)
npm run test:tube # Insaytube verification & IR evaluation suite (42 tests)
```

---

## 4. Default Demonstration Accounts

All demo accounts across all platforms are pre-seeded with the password:
**`insaypass123`**

- **Alex Rivers**: `alex_architect` / `insaypass123`
- **Elena Rostova**: `elena_lens` / `insaypass123`
- **Marcus Chen**: `marcus_c` / `insaypass123`
- **Chloe Vance**: `chloe_vibe` / `insaypass123`
- **Maya Patel**: `maya_snap` / `insaypass123`
- **Demo Collaborator**: `demo_user` / `insaypass123`

---

## 5. Architectural & Security Documentation

- **[Baseline Audit](INSAY_ECOSYSTEM_BASELINE_AUDIT.md)**: Analysis of initial prototypes and flaw catalog.
- **[Master Report](INSAY_ECOSYSTEM_MASTER_REPORT.md)**: Executive summary and transformation journey.
- **[Architecture Specification](INSAY_ECOSYSTEM_ARCHITECTURE.md)**: Component diagrams, schema design, and algorithms.
- **[Security Audit Report](INSAY_ECOSYSTEM_SECURITY_REPORT.md)**: Threat modeling, vulnerability remediations, and CSP.
- **[Test Report](INSAY_ECOSYSTEM_TEST_REPORT.md)**: Comprehensive test results and execution statistics.
- **[Deployment Guide](INSAY_ECOSYSTEM_DEPLOYMENT_GUIDE.md)**: Docker, Docker Compose, Nginx reverse proxy, and backups.

---

## 6. Standalone Package Archives

Each platform is packaged as an independent standalone ZIP archive:
- `insaygram.zip`
- `insaybook.zip`
- `insaysnap.zip`
- `insaytok.zip`
- `insaycord.zip`
- `insaytube.zip`
- `social-platforms-suite.zip` (Combined complete ecosystem)

---

## 7. License

MIT License. See individual application `LICENSE` files.
