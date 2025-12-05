# Redis Setup Guide for CloudBox

Redis is optional but **highly recommended** for production deployments. It provides significant performance benefits and enables features that are not available with in-memory fallbacks.

## What Redis Enables

| Feature | Without Redis | With Redis |
|---------|---------------|------------|
| **Caching** | All queries hit database | Fast lookups, reduced DB load |
| **Session Store** | Database-based sessions | Instant invalidation, multi-device tracking |
| **Job Queues** | In-process with p-limit | Separate worker process, no API competition |
| **Rate Limiting** | In-memory (single node only) | Distributed across all nodes |

### Session Management Features (Redis Required)

When Redis is enabled, users get access to:

- **GET /api/auth/sessions** - View all active sessions with device info
- **DELETE /api/auth/sessions/:id** - Terminate a specific session
- **POST /api/auth/sessions/logout-all** - Logout from all devices instantly

These endpoints allow users to:
- See which devices are logged in (browser, OS, IP)
- Instantly revoke access from any device
- Logout from all devices after password change

## Quick Start

### 1. Install Redis

**Docker (recommended for development):**
```bash
docker run -d --name cloudbox-redis -p 6379:6379 redis:alpine
```

**Windows (using Chocolatey):**
```powershell
choco install redis-64
redis-server
```

**macOS:**
```bash
brew install redis
brew services start redis
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt update
sudo apt install redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server
```

### 2. Configure Environment Variables

Add to your `backend/.env`:

```dotenv
# Redis connection
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=          # Leave empty for local development
REDIS_DB=0               # Database number (0-15)

# Enable caching (default: true if Redis is available)
CACHE_ENABLED=true

# Maximum concurrent sessions per user
MAX_SESSIONS_PER_USER=10
```

### 3. Run the Queue Worker (Production)

**IMPORTANT:** For production, run the queue worker as a separate process to isolate CPU-intensive tasks (ffmpeg transcoding, sharp thumbnails) from the API server.

```bash
# Development
npx tsx src/workers/queueWorker.ts

# Production (after build)
node dist/workers/queueWorker.js
```

**Worker Environment Variables:**

```dotenv
# Number of concurrent jobs the worker processes
WORKER_CONCURRENCY=2

# What queues to process: 'all', 'transcoding', or 'thumbnails'
WORKER_TYPE=all
```

## Production Configuration

### Secure Redis with Password

1. Edit `/etc/redis/redis.conf` (or your Redis config):
   ```
   requirepass your-secure-password-here
   ```

2. Update your `.env`:
   ```dotenv
   REDIS_PASSWORD=your-secure-password-here
   ```

### Redis with TLS (Cloud Providers)

For Redis services like AWS ElastiCache, Azure Cache, or Redis Cloud with TLS:

```dotenv
REDIS_HOST=your-redis-host.cache.amazonaws.com
REDIS_PORT=6379
REDIS_PASSWORD=your-auth-token
REDIS_TLS=true  # Note: You may need to add TLS support to the codebase
```

### Memory Configuration

For a typical CloudBox instance, configure Redis memory limits:

```
# redis.conf
maxmemory 256mb
maxmemory-policy allkeys-lru
```

## Docker Compose Setup

For running CloudBox with Redis and a dedicated worker:

```yaml
version: '3.8'

services:
  redis:
    image: redis:alpine
    command: redis-server --appendonly yes
    volumes:
      - redis-data:/data
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  api:
    build: ./backend
    environment:
      - REDIS_HOST=redis
      - REDIS_PORT=6379
    depends_on:
      redis:
        condition: service_healthy
    ports:
      - "3001:3001"

  worker:
    build: ./backend
    command: node dist/workers/queueWorker.js
    environment:
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - WORKER_CONCURRENCY=2
      - WORKER_TYPE=all
    depends_on:
      redis:
        condition: service_healthy

volumes:
  redis-data:
```

## Monitoring

### Health Check Endpoint

The `/health` endpoint now shows Redis status for each component:

```json
{
  "status": "healthy",
  "checks": {
    "transcoding": {
      "status": "healthy",
      "message": "Redis connected, 0 active jobs",
      "usingRedis": true
    },
    "thumbnails": {
      "status": "healthy", 
      "message": "Redis connected, 0 active, 0 waiting",
      "usingRedis": true
    },
    "cache": {
      "status": "healthy",
      "message": "Redis connected, 45 keys, 2.5M memory",
      "usingRedis": true
    },
    "sessions": {
      "status": "healthy",
      "message": "Redis connected, 12 active sessions",
      "usingRedis": true
    }
  }
}
```

**Status meanings:**
- `healthy`: Redis connected and working
- `degraded`: Running without Redis (fallback mode)
- `unhealthy`: Critical failure

### Bull Board (Job Queue UI)

Access the Bull Board dashboard at `/admin/queues` (admin login required) to:
- View pending/active/completed/failed jobs
- Retry failed jobs
- Clear queues
- Monitor job processing times

### Redis CLI Commands

```bash
# Check connection
redis-cli ping

# View all CloudBox keys
redis-cli keys "cache:*"
redis-cli keys "session:*"

# Check queue status
redis-cli keys "bull:*"

# Memory usage
redis-cli info memory

# Clear all CloudBox cache
redis-cli keys "cache:*" | xargs redis-cli del
```

## Fallback Behavior

When Redis is unavailable, CloudBox gracefully degrades:

| Component | Fallback Behavior | Impact |
|-----------|-------------------|--------|
| Cache | Disabled | More database queries, higher latency |
| Sessions | Database tokens only | No instant logout, no device tracking |
| Transcoding Queue | In-process with p-limit | Competes with API for CPU |
| Thumbnail Queue | In-process with p-limit | Competes with API for CPU |
| Rate Limiting | In-memory Map | Only works on single node |

**The health endpoint will show `degraded` status** for components not using Redis, making it easy to detect when Redis is down.

## Troubleshooting

### "Connection refused" error

1. Check if Redis is running:
   ```bash
   redis-cli ping
   ```

2. Verify host/port in `.env` match your Redis instance

3. Check firewall rules if Redis is on a different machine

### "NOAUTH Authentication required"

Add `REDIS_PASSWORD` to your `.env`

### High memory usage

1. Check current usage:
   ```bash
   redis-cli info memory
   ```

2. Clear old cache entries:
   ```bash
   redis-cli keys "cache:*" | xargs redis-cli del
   ```

3. Consider lowering TTLs in `backend/src/lib/cache.ts`

### Jobs not processing

1. Ensure the queue worker is running
2. Check Bull Board for failed jobs at `/admin/queues`
3. Check worker logs for errors

## Performance Tuning

### Cache TTLs

Adjust in `backend/src/lib/cache.ts`:

```typescript
ttl: {
  files: 30,        // File lists (changes frequently)
  user: 300,        // User info (changes rarely)
  folders: 60,      // Folder structure (moderate changes)
  fileMetadata: 300,// File metadata (rarely changes)
  quota: 60,        // Storage quota (changes with uploads)
}
```

### Queue Concurrency

Balance CPU usage vs throughput:

```dotenv
# Fallback (in-process) - keep low to not starve API
TRANSCODING_FALLBACK_CONCURRENCY=2
THUMBNAIL_FALLBACK_CONCURRENCY=2

# Worker process - can be higher since it's isolated
WORKER_CONCURRENCY=4
```

### Connection Pool

For high-traffic deployments, consider using a Redis connection pool by modifying the Redis client initialization in the codebase.
