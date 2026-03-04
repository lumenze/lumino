#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════════════════
# Lumino — Development Setup & Start
# Starts PostgreSQL + Redis via Docker, runs migrations, builds SDK,
# then starts the server and NovaPay reference app.
# ═══════════════════════════════════════════════════════════════════════════

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info() { echo -e "${BLUE}[lumino]${NC} $1"; }
ok() { echo -e "${GREEN}[lumino]${NC} $1"; }
warn() { echo -e "${YELLOW}[lumino]${NC} $1"; }
err() { echo -e "${RED}[lumino]${NC} $1"; }

# ── Check prerequisites ─────────────────────────────────────────────────

info "Checking prerequisites..."

if ! command -v node &>/dev/null; then
  err "Node.js not found. Install Node.js 20+."
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  err "Node.js 20+ required. Found v$(node -v)."
  exit 1
fi

if ! command -v pnpm &>/dev/null; then
  warn "pnpm not found. Installing..."
  npm install -g pnpm@9
fi

if ! command -v docker &>/dev/null; then
  err "Docker not found. Install Docker to run PostgreSQL and Redis."
  exit 1
fi

ok "Prerequisites OK (Node $(node -v), pnpm $(pnpm -v))"

# ── Start databases ─────────────────────────────────────────────────────

info "Starting PostgreSQL and Redis..."

docker compose -f infrastructure/docker/docker-compose.yml up -d postgres redis

# Wait for Postgres
info "Waiting for PostgreSQL..."
for i in $(seq 1 30); do
  if docker exec lumino-postgres pg_isready -U lumino &>/dev/null; then
    ok "PostgreSQL ready"
    break
  fi
  if [ "$i" -eq 30 ]; then
    err "PostgreSQL failed to start"
    exit 1
  fi
  sleep 1
done

# Wait for Redis
info "Waiting for Redis..."
for i in $(seq 1 15); do
  if docker exec lumino-redis redis-cli ping &>/dev/null; then
    ok "Redis ready"
    break
  fi
  if [ "$i" -eq 15 ]; then
    err "Redis failed to start"
    exit 1
  fi
  sleep 1
done

# ── Install dependencies ────────────────────────────────────────────────

info "Installing dependencies..."
pnpm install

# ── Setup environment ───────────────────────────────────────────────────

if [ ! -f .env ]; then
  info "Creating .env from template..."
  cp .env.example .env
  ok ".env created"
fi

# ── Build shared package ────────────────────────────────────────────────

info "Building @lumino/shared..."
pnpm --filter @lumino/shared build
ok "Shared package built"

# ── Generate Prisma client + run migrations ─────────────────────────────

info "Running Prisma generate + migrate..."
cd packages/server
export DATABASE_URL="postgresql://lumino:lumino@localhost:5432/lumino"
npx prisma generate
npx prisma migrate dev --name init 2>/dev/null || npx prisma db push --force-reset
cd "$ROOT"
ok "Database schema applied"

# ── Seed database ───────────────────────────────────────────────────────

info "Seeding database..."
cd packages/server
npx tsx src/database/seeds/seed.ts || warn "Seed may have already been applied"
cd "$ROOT"
ok "Database seeded"

# ── Build SDK ───────────────────────────────────────────────────────────

info "Building @lumino/sdk..."
pnpm --filter @lumino/sdk build
ok "SDK built (dist/lumino.js)"

# ── Start services ──────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}══════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Lumino development environment ready!${NC}"
echo -e "${GREEN}══════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  ${BLUE}Server:${NC}     http://localhost:3000"
echo -e "  ${BLUE}NovaPay:${NC}    http://localhost:3100"
echo -e "  ${BLUE}SDK:${NC}        http://localhost:3000/sdk/v1/lumino.js"
echo -e "  ${BLUE}API docs:${NC}   http://localhost:3000/health"
echo -e "  ${BLUE}PostgreSQL:${NC} localhost:5432"
echo -e "  ${BLUE}Redis:${NC}      localhost:6379"
echo ""
echo -e "  Starting server and NovaPay in parallel..."
echo -e "  Press ${YELLOW}Ctrl+C${NC} to stop all services."
echo ""

# Start server and NovaPay in parallel
trap "kill 0; exit" SIGINT SIGTERM

pnpm --filter @lumino/server dev &
SERVER_PID=$!

# Give server a moment to start
sleep 2

pnpm --filter @lumino/novapay dev &
NOVAPAY_PID=$!

wait
