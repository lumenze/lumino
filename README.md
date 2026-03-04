# Lumino — The Only AI-Native Digital Adoption Layer

> By Lumenze

## Architecture

```
lumino/
├── packages/
│   ├── shared/          # Types, validators, constants (shared contract)
│   ├── sdk/             # Embeddable SDK (Vanilla TS + Rollup IIFE/ESM)
│   ├── server/          # Core API (Node.js + Fastify + Prisma)
│   └── ai-services/     # AI/ML services (Python + FastAPI)
├── apps/
│   ├── novapay/         # Reference app: Fintech dashboard (Next.js)
│   └── novaconnect/     # Reference app: Payments portal (Next.js)
├── infrastructure/
│   ├── docker/          # Docker Compose + Dockerfiles
│   ├── k8s/             # Kubernetes manifests (Phase 2)
│   └── scripts/         # Utility scripts
└── docs/                # Architecture docs, API specs
```

## Package Boundaries

| Package | Language | Responsibility | Depends On |
|---------|----------|---------------|------------|
| `@lumino/shared` | TypeScript | Types, validators, constants | — |
| `@lumino/sdk` | TypeScript | Embeddable widget (Shadow DOM) | `shared` |
| `@lumino/server` | TypeScript + Fastify | API, auth, analytics | `shared` |
| `ai-services` | Python + FastAPI | NL matching, health, translation | — |
| `@lumino/novapay` | Next.js | Demo reference app | — |
| `@lumino/novaconnect` | Next.js | Demo reference app (cross-app) | — |

## Tech Stack

- **SDK**: Vanilla TypeScript, Rollup (IIFE + ESM), Shadow DOM isolation
- **Server**: Node.js 20 + Fastify + Prisma ORM + Zod validation
- **AI**: Python 3.11+ + FastAPI + AIProvider abstraction (cloud → local swap)
- **Data**: PostgreSQL 16 (JSONB + pgvector) + Redis 7
- **Build**: pnpm workspaces + Turborepo + Rollup (SDK)
- **Deploy**: Docker Compose (MVP) → Kubernetes (Phase 2)

## Ports

| Service | Port |
|---------|------|
| Lumino Server | 3000 |
| NovaPay (demo app) | 3100 |
| NovaConnect (demo app) | 3200 |
| AI Services | 8000 |
| PostgreSQL | 5432 |
| Redis | 6379 |

## Quick Start (Full Stack)

```bash
# Prerequisites: Node.js 20+, pnpm 9+, Docker

# 1. Install dependencies
pnpm install

# 2. Start databases (PostgreSQL + Redis)
docker compose -f infrastructure/docker/docker-compose.yml up -d postgres redis

# 3. Run Prisma migrations
DATABASE_URL="postgresql://lumino:lumino@localhost:5432/lumino" \
  npx prisma migrate deploy --schema=packages/server/prisma/schema.prisma

# 4. Generate Prisma client
DATABASE_URL="postgresql://lumino:lumino@localhost:5432/lumino" \
  npx prisma generate --schema=packages/server/prisma/schema.prisma

# 5. Build packages (order matters: shared → sdk → server)
pnpm --filter @lumino/shared build
pnpm --filter @lumino/sdk build
pnpm --filter @lumino/server build

# 6. Start server
DATABASE_URL="postgresql://lumino:lumino@localhost:5432/lumino" pnpm --filter @lumino/server start &


# 7. Start NovaPay demo (in a separate terminal)
pnpm --filter @lumino/novapay dev &

```

Then open http://localhost:3100 in your browser.

## Restart Commands

### Kill everything and restart

```bash
# Kill existing processes on ports 3000 and 3100
kill -9 $(lsof -ti:3000) $(lsof -ti:3100) 2>/dev/null

# Start server
DATABASE_URL="postgresql://lumino:lumino@localhost:5432/lumino" \
  pnpm --filter @lumino/server dev &

# Start NovaPay
pnpm --filter novapay dev &
```

### Rebuild SDK after changes

```bash
pnpm --filter @lumino/sdk build
# Then refresh browser — server serves SDK from packages/sdk/dist/
```

### Rebuild everything

```bash
pnpm --filter @lumino/shared build && \
pnpm --filter @lumino/sdk build && \
pnpm --filter @lumino/server build
```

### Restart databases

```bash
docker compose -f infrastructure/docker/docker-compose.yml down
docker compose -f infrastructure/docker/docker-compose.yml up -d postgres redis
```

## Database Access (PostgreSQL)

### Connect to the database

```bash
# Interactive psql shell
docker exec -it lumino-postgres psql -U lumino -d lumino
```

