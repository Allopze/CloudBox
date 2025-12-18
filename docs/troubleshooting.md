# CloudBox Troubleshooting Guide

Solutions for common issues when running CloudBox.

---

## Startup Issues

### Server Won't Start

#### Error: `EADDRINUSE: address already in use`

Another process is using port 3001 or 5173.

**Solution:**
```bash
# Find process using port 3001
netstat -ano | findstr :3001  # Windows
lsof -i :3001                 # Linux/Mac

# Kill the process or use different port
PORT=3002 npm run dev
```

---

#### Error: `Cannot find module`

Dependencies not installed or corrupted.

**Solution:**
```bash
# Clean install
rm -rf node_modules package-lock.json
rm -rf backend/node_modules backend/package-lock.json
rm -rf frontend/node_modules frontend/package-lock.json

npm run install:all
```

---

#### Error: `JWT secret not configured`

Using default secrets in production.

**Solution:**
Generate secure secrets:
```bash
openssl rand -base64 64
```

Set in `.env`:
```bash
JWT_SECRET=your-generated-secret
JWT_REFRESH_SECRET=another-generated-secret
```

---

## Database Issues

### Error: `ECONNREFUSED` to PostgreSQL

Database not running or wrong connection string.

**Solution:**
```bash
# Start PostgreSQL with Docker
docker-compose up -d postgres

# Verify connection string in backend/.env
DATABASE_URL="postgresql://cloudbox:password@localhost:5432/cloudbox"

# Test connection
cd backend && npx prisma db push
```

---

### Error: `Prisma client not generated`

Prisma client needs regeneration after schema changes.

**Solution:**
```bash
cd backend && npx prisma generate
```

---

### Error: `Migration failed`

Database schema out of sync.

**Solution:**
```bash
# Reset database (⚠️ deletes all data)
cd backend && npx prisma migrate reset

# Or push schema without migration
cd backend && npx prisma db push
```

---

## Redis Issues

### Error: `ECONNREFUSED` to Redis

Redis not running.

**Solution:**
```bash
# Start Redis with Docker
docker-compose up -d redis

# Or run without Redis (limited features)
# The app will fall back to in-memory caching
```

> **Note**: Without Redis, rate limiting is per-instance only and sessions won't persist across restarts.

---

### Warning: `Redis connection failed, using fallback`

Redis is optional. This warning is normal if you don't have Redis.

---

## Upload Issues

### Uploads Fail with Large Files

Chunk size or file size limits exceeded.

**Solutions:**

1. Check upload limits in Admin panel
2. Increase limits in environment:
```bash
MAX_FILE_SIZE=1073741824  # 1GB
```

3. Check storage path has enough space:
```bash
df -h /path/to/storage
```

---

### Error: `Quota exceeded`

User's storage quota is full.

**Solution:**
- Delete unneeded files
- Empty trash
- Request quota increase from admin

---

### Uploads Stuck at 99%

Merge phase taking time for large files.

**Solution:**
Wait for the merge to complete. For very large files (>1GB), this can take a minute.

---

## Media Processing Issues

### Thumbnails Not Generating

Missing system dependencies.

**Solution:**
Install GraphicsMagick:
```bash
# Ubuntu/Debian
sudo apt-get install graphicsmagick

# macOS
brew install graphicsmagick

# Windows
choco install graphicsmagick
```

---

### Videos Not Transcoding

FFmpeg not installed.

**Solution:**
```bash
# Ubuntu/Debian
sudo apt-get install ffmpeg

# macOS
brew install ffmpeg

# Windows
choco install ffmpeg
```

Verify installation:
```bash
ffmpeg -version
```

---

### PDF Preview Not Working

LibreOffice not installed (for Office → PDF conversion).

**Solution:**
```bash
# Ubuntu/Debian
sudo apt-get install libreoffice

# macOS
brew install --cask libreoffice

# Verify
soffice --version
```

---

