import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  Image,
  Video,
  Music,
  FileText,
  FileSpreadsheet,
  FileArchive,
  File,
  type LucideIcon,
} from 'lucide-react';

const MIDI_MIME_TYPES = new Set([
  'audio/midi',
  'audio/mid',
  'audio/x-midi',
  'audio/x-mid',
  'application/midi',
  'application/x-midi',
  'audio/sp-midi',
  'audio/smf',
]);

const isMidiMime = (mimeType: string): boolean => {
  return MIDI_MIME_TYPES.has(mimeType.toLowerCase());
};

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDuration(seconds: number): string {
  if (isNaN(seconds) || !isFinite(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatBytes(bytes: number | string, decimals = 2): string {
  const b = typeof bytes === 'string' ? parseInt(bytes) : bytes;
  if (b === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];

  const i = Math.floor(Math.log(b) / Math.log(k));

  return parseFloat((b / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export function formatDate(date: string | Date, locale?: string): string {
  const d = new Date(date);
  const userLocale = locale || navigator.language || 'en-US';
  return d.toLocaleDateString(userLocale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(date: string | Date, locale?: string): string {
  const d = new Date(date);
  const userLocale = locale || navigator.language || 'en-US';
  return d.toLocaleString(userLocale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getFileIcon(mimeType: string): LucideIcon {
  if (mimeType.startsWith('image/')) return Image;
  if (mimeType.startsWith('video/')) return Video;
  if (mimeType.startsWith('audio/') || isMidiMime(mimeType)) return Music;
  if (mimeType.includes('pdf')) return FileText;
  if (mimeType.includes('word') || mimeType.includes('document')) return FileText;
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return FileSpreadsheet;
  if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('7z')) return FileArchive;
  if (mimeType.includes('text')) return FileText;
  return File;
}

export function getFileColor(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'text-green-500';
  if (mimeType.startsWith('video/')) return 'text-purple-500';
  if (mimeType.startsWith('audio/') || isMidiMime(mimeType)) return 'text-pink-500';
  if (mimeType.includes('pdf')) return 'text-red-500';
  if (mimeType.includes('word') || mimeType.includes('document')) return 'text-blue-500';
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'text-emerald-500';
  if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('7z')) return 'text-amber-500';
  return 'text-dark-500';
}

export function isPreviewable(mimeType: string): boolean {
  return (
    mimeType.startsWith('image/') ||
    mimeType.startsWith('video/') ||
    mimeType.startsWith('audio/') ||
    isMidiMime(mimeType) ||
    mimeType === 'application/pdf' ||
    isDocument(mimeType)
  );
}

export function isImage(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

export function isVideo(mimeType: string): boolean {
  return mimeType.startsWith('video/');
}

export function isAudio(mimeType: string): boolean {
  return mimeType.startsWith('audio/') || isMidiMime(mimeType);
}

export function isDocument(mimeType: string): boolean {
  const documentTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.oasis.opendocument.text',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-powerpoint',
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/rtf',
  ];
  return documentTypes.includes(mimeType) || mimeType.startsWith('text/');
}

export function isSpreadsheet(mimeType: string): boolean {
  return (
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimeType === 'application/vnd.ms-excel' ||
    mimeType === 'text/csv'
  );
}

export function getExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
}

export function truncateFileName(name: string, maxLength = 30): string {
  if (name.length <= maxLength) return name;
  const ext = getExtension(name);
  const baseName = name.slice(0, name.length - ext.length - 1);
  const truncatedBase = baseName.slice(0, maxLength - ext.length - 4) + '...';
  return ext ? `${truncatedBase}.${ext}` : truncatedBase;
}

export function generateUploadId(): string {
  return `upload_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}
