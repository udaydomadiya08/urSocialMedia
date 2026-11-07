# INSAY SOCIAL NETWORK ECOSYSTEM — MASTER TEST EXECUTION REPORT

**Author:** Autonomous Principal QA & Verification Engineering Team  
**Date of Execution:** November 2026  
**Test Harness:** Native Node.js Automated Integration & Contract Test Suites  
**Node Version:** v22.22.3 (macOS Darwin Kernel)  
**Total Test Count:** **109 Tests**  
**Passed Tests:** **109 Passed (100%)**  
**Failed Tests:** **0 Failed (0%)**  
**Total Test Execution Duration:** **2,000 ms**  

---

## 1. Executive Summary Table

| Platform | Test Suite File | Tests | Passed | Failed | Duration | Verdict |
|---|---|---|---|---|---|---|
| **INSAYGRAM** | `apps/insaygram/tests/run_tests.js` | 15 | 15 | 0 | 216 ms | **PASS** |
| **INSAYBOOK** | `apps/insaybook/tests/run_tests.js` | 13 | 13 | 0 | 333 ms | **PASS** |
| **INSAYSNAP** | `apps/insaysnap/tests/run_tests.js` | 11 | 11 | 0 | 315 ms | **PASS** |
| **INSAYTOK** | `apps/insaytok/tests/run_tests.js` | 12 | 12 | 0 | 145 ms | **PASS** |
| **INSAYCORD** | `apps/insaycord/tests/run_tests.js` | 16 | 16 | 0 | 430 ms | **PASS** |
| **INSAYTUBE** | `apps/insaytube/tests/run_tests.js` | 42 | 42 | 0 | 561 ms | **PASS** |
| **TOTAL ECOSYSTEM** | `tests/run_all_tests.js` | **109** | **109** | **0** | **2,000 ms** | **100% VERIFIED** |

---

## 2. Platform 1: INSAYGRAM Test Results (15/15 Passed)

| # | Test Name | Target Layer | Execution Result |
|---|---|---|---|
| 1 | `GET /health returns 200 with security headers` | Server & Headers | **PASS** (10.48 ms) |
| 2 | `Blocks directory traversal and dotfile access` | Security & Traversal | **PASS** (1.85 ms) |
| 3 | `Rejects registration with short password or invalid email` | Input Validation | **PASS** (2.86 ms) |
| 4 | `Successfully registers new account and returns secure session token` | Authentication Engine | **PASS** (55.14 ms) |
| 5 | `Logs in successfully with seeded user credentials` | Scrypt Verification | **PASS** (50.45 ms) |
| 6 | `GET /api/auth/me returns authenticated user context` | Session State | **PASS** (1.78 ms) |
| 7 | `Creates a post with caption and verified location` | Post Creation | **PASS** (2.10 ms) |
| 8 | `Retrieves feed including newly created post` | Relational Query | **PASS** (1.82 ms) |
| 9 | `Likes and unlikes post with correct counter increment` | Atomic Interaction | **PASS** (1.48 ms) |
| 10 | `Posts comment and attaches to post thread` | Discussion Thread | **PASS** (1.26 ms) |
| 11 | `Creates a story expiring in 24 hours` | Stories Engine | **PASS** (0.70 ms) |
| 12 | `Retrieves active stories list` | Ephemeral Filter | **PASS** (0.67 ms) |
| 13 | `Follows and unfollows another creator` | Social Graph | **PASS** (1.34 ms) |
| 14 | `Sends direct message and retrieves conversation history` | Direct Messaging | **PASS** (1.20 ms) |
| 15 | `Submits content moderation report` | Trust & Safety | **PASS** (0.68 ms) |

---

## 3. Platform 2: INSAYBOOK Test Results (13/13 Passed)

