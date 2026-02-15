#!/bin/bash
# LifeOS Initial Setup
# Run this after cloning the repo.

set -euo pipefail

echo "🧠 LifeOS Setup"
echo ""

# Check prerequisites
echo "Checking prerequisites..."

if ! command -v node &> /dev/null; then
  echo "❌ Node.js not found. Install v20+: https://nodejs.org"
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  echo "❌ Node.js v20+ required (found v${NODE_VERSION})"
  exit 1
fi
echo "  ✅ Node.js $(node -v)"

if ! command -v git &> /dev/null; then
  echo "❌ Git not found"
  exit 1
fi
echo "  ✅ Git $(git --version | awk '{print $3}')"

if ! command -v gcloud &> /dev/null; then
  echo "  ⚠️  gcloud CLI not found (optional, needed for deployment)"
  echo "     Install: brew install google-cloud-sdk"
fi

echo ""

# Install dependencies
echo "Installing dependencies..."
npm install
echo "  ✅ Dependencies installed"
echo ""

# Check for .env
if [ ! -f .env ]; then
  cp .env.example .env
  echo "📝 Created .env from .env.example"
  echo "   Edit .env and fill in your values (see docs/setup-guide.md)"
  echo ""
else
  echo "  ✅ .env exists"
fi

# Build
echo "Building packages..."
npm run build 2>/dev/null || {
  echo "  ⚠️  Build failed — this is expected before configuring .env"
  echo "     Run 'npm run build' again after setting up your .env"
}
echo ""

echo "═══════════════════════════════════════"
echo "  ✅ Setup complete!"
echo ""
echo "  Next steps:"
echo "  1. Edit .env with your credentials"
echo "  2. Run: npm run auth"
echo "  3. Run: npm run build"
echo "  4. Test: npm run dev:obsidian"
echo "  5. Deploy: npm run deploy"
echo ""
echo "  Full guide: docs/setup-guide.md"
echo "═══════════════════════════════════════"
