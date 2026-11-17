#!/bin/bash
# Update Script for Vietjet Air

set -e

APP_DIR="/opt/vietjet"
BACKUP_DIR="/opt/vietjet-backups"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

echo "=== Vietjet Air - Update Script ==="
echo ""

# Check if archive file is provided
if [ -z "$1" ]; then
    echo "Error: No archive file specified"
    echo "Usage: ./update.sh <vietjet-YYYYMMDD-HHMMSS.tar.gz>"
    exit 1
fi

ARCHIVE_FILE="$1"
if [ ! -f "$ARCHIVE_FILE" ]; then
    echo "Error: File not found: $ARCHIVE_FILE"
    exit 1
fi

echo "Archive: $ARCHIVE_FILE"
echo "Target: $APP_DIR"
echo ""

# Backup current installation
echo "1. Creating backup of current installation..."
mkdir -p "$BACKUP_DIR"
BACKUP_NAME="vietjet-backup-$TIMESTAMP"
mkdir -p "$BACKUP_DIR/$BACKUP_NAME"

if [ -f "$APP_DIR/.env" ]; then
    cp "$APP_DIR/.env" "$BACKUP_DIR/$BACKUP_NAME/.env"
    echo "   ✓ .env backed up"
fi

if [ -f "$APP_DIR/ecosystem.config.js" ]; then
    cp "$APP_DIR/ecosystem.config.js" "$BACKUP_DIR/$BACKUP_NAME/ecosystem.config.js"
    echo "   ✓ ecosystem.config.js backed up"
fi

cd "$BACKUP_DIR"
tar -czf "$BACKUP_NAME.tar.gz" "$BACKUP_NAME"
rm -rf "$BACKUP_NAME"
echo "   ✓ Backup created: $BACKUP_DIR/$BACKUP_NAME.tar.gz"
echo ""

# Stop PM2 process
echo "2. Stopping current application..."
pm2 stop vietjet-air || true
echo "   ✓ Application stopped"
echo ""

# Extract new version
echo "3. Extracting new version..."
cd "$APP_DIR"

# Remove old files (except .env and logs)
echo "   Removing old files..."
find . -mindepth 1 -maxdepth 1 ! -name '.env' ! -name 'logs' ! -name '*.tar.gz' -exec rm -rf {} +

# Extract new archive
echo "   Extracting archive..."
tar -xzf "$ARCHIVE_FILE"
echo "   ✓ New version extracted"
echo ""

# Restore .env if it was in backup but not in new archive
if [ ! -f "$APP_DIR/.env" ] && [ -f "$BACKUP_DIR/$BACKUP_NAME.tar.gz" ]; then
    echo "4. Restoring .env from backup..."
    tar -xzf "$BACKUP_DIR/$BACKUP_NAME.tar.gz" -C /tmp "$BACKUP_NAME/.env"
    cp "/tmp/$BACKUP_NAME/.env" "$APP_DIR/.env"
    rm -rf "/tmp/$BACKUP_NAME"
    echo "   ✓ .env restored"
    echo ""
fi

# Start PM2 process
echo "5. Starting application..."
pm2 start ecosystem.config.js || pm2 restart vietjet-air
sleep 3
echo ""

# Check health
echo "6. Checking application health..."
sleep 2

if pm2 list | grep -q "vietjet-air.*online"; then
    echo "   ✓ PM2 process is running"
else
    echo "   ✗ PM2 process failed to start"
    echo ""
    echo "Rolling back..."
    pm2 stop vietjet-air || true
    
    # Restore from backup
    find . -mindepth 1 -maxdepth 1 ! -name 'logs' ! -name '*.tar.gz' -exec rm -rf {} +
    tar -xzf "$BACKUP_DIR/$BACKUP_NAME.tar.gz" -C "$APP_DIR" --strip-components=1
    pm2 start ecosystem.config.js
    
    echo "   ✓ Rolled back to previous version"
    exit 1
fi

# Test HTTP response
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4028/trang-chu || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
    echo "   ✓ HTTP health check passed (200 OK)"
else
    echo "   ✗ HTTP health check failed (HTTP $HTTP_CODE)"
    echo "   Check logs: pm2 logs vietjet-air"
fi
echo ""

# Save PM2 configuration
echo "7. Saving PM2 configuration..."
pm2 save
echo "   ✓ PM2 configuration saved"
echo ""

echo "=== Update Complete ==="
echo ""
echo "Next steps:"
echo "1. Check logs: pm2 logs vietjet-air"
echo "2. Monitor: pm2 monit"
echo "3. Test website: https://vietjet.shop"
echo ""
echo "If issues occur, rollback with:"
echo "  cd $APP_DIR"
echo "  pm2 stop vietjet-air"
echo "  tar -xzf $BACKUP_DIR/$BACKUP_NAME.tar.gz"
echo "  pm2 restart vietjet-air"
