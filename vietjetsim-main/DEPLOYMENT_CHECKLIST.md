# ✅ VIETJET AIR - DEPLOYMENT CHECKLIST

## 📦 Package Information

**Latest Package:** `vietjet-complete-20261117-132232.tar.gz`  
**Size:** 36MB  
**Build Date:** 2026-11-17 13:22:32  
**Node.js Required:** 18.17+ or 20.x  
**Production Port:** 4028

---

## 🎯 PRE-DEPLOYMENT CHECKLIST

### Local Environment
- [x] TypeScript type check passed
- [x] All tests passing (1215 tests)
- [x] Lint check passed
- [x] Production build successful
- [x] Local server test passed (port 4028)
- [x] Environment variables configured
- [x] Database migrations applied
- [x] VPS management scripts created
- [x] Documentation complete

### Deployment Package
- [x] Next.js production build included
- [x] Static assets included
- [x] Public files included
- [x] PM2 configuration included
- [x] Environment template included
- [x] VPS scripts included (backup, update, health-check)
- [x] Documentation included
- [x] Quick setup script included

---

## 🖥️ VPS PREPARATION CHECKLIST

### System Requirements
- [ ] VPS with Ubuntu 20.04+ / Debian 11+
- [ ] 2GB+ RAM (4GB recommended)
- [ ] 10GB+ free disk space
- [ ] Root or sudo access
- [ ] Domain name configured (vietjet.shop)
- [ ] DNS A record pointing to VPS IP

### Software Installation
- [ ] System updated (`sudo apt update && sudo apt upgrade`)
- [ ] Node.js 20.x installed
- [ ] npm installed
- [ ] PM2 installed globally
- [ ] Nginx installed
- [ ] PostgreSQL client installed (for testing)
- [ ] Certbot installed (for SSL)

### Network Configuration
- [ ] Port 80 open (HTTP)
- [ ] Port 443 open (HTTPS)
- [ ] Port 4028 available (internal)
- [ ] Firewall configured
- [ ] SSH access working

---

## 📤 DEPLOYMENT STEPS CHECKLIST

### 1. Upload Package
- [ ] Package uploaded to `/opt/vietjet/`
- [ ] Archive extracted successfully
- [ ] File permissions correct
- [ ] Directory structure verified

### 2. Environment Configuration
- [ ] `.env` file edited
- [ ] `DATABASE_URL` configured
- [ ] `JWT_SECRET` generated (64 chars)
- [ ] `JWT_REFRESH_SECRET` generated (64 chars)
- [ ] `CAPTCHA_SECRET` generated (64 chars)
- [ ] Domain URLs updated
- [ ] SMTP credentials verified
- [ ] Database connection tested

**Generate secrets command:**
```bash
openssl rand -hex 32
```

**Test database connection:**
```bash
psql "$DATABASE_URL" -c "SELECT 1;"
```

### 3. Application Startup
- [ ] PM2 process started
- [ ] Application running on port 4028
- [ ] PM2 status shows "online"
- [ ] Logs show no errors
- [ ] HTTP test passed (localhost:4028)
- [ ] PM2 configuration saved
- [ ] PM2 startup script configured

**Commands:**
```bash
pm2 start ecosystem.config.js
pm2 status
pm2 logs vietjet-air --lines 50
curl http://localhost:4028/trang-chu
pm2 save
pm2 startup
```

### 4. Nginx Configuration
- [ ] Nginx config file created
- [ ] Config syntax tested (`nginx -t`)
- [ ] Site enabled
- [ ] Proxy to port 4028 working
- [ ] Security headers configured
- [ ] Gzip compression enabled
- [ ] Static file caching configured
- [ ] Nginx reloaded

**Config location:** `/etc/nginx/sites-available/vietjet`

### 5. SSL Certificate
- [ ] Certbot installed
- [ ] SSL certificate obtained
- [ ] Certificate for vietjet.shop
- [ ] Certificate for www.vietjet.shop
- [ ] Auto-renewal configured
- [ ] HTTPS redirect working
- [ ] SSL test passed

**Install SSL:**
```bash
sudo certbot --nginx -d vietjet.shop -d www.vietjet.shop
```

### 6. Health Checks
- [ ] PM2 process healthy
- [ ] Port 4028 listening
- [ ] HTTP 200 response
- [ ] Nginx running
- [ ] SSL certificate valid
- [ ] Disk space sufficient (< 80%)
- [ ] Memory usage normal (< 80%)
- [ ] Database connection working

**Run health check:**
```bash
./vps-scripts/health-check.sh
```

---

## 🔒 SECURITY CHECKLIST

### Application Security
- [ ] JWT secrets are unique and strong
- [ ] Environment variables not exposed
- [ ] CSRF protection enabled
- [ ] Rate limiting configured
- [ ] SQL injection protection (parameterized queries)
- [ ] XSS protection headers set
- [ ] Admin routes protected

### Server Security
- [ ] SSH key authentication enabled
- [ ] Password authentication disabled
- [ ] Firewall configured (UFW)
- [ ] Only necessary ports open
- [ ] Root login disabled
- [ ] Regular security updates enabled
- [ ] Fail2ban configured (optional)

### SSL/TLS Security
- [ ] HTTPS enforced (HTTP → HTTPS redirect)
- [ ] TLS 1.2+ only
- [ ] Strong cipher suites
- [ ] HSTS header enabled
- [ ] SSL certificate auto-renewal working

---

