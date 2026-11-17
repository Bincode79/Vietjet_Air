# 🚀 HƯỚNG DẪN DEPLOY VIETJET AIR LÊN VPS

## 📦 Package đã tạo

File: `vietjet-20261117-131803.tar.gz` (36MB)

Nội dung:
- ✅ `.next/standalone/` - Production build
- ✅ `.next/static/` - Static assets
- ✅ `public/` - Public files
- ✅ `scripts/start-standalone.cjs` - Standalone server
- ✅ `ecosystem.config.js` - PM2 config
- ✅ `.env` - Environment template

---

## 🖥️ YÊU CẦU VPS

### Hardware
- **RAM:** 2GB+ (recommended 4GB)
- **Storage:** 10GB+ free space
- **CPU:** 1 core minimum (2+ recommended)

### Software
- **OS:** Ubuntu 20.04 LTS / 22.04 LTS / Debian 11+
- **Node.js:** 18.17+ hoặc 20.x
- **PostgreSQL:** 14+ (hoặc Neon serverless)
- **Nginx:** Latest stable
- **PM2:** Latest (process manager)

---

## 📝 BƯỚC 1: CHUẨN BỊ VPS

### 1.1. Cập nhật hệ thống
```bash
sudo apt update && sudo apt upgrade -y
```

### 1.2. Cài đặt Node.js 20.x
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version  # Kiểm tra: v20.x.x
npm --version   # Kiểm tra: 10.x.x
```

### 1.3. Cài đặt PM2
```bash
sudo npm install -g pm2
pm2 --version
```

### 1.4. Cài đặt Nginx
```bash
sudo apt install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

### 1.5. Tạo thư mục ứng dụng
```bash
sudo mkdir -p /opt/vietjet
sudo chown -R $USER:$USER /opt/vietjet
cd /opt/vietjet
```

---

## 📤 BƯỚC 2: UPLOAD VÀ CÀI ĐẶT

### 2.1. Upload file từ local
```bash
# Chạy từ máy local (trong thư mục vietjetsim-main/)
scp vietjet-20261117-131803.tar.gz user@your-vps-ip:/opt/vietjet/
```

### 2.2. Giải nén trên VPS
```bash
# SSH vào VPS
ssh user@your-vps-ip

# Giải nén
cd /opt/vietjet
tar -xzf vietjet-20261117-131803.tar.gz
rm vietjet-20261117-131803.tar.gz  # Xóa archive sau khi giải nén

# Kiểm tra cấu trúc
ls -la
```

---

## 🔑 BƯỚC 3: CẤU HÌNH ENVIRONMENT

### 3.1. Tạo JWT secrets
```bash
openssl rand -hex 32  # JWT_SECRET
openssl rand -hex 32  # JWT_REFRESH_SECRET
openssl rand -hex 32  # CAPTCHA_SECRET
```

### 3.2. Cấu hình .env
```bash
nano .env
```

Cập nhật các biến sau:
```env
# Domain
NEXT_PUBLIC_SITE_URL=https://vietjet.shop
MAIL_SITE_URL=https://vietjet.shop

# Database (Neon hoặc PostgreSQL local)
DATABASE_URL=postgresql://user:password@host:5432/vietjet_air

# JWT Secrets (dùng giá trị từ bước 3.1)
JWT_SECRET=<your-64-char-hex-string>
JWT_REFRESH_SECRET=<your-64-char-hex-string>
CAPTCHA_SECRET=<your-64-char-hex-string>

# Email (đã có sẵn)
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_USER=booking@vietjet.shop
SMTP_PASS=Deohieusao123@
MAIL_FROM=booking@vietjet.shop

# Optional
NVIDIA_API_KEY=
XAI_API_KEY=
VIETQR_WEBHOOK_SECRET=
```

Lưu và thoát (Ctrl+O, Enter, Ctrl+X)

---

## 🚀 BƯỚC 4: KHỞI ĐỘNG ỨNG DỤNG

### 4.1. Khởi động với PM2
```bash
cd /opt/vietjet
pm2 start ecosystem.config.js
```

### 4.2. Kiểm tra status
```bash
pm2 status
pm2 logs vietjet-air --lines 50
```

### 4.3. Lưu cấu hình PM2 (auto-start khi reboot)
```bash
pm2 save
pm2 startup
# Chạy lệnh mà PM2 gợi ý (thường là: sudo env PATH=...)
```

### 4.4. Test ứng dụng
```bash
curl http://localhost:4028/trang-chu
# Nếu trả về HTML → ✅ OK
```

---

## 🌐 BƯỚC 5: CÁC HÌNH NGINX

### 5.1. Tạo config file
```bash
sudo nano /etc/nginx/sites-available/vietjet
```

