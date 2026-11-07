# INSAYTOK — Short-Form Video Entertainment Platform

**Version:** 1.0.0  
**Status:** IMPLEMENTED & VERIFIED  
**Default Port:** 4176  

Insaytok is an independent short-form vertical video social platform engineered for high-engagement creator storytelling, vertical swipe navigation, and genuinely transparent, explainable algorithmic recommendations.

---

## 1. Key Capabilities

- **Vertical Swipeable Video Feed:** Full-height viewport snap scrolling with keyboard arrow navigation and mobile touch gestures.
- **Explainable Recommendation Engine:** Adapted from urYouTube's transparent information retrieval scoring. Rather than black-box randomization, Insaytok computes measurable interest affinity, engagement velocity, half-life recency decay, and creator fatigue penalties.
- **Why This Video? Transparency Badge:** Viewers can inspect the exact mathematical contribution breakdown on any video.
- **Video Upload Studio:** Direct MP4/WebM uploads with automatic hashtag extraction and custom sound audio attribution.
- **Creator Social Graph:** Creator follower counts, follow/unfollow toggle, and user video galleries.
- **Interactive Floating Rail:** Pulsating like heart, slide-over comments sheet, bookmarking, and rotating vinyl sound disc.
- **Watch History & Personalization:** Automatic watch completion rate tracking feed learning loops.
- **Trust & Moderation:** Reporting queue for copyright, spam, or harmful content.

---

## 2. Architecture & Tech Stack

- **Runtime:** Node.js (>=18)
- **Database:** Embedded SQLite via native `DatabaseSync` (`data/insaytok.db`) with WAL mode.
- **Recommendation Algorithm:** Multi-factor scoring model in `src/server/recommendation.js`.
- **Security:** CSP, X-Frame-Options: DENY, X-Content-Type-Options: nosniff, sliding-window rate limiting.

---

## 3. Running the Application

### Start Production Server
```bash
npm start
```
Runs at `http://127.0.0.1:4176`.

### Run Verification Suite
```bash
npm test
```
Executes 12 automated unit and integration tests verifying recommendation monotonicity, diversity, and video lifecycles.

---

## 4. Seed Creator Accounts

Default password for all seed accounts: `InsayPassword123!`

- `earth.minute` (Nature & deep-sea bioluminescence)
- `buildwithlee` (Minimalist desk DIY maker)
- `motionlab` (Kinetic typography & 3D visual loops)
- `demo_user` (Active demo creator)