## 📊 POST-DEPLOYMENT CHECKLIST

### Functional Testing
- [ ] Homepage loads (https://vietjet.shop)
- [ ] Flight search working
- [ ] Booking flow working
- [ ] Payment system working
- [ ] User authentication working
- [ ] Admin dashboard accessible
- [ ] Chat system working
- [ ] Email sending working
- [ ] API endpoints responding

### Performance Testing
- [ ] Page load time < 3s
- [ ] API response time < 500ms
- [ ] No memory leaks
- [ ] CPU usage normal
- [ ] Database queries optimized
- [ ] Static assets cached
- [ ] Gzip compression working

### Monitoring Setup
- [ ] PM2 monitoring enabled
- [ ] Health check cron job configured
- [ ] Backup cron job configured
- [ ] Log rotation configured
- [ ] Disk space monitoring
- [ ] Error alerts configured
- [ ] Uptime monitoring (optional)

**Setup daily backup:**
```bash
crontab -e
# Add: 0 2 * * * /opt/vietjet/vps-scripts/backup.sh
```

**Setup health checks:**
```bash
# Check every 15 minutes
*/15 * * * * /opt/vietjet/vps-scripts/health-check.sh
```

---

## 🔄 BACKUP & RECOVERY CHECKLIST

### Backup Strategy
- [ ] Daily application backups configured
- [ ] Daily database backups configured
- [ ] Backup retention policy set (7 days)
- [ ] Off-site backup location configured
- [ ] Backup restoration tested
- [ ] Recovery procedure documented

**Database backup:**
```bash
pg_dump "$DATABASE_URL" > vietjet-db-$(date +%Y%m%d).sql
```

### Recovery Plan
- [ ] Rollback procedure tested
- [ ] Backup restoration verified
- [ ] Database restore tested
- [ ] Downtime plan documented
- [ ] Emergency contacts listed

---

## 📈 OPTIMIZATION CHECKLIST

### Performance
- [ ] Database indexes reviewed
- [ ] Query performance optimized
- [ ] Image optimization enabled
- [ ] CDN configured (optional)
- [ ] Cache headers optimized
- [ ] Bundle size minimized

### Scaling Preparation
- [ ] Load testing completed
- [ ] Bottlenecks identified
- [ ] Scaling plan documented
- [ ] Database connection pooling configured
- [ ] Horizontal scaling considered

---

## 📞 SUPPORT & MAINTENANCE

### Documentation
- [ ] Deployment guide accessible
- [ ] VPS scripts documented
- [ ] Admin credentials secured
- [ ] Emergency procedures documented
- [ ] Contact information updated

### Maintenance Schedule
- [ ] Weekly health checks
- [ ] Monthly security updates
- [ ] Quarterly performance reviews
- [ ] Regular backup verification
- [ ] SSL certificate renewal monitoring

---

## ⚠️ CRITICAL WARNINGS

1. **Never commit `.env` file** - Contains secrets
2. **Always backup before updates** - Use backup script
3. **Test locally first** - Before deploying to production
4. **Monitor after deployment** - For at least 30 minutes
5. **Keep backups off-site** - VPS failure = data loss
6. **Rotate JWT secrets** - Periodically for security
7. **Update dependencies** - Regular security patches
8. **Check SSL expiry** - Renew before expiration

---

## 🎯 SUCCESS CRITERIA

Deployment is successful when:

- ✅ Website accessible via HTTPS
- ✅ All features working correctly
- ✅ No errors in logs
- ✅ Health check passes
- ✅ SSL certificate valid
- ✅ Performance acceptable
- ✅ Monitoring active
- ✅ Backups configured
- ✅ Admin access verified
- ✅ Email notifications working

---

## 📋 QUICK REFERENCE

### Essential Commands

**PM2:**
```bash
pm2 status                    # Check status
pm2 logs vietjet-air         # View logs
pm2 restart vietjet-air      # Restart app
pm2 reload vietjet-air       # Zero-downtime reload
pm2 monit                    # Real-time monitoring
```

**Nginx:**
```bash
sudo nginx -t                # Test config
sudo systemctl reload nginx  # Reload
sudo systemctl status nginx  # Check status
```

**VPS Scripts:**
```bash
./vps-scripts/health-check.sh              # Health check
./vps-scripts/backup.sh                    # Backup
./vps-scripts/update.sh <archive.tar.gz>   # Update
```

**Logs:**
```bash
pm2 logs vietjet-air                       # PM2 logs
sudo tail -f /var/log/nginx/error.log      # Nginx errors
cat /opt/vietjet/logs/pm2-error.log        # App errors
```

---

## 📞 EMERGENCY CONTACTS

**Technical Issues:**
- Check logs first
- Run health check script
- Review documentation
- Contact system administrator

**Critical Failures:**
1. Stop application: `pm2 stop vietjet-air`
2. Check logs: `pm2 logs vietjet-air --lines 100`
3. Restore from backup if needed
4. Contact support team

---

## ✅ DEPLOYMENT SIGN-OFF

After completing all checklists:

- [ ] All checklist items completed
- [ ] Testing passed
- [ ] Documentation reviewed
- [ ] Team notified
- [ ] Monitoring confirmed
- [ ] Backup verified
- [ ] Ready for production traffic

**Deployed by:** _________________  
**Date:** _________________  
**Version:** vietjet-complete-20261117-132232  
**Sign-off:** _________________

---

**Next Update:** Follow the update procedure in `vps-scripts/README.md`
