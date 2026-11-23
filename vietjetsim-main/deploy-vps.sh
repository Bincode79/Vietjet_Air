#!/bin/bash
# VPS Deployment Script for Vietjet Air

set -e

echo "=== Vietjet Air - VPS Deployment ==="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Build application
echo -e "${YELLOW}[1/6] Building application...${NC}"
npm run build

# Step 2: Create deployment package
echo -e "${YELLOW}[2/6] Creating deployment package...${NC}"
rm -rf deploy-package
mkdir -p deploy-package/.next
mkdir -p deploy-package/scripts
mkdir -p deploy-package/logs

cp -r .next/standalone/* deploy-package/
cp -r .next/static deploy-package/.next/
cp -r public deploy-package/
cp package.json deploy-package/
cp scripts/start-standalone.cjs deploy-package/scripts/
cp ecosystem.config.js deploy-package/
if [ -f .env.production ]; then
  cp .env.production deploy-package/.env
elif [ -f .env.production.example ]; then
  cp .env.production.example deploy-package/.env
fi

# Step 3: Archive
echo -e "${YELLOW}[3/6] Creating archive...${NC}"
cd deploy-package
tar -czf ../vietjet-$(date +%Y%m%d-%H%M%S).tar.gz .
cd ..
rm -rf deploy-package

echo -e "${GREEN}✓ Deployment package created!${NC}"
echo ""
echo "Latest archive:"
ls -lh vietjet-*.tar.gz | tail -1
echo ""
echo "=== Next Steps ==="
echo "1. Upload to VPS: scp vietjet-*.tar.gz user@your-vps:/opt/vietjet/"
echo "2. SSH to VPS: ssh user@your-vps"
echo "3. Extract: cd /opt/vietjet && tar -xzf vietjet-*.tar.gz"
echo "4. Set environment variables in .env"
echo "5. Install PM2: npm install -g pm2"
echo "6. Start: pm2 start ecosystem.config.js"
echo "7. Save PM2: pm2 save && pm2 startup"
echo ""
echo "=== Required Environment Variables on VPS ==="
echo "DATABASE_URL=postgresql://user:pass@host:5432/dbname"
echo "JWT_SECRET=<generate with: openssl rand -hex 32>"
echo "JWT_REFRESH_SECRET=<generate with: openssl rand -hex 32>"
echo "CAPTCHA_SECRET=<generate with: openssl rand -hex 32>"
