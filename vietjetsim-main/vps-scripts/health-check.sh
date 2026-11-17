#!/bin/bash
# Health Check Script for Vietjet Air on VPS

echo "=== Vietjet Air - Health Check ==="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check PM2 process
echo "1. PM2 Process Status:"
if pm2 list | grep -q "vietjet-air.*online"; then
    echo -e "${GREEN}✓ PM2 process is running${NC}"
    pm2 describe vietjet-air | grep -E "status|uptime|memory|cpu"
else
    echo -e "${RED}✗ PM2 process is NOT running${NC}"
    exit 1
fi
echo ""

# Check port 4028
echo "2. Port 4028 Status:"
if lsof -i:4028 -sTCP:LISTEN > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Port 4028 is listening${NC}"
    lsof -i:4028 -sTCP:LISTEN
else
    echo -e "${RED}✗ Port 4028 is NOT listening${NC}"
    exit 1
fi
echo ""

# Check HTTP response
echo "3. HTTP Response Test:"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4028/trang-chu)
if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✓ HTTP 200 OK (localhost:4028/trang-chu)${NC}"
else
    echo -e "${RED}✗ HTTP $HTTP_CODE (expected 200)${NC}"
    exit 1
fi
echo ""

# Check Nginx
echo "4. Nginx Status:"
if systemctl is-active --quiet nginx; then
    echo -e "${GREEN}✓ Nginx is running${NC}"
    nginx -t 2>&1 | grep -E "syntax|successful"
else
    echo -e "${RED}✗ Nginx is NOT running${NC}"
fi
echo ""

# Check SSL certificate
echo "5. SSL Certificate:"
if [ -f /etc/letsencrypt/live/vietjet.shop/fullchain.pem ]; then
    CERT_EXPIRY=$(openssl x509 -enddate -noout -in /etc/letsencrypt/live/vietjet.shop/fullchain.pem | cut -d= -f2)
    echo -e "${GREEN}✓ SSL certificate exists${NC}"
    echo "  Expires: $CERT_EXPIRY"
    
    # Check if certificate expires in less than 30 days
    EXPIRY_EPOCH=$(date -d "$CERT_EXPIRY" +%s 2>/dev/null || date -j -f "%b %d %T %Y %Z" "$CERT_EXPIRY" +%s)
    NOW_EPOCH=$(date +%s)
    DAYS_LEFT=$(( ($EXPIRY_EPOCH - $NOW_EPOCH) / 86400 ))
    
    if [ $DAYS_LEFT -lt 30 ]; then
        echo -e "${YELLOW}⚠ Certificate expires in $DAYS_LEFT days - renewal recommended${NC}"
    else
        echo -e "${GREEN}  $DAYS_LEFT days remaining${NC}"
    fi
else
    echo -e "${YELLOW}⚠ SSL certificate not found (not critical if using HTTP only)${NC}"
fi
echo ""

# Check disk space
echo "6. Disk Space:"
DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')
if [ $DISK_USAGE -gt 90 ]; then
    echo -e "${RED}✗ Disk usage: ${DISK_USAGE}% (critical)${NC}"
elif [ $DISK_USAGE -gt 80 ]; then
    echo -e "${YELLOW}⚠ Disk usage: ${DISK_USAGE}% (warning)${NC}"
else
    echo -e "${GREEN}✓ Disk usage: ${DISK_USAGE}%${NC}"
fi
df -h / | grep -E "Filesystem|/$"
echo ""

# Check memory
echo "7. Memory Usage:"
MEM_USAGE=$(free | grep Mem | awk '{printf "%.0f", $3/$2 * 100}')
if [ $MEM_USAGE -gt 90 ]; then
    echo -e "${RED}✗ Memory usage: ${MEM_USAGE}% (critical)${NC}"
elif [ $MEM_USAGE -gt 80 ]; then
    echo -e "${YELLOW}⚠ Memory usage: ${MEM_USAGE}% (warning)${NC}"
else
    echo -e "${GREEN}✓ Memory usage: ${MEM_USAGE}%${NC}"
fi
free -h
echo ""

# Check database connection (if DATABASE_URL is set)
echo "8. Database Connection:"
if [ -f /opt/vietjet/.env ]; then
    DB_URL=$(grep "^DATABASE_URL=" /opt/vietjet/.env | cut -d= -f2- | tr -d '"' | tr -d "'")
    if [ -n "$DB_URL" ]; then
        if psql "$DB_URL" -c "SELECT 1;" > /dev/null 2>&1; then
            echo -e "${GREEN}✓ Database connection successful${NC}"
        else
            echo -e "${RED}✗ Database connection failed${NC}"
        fi
    else
        echo -e "${YELLOW}⚠ DATABASE_URL not configured${NC}"
    fi
else
    echo -e "${YELLOW}⚠ .env file not found${NC}"
fi
echo ""

# Summary
echo "=== Health Check Complete ==="
echo -e "${GREEN}All critical checks passed!${NC}"
