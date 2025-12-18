# CloudBox Security Hardening Guide

Best practices for securing your CloudBox deployment.

---

## Pre-Deployment Checklist

### ✅ Required

- [ ] Generate unique JWT secrets
- [ ] Set `NODE_ENV=production`
- [ ] Configure HTTPS (via reverse proxy or Cloudflare)
- [ ] Set strong `ADMIN_PASSWORD`
- [ ] Configure `FRONTEND_URL` correctly
- [ ] Review and restrict CORS origins

### ⚠️ Recommended

- [ ] Enable Redis for distributed rate limiting
- [ ] Configure Sentry/GlitchTip for error tracking
- [ ] Set up automated backups
- [ ] Enable email verification
- [ ] Configure firewall rules

---

## Authentication Security

### JWT Configuration

```bash
# Generate secure secrets (run twice, use different output for each)
openssl rand -base64 64
```

```bash
# .env
JWT_SECRET=<64+ character random string>
JWT_REFRESH_SECRET=<different 64+ character random string>
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
```

**Important**: The server refuses to start in production with default secrets.

---

### Password Security

CloudBox uses bcrypt with cost factor 12:

```typescript
// Implemented in backend
bcrypt.hash(password, 12)
```

**Password Requirements:**
- Minimum 8 characters (12+ in production recommended)
- Validated on both frontend and backend

---

### Session Management

| Setting | Default | Recommendation |
|---------|---------|----------------|
| `MAX_SESSIONS_PER_USER` | 10 | Lower for sensitive deployments |
| Token rotation | Enabled | Keep enabled |
| HttpOnly cookies | Yes | Don't change |
| SameSite | Strict (prod) | Don't change |

---

## Rate Limiting

### Default Limits

| Endpoint Type | Limit | Window |
|---------------|-------|--------|
| Auth (login, register) | 20 req | 15 min |
| Admin endpoints | 60 req | 1 min |
| General API | 100 req | 1 min |
| File uploads | 50 req | 15 min |

### Distributed Rate Limiting

Enable Redis for rate limiting across multiple instances:

```bash
REDIS_HOST=redis.example.com
REDIS_PORT=6379
REDIS_PASSWORD=secure-password
```

Without Redis, rate limiting only works per-instance.

---

## HTTPS Configuration

### Option 1: Cloudflare Tunnel (Recommended)

No certificate management needed:

```bash
# Install cloudflared
cloudflared tunnel create cloudbox

# Configure in ~/.cloudflared/config.yml
ingress:
  - hostname: cloud.example.com
    service: http://localhost:3001
  - service: http_status:404
```

### Option 2: Caddy (Auto SSL)

```
cloud.example.com {
    reverse_proxy /api/* localhost:3001
    reverse_proxy /* localhost:8080
}
```

### Option 3: nginx + Let's Encrypt

```nginx
server {
    listen 443 ssl http2;
    server_name cloud.example.com;
    
    ssl_certificate /etc/letsencrypt/live/cloud.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/cloud.example.com/privkey.pem;
    
    # Modern SSL config
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;
    
    location /api {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

## Security Headers

CloudBox uses Helmet with these headers (automatically configured):

| Header | Value |
|--------|-------|
| Content-Security-Policy | Restrictive CSP |
| X-Content-Type-Options | nosniff |
| X-Frame-Options | DENY |
| Referrer-Policy | strict-origin-when-cross-origin |
| Strict-Transport-Security | max-age=31536000 |

---

## File Security

### Blocked Extensions

These file types are blocked from upload:

```
.exe, .bat, .cmd, .sh, .ps1, .php, .asp, .aspx, .cgi, .pl, .py, .rb
```

### Path Traversal Protection

All filenames are sanitized:

```typescript
// Removes ../ and other traversal attempts
sanitizeFilename(userInput)
```

### Zip Slip Protection

Archive extraction validates paths before extraction.

---

## Database Security

### Connection

Always use SSL in production:

```bash
DATABASE_URL="postgresql://user:pass@host:5432/db?sslmode=require"
```

### Backups

```bash
# Daily backup cron
0 3 * * * /opt/cloudbox/scripts/backup.sh /backups
```

See [backup.md](./backup.md) for full backup procedures.

---

## Secrets Rotation

### JWT Secrets

Rotate every 6 months:

1. Generate new secrets
2. Update environment variables
3. Restart servers
4. All users will need to re-login

### SMTP Password

If compromised, change in Admin UI immediately.

### Database Password

1. Update in PostgreSQL
2. Update `DATABASE_URL`
3. Restart all services

---

## Monitoring & Logging

### Enable Error Tracking

```bash
SENTRY_DSN=https://key@sentry.example.com/project
```

### Log Security Events

Security-related logs include:
- Failed login attempts (with IP)
- Suspicious request patterns
- Path traversal attempts
- Rate limit violations

### Monitor Failed Logins

The `LoginAttempt` table tracks all login attempts:

```sql
SELECT email, ip_address, COUNT(*) as attempts
FROM login_attempts
WHERE success = false AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY email, ip_address
HAVING COUNT(*) > 5;
```

---

## Account Lockout

After 5 failed attempts in 15 minutes:
- Account is locked for 15 minutes
- Admin can unlock via Admin panel

---

## API Security Best Practices

### For Custom Integrations

1. **Use short-lived tokens** - Access tokens expire in 15 minutes
2. **Store refresh tokens securely** - Never in localStorage for web apps
3. **Validate all inputs** - CloudBox uses Zod schemas
4. **Check file types** - Don't trust Content-Type header alone
5. **Implement retry limits** - Don't retry failed auth infinitely

---

## Docker Security

### Production Dockerfile

```dockerfile
# Run as non-root
USER node

# Don't expose internal ports
EXPOSE 3001

# Health checks
HEALTHCHECK CMD curl -f http://localhost:3001/api/health/ping || exit 1
```

### Docker Compose

```yaml
services:
  backend:
    security_opt:
      - no-new-privileges:true
    read_only: true
    tmpfs:
      - /tmp
```

---

## Firewall Rules

```bash
# Allow only necessary ports
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP (redirect to HTTPS)
ufw allow 443/tcp   # HTTPS
ufw enable

# Internal services (not exposed)
# - PostgreSQL: 5432 (internal only)
# - Redis: 6379 (internal only)
# - Backend: 3001 (behind proxy)
```

---

## Incident Response

### Suspected Breach

1. **Isolate**: Stop public access
2. **Assess**: Check logs for suspicious activity
3. **Rotate**: Change all secrets and passwords
4. **Notify**: Inform affected users
5. **Review**: Implement additional protections

### Log Locations

```bash
# Application logs
docker-compose logs backend

# System logs
/var/log/syslog
/var/log/auth.log
```

---

## Security Updates

1. Regularly run `npm audit`:
```bash
cd backend && npm audit
cd frontend && npm audit
```

2. Update dependencies:
```bash
npm update
npm audit fix
```

3. Monitor security advisories for:
   - Node.js
   - PostgreSQL
   - Redis
   - Docker

---

## Compliance Notes

### Data Storage

- Files stored locally (configurable path)
- Passwords hashed with bcrypt
- SMTP passwords encrypted at rest

### Data Deletion

- User deletion removes all files
- Trash auto-empties after configured days
- Database cascade deletes related records

### Audit Trail

The `Activity` table logs:
- File uploads/deletes
- Share creation
- User actions
