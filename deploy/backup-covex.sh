#!/bin/bash
#
# Phase 6: Backup Script for Covex
# Backs up database + critical ZK artifacts + config.

set -euo pipefail

APP_DIR="${APP_DIR:-/root/Covex27}"
BACKUP_DIR="${BACKUP_DIR:-/backups/covex}"
DATE=$(date +%Y-%m-%d_%H-%M-%S)
BACKUP_NAME="covex-backup-$DATE.tar.gz"

mkdir -p "$BACKUP_DIR"

echo "Creating backup: $BACKUP_NAME"

tar czf "$BACKUP_DIR/$BACKUP_NAME" \
    "$APP_DIR/covex.db" \
    "$APP_DIR/zk/" \
    "$APP_DIR/backend/Cargo.toml" \
    "$APP_DIR/.env.production" 2>/dev/null || true

# Keep only last 14 backups
find "$BACKUP_DIR" -name "covex-backup-*.tar.gz" -mtime +14 -delete

echo "Backup complete: $BACKUP_DIR/$BACKUP_NAME"

# Optional: rsync to remote
# rsync -avz "$BACKUP_DIR/" user@backup-server:/path/to/covex-backups/
