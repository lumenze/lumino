#!/bin/bash
set -e

echo "╔══════════════════════════════════════════════╗"
echo "║   Lumino — First Run Setup                    ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# Check prerequisites
command -v node >/dev/null 2>&1 || { echo "❌ Node.js 20+ required"; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "❌ pnpm 9+ required. Install: npm i -g pnpm"; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "❌ Docker required for databases"; exit 1; }

echo "1/5  Starting databases..."
docker compose -f infrastructure/docker/docker-compose.yml up -d postgres redis
echo "     Waiting for PostgreSQL..."
sleep 3

echo "2/5  Installing dependencies..."
pnpm install

echo "3/5  Building shared package..."
pnpm --filter @lumino/shared build

echo "4/5  Running database migrations..."
cd packages/server
npx prisma generate
npx prisma migrate dev --name init 2>/dev/null || npx prisma db push
cd ../..

echo "5/5  Seeding database..."
pnpm db:seed

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   ✅ Setup complete!                         ║"
echo "║                                              ║"
echo "║   Start development:                         ║"
echo "║     pnpm dev:server    → localhost:3000      ║"
echo "║     pnpm dev:novapay   → localhost:3100      ║"
echo "║                                              ║"
echo "║   Or start everything:                       ║"
echo "║     pnpm dev                                 ║"
echo "╚══════════════════════════════════════════════╝"