### Useful queries

```sql
-- List all tables
\dt

-- View all walkthroughs
SELECT id, app_id, status, creat




ed_at, published_at FROM walkthroughs;

-- View published walkthroughs with step count
SELECT w.id, w.status,
       v.version,
       jsonb_array_length(v.definition->'steps') AS step_count,
       v.definition->>'title' AS title
FROM walkthroughs w
JOIN walkthrough_versions v ON v.walkthrough_id = w.id
WHERE w.status = 'PUBLISHED'
ORDER BY w.updated_at DESC;

-- View user progress
SELECT user_id, walkthrough_id, completed, current_step_id, updated_at
FROM user_progress;

-- View walkthrough definition (full JSON)
SELECT v.definition
FROM walkthrough_versions v
JOIN walkthroughs w ON w.id = v.walkthrough_id
WHERE w.status = 'PUBLISHED'
LIMIT 1;

-- Reset all user progress (for fresh demo)
DELETE FROM user_progress;

-- View analytics events
SELECT event_type, walkthrough_id, created_at FROM analytics_events ORDER BY created_at DESC LIMIT 20;
```

### Database credentials (dev only)

| Setting | Value |
|---------|-------|
| Host | localhost |
| Port | 5432 |
| Database | lumino |
| User | lumino |
| Password | lumino |
| Connection string | `postgresql://lumino:lumino@localhost:5432/lumino` |

## Redis Access

```bash
# Connect to Redis CLI
docker exec -it lumino-redis redis-cli

# View all keys
KEYS *

# Check a specific key
GET <key>
```

## Demo: Two Personas

The NovaPay demo has a persona switcher (bottom-left corner) with two roles:

| Persona | Name | Role | What they see |
|---------|------|------|---------------|
| Author | Alex Chen | `author` | Record Guide FAB + notifications + walkthrough playback |
| Customer | Sarah Johnson | `customer` | Notifications + walkthrough playback |

Personas are stored in `localStorage('lumino_demo_role')`. Switching reloads the page and re-initializes the SDK with a new JWT.

### Token endpoint

```
GET http://localhost:3100/api/lumino-token?role=customer
GET http://localhost:3100/api/lumino-token?role=author
```

### Minimal Host Integration

For host apps, integration is a single script tag:

```html
<script
  src="/lumino/sdk/v1/lumino.js"
  data-lumino-app-id="novapay-dashboard"
  data-lumino-token-endpoint="/api/lumino-token"
  data-lumino-api-url="/lumino"
  data-lumino-environment="development"
  data-lumino-debug="true"
></script>
```

Implemented in NovaPay layout:
[apps/novapay/src/app/layout.tsx](apps/novapay/src/app/layout.tsx)

Auto-init behavior is implemented in:
[packages/sdk/src/index.ts](packages/sdk/src/index.ts)

## API Endpoints

### Walkthroughs

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/walkthroughs` | Author/Admin | Create walkthrough |
| GET | `/api/v1/walkthroughs?appId=` | Author/Admin | List all walkthroughs |
| GET | `/api/v1/walkthroughs/published?appId=` | Any | List published walkthroughs |
| GET | `/api/v1/walkthroughs/:id` | Author/Admin | Get walkthrough by ID |
| POST | `/api/v1/walkthroughs/:id/versions` | Author/Admin | Create new version |
| POST | `/api/v1/walkthroughs/:id/publish` | Admin | Publish walkthrough |
| POST | `/api/v1/walkthroughs/:id/archive` | Admin | Archive walkthrough |

### User State

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/user-state/progress` | Any | Get all progress for user |
| GET | `/api/v1/user-state/progress/:walkthroughId` | Any | Get progress for one walkthrough |
| PUT | `/api/v1/user-state/progress` | Any | Upsert progress |
| DELETE | `/api/v1/user-state/progress/:walkthroughId` | Any | Delete progress |

### Other

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Server health check |
| GET | `/sdk/v1/lumino.js` | SDK bundle (IIFE) |
| POST | `/api/v1/auth/verify` | Verify JWT token |

## Key Decisions

- **Full version history**: Every walkthrough edit creates a new version
- **JSONB storage**: Flexible walkthrough definitions, queryable
- **Max selector signals**: CSS, text, aria, DOM path, visual hash, bounding box
- **Script tag distribution**: Self-hosted from on-prem backend
- **Explicit init**: `Lumino.init()` gives customer full control
- **JWT auth**: HMAC or RSA, 3 roles (customer/author/admin), no PII
- **Cloud AI for MVP**: Behind abstraction layer, swap to local models for production

---

CONFIDENTIAL — Lumenze © 2026
