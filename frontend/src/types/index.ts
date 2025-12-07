export interface User {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'USER';
  avatar: string | null;
  emailVerified: boolean;
  storageQuota: string;
  storageUsed: string;
  maxFileSize?: string;
  createdAt: string;
}

export interface FileItem {
  id: string;
  name: string;
  originalName: string;
  mimeType: string;
  size: string;
  path: string;
  thumbnailPath: string | null;
  folderId: string | null;
  userId: string;
  isFavorite: boolean;
  isTrash: boolean;
  trashedAt: string | null;
  metadata: string | null;
  createdAt: string;
  updatedAt: string;
}

// Alias for FileItem
export type File = FileItem;

export interface Folder {
  id: string;
  name: string;
  color: string | null;
  category: string | null;
  parentId: string | null;
  userId: string;
  isFavorite: boolean;
  isTrash: boolean;
  trashedAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { files: number };
}

export interface Share {
  id: string;
  type: 'PRIVATE' | 'PUBLIC';
  permission: 'VIEWER' | 'EDITOR' | null;
  fileId: string | null;
  folderId: string | null;
  ownerId: string;
  publicToken: string | null;
  password: string | null;
  expiresAt: string | null;
  downloadLimit: number | null;
  downloadCount: number;
  createdAt: string;
  updatedAt: string;
  file?: FileItem | null;
  folder?: Folder | null;
  owner?: User;
  collaborators?: ShareCollaborator[];
  publicUrl?: string | null;
}

export interface ShareCollaborator {
  id: string;
  shareId: string;
  userId: string;
  permission: 'VIEWER' | 'EDITOR';
  user?: User;
  createdAt: string;
}

export interface Album {
  id: string;
  name: string;
  color: string | null;
  userId: string;
  coverPath: string | null;
  coverUrl: string | null;
  createdAt: string;
  updatedAt: string;
  files?: FileItem[];
  _count?: { files: number };
}

export interface Activity {
  id: string;
  type: ActivityType;
  userId: string;
  fileId: string | null;
  folderId: string | null;
  details: string | null;
  createdAt: string;
}

export type ActivityType =
  | 'UPLOAD'
  | 'DOWNLOAD'
  | 'DELETE'
  | 'RESTORE'
  | 'SHARE'
  | 'UNSHARE'
  | 'MOVE'
  | 'RENAME'
  | 'CREATE_FOLDER'
  | 'COMPRESS'
  | 'DECOMPRESS';

export interface CompressionJob {
  id: string;
  type: 'COMPRESS' | 'DECOMPRESS';
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  progress: number;
  inputPaths: string;
  outputPath: string | null;
  format: string;
  userId: string;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface DashboardStats {
  storage: {
    quota: string;
    used: string;
    percentage: number;
  };
  counts: {
    files: number;
    folders: number;
  };
  categories: {
    images: { count: number; size: string };
    videos: { count: number; size: string };
    audio: { count: number; size: string };
    documents: { count: number; size: string };
    other: { count: number; size: string };
  };
  recentActivity: Activity[];
  mostAccessed: (FileItem & { accessCount: number })[];
}

export interface Breadcrumb {
  id: string;
  name: string;
}

export interface UploadProgress {
  id: string;
  name: string;
  filename: string;
  size: number;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  error?: string;
}
