# CloudBox WebSockets (Socket.IO)

Documentation for real-time events using Socket.IO.

---

## Overview

CloudBox uses [Socket.IO](https://socket.io/) for real-time updates including:
- Upload progress
- Video transcoding progress
- Storage quota updates

---

## Connection

### Client Setup

```typescript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3001', {
  auth: {
    token: accessToken, // JWT access token
  },
  transports: ['websocket', 'polling'],
});

socket.on('connect', () => {
  console.log('Connected:', socket.id);
});

socket.on('connect_error', (error) => {
  console.error('Connection failed:', error.message);
});
```

### Authentication

Connections require a valid JWT token in the handshake:

```typescript
socket.auth = { token: newAccessToken };
socket.connect();
```

If the token is invalid or expired, the connection will be rejected with an error.

---

## Events

### Server → Client Events

#### `upload:progress`

Emitted during chunked file uploads.

```typescript
socket.on('upload:progress', (data) => {
  console.log(data);
  // {
  //   uploadId: 'uuid',
  //   progress: 45,           // Percentage (0-100)
  //   uploadedChunks: 9,      // Chunks uploaded
  //   totalChunks: 20,        // Total chunks
  //   speed: 1048576          // Bytes per second
  // }
});
```

---

#### `upload:complete`

Emitted when upload finishes successfully.

```typescript
socket.on('upload:complete', (data) => {
  console.log(data);
  // {
  //   uploadId: 'uuid',
  //   file: {
  //     id: 'file-uuid',
  //     name: 'document.pdf',
  //     size: 1234567,
  //     mimeType: 'application/pdf',
  //     ...
  //   }
  // }
});
```

---

#### `upload:error`

Emitted when upload fails.

```typescript
socket.on('upload:error', (data) => {
  console.log(data);
  // {
  //   uploadId: 'uuid',
  //   error: 'Quota exceeded',
  //   code: 'QUOTA_EXCEEDED'   // Optional error code
  // }
});
```

---

#### `transcoding:progress`

Emitted during video transcoding.

```typescript
socket.on('transcoding:progress', (data) => {
  console.log(data);
  // {
  //   fileId: 'uuid',
  //   progress: 65,           // Percentage (0-100)
  //   status: 'PROCESSING'    // PENDING, PROCESSING, COMPLETED, FAILED
  // }
});
```

---

#### `transcoding:complete`

Emitted when transcoding finishes.

```typescript
socket.on('transcoding:complete', (data) => {
  console.log(data);
  // {
  //   fileId: 'uuid',
  //   transcodedPath: '/path/to/transcoded.mp4'
  // }
});
```

---

#### `quota:updated`

Emitted when user's storage quota changes (after upload/delete).

```typescript
socket.on('quota:updated', (data) => {
  console.log(data);
  // {
  //   storageUsed: 2147483648,   // Bytes used
  //   storageQuota: 5368709120   // Total quota in bytes
  // }
});
```

---

### Client → Server Events

#### `subscribe:upload`

Subscribe to upload progress for a specific upload.

```typescript
socket.emit('subscribe:upload', uploadId);
```

---

#### `unsubscribe:upload`

Unsubscribe from upload progress.

```typescript
socket.emit('unsubscribe:upload', uploadId);
```

---

#### `subscribe:transcoding`

Subscribe to transcoding progress for a specific file.

```typescript
socket.emit('subscribe:transcoding', fileId);
```

---

#### `unsubscribe:transcoding`

Unsubscribe from transcoding progress.

```typescript
socket.emit('unsubscribe:transcoding', fileId);
```

---

## Usage Examples

### Complete Upload Flow

```typescript
import { io } from 'socket.io-client';

const socket = io(API_URL, { auth: { token } });

// Start upload
const uploadId = await api.initUpload(file);

// Subscribe to progress
socket.emit('subscribe:upload', uploadId);

socket.on('upload:progress', ({ progress, speed }) => {
  updateProgressBar(progress);
  updateSpeedDisplay(speed);
});

socket.on('upload:complete', ({ file }) => {
  socket.emit('unsubscribe:upload', uploadId);
  showSuccess(`${file.name} uploaded!`);
});

socket.on('upload:error', ({ error }) => {
  socket.emit('unsubscribe:upload', uploadId);
  showError(error);
});

// Upload chunks...
await uploadChunks(file, uploadId);
```

---

### Transcoding Progress

```typescript
// After video upload
socket.emit('subscribe:transcoding', fileId);

socket.on('transcoding:progress', ({ progress, status }) => {
  if (status === 'PROCESSING') {
    showTranscodingProgress(progress);
  }
});

socket.on('transcoding:complete', () => {
  socket.emit('unsubscribe:transcoding', fileId);
  showSuccess('Video ready to stream!');
});
```

---

### Real-time Quota Display

```typescript
// Automatically receive quota updates
socket.on('quota:updated', ({ storageUsed, storageQuota }) => {
  const percentUsed = (storageUsed / storageQuota) * 100;
  updateQuotaDisplay(storageUsed, storageQuota, percentUsed);
});
```

---

## React Hook Example

```typescript
import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../stores/authStore';

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const { token } = useAuthStore();

  useEffect(() => {
    if (!token) return;

    socketRef.current = io(import.meta.env.VITE_API_URL, {
      auth: { token },
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, [token]);

  return socketRef.current;
}

// Usage in component
function UploadProgress({ uploadId }) {
  const socket = useSocket();
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!socket || !uploadId) return;

    socket.emit('subscribe:upload', uploadId);
    socket.on('upload:progress', (data) => setProgress(data.progress));

    return () => {
      socket.emit('unsubscribe:upload', uploadId);
      socket.off('upload:progress');
    };
  }, [socket, uploadId]);

  return <ProgressBar value={progress} />;
}
```

---

## Server Configuration

Socket.IO is configured in `backend/src/lib/socket.ts`:

```typescript
const io = new Server(httpServer, {
  cors: {
    origin: config.frontendUrl,
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
});
```

---

## Debugging

Enable Socket.IO debug logs:

```javascript
// Browser console
localStorage.setItem('debug', 'socket.io-client:*');

// Then refresh the page
```

Server-side logs show connection/disconnection events automatically in debug mode.

---

## TypeScript Types

```typescript
// Server to Client events
interface ServerToClientEvents {
  'upload:progress': (data: {
    uploadId: string;
    progress: number;
    uploadedChunks: number;
    totalChunks: number;
    speed: number;
  }) => void;
  'upload:complete': (data: {
    uploadId: string;
    file: FileData;
  }) => void;
  'upload:error': (data: {
    uploadId: string;
    error: string;
    code?: string;
  }) => void;
  'transcoding:progress': (data: {
    fileId: string;
    progress: number;
    status: string;
  }) => void;
  'transcoding:complete': (data: {
    fileId: string;
    transcodedPath: string;
  }) => void;
  'quota:updated': (data: {
    storageUsed: number;
    storageQuota: number;
  }) => void;
}

// Client to Server events
interface ClientToServerEvents {
  'subscribe:upload': (uploadId: string) => void;
  'unsubscribe:upload': (uploadId: string) => void;
  'subscribe:transcoding': (fileId: string) => void;
  'unsubscribe:transcoding': (fileId: string) => void;
}
```

---

## Connection States

| State | Description |
|-------|-------------|
| `connecting` | Attempting to connect |
| `connected` | Successfully connected |
| `disconnected` | Connection lost |
| `reconnecting` | Attempting to reconnect |

Socket.IO automatically reconnects on connection loss.
