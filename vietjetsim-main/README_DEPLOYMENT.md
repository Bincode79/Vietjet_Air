# 🚀 Vietjet Air - Deployment Package

## 📦 Package Overview

**Latest Release:** `vietjet-complete-20261117-132232.tar.gz`  
**Size:** 36MB  
**Build:** 2026-11-17 13:22:32  
**Status:** ✅ Production Ready

---

## 🎯 Quick Start

### 1. Upload to VPS
```bash
scp vietjet-complete-20261117-132232.tar.gz user@your-vps:/opt/vietjet/
```

### 2. Extract & Setup
```bash
ssh user@your-vps
cd /opt/vietjet
tar -xzf vietjet-complete-20261117-132232.tar.gz
nano .env  # Configure DATABASE_URL & JWT secrets
./quick-setup.sh
```

### 3. Configure Nginx & SSL
```bash
# Copy Nginx config from DEPLOY_VPS_GUIDE.md
sudo nano /etc/nginx/sites-available/vietjet
sudo ln -s /etc/nginx/sites-available/vietjet /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# Install SSL
sudo certbot --nginx -d vietjet.shop -d www.vietjet.shop
```

### 4. Verify
```bash
./vps-scripts/health-check.sh
```

**Done!** Visit https://vietjet.shop

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| **DEPLOYMENT_SUMMARY.md** | High-level overview & 5-step guide |
| **DEPLOY_VPS_GUIDE.md** | Complete step-by-step deployment guide |
| **DEPLOYMENT_CHECKLIST.md** | Detailed checklist with sign-off |
| **vps-scripts/README.md** | VPS management scripts documentation |
| **DEPLOYMENT_INFO.txt** | Package contents quick reference |

**Start here:** `DEPLOYMENT_SUMMARY.md` → `DEPLOY_VPS_GUIDE.md`

---

## 🛠️ VPS Management Scripts

Located in `vps-scripts/`:

| Script | Purpose |
|--------|---------|
| `backup.sh` | Backup configuration, logs, PM2 state |
| `update.sh` | Deploy new version with auto-rollback |
| `health-check.sh` | System health monitoring (8 checks) |
| `quick-setup.sh` | One-command setup after extraction |

**Usage:**
```bash
./vps-scripts/health-check.sh              # Check system health
./vps-scripts/backup.sh                    # Create backup
./vps-scripts/update.sh <new-package>      # Update deployment
```

---

## 🔑 Required Configuration

Before deployment, generate these secrets:

```bash
# Generate 3 unique secrets (64 chars each)
openssl rand -hex 32  # JWT_SECRET
openssl rand -hex 32  # JWT_REFRESH_SECRET
openssl rand -hex 32  # CAPTCHA_SECRET
```

Configure in `.env`:
```env
DATABASE_URL=postgresql://user:pass@host:5432/vietjet_air
JWT_SECRET=<generated-above>
JWT_REFRESH_SECRET=<generated-above>
CAPTCHA_SECRET=<generated-above>
```

---

## 📋 System Requirements

### VPS
- **OS:** Ubuntu 20.04+ / Debian 11+
- **RAM:** 2GB minimum (4GB recommended)
- **Storage:** 10GB+ free
- **CPU:** 1+ cores (2+ recommended)

### Software
- **Node.js:** 18.17+ or 20.x
- **PM2:** Latest (`npm install -g pm2`)
- **Nginx:** Latest stable
- **PostgreSQL:** 14+ or Neon serverless
- **Certbot:** For SSL certificates

---

## ✅ What's Included

### Application (Production Build)
- Next.js 16.4.6 standalone build
- React 19.0.3 server components
- 84 API routes
- 22 pages
- 121 components
- 1215 tests passing

### Features
- ✅ Flight search & booking
- ✅ Seat selection
- ✅ Multi-payment gateway
- ✅ E-ticket & boarding pass
- ✅ Chat & voice support
- ✅ Admin dashboard (18 tabs)
- ✅ Loyalty program
- ✅ Responsive design

### Infrastructure
- ✅ PM2 configuration
- ✅ Nginx reverse proxy config
- ✅ SSL/TLS setup
- ✅ Security headers
- ✅ Gzip compression
- ✅ Cache optimization

### Management
- ✅ Automated backup script
- ✅ Zero-downtime update script
- ✅ Health monitoring script
- ✅ Quick setup script
- ✅ Complete documentation

---

## 🚀 Deployment Steps

### Step 1: Prepare VPS
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2
sudo npm install -g pm2

# Install Nginx
sudo apt install -y nginx

# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Create app directory
sudo mkdir -p /opt/vietjet
sudo chown -R $USER:$USER /opt/vietjet
```

### Step 2: Upload & Extract
```bash
# Upload from local
scp vietjet-complete-20261117-132232.tar.gz user@vps:/opt/vietjet/

# Extract on VPS
ssh user@vps
cd /opt/vietjet
tar -xzf vietjet-complete-20261117-132232.tar.gz
```

### Step 3: Configure Environment
```bash
# Edit .env
nano .env

