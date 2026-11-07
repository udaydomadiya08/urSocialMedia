# INSAYTUBE — Open, User-Controlled Long-Form Video Platform

**INSAYTUBE** is an open-source, local-first long-form video recommendation and discovery platform where **the user—not the platform algorithm—controls ranking, discovery, and digital wellbeing**.

It provides modular multi-algorithm equalizers (BM25, Content-Based, Item Similarity, Collaborative Filtering, Novelty Exploration, MMR Diversity), user-controlled objective weights, topic presets, YouTube search proxies with SSRF protection, and zero external npm runtime dependencies.

Part of the **INSAY Social Platforms Suite**.

---

## 1. Product Capabilities

- **User-Controlled Algorithm Equalizer**: Toggle and adjust weights for BM25 keyword matching, collaborative filtering, video similarity, novelty exploration, and diversity reranking.
- **Digital Wellbeing Presets**: Pre-configured profiles including *Deep CS Monk Mode*, *Indie Maker Explorer*, and *Long-Form History Scholar*.
- **Zero-Bias Popularity Control**: Set popularity and view count influence to 0% so quality and depth win over algorithmic clickbait.
- **Zero-Key Local Video Playback**: Paste any YouTube link or Video ID to add, score, and play videos without needing Google Cloud API keys.
- **Live Search Proxy**: Server-side YouTube API proxy with automatic fallback to allowlisted HTTPS Piped/Invidious mirrors.
- **Algorithmic Transparency**: Full mathematical score breakdown badge on every video card detailing why it was recommended.

---

## 2. Quick Start

### Starting the Server
```bash
npm start
```
Binds to port `4178` by default (or the port specified by the `PORT` environment variable).  
Access the web app at: `http://127.0.0.1:4178`

### Running the QA Verification Suite
```bash
npm test
```
Executes the comprehensive 42-test verification and Information Retrieval (IR) evaluation benchmark suite.

---

## 3. Technology Stack

- **Runtime**: Node.js >= 22 (zero external npm runtime dependencies).
- **Architecture**: Local-first vanilla ES6+ engine with client-side vector scoring, offline fallback CSS, and hardened HTTP reverse-proxy server.
- **Port**: `4178` (configurable via `PORT`).
- **Security**: Strict Content Security Policy (CSP), anti-SSRF allowlist, rate limiting, and path traversal guards.

---

## 4. License

MIT License. See `LICENSE`.
