# CloudBox Background Queues

Documentation for Bull queues used for background job processing.

---

## Overview

CloudBox uses [Bull](https://github.com/OptimalBits/bull) with Redis for background job processing. Three main queues handle media processing tasks:

| Queue | Purpose | Concurrency |
|-------|---------|-------------|
| `transcoding` | Video transcoding | 2 |
| `thumbnails` | Thumbnail generation | 4 |
| `document-conversion` | Office → PDF | 2 |

---

## Queue Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Backend   │────▶│    Redis    │◀────│   Worker    │
│   (Jobs)    │     │   (Queue)   │     │  (Process)  │
└─────────────┘     └─────────────┘     └─────────────┘
       │                                       │
       │         ┌─────────────┐               │
       └────────▶│  Socket.IO  │◀─────────────┘
                 │  (Progress) │
                 └─────────────┘
```

---

## Transcoding Queue

Handles video transcoding using FFmpeg.

### Job Data

```typescript
interface TranscodingJob {
  fileId: string;
  inputPath: string;
  outputPath: string;
  userId: string;
}
```

### Status Flow

```
PENDING → PROCESSING → COMPLETED
                    ↘ FAILED
```

### Configuration

```bash
TRANSCODING_BULL_CONCURRENCY=2
TRANSCODING_FALLBACK_CONCURRENCY=2  # Without Redis
```

### Progress Events

Progress emitted via Socket.IO:
```typescript
{
  fileId: 'uuid',
  progress: 45,        // 0-100
  status: 'PROCESSING'
}
```

---

## Thumbnails Queue

Generates thumbnails for images, videos, and PDFs.

### Supported Formats

| Type | Tool Used |
|------|-----------|
| Images | Sharp |
| Videos | FFmpeg |
| PDFs | pdf2pic (GraphicsMagick) |

### Job Data

```typescript
interface ThumbnailJob {
  fileId: string;
  inputPath: string;
  outputPath: string;
  mimeType: string;
}
```

### Configuration

```bash
THUMBNAIL_CONCURRENCY=4
THUMBNAIL_RATE_LIMIT_PER_HOUR=1000
```

### Rate Limiting

Thumbnails are rate-limited per user to prevent abuse:
- 1000 thumbnails per hour per user
- Configurable via environment variables

---

## Document Conversion Queue

Converts Office documents to PDF for preview.

### Requirements

- LibreOffice (`soffice` in PATH)

### Supported Formats

- `.docx`, `.doc` (Word)
- `.xlsx`, `.xls` (Excel)
- `.pptx`, `.ppt` (PowerPoint)
- `.odt`, `.ods`, `.odp` (OpenDocument)

### Job Data

```typescript
interface DocumentJob {
  fileId: string;
  inputPath: string;
  outputDir: string;
}
```

---

## Bull Board Dashboard

Access the queue dashboard at:
```
/admin/queues
```

**Requires**: Admin authentication

**Features**:
- View job status
- Retry failed jobs
- View job data
- Delete jobs

---

## Running Workers

### Development (Integrated)

Workers run in the same process as the backend by default:

```bash
npm run dev
```

### Production (Separate)

For better resource management, run workers separately:

```bash
# Main backend (API only)
node dist/index.js

# Separate worker process
node dist/workers/queueWorker.js
```

### Worker Types

```bash
# All queues
WORKER_TYPE=all node dist/workers/queueWorker.js

# Specific queue
WORKER_TYPE=transcoding node dist/workers/queueWorker.js
WORKER_TYPE=thumbnails node dist/workers/queueWorker.js
```

---

## Redis Fallback

When Redis is unavailable, queues fall back to in-memory processing:

| Feature | With Redis | Without Redis |
|---------|------------|---------------|
| Persistence | ✅ | ❌ |
| Multi-instance | ✅ | ❌ |
| Job retries | ✅ | Limited |
| Dashboard | ✅ | ❌ |

> **Note**: In fallback mode, jobs are lost on restart.

---

## Job Lifecycle

### 1. Job Created

```typescript
// In routes
await transcodingQueue.add({
  fileId: file.id,
  inputPath: file.path,
  outputPath: transcodedPath,
  userId: req.user.userId,
});
```

### 2. Job Processing

```typescript
// In worker
transcodingQueue.process(async (job) => {
  const { fileId, inputPath, outputPath } = job.data;
  
  // Update progress
  job.progress(50);
  
  // Emit via Socket.IO
  emitTranscodingProgress(fileId, 50, 'PROCESSING');
  
  // Do work...
  await transcodeVideo(inputPath, outputPath);
  
  return { success: true };
});
```

### 3. Job Completed

```typescript
transcodingQueue.on('completed', async (job, result) => {
  // Update database
  await prisma.transcodingJob.update({
    where: { fileId: job.data.fileId },
    data: { status: 'COMPLETED', progress: 100 },
  });
  
  // Notify client
  emitTranscodingComplete(job.data.fileId, result.outputPath);
});
```

### 4. Job Failed

```typescript
transcodingQueue.on('failed', async (job, error) => {
  await prisma.transcodingJob.update({
    where: { fileId: job.data.fileId },
    data: { status: 'FAILED', error: error.message },
  });
});
```

---

## Retry Configuration

```typescript
const queue = new Bull('myqueue', {
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000, // Start with 5 seconds
    },
  },
});
```

---

## Monitoring

### Queue Health

```typescript
const counts = await transcodingQueue.getJobCounts();
// { waiting: 5, active: 2, completed: 100, failed: 3 }
```

### Active Jobs

```typescript
const activeJobs = await transcodingQueue.getActive();
```

### Failed Jobs

```typescript
const failedJobs = await transcodingQueue.getFailed();
for (const job of failedJobs) {
  console.log(job.id, job.failedReason);
}
```

---

## Cleanup

Old completed/failed jobs are cleaned automatically:

```typescript
// Runs periodically in backend
await queue.clean(7 * 24 * 60 * 60 * 1000); // 7 days
```

---

## Troubleshooting

### Jobs Stuck in "Active"

Worker crashed without completing:

```bash
# In Bull Board, click "Retry" on stuck jobs
# Or programmatically:
const stuckJobs = await queue.getActive();
for (const job of stuckJobs) {
  await job.retry();
}
```

### Queue Not Processing

Check Redis connection:

```bash
redis-cli ping
# Should return: PONG
```

### Memory Issues

Reduce concurrency:

```bash
TRANSCODING_BULL_CONCURRENCY=1
THUMBNAIL_CONCURRENCY=2
```

---

## Performance Tips

1. **Separate workers for heavy tasks**: Run transcoding on dedicated server
2. **Increase concurrency for I/O bound tasks**: Thumbnails can handle more concurrency
3. **Monitor queue length**: Set up alerts if queue grows too large
4. **Use priority**: Add priority to time-sensitive jobs

```typescript
await queue.add(jobData, { priority: 1 }); // Higher priority
```
