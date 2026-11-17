#!/bin/bash
# Backup Script for Vietjet Air

set -e

BACKUP_DIR="/opt/vietjet-backups"
APP_DIR="/opt/vietjet"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_NAME="vietjet-backup-$TIMESTAMP"

echo "=== Vietjet Air - Backup Script ==="
echo ""

# Create backup directory
mkdir -p "$BACKUP_DIR"

echo "1. Creating backup directory: $BACKUP_DIR/$BACKUP_NAME"
mkdir -p "$BACKUP_DIR/$BACKUP_NAME"

# Backup .env file (contains secrets)
echo "2. Backing up .env file..."
if [ -f "$APP_DIR/.env" ]; then
    cp "$APP_DIR/.env" "$BACKUP_DIR/$BACKUP_NAME/.env"
    echo "   ✓ .env backed up"
else
    echo "   ⚠ .env not found"
fi

# Backup PM2 config
echo "3. Backing up PM2 configuration..."
if [ -f "$APP_DIR/ecosystem.config.js" ]; then
    cp "$APP_DIR/ecosystem.config.js" "$BACKUP_DIR/$BACKUP_NAME/ecosystem.config.js"
    echo "   ✓ ecosystem.config.js backed up"
fi

# Backup Nginx config
echo "4. Backing up Nginx configuration..."
if [ -f /etc/nginx/sites-available/vietjet ]; then
    sudo cp /etc/nginx/sites-available/vietjet "$BACKUP_DIR/$BACKUP_NAME/nginx-vietjet"
    sudo chown $USER:$USER "$BACKUP_DIR/$BACKUP_NAME/nginx-vietjet"
    echo "   ✓ Nginx config backed up"
fi

# Backup PM2 dump
echo "5. Backing up PM2 process list..."
pm2 save > /dev/null 2>&1
if [ -f ~/.pm2/dump.pm2 ]; then
    cp ~/.pm2/dump.pm2 "$BACKUP_DIR/$BACKUP_NAME/pm2-dump.pm2"
    echo "   ✓ PM2 dump backed up"
fi

# Backup logs (last 1000 lines)
echo "6. Backing up recent logs..."
mkdir -p "$BACKUP_DIR/$BACKUP_NAME/logs"
if [ -f "$APP_DIR/logs/pm2-out.log" ]; then
    tail -1000 "$APP_DIR/logs/pm2-out.log" > "$BACKUP_DIR/$BACKUP_NAME/logs/pm2-out.log"
fi
if [ -f "$APP_DIR/logs/pm2-error.log" ]; then
    tail -1000 "$APP_DIR/logs/pm2-error.log" > "$BACKUP_DIR/$BACKUP_NAME/logs/pm2-error.log"
fi
echo "   ✓ Logs backed up"

# Create archive
echo "7. Creating compressed archive..."
cd "$BACKUP_DIR"
tar -czf "$BACKUP_NAME.tar.gz" "$BACKUP_NAME"
rm -rf "$BACKUP_NAME"
echo "   ✓ Archive created: $BACKUP_DIR/$BACKUP_NAME.tar.gz"

# Show backup size
BACKUP_SIZE=$(du -h "$BACKUP_DIR/$BACKUP_NAME.tar.gz" | cut -f1)
echo ""
echo "=== Backup Complete ==="
echo "Location: $BACKUP_DIR/$BACKUP_NAME.tar.gz"
echo "Size: $BACKUP_SIZE"
echo ""

# Cleanup old backups (keep last 7 days)
echo "8. Cleaning up old backups (keeping last 7 days)..."
find "$BACKUP_DIR" -name "vietjet-backup-*.tar.gz" -mtime +7 -delete
REMAINING=$(ls -1 "$BACKUP_DIR"/vietjet-backup-*.tar.gz 2>/dev/null | wc -l)
echo "   ✓ $REMAINING backup(s) remaining"

echo ""
echo "Note: This backup does NOT include database. Use pg_dump for database backups."
echo "Example: pg_dump \$DATABASE_URL > vietjet-db-$TIMESTAMP.sql"
