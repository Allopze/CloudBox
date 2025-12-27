/**
 * Socket.io client for real-time upload progress
 */

import { io, Socket } from 'socket.io-client';
import { API_URL } from './api';
import { getAccessToken } from './tokenManager';

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

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

class SocketManager {
  private socket: TypedSocket | null = null;
  private connecting = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private listeners = new Map<string, Set<(...args: any[]) => void>>();

  /**
   * Connect to the WebSocket server
   */
  connect(): TypedSocket {
    if (this.socket?.connected) {
      return this.socket;
    }

    if (this.connecting) {
      return this.socket!;
    }

    this.connecting = true;

    // Get auth token
    const token = getAccessToken();

    // Connect to WebSocket server
    const wsUrl = API_URL.replace('/api', '').replace('http', 'ws');
    
    this.socket = io(wsUrl, {
      auth: token ? { token } : {},
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    }) as TypedSocket;

    this.socket.on('connect', () => {
      console.log('[Socket] Connected');
      this.connecting = false;
      this.reconnectAttempts = 0;
    });

    this.socket.on('disconnect', (reason: string) => {
      console.log('[Socket] Disconnected:', reason);
    });

    this.socket.on('connect_error', (error: Error) => {
      console.error('[Socket] Connection error:', error.message);
      this.connecting = false;
      this.reconnectAttempts++;
    });

    return this.socket;
  }

  /**
   * Disconnect from the WebSocket server
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.listeners.clear();
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  /**
   * Get the socket instance
   */
  getSocket(): TypedSocket | null {
    return this.socket;
  }

  /**
   * Subscribe to upload progress
   */
  subscribeUpload(uploadId: string): void {
    const socket = this.connect();
    socket.emit('subscribe:upload', uploadId);
  }

  /**
   * Unsubscribe from upload progress
   */
  unsubscribeUpload(uploadId: string): void {
    if (this.socket?.connected) {
      this.socket.emit('unsubscribe:upload', uploadId);
    }
  }

  /**
   * Subscribe to transcoding progress
   */
  subscribeTranscoding(fileId: string): void {
    const socket = this.connect();
    socket.emit('subscribe:transcoding', fileId);
  }

  /**
   * Unsubscribe from transcoding progress
   */
  unsubscribeTranscoding(fileId: string): void {
    if (this.socket?.connected) {
      this.socket.emit('unsubscribe:transcoding', fileId);
    }
  }

  /**
   * Add event listener
   */
  on<K extends keyof ServerToClientEvents>(
    event: K,
    callback: ServerToClientEvents[K]
  ): void {
    const socket = this.connect();
    socket.on(event, callback as any);

    // Track listeners for cleanup
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  /**
   * Remove event listener
   */
  off<K extends keyof ServerToClientEvents>(
    event: K,
    callback: ServerToClientEvents[K]
  ): void {
    if (this.socket) {
      this.socket.off(event, callback as any);
    }

    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.delete(callback);
    }
  }

  /**
   * Listen once
   */
  once<K extends keyof ServerToClientEvents>(
    event: K,
    callback: ServerToClientEvents[K]
  ): void {
    const socket = this.connect();
    socket.once(event, callback as any);
  }
}

// Singleton instance
export const socketManager = new SocketManager();

// React hook for socket connection
export function useSocket() {
  return {
    connect: () => socketManager.connect(),
    disconnect: () => socketManager.disconnect(),
    isConnected: () => socketManager.isConnected(),
    subscribeUpload: (uploadId: string) => socketManager.subscribeUpload(uploadId),
    unsubscribeUpload: (uploadId: string) => socketManager.unsubscribeUpload(uploadId),
    subscribeTranscoding: (fileId: string) => socketManager.subscribeTranscoding(fileId),
    unsubscribeTranscoding: (fileId: string) => socketManager.unsubscribeTranscoding(fileId),
    on: <K extends keyof ServerToClientEvents>(event: K, callback: ServerToClientEvents[K]) =>
      socketManager.on(event, callback),
    off: <K extends keyof ServerToClientEvents>(event: K, callback: ServerToClientEvents[K]) =>
      socketManager.off(event, callback),
  };
}
