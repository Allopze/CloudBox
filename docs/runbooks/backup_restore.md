# CloudBox Backup & Restore Runbook

> [!IMPORTANT]
> This runbook documents verified procedures for backup and disaster recovery.
> Test these procedures in a staging environment before relying on them in production.

---

## Quick Reference

| Action | Command |
|--------|---------|
| Manual backup | `POSTGRES_PASSWORD=xxx ./scripts/backup.sh /backups` |
| Restore database | `gunzip -c backup.sql.gz \| docker exec -i cloudbox-postgres psql -U cloudbox cloudbox` |
| Verify backup | `pg_restore --list backup.sql.gz` |

---

## 1. Pre-Flight Checklist

Before deploying to production, verify:

- [ ] Backup script is executable: `chmod +x ./scripts/backup.sh`
- [ ] Backup directory exists and has write permissions
- [ ] Cron job is configured (see below)
- [ ] Backup restoration has been tested at least once
- [ ] Off-site backup location is configured (S3, B2, etc.)

---

## 2. Automated Backup Setup

### 2.1 Configure Cron Job

Add to crontab (`crontab -e`):

```bash
# CloudBox daily backup at 3:00 AM
0 3 * * * POSTGRES_PASSWORD='YOUR_DB_PASSWORD' /opt/cloudbox/scripts/backup.sh /backups >> /var/log/cloudbox-backup.log 2>&1

# Weekly cleanup of old log files
0 4 * * 0 find /var/log -name 'cloudbox-backup.log.*' -mtime +30 -delete
```

### 2.2 Environment Variables

Create `/opt/cloudbox/.backup-env`:

```bash
# Backup configuration
export POSTGRES_HOST=localhost
export POSTGRES_PORT=5432
export POSTGRES_USER=cloudbox
export POSTGRES_PASSWORD='YOUR_SECURE_PASSWORD'
export POSTGRES_DB=cloudbox
export BACKUP_RETENTION_DAYS=30
```

Then modify cron:

```bash
0 3 * * * source /opt/cloudbox/.backup-env && /opt/cloudbox/scripts/backup.sh /backups >> /var/log/cloudbox-backup.log 2>&1
```

> [!CAUTION]
> Secure the `.backup-env` file: `chmod 600 /opt/cloudbox/.backup-env`

---

## 3. Manual Backup Procedure

### 3.1 Database Backup

```bash
# Using the backup script
POSTGRES_PASSWORD=xxx ./scripts/backup.sh /path/to/backups

# Or directly with Docker
docker exec cloudbox-postgres pg_dump -U cloudbox cloudbox | gzip > cloudbox_$(date +%Y%m%d_%H%M%S).sql.gz
```

### 3.2 File Storage Backup

```bash
# Backup the data directory
tar -czvf cloudbox_files_$(date +%Y%m%d).tar.gz /path/to/cloudbox/data

# Or use rsync for incremental backups
rsync -avz --delete /path/to/cloudbox/data/ /backup/cloudbox-files/
```

### 3.3 Full System Backup

```bash
#!/bin/bash
# full-backup.sh

BACKUP_DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/${BACKUP_DATE}"

mkdir -p "${BACKUP_DIR}"

# Database
POSTGRES_PASSWORD=xxx ./scripts/backup.sh "${BACKUP_DIR}"

# Files
tar -czvf "${BACKUP_DIR}/files.tar.gz" /app/data

# Configuration (excluding secrets)
cp .env.production.example "${BACKUP_DIR}/env-template.txt"

echo "Backup complete: ${BACKUP_DIR}"
```

---

## 4. Backup Verification

### 4.1 Verify Backup Integrity

```bash
# Check if backup file is valid
pg_restore --list cloudbox_*.sql.gz

# Check file size (should be non-zero)
ls -lh /backups/cloudbox_*.sql.gz

# Count tables in backup
gunzip -c cloudbox_*.sql.gz | grep -c "^CREATE TABLE"
```

### 4.2 Test Restore (Staging)

> [!WARNING]
> Only run restore tests on staging or test databases, never on production!

```bash
# Create test database
docker exec cloudbox-postgres psql -U cloudbox -c "CREATE DATABASE cloudbox_test;"

# Restore to test database
gunzip -c cloudbox_20251217.sql.gz | docker exec -i cloudbox-postgres psql -U cloudbox cloudbox_test

# Verify data
docker exec cloudbox-postgres psql -U cloudbox -d cloudbox_test -c "SELECT COUNT(*) FROM users;"
docker exec cloudbox-postgres psql -U cloudbox -d cloudbox_test -c "SELECT COUNT(*) FROM files;"

# Cleanup
docker exec cloudbox-postgres psql -U cloudbox -c "DROP DATABASE cloudbox_test;"
```

---

## 5. Disaster Recovery Procedure

### 5.1 Full Recovery Steps

