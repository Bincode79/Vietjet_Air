# 🛠️ VPS Management Scripts

Scripts hỗ trợ quản lý Vietjet Air trên VPS.

## 📁 Scripts

### 1. `backup.sh` - Backup Configuration
**Mục đích:** Sao lưu cấu hình, logs và file quan trọng.

**Sử dụng:**
```bash
cd /opt/vietjet
./backup.sh
```

**Backup bao gồm:**
- `.env` file (environment variables & secrets)
- `ecosystem.config.js` (PM2 config)
- Nginx configuration
- PM2 process dump
- Logs (1000 dòng gần nhất)

**Lưu trữ:** `/opt/vietjet-backups/`  
**Tự động xóa:** Backups cũ hơn 7 ngày

**Lưu ý:** Script này KHÔNG backup database. Dùng lệnh sau để backup DB:
```bash
pg_dump $DATABASE_URL > vietjet-db-$(date +%Y%m%d-%H%M%S).sql
```

---

### 2. `update.sh` - Deploy New Version
**Mục đích:** Cập nhật ứng dụng lên version mới với zero-downtime.

**Sử dụng:**
```bash
cd /opt/vietjet
./update.sh vietjet-20261117-131803.tar.gz
```

**Quy trình:**
1. Tạo backup tự động
2. Dừng PM2 process
3. Giải nén version mới
4. Restore `.env` từ backup
5. Khởi động lại ứng dụng
6. Health check (PM2 status + HTTP test)
7. **Auto-rollback** nếu health check thất bại

**Rollback thủ công:**
```bash
cd /opt/vietjet
pm2 stop vietjet-air
tar -xzf /opt/vietjet-backups/vietjet-backup-YYYYMMDD-HHMMSS.tar.gz
pm2 restart vietjet-air
```

---

### 3. `health-check.sh` - System Health Check
**Mục đích:** Kiểm tra sức khỏe toàn bộ hệ thống.

**Sử dụng:**
```bash
cd /opt/vietjet
./health-check.sh
```

**Kiểm tra:**
1. ✅ PM2 process status (online/stopped)
2. ✅ Port 4028 listening
3. ✅ HTTP response (200 OK)
4. ✅ Nginx status & config test
5. ✅ SSL certificate validity & expiry
6. ✅ Disk space usage
7. ✅ Memory usage
8. ✅ Database connection

**Exit codes:**
- `0` = All checks passed
- `1` = Critical check failed

**Dùng trong cron:**
```bash
# Check mỗi 15 phút và gửi email nếu fail
*/15 * * * * /opt/vietjet/health-check.sh || mail -s "Vietjet Health Check Failed" admin@example.com
```

---

## 🚀 Quick Start Guide

### Setup trên VPS
```bash
# 1. Upload scripts cùng với deployment package
cd /opt/vietjet

# 2. Cấp quyền thực thi
chmod +x backup.sh update.sh health-check.sh

# 3. Test health check
./health-check.sh

# 4. Setup cron job cho backup hàng ngày
crontab -e
# Thêm dòng: 0 2 * * * /opt/vietjet/backup.sh
```

### Workflow Update
```bash
# Trên máy local
cd vietjetsim-main
./deploy-vps.sh
scp vietjet-*.tar.gz user@vps:/opt/vietjet/

# Trên VPS
ssh user@vps
cd /opt/vietjet
./update.sh vietjet-20261117-131803.tar.gz
./health-check.sh
```

---

## 📋 Best Practices

### 1. Backup Strategy
- **Tự động:** Chạy `backup.sh` mỗi ngày qua cron
- **Trước update:** Script `update.sh` tự động backup
- **Database:** Backup riêng với `pg_dump` hàng ngày
- **Off-site:** Sao chép backup ra khỏi VPS định kỳ

### 2. Update Strategy
- **Test local:** Luôn test build local trước
- **Off-peak hours:** Update vào giờ ít traffic
- **Monitor:** Theo dõi logs sau update 15-30 phút
- **Rollback plan:** Giữ backup gần nhất sẵn sàng

### 3. Monitoring
- **Health check:** Chạy mỗi 15 phút qua cron
- **PM2 monitoring:** `pm2 monit` hoặc PM2 Plus
- **Log rotation:** Cấu hình `pm2-logrotate`
- **Alerts:** Setup email/Slack alerts cho failures

---

## 🔧 Customization

### Thay đổi backup retention
Edit `backup.sh`:
```bash
# Giữ backup 30 ngày thay vì 7
find "$BACKUP_DIR" -name "vietjet-backup-*.tar.gz" -mtime +30 -delete
```

### Thêm custom health checks
Edit `health-check.sh`:
```bash
# Ví dụ: Check API endpoint cụ thể
echo "9. Custom API Check:"
API_RESPONSE=$(curl -s http://localhost:4028/api/san-bay)
if echo "$API_RESPONSE" | grep -q "airports"; then
    echo -e "${GREEN}✓ API responding correctly${NC}"
else
    echo -e "${RED}✗ API response invalid${NC}"
fi
```

### Auto-restart nếu health check fail
```bash
# Cron job với auto-restart
*/15 * * * * /opt/vietjet/health-check.sh || pm2 restart vietjet-air
```

---

## 📞 Support

**Logs:**
```bash
pm2 logs vietjet-air          # Real-time logs
pm2 logs vietjet-air --lines 100  # Last 100 lines
cat logs/pm2-error.log        # Error logs
sudo tail -f /var/log/nginx/error.log  # Nginx errors
```

**Debug:**
```bash
# Check environment
cat .env

# Test database connection
psql $DATABASE_URL -c "SELECT 1;"

# Check port
lsof -i:4028

# Check process
pm2 describe vietjet-air
```

---

## ⚠️ Important Notes

1. **Never commit secrets:** `.env` file chứa secrets, không commit vào git
2. **Backup before update:** Luôn có backup trước khi update
3. **Test locally first:** Test build trên local trước khi deploy
4. **Monitor after update:** Theo dõi hệ thống sau update ít nhất 30 phút
5. **Database migrations:** Chạy migrations TRƯỚC khi update code nếu cần

---

## 📚 Related Documents

- [DEPLOY_VPS_GUIDE.md](../DEPLOY_VPS_GUIDE.md) - Hướng dẫn deploy chi tiết
- [DEPLOYMENT.md](../DEPLOYMENT.md) - Deployment overview
- [README.md](../README.md) - Project documentation