### Archive Extraction Fails

7-Zip not installed.

**Solution:**
```bash
# Ubuntu/Debian
sudo apt-get install p7zip-full

# macOS
brew install p7zip

# Windows
choco install 7zip

# Verify
7z --help
```

---

## Frontend Issues

### Blank Page / White Screen

JavaScript error or build issue.

**Solutions:**

1. Check browser console for errors (F12)
2. Clear browser cache
3. Rebuild frontend:
```bash
cd frontend && npm run build
```

---

### API Errors / CORS Issues

Frontend URL mismatch.

**Solution:**
Ensure `FRONTEND_URL` in backend `.env` matches your frontend URL:
```bash
# Development
FRONTEND_URL=http://localhost:5173

# Production
FRONTEND_URL=https://your-domain.com
```

---

### Login Not Working

Cookies not being sent.

**Solutions:**

1. Ensure using HTTPS in production
2. Check browser allows third-party cookies
3. Verify `FRONTEND_URL` matches exactly (including port)

---

## Email Issues

### Emails Not Sending

SMTP not configured or incorrect settings.

**Solution:**

1. Configure SMTP in Admin panel → Settings → Email
2. Use "Test Connection" button
3. Check SMTP credentials are correct

Common SMTP settings:
```bash
# Gmail
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false

# Gmail requires "App Password" if 2FA enabled
```

---

### Email Verification Link Expired

Token expired or already used.

**Solution:**
Request new verification email from login page.

---

## Performance Issues

### Slow File Listing

Too many files in single folder.

**Solutions:**
- Organize files into subfolders
- Use search instead of browsing
- Enable Redis for caching

---

### High Memory Usage

Large files being processed.

**Solutions:**
- Reduce concurrent workers:
```bash
TRANSCODING_BULL_CONCURRENCY=1
THUMBNAIL_CONCURRENCY=2
```

- Increase Node.js memory limit:
```bash
NODE_OPTIONS="--max-old-space-size=4096" npm run dev
```

---

### Slow Uploads

Network or chunk configuration issue.

**Solutions:**
- Adjust chunk size in Admin panel
- Reduce concurrent chunks for unstable connections
- Check network speed

---

## Docker Issues

### Container Won't Start

Check logs:
```bash
docker-compose logs backend
docker-compose logs frontend
```

---

### Permission Denied on Volumes

File ownership mismatch.

**Solution:**
```bash
# Fix ownership
sudo chown -R 1001:1001 ./data

# Or use Docker volume
docker volume create cloudbox_data
```

---

### Out of Disk Space

Docker using too much space.

**Solution:**
```bash
# Clean unused Docker resources
docker system prune -a

# Check Docker disk usage
docker system df
```

---

## Logs & Debugging

### Enable Debug Logging

```bash
# Backend
LOG_LEVEL=debug npm run dev

# Frontend (in browser console)
localStorage.setItem('debug', 'cloudbox:*');
```

### View Logs

```bash
# Docker
docker-compose logs -f backend

# PM2
pm2 logs cloudbox-backend

# Direct
tail -f /var/log/cloudbox/backend.log
```

---

## Getting Help

If you can't resolve an issue:

1. Check existing [GitHub Issues](https://github.com/yourusername/cloudbox/issues)
2. Create a new issue with:
   - Steps to reproduce
   - Error messages
   - Environment info (OS, Node version, etc.)
   - Relevant logs

---

## Quick Reference

| Issue | Quick Fix |
|-------|-----------|
| Port in use | `PORT=3002 npm run dev` |
| DB connection | `docker-compose up -d postgres` |
| Redis missing | App works without it (limited) |
| Prisma error | `cd backend && npx prisma generate` |
| Missing deps | `npm run install:all` |
| Thumbnails fail | Install GraphicsMagick |
| Video transcoding | Install FFmpeg |
| PDF preview | Install LibreOffice |
| Archive extract | Install 7-Zip |
