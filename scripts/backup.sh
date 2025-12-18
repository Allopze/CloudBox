#!/bin/bash
# ============================================
# CloudBox - PostgreSQL Backup Script
# ============================================
# 
# Usage: ./backup.sh [backup_dir]
# 
# Environment variables:
#   POSTGRES_HOST     - Database host (default: localhost)
#   POSTGRES_PORT     - Database port (default: 5432)
#   POSTGRES_USER     - Database user (default: cloudbox)
#   POSTGRES_PASSWORD - Database password (required)
#   POSTGRES_DB       - Database name (default: cloudbox)
#
# Example:
#   POSTGRES_PASSWORD=mypassword ./backup.sh /backups
#
# For Docker environments:
#   docker exec cloudbox-postgres pg_dump -U cloudbox cloudbox | gzip > backup.sql.gz
#

set -euo pipefail

# Configuration
BACKUP_DIR="${1:-./backups}"
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_USER="${POSTGRES_USER:-cloudbox}"
POSTGRES_DB="${POSTGRES_DB:-cloudbox}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/cloudbox_${TIMESTAMP}.sql.gz"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Validate required environment variables
if [ -z "${POSTGRES_PASSWORD:-}" ]; then
    log_error "POSTGRES_PASSWORD environment variable is required"
    exit 1
fi

# Create backup directory if it doesn't exist
mkdir -p "${BACKUP_DIR}"

# Export password for pg_dump
export PGPASSWORD="${POSTGRES_PASSWORD}"

log_info "Starting CloudBox database backup..."
log_info "Host: ${POSTGRES_HOST}:${POSTGRES_PORT}"
log_info "Database: ${POSTGRES_DB}"
log_info "Output: ${BACKUP_FILE}"

# Perform backup with compression
if pg_dump -h "${POSTGRES_HOST}" \
           -p "${POSTGRES_PORT}" \
           -U "${POSTGRES_USER}" \
           -d "${POSTGRES_DB}" \
           --no-owner \
           --no-acl \
           -F c \
           | gzip > "${BACKUP_FILE}"; then
    
    BACKUP_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
    log_info "Backup completed successfully: ${BACKUP_FILE} (${BACKUP_SIZE})"
else
    log_error "Backup failed!"
    rm -f "${BACKUP_FILE}"
    exit 1
fi

# Cleanup old backups
if [ "${RETENTION_DAYS}" -gt 0 ]; then
    log_info "Cleaning up backups older than ${RETENTION_DAYS} days..."
    DELETED=$(find "${BACKUP_DIR}" -name "cloudbox_*.sql.gz" -mtime +"${RETENTION_DAYS}" -delete -print | wc -l)
    if [ "${DELETED}" -gt 0 ]; then
        log_info "Deleted ${DELETED} old backup(s)"
    fi
fi

# List current backups
log_info "Current backups:"
ls -lh "${BACKUP_DIR}"/cloudbox_*.sql.gz 2>/dev/null || log_warn "No backups found"

log_info "Backup process completed!"