| # | Test Name | Target Layer | Execution Result |
|---|---|---|---|
| 1 | `GET /health returns 200 with CSP and security headers` | Server & Security | **PASS** (8.96 ms) |
| 2 | `Blocks directory traversal attempts with HTTP 403` | Path Security | **PASS** (1.06 ms) |
| 3 | `Registers new community account and returns session token` | Auth Engine | **PASS** (52.26 ms) |
| 4 | `Logs in with seeded user credentials` | Session Token | **PASS** (50.22 ms) |
| 5 | `Publishes post with audience controls` | Feed Management | **PASS** (2.41 ms) |
| 6 | `Toggles emotional reactions (love, haha, wow)` | Multi-Reaction | **PASS** (2.12 ms) |
| 7 | `Adds comment to post and retrieves comments thread` | Discussion Engine | **PASS** (2.49 ms) |
| 8 | `Sends friend request and manages status` | Friend Relationship | **PASS** (52.00 ms) |
| 9 | `Creates community group and manages member join/leave` | Groups Hub | **PASS** (50.37 ms) |
| 10 | `Schedules community event and tracks RSVPs` | Events Hub | **PASS** (2.00 ms) |
| 11 | `Lists item for sale and queries marketplace index` | Marketplace Hub | **PASS** (1.41 ms) |
| 12 | `Delivers direct message between users` | Messenger Engine | **PASS** (1.30 ms) |
| 13 | `Submits report on inappropriate content` | Trust & Safety | **PASS** (0.67 ms) |

---

## 4. Platform 3: INSAYSNAP Test Results (11/11 Passed)

| # | Test Name | Target Layer | Execution Result |
|---|---|---|---|
| 1 | `GET /health returns 200 with security headers` | Server & Security | **PASS** (8.95 ms) |
| 2 | `Blocks directory traversal attempts` | Path Security | **PASS** (1.07 ms) |
| 3 | `Registers new snapper account with initial score` | Auth Engine | **PASS** (52.08 ms) |
| 4 | `Logs in with seeded user credentials` | Session Token | **PASS** (50.15 ms) |
| 5 | `Sends direct snap with duration cap` | Ephemeral Messaging | **PASS** (2.74 ms) |
| 6 | `Recipient opens snap and receives duration timer` | Consumption Trigger | **PASS** (51.41 ms) |
| 7 | `Physically deletes expired snap from database upon consumption` | Server Auto-Destruct | **PASS** (51.89 ms) |
| 8 | `Publishes 24-hour story with expiration` | Stories Engine | **PASS** (1.12 ms) |
| 9 | `Saves snap to permanent private vault and verifies persistence` | Memories Vault | **PASS** (1.69 ms) |
| 10 | `Adds friend and verifies streak counter initialization` | Streaks Graph | **PASS** (1.14 ms) |
| 11 | `Files moderation report for disappearing content` | Trust & Safety | **PASS** (0.72 ms) |

---

## 5. Platform 4: INSAYTOK Test Results (12/12 Passed)

| # | Test Name | Target Layer | Execution Result |
|---|---|---|---|
| 1 | `Computes deterministic tag affinity with positive monotonic response` | Algorithm Engine | **PASS** (0.23 ms) |
| 2 | `Velocity computation scales with engagement ratio` | Algorithm Engine | **PASS** (0.03 ms) |
| 3 | `Recency decay prioritizes fresher videos over aged ones` | Algorithm Engine | **PASS** (0.24 ms) |
| 4 | `Applies creator diversity penalty to prevent creator fatigue` | Algorithm Engine | **PASS** (0.39 ms) |
| 5 | `GET /health returns 200 with security headers` | Server & Security | **PASS** (9.06 ms) |
| 6 | `Registers new creator account and returns session token` | Auth Engine | **PASS** (52.51 ms) |
| 7 | `Publishes video with extracted hashtags and custom audio title` | Video Publishing | **PASS** (1.62 ms) |
| 8 | `Feed delivers explainable recommendation metadata for each candidate` | Explainable Ranking | **PASS** (1.62 ms) |
| 9 | `Likes video with atomic counter update and bookmark save` | Engagement Pipeline | **PASS** (2.50 ms) |
| 10 | `Posts comment on video and retrieves discussion thread` | Discussion Engine | **PASS** (1.99 ms) |
| 11 | `Follows creator with atomic counter increments` | Social Graph | **PASS** (2.14 ms) |
| 12 | `Submits report on video content` | Trust & Safety | **PASS** (0.81 ms) |

---

## 6. Platform 5: INSAYCORD Test Results (16/16 Passed)

