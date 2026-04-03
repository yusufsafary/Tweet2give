#!/bin/bash
# Script untuk push Tweet2Give ke GitHub
# Jalankan: bash push-to-github.sh
# Pastikan Anda sudah login GitHub di terminal ini

set -e

REPO_URL="https://github.com/yusufsafary/Tweet2give.git"
BRANCH="main"

echo "================================================"
echo "  Tweet2Give — Push ke GitHub"
echo "  Repo: $REPO_URL"
echo "================================================"

# Pastikan kita di folder tweet2give
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo ""
echo "[1/5] Inisialisasi git (jika belum)..."
git init
git checkout -B main 2>/dev/null || true

echo ""
echo "[2/5] Tambahkan remote origin..."
git remote remove origin 2>/dev/null || true
git remote add origin "$REPO_URL"
echo "      Remote: $REPO_URL"

echo ""
echo "[3/5] Staging semua file..."
git add -A
git status --short

echo ""
echo "[4/5] Commit..."
git config user.email "tweet2give@arthousebase.dev" 2>/dev/null || true
git config user.name "Tweet2Give" 2>/dev/null || true

git commit -m "feat: Tweet2Give smart contract + Vercel serverless setup

Core smart contracts:
- Tweet2Give.sol: donations, quorum voting, withdrawal proposals, fee system
- Tweet2GiveGovernor.sol: DAO governance layer
- Tweet2GiveFactory.sol: multi-deployment factory
- MockERC20.sol: test mock token

Vercel serverless API:
- GET /api/health, /api/stats
- GET /api/creators, /api/creators/:handle
- GET /api/proposals
- GET|POST /api/vote
- GET /api/donations/recent

Infrastructure:
- Deploy & seed scripts (Base Sepolia + Base Mainnet)
- GitHub Actions CI/CD (test, lint, gas, Vercel deploy)
- AUDIT.md: kesiapan file dan daftar kekurangan
- README.md: dokumentasi lengkap

Networks: Base (USDC via @bankrbot) + Solana (manual)
Demo phase: 0% platform fee" || echo "Nothing to commit or already committed"

echo ""
echo "[5/5] Push ke GitHub..."
git push -u origin main --force

echo ""
echo "================================================"
echo "  ✓ BERHASIL! File sudah di GitHub:"
echo "  https://github.com/yusufsafary/Tweet2give"
echo "================================================"
echo ""
echo "Langkah selanjutnya:"
echo "  1. Buka repo di GitHub dan cek semua file"
echo "  2. Tambahkan GitHub Secrets (lihat AUDIT.md)"
echo "  3. Connect repo ke Vercel untuk auto-deploy"
echo "  4. Isi .env dari .env.example lalu deploy testnet:"
echo "     npm install && npm run compile && npm run deploy:testnet"
