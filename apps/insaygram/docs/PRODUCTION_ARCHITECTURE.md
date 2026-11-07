# Production architecture boundary

## Services
- Identity: account registration, verified contact methods, sessions, recovery, device/session revocation.
- Social graph: follows/friends, blocks, mutes, group membership and roles.
- Content: posts, comments, reactions, visibility and lifecycle state.
- Media: signed upload URLs, virus scanning, transcoding, thumbnailing, storage lifecycle and CDN delivery.
- Feed: candidate retrieval, explicit ranking policy, pagination and user controls.
- Messaging: conversations, membership, delivery/read receipts, attachments and WebSocket fanout.
- Trust & safety: reports, moderation decisions, appeals, rate limits and audit events.

## Suggested relational entities
`users`, `sessions`, `profiles`, `follows`, `friendships`, `blocks`, `posts`, `media_assets`, `comments`, `reactions`, `groups`, `group_members`, `conversations`, `conversation_members`, `messages`, `reports`, `moderation_actions`, `notifications`, `user_preferences`. Add only entities required by each product.

## API boundary (illustrative, not implemented)
- `POST /v1/auth/register`, `POST /v1/auth/login`, `POST /v1/auth/logout`
- `GET/PATCH /v1/me`, `GET /v1/users/:id`
- `GET/POST /v1/posts`, `GET/PATCH/DELETE /v1/posts/:id`
- `POST /v1/posts/:id/reactions`, `GET/POST /v1/posts/:id/comments`
- `POST /v1/media/upload-intents`, `POST /v1/media/:id/complete`
- `GET /v1/feed`, `POST /v1/reports`
- Product-specific graph, group, story, video or chat endpoints as applicable.

## Non-negotiable safeguards
Authorization must be enforced server-side on every object. Validate schemas and media type/size; encode output; use CSRF protection where cookie sessions are used; secure cookies; rate-limit auth, posting and messaging; keep secrets server-side; encrypt transport and backups; implement deletion/export; establish moderation and incident response before public launch. Expiring content requires server-side expiry and deletion policies, not merely hiding it in a client.

## Current scope
The shipped app does not implement this API. The browser-only local demo is deliberately explicit about that boundary.
