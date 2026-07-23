#!/bin/bash
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo ""
echo "🗂  TFSA Portfolio Intelligence"
echo "================================"

# Check Node
if ! command -v node &> /dev/null; then
  echo ""
  echo "❌  Node.js not found."
  echo "   Install it from: https://nodejs.org  (choose LTS)"
  echo ""
  read -p "Press Enter to exit..."
  exit 1
fi

NODE_VER=$(node --version | cut -d. -f1 | tr -d 'v')
if [ "$NODE_VER" -lt 18 ]; then
  echo "❌  Node.js v18+ required. You have $(node --version)."
  echo "   Update at: https://nodejs.org"
  exit 1
fi

# Install deps if missing
if [ ! -d "node_modules" ]; then
  echo ""
  echo "📦  Installing dependencies (first run — takes ~60s)…"
  npm install
fi

# Generate Prisma client
if [ ! -d "node_modules/.prisma/client" ]; then
  echo "🔧  Generating Prisma client…"
  npx prisma generate
fi

# Create DB and seed on first run
if [ ! -f "prisma/portfolio.db" ]; then
  echo "🗄   Creating local database…"
  export DATABASE_URL="file:./portfolio.db"
  npx prisma db push --skip-generate
  echo "🌱  Seeding your 14 holdings…"
  npx tsx prisma/seed.ts
fi

echo ""
echo "✅  All good! Opening http://localhost:3000"
echo "   Press Ctrl+C anytime to stop."
echo ""

export DATABASE_URL="file:./portfolio.db"
npm run dev
