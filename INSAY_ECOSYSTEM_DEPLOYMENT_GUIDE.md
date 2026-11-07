# INSAY SOCIAL NETWORK ECOSYSTEM — PRODUCTION DEPLOYMENT GUIDE

**Author:** Autonomous Principal DevOps & Infrastructure Engineering Team  
**Version:** 1.0.0  
**Target Environments:** Bare-Metal Linux/macOS, Docker, Kubernetes, Nginx / Caddy Reverse Proxy  

---

## 1. System Requirements

- **Runtime**: Node.js >= 22.0.0 (uses built-in `node:sqlite`, `crypto`, `http`).
- **Operating System**: Linux (Ubuntu 22.04 LTS, Debian 12, Alpine 3.19), macOS (macOS 14+), or containerized equivalents.
- **Memory**: 
  - Minimum: 512 MB RAM total for entire 5-platform ecosystem.
  - Recommended: 2 GB RAM for production traffic.
- **Storage**: SSD with standard POSIX file locking support (for SQLite WAL journal files).

---

## 2. Fast Local Deployment

To run all six platforms simultaneously on localhost:

```bash
# 1. Enter repository
cd /path/to/social-platforms-suite

# 2. Start ecosystem supervisor
npm start
# or: node ecosystem.js
```

The supervisor binds to the following local endpoints:
- **INSAYGRAM**: `http://127.0.0.1:4173`
- **INSAYBOOK**: `http://127.0.0.1:4174`
- **INSAYSNAP**: `http://127.0.0.1:4175`
- **INSAYTOK**: `http://127.0.0.1:4176`
- **INSAYCORD**: `http://127.0.0.1:4177`
- **INSAYTUBE**: `http://127.0.0.1:4178`

To run any platform as an independent standalone service:
```bash
cd apps/insaygram && npm start # Binds to port 4173
# Or specify a custom port:
PORT=8080 npm start
```

---

## 3. Environment Variable Configuration

Each platform recognizes the following environment variables:

| Variable | Default Value | Description |
|---|---|---|
| `PORT` | Platform Default (`4173`–`4177`) | TCP port for the HTTP/WebSocket server |
| `NODE_ENV` | `development` | Setting to `production` enables strict caching and logging optimizations |
| `HOST` | `127.0.0.1` | Network interface to bind (use `0.0.0.0` inside containers) |

---

## 4. Containerization (Docker & Docker Compose)

### 4.1 Production Dockerfile (`Dockerfile`)
A lean, zero-dependency Alpine container:

```dockerfile
FROM node:22-alpine

WORKDIR /app

# Copy root package descriptor
COPY package.json ./

# Copy core modules and applications
COPY packages ./packages
COPY apps ./apps
COPY ecosystem.js ./

# Create data and uploads directories for persistence
RUN mkdir -p /app/data /app/uploads

EXPOSE 4173 4174 4175 4176 4177 4178

CMD ["node", "ecosystem.js"]
```

### 4.2 Docker Compose (`docker-compose.yml`)
Run the entire ecosystem with isolated persistent volumes:

```yaml
version: '3.8'

services:
  insay-ecosystem:
    build: .
    restart: always
    ports:
      - "4173:4173" # Insaygram
      - "4174:4174" # Insaybook
      - "4175:4175" # Insaysnap
      - "4176:4176" # Insaytok
      - "4177:4177" # Insaycord
      - "4178:4178" # Insaytube
    volumes:
      - insaygram-data:/app/apps/insaygram/data
      - insaygram-uploads:/app/apps/insaygram/uploads
      - insaybook-data:/app/apps/insaybook/data
      - insaybook-uploads:/app/apps/insaybook/uploads
      - insaysnap-data:/app/apps/insaysnap/data
      - insaysnap-uploads:/app/apps/insaysnap/uploads
      - insaytok-data:/app/apps/insaytok/data
      - insaytok-uploads:/app/apps/insaytok/uploads
      - insaycord-data:/app/apps/insaycord/data
      - insaycord-uploads:/app/apps/insaycord/uploads
      - insaytube-data:/app/apps/insaytube/data
      - insaytube-uploads:/app/apps/insaytube/uploads
    environment:
      - NODE_ENV=production

volumes:
  insaygram-data:
  insaygram-uploads:
  insaybook-data:
  insaybook-uploads:
  insaysnap-data:
  insaysnap-uploads:
  insaytok-data:
  insaytok-uploads:
  insaycord-data:
  insaycord-uploads:
```

---

## 5. Reverse Proxy & Domain Routing (Nginx)

In production, terminate TLS and route incoming subdomains to the respective platform ports with full WebSocket support:

```nginx
# Insaygram: gram.example.com -> 127.0.0.1:4173
server {
    listen 443 ssl http2;
    server_name gram.example.com;

    ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

    client_max_body_size 30M;

    location / {
        proxy_pass http://127.0.0.1:4173;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Insaycord: cord.example.com -> 127.0.0.1:4177 (Real-Time WebSocket & Audio Signaling)
server {
    listen 443 ssl http2;
    server_name cord.example.com;

    ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

    client_max_body_size 25M;

    location / {
        proxy_pass http://127.0.0.1:4177;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 6. Database Maintenance & Hot Backups

Because all platforms use SQLite in Write-Ahead Logging (WAL) mode, online backups can be executed without stopping the servers or interrupting client read/write transactions:

```bash
# Non-blocking online snapshot of Insaygram
sqlite3 apps/insaygram/data/insaygram.db ".backup 'backups/insaygram-$(date +%Y%m%d%H%M%S).db'"

# Non-blocking online snapshot of Insaybook
sqlite3 apps/insaybook/data/insaybook.db ".backup 'backups/insaybook-$(date +%Y%m%d%H%M%S).db'"
```

---

## 7. Health Checks & Synthetic Monitoring

Each platform exposes an unauthenticated health check endpoint:
```http
GET /health HTTP/1.1
```

Response:
```json
{
  "ok": true,
  "platform": "insaygram",
  "version": "1.0.0",
  "mode": "production"
}
```

Configure your infrastructure monitoring (Uptime Kuma, Prometheus, or Datadog) to alert if `/health` fails or returns a non-200 HTTP status code.

