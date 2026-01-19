# JWT Secret Rotation Procedure

This document describes how to safely rotate JWT secrets in a production CloudBox deployment.

## When to Rotate

- Suspected secret compromise
- Routine rotation (recommended: annually)
- Personnel changes (admins leaving)

## Pre-Rotation Preparation

1. **Schedule maintenance window** - Users will be logged out
2. **Backup current `.env`** file
3. **Generate new secrets**:
   ```bash
   # Generate new JWT_SECRET
   openssl rand -base64 64
   
   # Generate new JWT_REFRESH_SECRET
   openssl rand -base64 64
   ```

## Rotation Steps

### Option A: Immediate Rotation (Brief Downtime)

1. Stop all services:
   ```bash
   docker-compose -f docker-compose.prod.yml down
   ```

2. Update `.env` with new secrets:
   ```
   JWT_SECRET=<new-secret>
   JWT_REFRESH_SECRET=<new-refresh-secret>
   ```

3. Clear refresh tokens from database (invalidates all sessions):
   ```bash
   docker-compose -f docker-compose.prod.yml up -d postgres
   docker-compose -f docker-compose.prod.yml exec postgres \
     psql -U cloudbox -c "DELETE FROM refresh_tokens;"
   ```

4. Start all services:
   ```bash
   docker-compose -f docker-compose.prod.yml up -d
   ```

5. Verify health:
   ```bash
   curl http://localhost:3001/api/health/ping
   ```

### Option B: Graceful Rotation (Zero Downtime)

For zero-downtime rotation, you would need to implement dual-secret verification in the codebase. The current implementation does not support this out-of-the-box.

## Post-Rotation

- [ ] Verify admin can login
- [ ] Verify regular user can login
- [ ] Check error logs for JWT-related errors
- [ ] Update secret in any CI/CD pipelines
- [ ] Document rotation date

## Rollback

If issues occur, restore the previous `.env` and restart services:
```bash
cp .env.backup .env
docker-compose -f docker-compose.prod.yml up -d
```

## Notes

- All users will be logged out during rotation
- Mobile apps / API clients may need to re-authenticate
- The `ENCRYPTION_KEY` is separate and rotates independently (requires data re-encryption)
