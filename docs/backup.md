# CloudBox Backup & Restore Guide

This guide covers how to back up and restore CloudBox data for disaster recovery.

---

## Components to Back Up

| Component | What | Location |
|-----------|------|----------|
| **PostgreSQL DB** | Users, files metadata, settings | Docker volume or managed DB |
| **File Storage** | Actual uploaded files, thumbnails | `STORAGE_PATH` (default: `/app/data`) |
| **Redis** | Sessions, rate limits (ephemeral) | Not required, regenerates |

---

## Quick Backup

### Option 1: Using the Backup Script

```bash
# Set password and run
POSTGRES_PASSWORD=your_password ./scripts/backup.sh /path/to/backups

# Or with Docker Compose
docker exec cloudbox-postgres pg_dump -U cloudbox cloudbox | gzip > cloudbox_$(date +%Y%m%d).sql.gz
```

### Option 2: Docker Compose

```bash
# Database backup
docker-compose exec postgres pg_dump -U cloudbox cloudbox > backup.sql

# File storage backup (compress the data volume)
tar -czvf cloudbox_files_$(date +%Y%m%d).tar.gz /path/to/storage
```

---

## Automated Daily Backups

> [!IMPORTANT]
> **Before going to production**, verify your backup can be restored successfully.
> See [Backup & Restore Runbook](./runbooks/backup_restore.md) for detailed procedures.

Add to crontab (`crontab -e`):

```cron
# Daily backup at 3 AM
0 3 * * * POSTGRES_PASSWORD=your_password /opt/cloudbox/scripts/backup.sh /backups >> /var/log/cloudbox-backup.log 2>&1
```

Environment variables for the backup script:

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_HOST` | localhost | Database host |
| `POSTGRES_PORT` | 5432 | Database port |
| `POSTGRES_USER` | cloudbox | Database user |
| `POSTGRES_PASSWORD` | (required) | Database password |
| `POSTGRES_DB` | cloudbox | Database name |
| `BACKUP_RETENTION_DAYS` | 30 | Days to keep old backups |

---

## Restore Procedures

### 1. Database Restore

```bash
# From compressed backup
gunzip -c cloudbox_20251217.sql.gz | docker exec -i cloudbox-postgres psql -U cloudbox cloudbox

# From plain SQL
docker exec -i cloudbox-postgres psql -U cloudbox cloudbox < backup.sql

# Using pg_restore for custom format
pg_restore -h localhost -U cloudbox -d cloudbox -c backup.dump
```

### 2. File Storage Restore

```bash
# Extract files to storage path
tar -xzvf cloudbox_files_20251217.tar.gz -C /

# Ensure correct ownership (match Docker user)
chown -R 1001:1001 /path/to/storage
```

### 3. Full Disaster Recovery

1. **Stop services:**
   ```bash
   docker-compose down
   ```

2. **Restore database:**
   ```bash
   docker-compose up -d postgres
   # Wait for postgres to be ready
   sleep 10
   gunzip -c backup.sql.gz | docker exec -i cloudbox-postgres psql -U cloudbox cloudbox
   ```

3. **Restore files:**
   ```bash
   tar -xzvf cloudbox_files.tar.gz -C /
   ```

4. **Start all services:**
   ```bash
   docker-compose up -d
   ```

5. **Verify:**
   ```bash
   curl http://localhost:3001/api/health/ping
   ```

---

## Cloud Storage Backup (Optional)

For production, consider uploading backups to cloud storage:

```bash
# AWS S3
aws s3 cp backup.sql.gz s3://my-bucket/cloudbox/backups/

# Google Cloud Storage
gsutil cp backup.sql.gz gs://my-bucket/cloudbox/backups/

# Backblaze B2
b2 upload-file my-bucket backup.sql.gz cloudbox/backups/backup.sql.gz
```

---

## Testing Backups

> [!IMPORTANT]
> Regularly test your backup restoration process!

1. Spin up a test environment
2. Restore from backup
3. Verify data integrity:
   ```bash
   # Check file count matches
   docker exec cloudbox-postgres psql -U cloudbox -c "SELECT COUNT(*) FROM files;"
   
   # Check storage matches metadata
   find /path/to/storage -type f | wc -l
   ```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `pg_dump: connection refused` | Ensure postgres is running and accessible |
| `permission denied` | Check file ownership (user 1001) |
| `disk space full` | Increase retention, add storage |
| `backup corrupted` | Use `pg_restore --list` to verify before restore |
