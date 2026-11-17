# 🚀 Hướng Dẫn Deploy Vietjet Air lên VPS

## 📋 Yêu Cầu VPS

- **OS:** Ubuntu 20.04+ / Debian 11+ / CentOS 8+
- **RAM:** Tối thiểu 1GB (Khuyến nghị 2GB+)
- **CPU:** 1 core (Khuyến nghị 2 cores+)
- **Storage:** 5GB khả dụng
- **Node.js:** v18.17.0+ hoặc v20.x
- **Database:** PostgreSQL 14+ (Neon hoặc local)

---

## 🔧 Bước 1: Chuẩn Bị VPS

### 1.1 Cập nhật hệ thống
```bash
sudo apt update && sudo apt upgrade -y
```

### 1.2 Cài đặt Node.js 20.x
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version  # Kiểm tra: v20.x
npm --version   # Kiểm tra: v10.x
```

### 1.3 Cài đặt PM2
```bash
sudo npm install -g pm2
pm2 --version
```

### 1.4 Cài đặt Nginx (Reverse Proxy)
```bash
sudo apt install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

---

## 📦 Bước 2: Build và Upload

### 2.1 Build trên local
```bash
cd vietjetsim-main
npm run build
```

### 2.2 Tạo deployment package
```bash
./deploy-vps.sh
```

Lệnh này sẽ tạo file `vietjet-YYYYMMDD-HHMMSS.tar.gz`

### 2.3 Upload lên VPS
```bash
# Thay your-user và your-vps-ip
scp vietjet-*.tar.gz your-user@your-vps-ip:/home/your-user/
```

---

## 🎯 Bước 3: Deploy trên VPS

### 3.1 SSH vào VPS
```bash
ssh your-user@your-vps-ip
```

### 3.2 Tạo thư mục app
```bash
sudo mkdir -p /var/www/vietjet-air
sudo chown -R $USER:$USER /var/www/vietjet-air
cd /var/www/vietjet-air
```

### 3.3 Giải nén package
```bash
tar -xzf ~/vietjet-*.tar.gz -C /var/www/vietjet-air/
```

### 3.4 Tạo file .env
```bash
nano .env
```

Nội dung:
```env
# Site URLs
NEXT_PUBLIC_SITE_URL=https://vietjet.shop
MAIL_SITE_URL=https://vietjet.shop

# Database (Neon PostgreSQL)
DATABASE_URL=postgresql://user:pass@host/dbname?sslmode=require

# JWT Secrets (Generate: openssl rand -hex 32)
JWT_SECRET=<your-64-hex-chars>
JWT_REFRESH_SECRET=<your-64-hex-chars>
CAPTCHA_SECRET=<your-64-hex-chars>

# Mail (Hostinger)
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_USER=booking@vietjet.shop
SMTP_PASS=Deohieusao123@
MAIL_FROM=booking@vietjet.shop

# Optional: Coding Pi
CODING_PI_PROVIDER=nvidia
NVIDIA_API_KEY=
XAI_API_KEY=

# Optional: VietQR
VIETQR_WEBHOOK_SECRET=
```

Lưu: `Ctrl+O`, Enter, `Ctrl+X`

### 3.5 Generate JWT Secrets
```bash
echo "JWT_SECRET=$(openssl rand -hex 32)"
echo "JWT_REFRESH_SECRET=$(openssl rand -hex 32)"
echo "CAPTCHA_SECRET=$(openssl rand -hex 32)"
```

Copy các giá trị này vào `.env`

---

## ▶️ Bước 4: Khởi Động App

### 4.1 Tạo thư mục logs
```bash
mkdir -p logs
```

### 4.2 Start bằng PM2
```bash
pm2 start scripts/start-standalone.cjs --name vietjet-air -- --port 4028
```

### 4.3 Kiểm tra status
```bash
pm2 status
pm2 logs vietjet-air
```

### 4.4 Lưu PM2 config và auto-start
```bash
pm2 save
pm2 startup
# Copy và chạy lệnh output ra
```

---

## 🌐 Bước 5: Cấu Hình Nginx

### 5.1 Tạo config file
```bash
sudo nano /etc/nginx/sites-available/vietjet-air
```

Nội dung:
```nginx
server {
    listen 80;
    server_name vietjet.shop www.vietjet.shop;

    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name vietjet.shop www.vietjet.shop;

    # SSL Certificate (Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/vietjet.shop/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/vietjet.shop/privkey.pem;
    
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Gzip
    gzip on;
    gzip_vary on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;

    # Max body size (for uploads)
    client_max_body_size 10M;

    location / {
        proxy_pass http://localhost:4028;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # SSE Support
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # Static files caching
    location /_next/static {
        proxy_pass http://localhost:4028;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    location /images {
        proxy_pass http://localhost:4028;
        add_header Cache-Control "public, max-age=2592000";
    }
}
```

### 5.2 Enable site
```bash
sudo ln -s /etc/nginx/sites-available/vietjet-air /etc/nginx/sites-enabled/
sudo nginx -t  # Test config
sudo systemctl reload nginx
```

---

## 🔒 Bước 6: SSL Certificate (Let's Encrypt)

### 6.1 Cài đặt Certbot
```bash
sudo apt install -y certbot python3-certbot-nginx
```

### 6.2 Lấy SSL certificate
```bash
sudo certbot --nginx -d vietjet.shop -d www.vietjet.shop
```

### 6.3 Auto-renew
```bash
sudo certbot renew --dry-run
```

---

## 🎉 Bước 7: Hoàn Tất

Truy cập: **https://vietjet.shop**

### Kiểm tra logs
```bash
pm2 logs vietjet-air
tail -f logs/pm2-out.log
```

### Commands hữu ích
```bash
# Restart app
pm2 restart vietjet-air

# Stop app
pm2 stop vietjet-air

# View metrics
pm2 monit

# Reload (zero-downtime)
pm2 reload vietjet-air
```

---

## 🔧 Troubleshooting

### App không start
```bash
# Kiểm tra logs
pm2 logs vietjet-air --lines 100

# Kiểm tra port
lsof -i :4028

# Kiểm tra .env
cat .env | grep -E "DATABASE_URL|JWT_SECRET"
```

### Lỗi database connection
- Kiểm tra `DATABASE_URL` trong `.env`
- Verify Neon connection string
- Test connection: `psql "$DATABASE_URL"`

### Nginx error
```bash
sudo nginx -t
sudo tail -f /var/log/nginx/error.log
```

---

## 📊 Monitoring

### PM2 Web Dashboard
```bash
pm2 install pm2-server-monit
```

### Log Rotation
```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 10
```

---

## 🔄 Update/Redeploy

1. Build mới trên local
2. Upload tar.gz mới
3. Backup thư mục cũ
4. Giải nén version mới
5. Restart: `pm2 reload vietjet-air`

---

**Hoàn tất! App đã chạy production tại https://vietjet.shop**