1. **Stop all services**
   ```bash
   docker-compose -f docker-compose.prod.yml down
   ```

2. **Restore database volume** (if using Docker volumes)
   ```bash
   docker volume rm cloudbox_postgres_data
   docker volume create cloudbox_postgres_data
   ```

3. **Start database only**
   ```bash
   docker-compose -f docker-compose.prod.yml up -d postgres
   sleep 15  # Wait for postgres to initialize
   ```

4. **Restore database from backup**
   ```bash
   gunzip -c /backups/cloudbox_YYYYMMDD.sql.gz | docker exec -i cloudbox-postgres psql -U cloudbox cloudbox
   ```

5. **Restore file storage**
   ```bash
   tar -xzvf /backups/cloudbox_files_YYYYMMDD.tar.gz -C /
   chown -R 1001:1001 /app/data
   ```

6. **Start remaining services**
   ```bash
   docker-compose -f docker-compose.prod.yml up -d
   ```

7. **Verify recovery**
   ```bash
   # Check API health
   curl http://localhost:3001/api/health/ping
   
   # Check file count matches
   docker exec cloudbox-postgres psql -U cloudbox -c "SELECT COUNT(*) as db_files FROM files WHERE \"isTrash\" = false;"
   find /app/data -type f | wc -l
   ```

### 5.2 Recovery Time Objectives

| Component | Expected Recovery Time |
|-----------|----------------------|
| Database (10GB) | ~10 minutes |
| Files (100GB) | ~30-60 minutes |
| Full service | ~1 hour |

---

## 6. Off-Site Backup

### 6.1 AWS S3

```bash
# Install AWS CLI
pip install awscli

# Configure
aws configure

# Upload backup
aws s3 cp /backups/cloudbox_$(date +%Y%m%d).sql.gz s3://your-bucket/cloudbox/backups/

# Sync all backups
aws s3 sync /backups/ s3://your-bucket/cloudbox/backups/
```

### 6.2 Backblaze B2

```bash
# Install B2 CLI
pip install b2

# Authorize
b2 authorize-account YOUR_KEY_ID YOUR_APP_KEY

# Upload
b2 upload-file your-bucket /backups/cloudbox_*.sql.gz cloudbox/backups/
```

### 6.3 Automated Upload Cron

```bash
# After backup, upload to S3
5 3 * * * aws s3 cp /backups/cloudbox_$(date +\%Y\%m\%d)*.sql.gz s3://your-bucket/cloudbox/backups/
```

---

## 7. Monitoring Backups

### 7.1 Backup Health Check Script

```bash
#!/bin/bash
# check-backup-health.sh

BACKUP_DIR="/backups"
MAX_AGE_HOURS=25  # Alert if backup is older than 25 hours

LATEST_BACKUP=$(ls -t ${BACKUP_DIR}/cloudbox_*.sql.gz 2>/dev/null | head -1)

if [ -z "$LATEST_BACKUP" ]; then
    echo "CRITICAL: No backups found!"
    exit 2
fi

AGE_SECONDS=$(($(date +%s) - $(stat -c %Y "$LATEST_BACKUP")))
AGE_HOURS=$((AGE_SECONDS / 3600))

if [ $AGE_HOURS -gt $MAX_AGE_HOURS ]; then
    echo "WARNING: Latest backup is ${AGE_HOURS} hours old: $LATEST_BACKUP"
    exit 1
fi

SIZE=$(du -h "$LATEST_BACKUP" | cut -f1)
echo "OK: Latest backup is ${AGE_HOURS}h old, size: ${SIZE}"
exit 0
```

### 7.2 Alert Integration

Add to monitoring (e.g., Prometheus AlertManager, Uptime Kuma):

```yaml
# prometheus-rules.yml
groups:
  - name: backup-alerts
    rules:
      - alert: BackupMissing
        expr: time() - backup_last_success_timestamp > 90000
        labels:
          severity: critical
        annotations:
          summary: "CloudBox backup has not run in 25+ hours"
```

---

## 8. Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| `pg_dump: connection refused` | PostgreSQL not running | `docker-compose up -d postgres` |
| `permission denied` on restore | Wrong file ownership | `chown -R 1001:1001 /app/data` |
| `disk space full` | Too many backups | Reduce `BACKUP_RETENTION_DAYS` |
| Backup file is 0 bytes | pg_dump failed | Check postgres logs, disk space |
| Restore hangs | Large database | Use `pg_restore --jobs=4` for parallel |

---

## Appendix: Backup Verification Log

Use this table to track verified restore tests:

| Date | Backup File | Restored To | Result | Tester |
|------|-------------|-------------|--------|--------|
| YYYY-MM-DD | cloudbox_YYYYMMDD.sql.gz | staging | ✅ Pass | Name |

> [!TIP]
> Schedule quarterly restore tests and document results here.