Nội dung:
```nginx
# HTTP → HTTPS redirect
server {
    listen 80;
    listen [::]:80;
    server_name vietjet.shop www.vietjet.shop;
    
    return 301 https://$server_name$request_uri;
}

# HTTPS server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name vietjet.shop www.vietjet.shop;
    
    # SSL certificates (sẽ cấu hình sau với Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/vietjet.shop/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/vietjet.shop/privkey.pem;
    
    # SSL config
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384';
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    
    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(self), geolocation=()" always;
    
    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_types text/plain text/css text/xml text/javascript application/json application/javascript application/xml+rss application/rss+xml font/truetype font/opentype application/vnd.ms-fontobject image/svg+xml;
    gzip_min_length 1000;
    gzip_comp_level 6;
    
    # Proxy to Next.js
    location / {
        proxy_pass http://localhost:4028;
        proxy_http_version 1.1;
        
        # Headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port $server_port;
        
        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        
        # SSE support (for chat)
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding off;
    }
    
    # Static files caching
    location /_next/static {
        proxy_pass http://localhost:4028;
        proxy_cache_valid 200 365d;
        add_header Cache-Control "public, immutable";
    }
    
    # Public files caching
    location /images {
        proxy_pass http://localhost:4028;
        proxy_cache_valid 200 7d;
        add_header Cache-Control "public, max-age=604800";
    }
    
    # Client max body size (for file uploads)
    client_max_body_size 10M;
}
```

### 5.2. Enable site
```bash
sudo ln -s /etc/nginx/sites-available/vietjet /etc/nginx/sites-enabled/
sudo nginx -t  # Test cấu hình
```

---

## 🔒 BƯỚC 6: CÀI ĐẶT SSL (LET'S ENCRYPT)

### 6.1. Cài đặt Certbot
```bash
sudo apt install -y certbot python3-certbot-nginx
```

### 6.2. Lấy SSL certificate
```bash
sudo certbot --nginx -d vietjet.shop -d www.vietjet.shop
```

Làm theo hướng dẫn:
- Nhập email
- Đồng ý Terms of Service
- Chọn redirect HTTP → HTTPS (recommended)

### 6.3. Test SSL renewal
```bash
sudo certbot renew --dry-run
```

### 6.4. Reload Nginx
```bash
sudo systemctl reload nginx
```

---

## ✅ BƯỚC 7: KIỂM TRA

### 7.1. Test từ browser
```
https://vietjet.shop
https://vietjet.shop/trang-chu
https://vietjet.shop/api/san-bay
```

### 7.2. Kiểm tra SSL
```bash
curl -I https://vietjet.shop
# Xem header: Strict-Transport-Security, X-Frame-Options, etc.
```

### 7.3. Kiểm tra PM2
```bash
pm2 status
pm2 logs vietjet-air
pm2 monit  # Real-time monitoring
```

---

## 🔄 CẬP NHẬT ỨNG DỤNG

### Khi có version mới:

1. **Build và tạo package mới từ local:**
```bash
cd vietjetsim-main
./deploy-vps.sh
```

2. **Upload lên VPS:**
```bash
scp vietjet-YYYYMMDD-HHMMSS.tar.gz user@your-vps:/opt/vietjet/
```

3. **Backup và update trên VPS:**
```bash
cd /opt/vietjet
mv .env .env.backup
tar -xzf vietjet-YYYYMMDD-HHMMSS.tar.gz
mv .env.backup .env
pm2 reload ecosystem.config.js  # Zero-downtime reload
```

---

## 🛠️ TROUBLESHOOTING

### Ứng dụng không start
```bash
pm2 logs vietjet-air --lines 100
# Kiểm tra lỗi: database connection, port conflict, missing env vars
```

### Port 4028 đã được dùng
```bash
sudo lsof -i:4028
sudo kill -9 <PID>
pm2 restart vietjet-air
```

### Database connection failed
```bash
# Test database connection
psql $DATABASE_URL -c "SELECT 1;"

# Kiểm tra DATABASE_URL trong .env
cat .env | grep DATABASE_URL
```

### SSL certificate renewal failed
```bash
sudo certbot renew --dry-run
# Xem error và fix theo hướng dẫn
```

### High memory usage
```bash
pm2 restart vietjet-air
# Hoặc tăng max_memory_restart trong ecosystem.config.js
```

---

## 📊 MONITORING

### PM2 Dashboard
```bash
pm2 monit  # Real-time monitoring
pm2 plus    # Web-based monitoring (optional)
```

### Log rotation
```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

### System monitoring
```bash
htop           # CPU/Memory
df -h          # Disk space
free -h        # Memory usage
netstat -tulpn # Port usage
```

---

## 🎯 PRODUCTION CHECKLIST

- [ ] Node.js 20.x installed
- [ ] PM2 installed and configured
- [ ] Database accessible
- [ ] All environment variables set
- [ ] JWT secrets generated (64 chars each)
- [ ] Application running on port 4028
- [ ] Nginx configured
- [ ] SSL certificate installed
- [ ] HTTPS working
- [ ] PM2 auto-start enabled
- [ ] Firewall configured (allow 80, 443)
- [ ] Database backups scheduled
- [ ] Log rotation configured
- [ ] Monitoring setup

---

## 📞 SUPPORT

Nếu gặp vấn đề:
1. Kiểm tra logs: `pm2 logs vietjet-air`
2. Kiểm tra Nginx logs: `sudo tail -f /var/log/nginx/error.log`
3. Test database: `psql $DATABASE_URL -c "SELECT 1;"`
4. Restart services: `pm2 restart vietjet-air && sudo systemctl reload nginx`

**Package version:** 20261117-131803  
**Node.js version required:** 18.17+ / 20.x  
**Production port:** 4028
