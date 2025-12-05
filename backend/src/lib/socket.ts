/**
 * Socket.io server for real-time events
 * 
 * Provides real-time updates for:
 * - Upload progress
 * - Transcoding progress
 * - Quota updates
 */

import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import logger from './logger.js';

// Events emitted by server
export interface ServerToClientEvents {
  'upload:progress': (data: {
    uploadId: string;
    progress: number;
    uploadedChunks: number;
    totalChunks: number;
    speed: number;
  }) => void;
  'upload:complete': (data: {
    uploadId: string;
    file: any;
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

// Events emitted by client
export interface ClientToServerEvents {
  'subscribe:upload': (uploadId: string) => void;
  'unsubscribe:upload': (uploadId: string) => void;
  'subscribe:transcoding': (fileId: string) => void;
  'unsubscribe:transcoding': (fileId: string) => void;
}

interface SocketData {
  userId: string;
}

type TypedServer = Server<ClientToServerEvents, ServerToClientEvents, {}, SocketData>;
type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents, {}, SocketData>;

let io: TypedServer | null = null;

// Track user connections for targeted messages
const userSockets = new Map<string, Set<string>>(); // userId -> Set of socket IDs

/**
 * Initialize Socket.io server
 */
export function initSocketIO(httpServer: HttpServer): TypedServer {
  io = new Server(httpServer, {
    cors: {
      origin: (origin: string | undefined, callback: (err: Error | null, allowed?: boolean) => void) => {
        if (!origin) return callback(null, true);
        
        if (config.nodeEnv === 'development' && origin.startsWith('http://localhost:')) {
          return callback(null, true);
        }
        
        if (origin === config.frontendUrl) {
          return callback(null, true);
        }
        
        callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Authentication middleware
  io.use((socket: TypedSocket, next: (err?: Error) => void) => {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const decoded = jwt.verify(token, config.jwt.secret) as { userId: string };
      socket.data.userId = decoded.userId;
      next();
    } catch (error) {
      logger.warn('Socket auth failed', { error: error instanceof Error ? error.message : 'Unknown' });
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: TypedSocket) => {
    const userId = socket.data.userId;
    logger.info('Socket connected', { socketId: socket.id, userId });

    // Track user's sockets
    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }
    userSockets.get(userId)!.add(socket.id);

    // Handle upload subscription
    socket.on('subscribe:upload', (uploadId: string) => {
      const room = `upload:${uploadId}`;
      socket.join(room);
      logger.debug('Subscribed to upload', { socketId: socket.id, uploadId });
    });

    socket.on('unsubscribe:upload', (uploadId: string) => {
      const room = `upload:${uploadId}`;
      socket.leave(room);
      logger.debug('Unsubscribed from upload', { socketId: socket.id, uploadId });
    });

    // Handle transcoding subscription
    socket.on('subscribe:transcoding', (fileId: string) => {
      const room = `transcoding:${fileId}`;
      socket.join(room);
      logger.debug('Subscribed to transcoding', { socketId: socket.id, fileId });
    });

    socket.on('unsubscribe:transcoding', (fileId: string) => {
      const room = `transcoding:${fileId}`;
      socket.leave(room);
      logger.debug('Unsubscribed from transcoding', { socketId: socket.id, fileId });
    });

    // Handle disconnect
    socket.on('disconnect', (reason: string) => {
      logger.info('Socket disconnected', { socketId: socket.id, userId, reason });
      
      const sockets = userSockets.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          userSockets.delete(userId);
        }
      }
    });
  });

  logger.info('Socket.io server initialized');
  return io;
}

/**
 * Get the Socket.io server instance
 */
export function getIO(): TypedServer | null {
  return io;
}

/**
 * Emit upload progress to subscribers
 */
export function emitUploadProgress(
  uploadId: string,
  data: {
    progress: number;
    uploadedChunks: number;
    totalChunks: number;
    speed: number;
  }
): void {
  if (!io) return;
  
  io.to(`upload:${uploadId}`).emit('upload:progress', {
    uploadId,
    ...data,
  });
}

/**
 * Emit upload complete to subscribers
 */
export function emitUploadComplete(uploadId: string, file: any): void {
  if (!io) return;
  
  io.to(`upload:${uploadId}`).emit('upload:complete', {
    uploadId,
    file,
  });
}

/**
 * Emit upload error to subscribers
 */
export function emitUploadError(uploadId: string, error: string, code?: string): void {
  if (!io) return;
  
  io.to(`upload:${uploadId}`).emit('upload:error', {
    uploadId,
    error,
    code,
  });
}

/**
 * Emit transcoding progress to subscribers
 */
export function emitTranscodingProgress(
  fileId: string,
  progress: number,
  status: string
): void {
  if (!io) return;
  
  io.to(`transcoding:${fileId}`).emit('transcoding:progress', {
    fileId,
    progress,
    status,
  });
}

/**
 * Emit transcoding complete to subscribers
 */
export function emitTranscodingComplete(fileId: string, transcodedPath: string): void {
  if (!io) return;
  
  io.to(`transcoding:${fileId}`).emit('transcoding:complete', {
    fileId,
    transcodedPath,
  });
}

/**
 * Emit quota update to a specific user
 */
export function emitQuotaUpdate(
  userId: string,
  storageUsed: number,
  storageQuota: number
): void {
  if (!io) return;
  
  const sockets = userSockets.get(userId);
  if (sockets) {
    for (const socketId of sockets) {
      io.to(socketId).emit('quota:updated', {
        storageUsed,
        storageQuota,
      });
    }
  }
}

/**
 * Get connected user count
 */
export function getConnectedUserCount(): number {
  return userSockets.size;
}

/**
 * Get total connection count
 */
export function getTotalConnectionCount(): number {
  let count = 0;
  for (const sockets of userSockets.values()) {
    count += sockets.size;
  }
  return count;
}
