#!/bin/bash
# Complete VPS Deployment Package Builder

set -e

echo "=== Vietjet Air - Complete VPS Deployment Package ==="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Step 1: Build application
echo -e "${YELLOW}[1/7] Building application...${NC}"
npm run build

# Step 2: Create deployment package
echo -e "${YELLOW}[2/7] Creating deployment package...${NC}"
rm -rf deploy-package
mkdir -p deploy-package/.next
mkdir -p deploy-package/scripts
mkdir -p deploy-package/logs
mkdir -p deploy-package/vps-scripts

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

# Copy VPS management scripts
cp vps-scripts/*.sh deploy-package/vps-scripts/
cp vps-scripts/README.md deploy-package/vps-scripts/
chmod +x deploy-package/vps-scripts/*.sh

# Copy documentation
cp DEPLOY_VPS_GUIDE.md deploy-package/
cp README.md deploy-package/ 2>/dev/null || echo "README.md not found, skipping"

echo -e "${GREEN}✓ Package structure created${NC}"

# Step 3: Create deployment info
echo -e "${YELLOW}[3/7] Creating deployment info...${NC}"
cat > deploy-package/DEPLOYMENT_INFO.txt << ENDINFO
===========================================
Vietjet Air - Deployment Package
===========================================

Build Date: $(date '+%Y-%m-%d %H:%M:%S %Z')
Package Version: $(date +%Y%m%d-%H%M%S)
Node.js Version Required: 18.17+ or 20.x
Production Port: 4028

===========================================
CONTENTS
===========================================

.next/               - Next.js production build
public/              - Static assets
scripts/             - Standalone server script
vps-scripts/         - VPS management scripts
  ├── backup.sh      - Backup configuration
  ├── update.sh      - Update deployment
  ├── health-check.sh - System health check
  └── README.md      - Scripts documentation
logs/                - Log directory (empty)
ecosystem.config.js  - PM2 configuration
.env                 - Environment variables (TEMPLATE - MUST CONFIGURE)
package.json         - Package metadata
DEPLOY_VPS_GUIDE.md  - Complete deployment guide

===========================================
QUICK START
===========================================

1. Extract on VPS:
   tar -xzf vietjet-*.tar.gz -C /opt/vietjet

2. Configure environment:
   cd /opt/vietjet
   nano .env
   # Set: DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET, CAPTCHA_SECRET

3. Start with PM2:
   pm2 start ecosystem.config.js
   pm2 save
   pm2 startup

4. Setup Nginx (see DEPLOY_VPS_GUIDE.md)

5. Install SSL:
   sudo certbot --nginx -d vietjet.shop

===========================================
MANAGEMENT COMMANDS
===========================================

Health Check:    ./vps-scripts/health-check.sh
Backup:          ./vps-scripts/backup.sh
Update:          ./vps-scripts/update.sh <new-archive.tar.gz>
View Logs:       pm2 logs vietjet-air
Monitor:         pm2 monit
Restart:         pm2 restart vietjet-air

===========================================
SUPPORT
===========================================

Documentation: DEPLOY_VPS_GUIDE.md
Logs: logs/pm2-*.log
PM2 Status: pm2 status
Node.js: node --version (must be 18.17+ or 20.x)

===========================================
ENDINFO

echo -e "${GREEN}✓ Deployment info created${NC}"

# Step 4: Create .env template with instructions
echo -e "${YELLOW}[4/7] Creating .env template...${NC}"
cat > deploy-package/.env << 'ENDENV'
# ============================================
# Vietjet Air - Production Environment
# ============================================
# 
# ⚠️  CRITICAL: Configure these values before starting the application
#

# --- Public URLs ---
NEXT_PUBLIC_SITE_URL=https://vietjet.shop
MAIL_SITE_URL=https://vietjet.shop

# --- Database ---
# ⚠️  REQUIRED: Configure your PostgreSQL connection
# Example: postgresql://username:password@hostname:5432/database_name
DATABASE_URL=postgresql://

# --- JWT Secrets ---
# ⚠️  REQUIRED: Generate with: openssl rand -hex 32
# Each secret MUST be unique and 64 characters (32 bytes hex)
JWT_SECRET=
JWT_REFRESH_SECRET=
CAPTCHA_SECRET=

# --- Email Configuration ---
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_USER=booking@vietjet.shop
SMTP_PASS=Deohieusao123@
MAIL_FROM=booking@vietjet.shop

# --- Optional: AI/LLM Integration ---
CODING_PI_PROVIDER=nvidia
NVIDIA_API_KEY=
XAI_API_KEY=

# --- Optional: Payment Webhooks ---
VIETQR_WEBHOOK_SECRET=

# ============================================
# CONFIGURATION CHECKLIST
# ============================================
# 
# [ ] DATABASE_URL configured and tested
# [ ] JWT_SECRET generated (64 chars)
# [ ] JWT_REFRESH_SECRET generated (64 chars)
# [ ] CAPTCHA_SECRET generated (64 chars)
# [ ] SMTP credentials verified
# [ ] Domain URLs updated if needed
# 
# Test database connection:
#   psql "$DATABASE_URL" -c "SELECT 1;"
# 
# Generate secrets:
#   openssl rand -hex 32
# 
ENDENV

echo -e "${GREEN}✓ Environment template created${NC}"

# Step 5: Create quick setup script for VPS
echo -e "${YELLOW}[5/7] Creating quick setup script...${NC}"
cat > deploy-package/quick-setup.sh << 'ENDSETUP'
#!/bin/bash
# Quick Setup Script for VPS

echo "=== Vietjet Air - Quick Setup ==="
echo ""

# Check if .env is configured
if ! grep -q "^DATABASE_URL=postgresql://.*@" .env 2>/dev/null; then
    echo "⚠️  .env is not configured!"
    echo ""
    echo "Please configure .env file before running setup:"
    echo "  1. Edit .env: nano .env"
    echo "  2. Set DATABASE_URL"
    echo "  3. Generate and set JWT secrets: openssl rand -hex 32"
    echo "  4. Save and run this script again"
    echo ""
    exit 1
fi

echo "✓ .env file found"
echo ""

# Test database connection
echo "Testing database connection..."
if command -v psql > /dev/null; then
    DB_URL=$(grep "^DATABASE_URL=" .env | cut -d= -f2- | tr -d '"' | tr -d "'")
    if psql "$DB_URL" -c "SELECT 1;" > /dev/null 2>&1; then
        echo "✓ Database connection successful"
    else
        echo "✗ Database connection failed"
        echo "  Check your DATABASE_URL in .env"
        exit 1
    fi
else
    echo "⚠️  psql not found, skipping database test"
fi
echo ""

# Start with PM2
echo "Starting application with PM2..."
if command -v pm2 > /dev/null; then
    pm2 start ecosystem.config.js
    pm2 save
    echo "✓ Application started"
    echo ""
    pm2 status
else
    echo "✗ PM2 not found. Install with: npm install -g pm2"
    exit 1
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "  1. Setup PM2 startup: pm2 startup"
echo "  2. Configure Nginx (see DEPLOY_VPS_GUIDE.md)"
echo "  3. Install SSL: sudo certbot --nginx -d vietjet.shop"
echo "  4. Run health check: ./vps-scripts/health-check.sh"
ENDSETUP

chmod +x deploy-package/quick-setup.sh
echo -e "${GREEN}✓ Quick setup script created${NC}"

# Step 6: Archive
echo -e "${YELLOW}[6/7] Creating compressed archive...${NC}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
ARCHIVE_NAME="vietjet-complete-$TIMESTAMP"

cd deploy-package
tar -czf "../$ARCHIVE_NAME.tar.gz" .
cd ..
rm -rf deploy-package

echo -e "${GREEN}✓ Archive created${NC}"

# Step 7: Summary
echo -e "${YELLOW}[7/7] Generating summary...${NC}"
ARCHIVE_SIZE=$(du -h "$ARCHIVE_NAME.tar.gz" | cut -f1)

echo ""
echo -e "${GREEN}=== Deployment Package Complete ===${NC}"
echo ""
echo "📦 Package: $ARCHIVE_NAME.tar.gz"
echo "📊 Size: $ARCHIVE_SIZE"
echo ""
echo "📋 Contents:"
echo "  ✓ Next.js production build"
echo "  ✓ VPS management scripts (backup, update, health-check)"
echo "  ✓ PM2 configuration"
echo "  ✓ Environment template"
echo "  ✓ Quick setup script"
echo "  ✓ Complete documentation"
echo ""
echo "🚀 Upload to VPS:"
echo "  scp $ARCHIVE_NAME.tar.gz user@your-vps:/opt/vietjet/"
echo ""
echo "📖 Then follow: DEPLOY_VPS_GUIDE.md"