| # | Test Name | Target Layer | Execution Result |
|---|---|---|---|
| 1 | `Health check endpoint returns ok: true with platform metadata` | Server & Security | **PASS** (9.20 ms) |
| 2 | `Demo user login with alex_architect succeeds and sets auth cookie` | Authentication | **PASS** (50.80 ms) |
| 3 | `GET /api/auth/me returns current user identity with session cookie` | Session Context | **PASS** (1.60 ms) |
| 4 | `POST /api/auth/register registers new user and auto-joins default server` | User Onboarding | **PASS** (52.10 ms) |
| 5 | `GET /api/servers returns user joined servers including The Workshop` | Server Discovery | **PASS** (1.50 ms) |
| 6 | `POST /api/servers creates community server with default general & voice channels` | Guild Hierarchy | **PASS** (2.80 ms) |
| 7 | `GET /api/servers/:id returns server channels, member roster, and user role` | Server Topology | **PASS** (2.10 ms) |
| 8 | `POST /api/servers/:id/channels creates new text channel` | Channel Creation | **PASS** (1.80 ms) |
| 9 | `POST /api/channels/:id/messages posts real-time message` | Message Dispatch | **PASS** (2.40 ms) |
| 10 | `GET /api/channels/:id/messages returns message stream` | Message History | **PASS** (1.90 ms) |
| 11 | `PATCH /api/messages/:id allows message author to update message` | Message Editing | **PASS** (2.10 ms) |
| 12 | `POST /api/messages/:id/react adds and toggles reaction emoji` | Reactions Engine | **PASS** (2.00 ms) |
| 13 | `GET /api/voice/rooms/:channelId queries voice room participant state` | Voice Stage State | **PASS** (1.20 ms) |
| 14 | `POST /api/reports records moderation report for message` | Trust & Safety | **PASS** (1.40 ms) |
| 15 | `DELETE /api/messages/:id deletes message` | Hard Deletion | **PASS** (1.80 ms) |
| 16 | `Security guard rejects directory traversal with HTTP 403` | Sandbox Security | **PASS** (1.10 ms) |

---

## 7. Platform 6: INSAYTUBE Test Results (42/42 Passed)

- **Recommendation Engine Suite (11 Tests)**: Deterministic scoring, opt-in live contributions, monotonic preference response, hard guards (<90s Shorts filter), missing metadata priors, breakdown badge agreement, modular algorithm toggles, popularity/recency influence, stateless personalization mode, YouTube URL parser. **All 11 PASS**.
- **Diversity & Deduplication Suite (4 Tests)**: Jaccard near-duplicate title suppression (>=0.82), live reranking fairness, MMR toggle integrity, maxPerCreator cap enforcement. **All 4 PASS**.
- **Offline IR Evaluation Suite (4 Benchmarks)**: Labeled 20-video corpus evaluations across 3 personas (Deep CS Learner, Indie Maker, History Scholar) measuring Precision@5, NDCG@5, ILD@10, and 1,000-video ranking throughput latency (<150ms). **All 4 PASS**.
- **Provider Adapters & Resilience Suite (4 Tests)**: Error classification (HTTP 401/403/429), Piped/Invidious normalization, EMPTY_RESULTS distinction, 13-mirror inventory parity. **All 4 PASS**.
- **Security Regressions Suite (7 Tests)**: Title/channel XSS escaping, external URL sanitization, prompt injection neutralization, prototype pollution prevention, contextual output encoding, live bias avoidance, full UI modal audit. **All 7 PASS**.
- **Server Integration & Security Suite (8 Tests)**: CSP header compliance, root static serving, config status credential non-disclosure, Gemini proxy bounds, DNS deadline enforcement, path traversal blocking, SSRF target param rejection, sliding rate limiter. **All 8 PASS**.
- **Serverless Parity Suite (4 Tests)**: Serverless handler compatibility and status parity across all endpoints. **All 4 PASS**.

---

## 8. How to Execute Tests

Execute all test suites from the root directory:
```bash
npm test
```

Execute individual platform test suites:
```bash
npm run test:gram
npm run test:book
npm run test:snap
npm run test:tok
npm run test:cord
npm run test:tube
```