# Generate secrets
openssl rand -hex 32  # Copy for JWT_SECRET
openssl rand -hex 32  # Copy for JWT_REFRESH_SECRET
openssl rand -hex 32  # Copy for CAPTCHA_SECRET

# Test database connection
psql "$DATABASE_URL" -c "SELECT 1;"
```

### Step 4: Start Application
```bash
# Quick setup (or manual PM2 start)
./quick-setup.sh

# Or manually:
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### Step 5: Configure Nginx
```bash
# Create config
sudo nano /etc/nginx/sites-available/vietjet
# Copy from DEPLOY_VPS_GUIDE.md

# Enable site
sudo ln -s /etc/nginx/sites-available/vietjet /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Step 6: Install SSL
```bash
sudo certbot --nginx -d vietjet.shop -d www.vietjet.shop
```

### Step 7: Verify
```bash
./vps-scripts/health-check.sh
curl -I https://vietjet.shop
```

---

## 📊 Post-Deployment

### Monitor Application
```bash
pm2 status                    # Process status
pm2 logs vietjet-air         # View logs
pm2 monit                    # Real-time monitoring
```

### Setup Automated Tasks
```bash
# Daily backup at 2 AM
crontab -e
# Add: 0 2 * * * /opt/vietjet/vps-scripts/backup.sh

# Health check every 15 minutes
# Add: */15 * * * * /opt/vietjet/vps-scripts/health-check.sh
```

### Test Functionality
- [ ] Homepage: https://vietjet.shop
- [ ] Flight search
- [ ] Booking flow
- [ ] Payment
- [ ] Admin dashboard: https://vietjet.shop/quan-tri
- [ ] API: https://vietjet.shop/api/san-bay

---

## 🔄 Update Procedure

When new version is available:

```bash
# 1. Build on local
./deploy-vps-complete.sh

# 2. Upload to VPS
scp vietjet-complete-*.tar.gz user@vps:/opt/vietjet/

# 3. Update (auto-backup & rollback on failure)
ssh user@vps
cd /opt/vietjet
./vps-scripts/update.sh vietjet-complete-*.tar.gz

# 4. Verify
./vps-scripts/health-check.sh
```

---

## 🛡️ Security Features

### Application
- JWT authentication with rotation
- CSRF protection
- Rate limiting
- SQL injection prevention
- XSS protection
- RBAC (68 permissions)
- 2FA support
- Account lockout

### Server
- HTTPS enforced
- TLS 1.2+ only
- HSTS enabled
- Security headers
- Firewall configured
- SSH key auth

---

## 📞 Troubleshooting

### Application Not Starting
```bash
pm2 logs vietjet-air --lines 100
# Check: DATABASE_URL, JWT secrets, port availability
```

### Database Connection Failed
```bash
psql "$DATABASE_URL" -c "SELECT 1;"
# Verify credentials, host, port
```

### SSL Issues
```bash
sudo certbot renew --dry-run
# Check DNS, ports 80/443 open
```

### High Memory Usage
```bash
pm2 restart vietjet-air
# Or increase max_memory_restart in ecosystem.config.js
```

---

## 📈 Performance

### Expected Metrics
- **Page Load:** < 3s
- **API Response:** < 500ms
- **Memory Usage:** ~400-500MB
- **CPU (idle):** < 20%
- **Uptime:** 99.9%+

### Optimization
- ✅ SSR enabled
- ✅ Static generation
- ✅ Image optimization
- ✅ Gzip compression
- ✅ Cache headers (365d static)
- ✅ DB connection pooling

---

## 🎯 Support

**Documentation:**
- Full guide: `DEPLOY_VPS_GUIDE.md`
- Checklist: `DEPLOYMENT_CHECKLIST.md`
- Scripts: `vps-scripts/README.md`

**Logs:**
```bash
pm2 logs vietjet-air
cat logs/pm2-error.log
sudo tail -f /var/log/nginx/error.log
```

**Health Check:**
```bash
./vps-scripts/health-check.sh
```

---

## ✅ Deployment Checklist

Quick verification:

- [ ] VPS prepared (Node.js, PM2, Nginx, Certbot)
- [ ] Package uploaded & extracted
- [ ] Environment configured (.env)
- [ ] Database connection tested
- [ ] Application running (PM2)
- [ ] Nginx configured
- [ ] SSL installed
- [ ] Health check passed
- [ ] Backups configured
- [ ] Monitoring setup

**Full checklist:** See `DEPLOYMENT_CHECKLIST.md`

---

## 🎉 Ready!

Everything is prepared for production deployment.

**Package:** `vietjet-complete-20261117-132232.tar.gz` (36MB)  
**Documentation:** Complete  
**Scripts:** Ready  
**Status:** ✅ Production Ready

**Start with:** `DEPLOYMENT_SUMMARY.md`

---

**Questions?** Check the documentation or run health check after deployment.
