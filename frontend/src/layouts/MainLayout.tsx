import { useState, useCallback, useEffect, useRef } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { Outlet, useLocation, useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import UploadProgress from '../components/UploadProgress';
import UploadModal from '../components/modals/UploadModal';
import CreateFolderModal from '../components/modals/CreateFolderModal';
import CreateFileModal from '../components/modals/CreateFileModal';
import VerificationLockModal from '../components/modals/VerificationLockModal';
import DndContextProvider from '../components/dnd/DndContextProvider';
import Breadcrumbs from '../components/files/Breadcrumbs';
import { useUIStore } from '../stores/uiStore';
import { useFileStore } from '../stores/fileStore';
import { useDragDropStore } from '../stores/dragDropStore';
import { useUploadStore } from '../stores/uploadStore';
import { useBrandingStore } from '../stores/brandingStore';
import { useGlobalProgressStore } from '../stores/globalProgressStore';
import { useAuthStore } from '../stores/authStore';
import { cn, formatBytes } from '../lib/utils';
import { uploadFile, UPLOAD_CONFIG, UPLOAD_ERROR_CODES, ensureConfigLoaded } from '../lib/chunkedUpload';
import { PanelLeftClose, PanelLeft, Grid, List, SortAsc, SortDesc, Check, Link as LinkIcon, Users, Image, Star, Video, Camera, FolderOpen, Settings, ShieldCheck, Upload, FolderPlus, Trash2, Music, Disc, Plus, ArrowLeft, FilePlus, FolderUp, CheckSquare, RefreshCw, FileSpreadsheet, Presentation, FileCode, Files, File, AlignLeft } from 'lucide-react';
import { Album } from '../types';
import Dropdown, { DropdownItem, DropdownDivider } from '../components/ui/Dropdown';
import ContextMenu, { type ContextMenuItemOrDivider } from '../components/ui/ContextMenu';
import SkipLink from '../components/ui/SkipLink';
import { api } from '../lib/api';
import { toast } from '../components/ui/Toast';

const sortOptions = [
  { value: 'name', labelKey: 'layout.sortName' },
  { value: 'createdAt', labelKey: 'layout.sortCreatedAt' },
  { value: 'updatedAt', labelKey: 'layout.sortUpdatedAt' },
  { value: 'size', labelKey: 'layout.sortSize' },
];

// Pages that show view/sort controls
const pagesWithViewControls = ['/files', '/documents', '/trash', '/favorites'];

// Pages that show breadcrumbs
const pagesWithBreadcrumbs = ['/files'];

// Helper to read all files from a directory entry recursively
const readDirectoryEntries = async (
  dirEntry: FileSystemDirectoryEntry,
  basePath: string
): Promise<{ file: File; relativePath: string }[]> => {
  const results: { file: File; relativePath: string }[] = [];
  const reader = dirEntry.createReader();

  const readEntries = (): Promise<FileSystemEntry[]> => {
    return new Promise((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
  };

  // Read all entries (readEntries may not return all at once)
  let entries: FileSystemEntry[] = [];
  let batch: FileSystemEntry[];
  do {
    batch = await readEntries();
    entries = entries.concat(batch);
  } while (batch.length > 0);

  for (const entry of entries) {
    if (entry.isFile) {
      const fileEntry = entry as FileSystemFileEntry;
      const file = await new Promise<File>((resolve, reject) => {
        fileEntry.file(resolve, reject);
      });
      results.push({ file, relativePath: `${basePath}/${entry.name}` });
    } else if (entry.isDirectory) {
      const subResults = await readDirectoryEntries(
        entry as FileSystemDirectoryEntry,
        `${basePath}/${entry.name}`
      );
      results.push(...subResults);
    }
  }
  return results;
};

export default function MainLayout() {
  // Marquee selection handlers (defined early so effects can reference them safely)
  const handleMarqueeMouseDown = useRef<(e: { button?: number; clientX: number; clientY: number; target?: EventTarget | null }) => void>();
  const handleMarqueeMouseMove = useRef<(e: { clientX: number; clientY: number }) => void>();
  const handleMarqueeMouseUp = useRef<() => void>();
  const onMarqueeMouseDown = useCallback((e: AnyMouseEvent) => {
    handleMarqueeMouseDown.current?.(e);
  }, []);
  const onMarqueeMouseMove = useCallback((e: AnyMouseEvent) => {
    handleMarqueeMouseMove.current?.(e);
  }, []);
  const onMarqueeMouseUp = useCallback(() => {
    handleMarqueeMouseUp.current?.();
  }, []);

  const { t } = useTranslation();
  const { sidebarOpen, toggleSidebar } = useUIStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const viewMode = useFileStore((state) => state.viewMode);
  const setViewMode = useFileStore((state) => state.setViewMode);
  const sortBy = useFileStore((state) => state.sortBy);
  const sortOrder = useFileStore((state) => state.sortOrder);
  const setSortBy = useFileStore((state) => state.setSortBy);
  const setSortOrder = useFileStore((state) => state.setSortOrder);
  const breadcrumbs = useFileStore((state) => state.breadcrumbs);
  const selectAll = useFileStore((state) => state.selectAll);
  const clearSelection = useFileStore((state) => state.clearSelection);
  const { isDragging: isInternalDragging } = useDragDropStore();
  const { setGlobalProgress, resetGlobalProgress } = useUploadStore();
  const { branding } = useBrandingStore();
  const { addOperation, incrementProgress, completeOperation, failOperation } = useGlobalProgressStore();
  const { refreshUser, user } = useAuthStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { albumId } = useParams<{ albumId: string }>();

  const getEffectiveMaxFileSize = useCallback(() => {
    const globalMax = UPLOAD_CONFIG.MAX_FILE_SIZE;
    const userMax = Number(user?.maxFileSize || 0);
    if (!Number.isFinite(userMax) || userMax <= 0) {
      return globalMax;
    }
    return Math.min(userMax, globalMax);
  }, [user]);

  const getUploadErrorMessage = useCallback(
    (errorCode?: string, fallback?: string) => {
      if (errorCode === UPLOAD_ERROR_CODES.FILE_TOO_LARGE) {
        const maxFileSize = getEffectiveMaxFileSize();
        if (Number.isFinite(maxFileSize) && maxFileSize > 0) {
          return t('modals.upload.errors.fileTooLarge', { size: formatBytes(maxFileSize) });
        }
        return t('modals.upload.errors.fileTooLarge', { size: '0 B' });
      }

      return fallback;
    },
    [getEffectiveMaxFileSize, t]
  );

  // When using a shared scroll container for multiple pages, preserve-scroll can
  // make some pages appear "blank" if the previous page was scrolled past the
  // new page's content. Reset scroll on route changes.
  useEffect(() => {
    workzoneRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location.pathname]);

  // Page detection
  const isAdminPage = location.pathname.startsWith('/admin');
  const isFilesPage = location.pathname === '/files';
  const isDocumentsPage = location.pathname === '/documents';
  const isPhotosPage = location.pathname === '/photos';
  const isMusicPage = location.pathname === '/music';
  const isSharedPage = location.pathname === '/shared';
  const isAlbumsPage = location.pathname.startsWith('/albums');
  const isSettingsPage = location.pathname === '/settings';
  const isTrashPage = location.pathname === '/trash';
  const isFavoritesPage = location.pathname === '/favorites';
  const isAlbumDetailPage = !!albumId && location.pathname.startsWith('/albums/');
  const isGalleryPage = isPhotosPage || isAlbumsPage;

  const showViewControls = pagesWithViewControls.includes(location.pathname);
  const showBreadcrumbs = pagesWithBreadcrumbs.some(p => location.pathname.startsWith(p));

  const currentSort = sortOptions.find((s) => s.value === sortBy);
  const currentSortLabel = currentSort ? t(currentSort.labelKey) : t('layout.sort');

  const sharedTab = searchParams.get('tab') || 'my-shares';
  const photosTab = searchParams.get('tab') || 'all';
  const musicTab = searchParams.get('tab') || 'all';
  const documentsTab = searchParams.get('tab') || 'all';

  // Get current folder ID from search params
  const currentFolderId = searchParams.get('folder');

  // Album detail state
  const [currentAlbum, setCurrentAlbum] = useState<Album | null>(null);
  const [albumPhotoCount, setAlbumPhotoCount] = useState(0);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [isUploadModalOpen, setUploadModalOpen] = useState(false);
  const [isCreateFolderModalOpen, setCreateFolderModalOpen] = useState(false);
  const [isCreateFileModalOpen, setCreateFileModalOpen] = useState(false);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Drag and drop state
  const [isDragging, setIsDragging] = useState(false);
  const [, setDragCounter] = useState(0);

  // Marquee selection state
  const workzoneRef = useRef<HTMLDivElement>(null);
  const scrollIntervalRef = useRef<number | null>(null);
  const mousePositionRef = useRef({ x: 0, y: 0 });
  const [isMarqueeActive, setIsMarqueeActive] = useState(false);
  const [marqueeStart, setMarqueeStart] = useState({ x: 0, y: 0 });
  const marqueeBoxRef = useRef<HTMLDivElement>(null);

  // Get accent color with fallback
  const accentColor = branding.primaryColor || '#dc2626';

  // Convert hex to rgba
  const hexToRgba = (hex: string, alpha: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  // Global drag and drop handlers (for external file uploads only)
  const handleDragEnter = useCallback((e: DragEvent) => {
    // Ignore internal drags (file/folder moves within the app)
    if (isInternalDragging) return;

    // Check if this is an external file drag (from OS)
    const hasFiles = e.dataTransfer?.types?.includes('Files');
    if (!hasFiles) return;

    e.preventDefault();
    e.stopPropagation();
    setDragCounter((prev) => prev + 1);
    if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, [isInternalDragging]);

  const handleDragLeave = useCallback((e: DragEvent) => {
    // Ignore internal drags
    if (isInternalDragging) return;

    e.preventDefault();
    e.stopPropagation();
    setDragCounter((prev) => {
      const newCount = prev - 1;
      if (newCount === 0) {
        setIsDragging(false);
      }
      return newCount;
    });
  }, [isInternalDragging]);

  const handleDragOver = useCallback((e: DragEvent) => {
    // Ignore internal drags
    if (isInternalDragging) return;

    // Check if this is an external file drag
    const hasFiles = e.dataTransfer?.types?.includes('Files');
    if (!hasFiles) return;

    e.preventDefault();
    e.stopPropagation();
  }, [isInternalDragging]);



  const handleDrop = useCallback(async (e: DragEvent) => {
    // Ignore internal drags (handled by individual components)
    if (isInternalDragging) return;

    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    setDragCounter(0);

    const items = e.dataTransfer?.items;
    if (!items || items.length === 0) return;

    // Check if this is an external file drag
    const hasFiles = e.dataTransfer?.types?.includes('Files');
    if (!hasFiles) return;

    // Get current folder ID from URL
    // Check path first: /files/:folderId
    const pathMatch = window.location.pathname.match(/^\/files\/([^/]+)\/?$/);
    const urlParams = new URLSearchParams(window.location.search);
    const folderId = pathMatch ? pathMatch[1] : urlParams.get('folder');

    const allFiles: { file: File; relativePath: string }[] = [];

    // IMPORTANT: Collect all entries SYNCHRONOUSLY before any async operations
    // DataTransferItemList and its items become invalid after the event handler returns
    // or after any async operation, so we must extract all FileSystemEntry objects first
    const entries: { entry: FileSystemEntry | null; file: File | null }[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind !== 'file') continue;

      const entry = item.webkitGetAsEntry?.();
      const file = item.getAsFile();
      entries.push({ entry, file });
    }

    // Now process entries asynchronously
    for (const { entry, file } of entries) {
      if (!entry) {
        // Fallback for browsers without webkitGetAsEntry
        if (file) {
          allFiles.push({ file, relativePath: file.name });
        }
        continue;
      }

      if (entry.isFile) {
        const fileEntry = entry as FileSystemFileEntry;
        const resolvedFile = await new Promise<File>((resolve, reject) => {
          fileEntry.file(resolve, reject);
        });
        allFiles.push({ file: resolvedFile, relativePath: resolvedFile.name });
      } else if (entry.isDirectory) {
        const dirFiles = await readDirectoryEntries(
          entry as FileSystemDirectoryEntry,
          entry.name
        );
        allFiles.push(...dirFiles);
      }
    }

    if (allFiles.length === 0) return;

    await ensureConfigLoaded();

    // Calculate total size for progress tracking
    const totalSize = allFiles.reduce((sum, { file }) => sum + file.size, 0);
    let lastSpeedUpdate = Date.now();
    let lastUploadedTotal = 0;
    let currentSpeed = 0;

    // Show initial progress
    setGlobalProgress(0, totalSize, 0);

    // Upload files in batches with limited concurrency to reduce per-request overhead
    let successCount = 0;
    let errorCount = 0;
    let lastErrorMessage: string | null = null;
    let lastErrorCode: string | null = null;

    const DIRECT_UPLOAD_LIMIT = 50 * 1024 * 1024;
    const MAX_FILES_PER_BATCH = 20;
    const MAX_PARALLEL_UPLOADS = Math.max(1, Math.min(UPLOAD_CONFIG.MAX_CONCURRENT_FILES, 6));

    let completedBytes = 0;
    const inFlightBytes = new Map<string, number>();

    const updateProgress = () => {
      let inFlightTotal = 0;
      for (const bytes of inFlightBytes.values()) {
        inFlightTotal += bytes;
      }

      const uploadedSoFar = Math.min(completedBytes + inFlightTotal, totalSize);
      const now = Date.now();
      const timeDiff = (now - lastSpeedUpdate) / 1000;

      if (timeDiff > 0.1) {
        currentSpeed = (uploadedSoFar - lastUploadedTotal) / timeDiff;
        lastSpeedUpdate = now;
        lastUploadedTotal = uploadedSoFar;
      }

      setGlobalProgress(uploadedSoFar, totalSize, currentSpeed);
    };

    const updateInFlight = (id: string, loaded: number) => {
      inFlightBytes.set(id, loaded);
      updateProgress();
    };

    const finishJob = (id: string, size: number) => {
      inFlightBytes.delete(id);
      completedBytes += size;
      updateProgress();
    };

    const directItems = allFiles.filter(({ file }) => file.size <= DIRECT_UPLOAD_LIMIT);
    const chunkedItems = allFiles.filter(({ file }) => file.size > DIRECT_UPLOAD_LIMIT);

    const batches: { file: File; relativePath: string }[][] = [];
    for (let i = 0; i < directItems.length; i += MAX_FILES_PER_BATCH) {
      batches.push(directItems.slice(i, i + MAX_FILES_PER_BATCH));
    }

    type UploadJob =
      | { id: string; type: 'batch'; items: { file: File; relativePath: string }[]; size: number }
      | { id: string; type: 'chunked'; item: { file: File; relativePath: string }; size: number };

    const jobs: UploadJob[] = [
      ...batches.map((items, index) => ({
        id: `batch-${index}-${Date.now()}`,
        type: 'batch' as const,
        items,
        size: items.reduce((sum, item) => sum + item.file.size, 0),
      })),
      ...chunkedItems.map((item, index) => ({
        id: `chunked-${index}-${Date.now()}`,
        type: 'chunked' as const,
        item,
        size: item.file.size,
      })),
    ];

    const runJob = async (job: UploadJob) => {
      if (job.type === 'batch') {
        const formData = new FormData();
        for (const { file, relativePath } of job.items) {
          formData.append('files', file);
          formData.append('paths', relativePath);
        }
        if (folderId) {
          formData.append('folderId', folderId);
        }

        updateInFlight(job.id, 0);
        try {
          await api.post('/files/upload-with-folders', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            onUploadProgress: (progressEvent) => {
              const loaded = Math.min(progressEvent.loaded || 0, job.size);
              updateInFlight(job.id, loaded);
            },
          });
          successCount += job.items.length;
        } catch (error: unknown) {
          errorCount += job.items.length;
          const errorResponse = error as { response?: { data?: { error?: string; code?: string } } };
          if (errorResponse.response?.data?.error) {
            lastErrorMessage = errorResponse.response.data.error;
          }
          if (errorResponse.response?.data?.code) {
            lastErrorCode = errorResponse.response.data.code;
          } else if (error instanceof Error && error.message) {
            lastErrorMessage = error.message;
          }
        } finally {
          finishJob(job.id, job.size);
        }
        return;
      }

      updateInFlight(job.id, 0);
      try {
        const result = await uploadFile(
          job.item.file,
          folderId,
          (progress) => {
            updateInFlight(job.id, Math.min(progress.uploadedSize, job.size));
          },
          { relativePath: job.item.relativePath }
        );
        if (result.success) {
          successCount += 1;
        } else {
          errorCount += 1;
          if (result.error) {
            lastErrorMessage = result.error;
          }
          if (result.errorCode) {
            lastErrorCode = result.errorCode;
          }
        }
      } catch (error: unknown) {
        errorCount += 1;
        const errorResponse = error as { response?: { data?: { error?: string; code?: string } } };
        if (errorResponse.response?.data?.error) {
          lastErrorMessage = errorResponse.response.data.error;
        }
        if (errorResponse.response?.data?.code) {
          lastErrorCode = errorResponse.response.data.code;
        } else if (error instanceof Error && error.message) {
          lastErrorMessage = error.message;
        }
      } finally {
        finishJob(job.id, job.size);
      }
    };

    const pendingJobs = [...jobs];
    const executing: Promise<void>[] = [];

    const startJob = (job: UploadJob) => {
      const promise = runJob(job)
        .catch(() => { })
        .finally(() => {
          const index = executing.indexOf(promise);
          if (index >= 0) {
            executing.splice(index, 1);
          }
        });
      executing.push(promise);
    };

    while (pendingJobs.length > 0 || executing.length > 0) {
      while (executing.length < MAX_PARALLEL_UPLOADS && pendingJobs.length > 0) {
        startJob(pendingJobs.shift()!);
      }

      if (executing.length > 0) {
        await Promise.race(executing);
      }
    }

    resetGlobalProgress();

    const resolvedErrorMessage = getUploadErrorMessage(lastErrorCode || undefined, lastErrorMessage || undefined);

    if (errorCount === 0) {
      toast(t('files.uploadSuccess', { count: successCount }), 'success');
    } else if (successCount > 0) {
      const message = resolvedErrorMessage
        ? `${t('files.uploadPartialSuccess', { success: successCount, failed: errorCount })} - ${resolvedErrorMessage}`
        : t('files.uploadPartialSuccess', { success: successCount, failed: errorCount });
      toast(message, 'warning');
    } else {
      toast(resolvedErrorMessage || t('files.uploadError'), 'error');
    }

    triggerRefresh();
    refreshUser(); // Update storage info in sidebar
  }, [setGlobalProgress, resetGlobalProgress, isInternalDragging, refreshUser, t, getUploadErrorMessage]);

  // Set up global drag/drop listeners and global marquee start
  useEffect(() => {
    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);
    window.addEventListener('mousedown', onMarqueeMouseDown as EventListener);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
      window.removeEventListener('mousedown', onMarqueeMouseDown as EventListener);
    };
  }, [handleDragEnter, handleDragLeave, handleDragOver, handleDrop, onMarqueeMouseDown]);

  // Global keyboard shortcuts for selection
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      const isMenuShortcut =
        e.key === 'Escape' ||
        e.key === 'Delete' ||
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a');

      if (isMenuShortcut && document.querySelector('[role="menu"]')) {
        e.preventDefault();
        return;
      }

      // Ctrl/Cmd + A: Select all
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        const allItems = Array.from(document.querySelectorAll('[data-file-item], [data-folder-item]'));
        const ids = allItems.map(el => el.getAttribute('data-file-item') || el.getAttribute('data-folder-item')).filter(Boolean) as string[];
        if (ids.length > 0) {
          selectAll(ids);
        }
      }

      // Escape: Clear selection
      if (e.key === 'Escape') {
        clearSelection();
      }

      // Delete: Move selected items to trash
      if (e.key === 'Delete') {
        const selectedItems = useFileStore.getState().selectedItems;
        if (selectedItems.size === 0) return;

        e.preventDefault();
        const itemIds = Array.from(selectedItems);
        const total = itemIds.length;

        const opId = addOperation({
          id: `delete-keyboard-${Date.now()}`,
          type: 'delete',
          title: t('files.deleting', { count: total }),
          totalItems: total,
        });

        try {
          // Delete files and folders sequentially to show progress
          for (const id of itemIds) {
            const fileEl = document.querySelector(`[data-file-item="${id}"]`);
            const folderEl = document.querySelector(`[data-folder-item="${id}"]`);
            const itemName = fileEl?.getAttribute('data-file-name') || folderEl?.getAttribute('data-folder-name') || id;

            if (fileEl) {
              await api.delete(`/files/${id}`);
            } else if (folderEl) {
              await api.delete(`/folders/${id}`);
            }
            incrementProgress(opId, itemName);
          }

          completeOperation(opId);
          clearSelection();
          // Note: No toast here - GlobalProgressIndicator already shows completion
          // Trigger a refresh by dispatching a custom event
          window.dispatchEvent(new CustomEvent('workzone-refresh'));
          refreshUser(); // Update storage info in sidebar
        } catch {
          failOperation(opId, t('files.deleteError'));
          toast(t('files.deleteError'), 'error');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectAll, clearSelection, addOperation, incrementProgress, completeOperation, failOperation, refreshUser, t]);

  // Cache for element positions (populated on marquee start for performance)
  const elementPositionsCacheRef = useRef<Array<{ id: string; x: number; y: number; right: number; bottom: number }>>([]);

  // Helper function to cache all element positions at marquee start
  const cacheElementPositions = useCallback(() => {
    if (!workzoneRef.current) return;
    const rect = workzoneRef.current.getBoundingClientRect();
    const items = workzoneRef.current.querySelectorAll("[data-file-item], [data-folder-item]");
    const positions: Array<{ id: string; x: number; y: number; right: number; bottom: number }> = [];

    items.forEach((item) => {
      const itemRect = item.getBoundingClientRect();
      const id = item.getAttribute("data-file-item") || item.getAttribute("data-folder-item");
      if (id) {
        positions.push({
          id,
          x: itemRect.left - rect.left + workzoneRef.current!.scrollLeft,
          y: itemRect.top - rect.top + workzoneRef.current!.scrollTop,
          right: itemRect.left - rect.left + workzoneRef.current!.scrollLeft + itemRect.width,
          bottom: itemRect.top - rect.top + workzoneRef.current!.scrollTop + itemRect.height,
        });
      }
    });

    elementPositionsCacheRef.current = positions;
  }, []);

  // Helper function to update selection based on marquee bounds
  // Track previous selection to avoid unnecessary re-renders
  const previousMarqueeSelectionRef = useRef<string[]>([]);

  const updateMarqueeSelection = useCallback((startX: number, startY: number, endX: number, endY: number) => {
    const minX = Math.min(startX, endX);
    const maxX = Math.max(startX, endX);
    const minY = Math.min(startY, endY);
    const maxY = Math.max(startY, endY);

    const marqueeWidth = maxX - minX;
    const marqueeHeight = maxY - minY;
    if (marqueeWidth < 5 || marqueeHeight < 5) return;

    // Use cached positions for fast collision detection (no DOM queries)
    const selectedIds: string[] = [];
    for (const item of elementPositionsCacheRef.current) {
      if (item.x < maxX && item.right > minX && item.y < maxY && item.bottom > minY) {
        selectedIds.push(item.id);
      }
    }

    // Only update if selection actually changed (reduces re-renders significantly)
    const prev = previousMarqueeSelectionRef.current;
    if (selectedIds.length !== prev.length || !selectedIds.every((id, i) => id === prev[i])) {
      previousMarqueeSelectionRef.current = selectedIds;
      selectAll(selectedIds);
    }
  }, [selectAll]);

  // Marquee selection handlers
  handleMarqueeMouseDown.current = useCallback((e: { button?: number; clientX: number; clientY: number; target?: EventTarget | null }) => {
    // Don't start marquee if internal drag is active or on admin page
    if (isInternalDragging || isAdminPage) return;

    // Only start on left click
    if (e.button !== undefined && e.button !== 0) return;

    // Avoid starting from interactive form controls that need clicks to work
    const target = e.target as HTMLElement | null;
    if (target && (target.closest('input, textarea, select, button, [role="button"], [role="menu"], a, [contenteditable="true"], .no-marquee'))) {
      return;
    }

    // Require workzone to exist for proper coordinate calculation
    const rect = workzoneRef.current?.getBoundingClientRect();
    if (!rect || !workzoneRef.current) return;

    // Calculate position relative to workzone, clamping to valid bounds
    // This allows starting from anywhere on the screen
    const rawX = e.clientX - rect.left + workzoneRef.current.scrollLeft;
    const rawY = e.clientY - rect.top + workzoneRef.current.scrollTop;

    // Clamp coordinates to workzone bounds
    const maxX = workzoneRef.current.scrollWidth;
    const maxY = workzoneRef.current.scrollHeight;
    const x = Math.max(0, Math.min(maxX, rawX));
    const y = Math.max(0, Math.min(maxY, rawY));

    setMarqueeStart({ x, y });
    marqueeEndRef.current = { x, y };
    setIsMarqueeActive(true);
    clearSelection();
    // Cache element positions for fast collision detection
    cacheElementPositions();
  }, [clearSelection, isInternalDragging, isAdminPage, cacheElementPositions]);

  // Store marquee state in refs for auto-scroll access
  const marqueeStartRef = useRef(marqueeStart);
  const marqueeEndRef = useRef({ x: 0, y: 0 });
  useEffect(() => { marqueeStartRef.current = marqueeStart; }, [marqueeStart]);
  // marqueeEndRef is updated directly in mouse move handler

  // Throttle ref for selection updates (32ms = ~30fps balance)
  const lastSelectionUpdateRef = useRef(0);

  handleMarqueeMouseMove.current = useCallback((e: { clientX: number; clientY: number }) => {
    if (!isMarqueeActive || !workzoneRef.current) return;

    // Store current mouse position in ref for auto-scroll
    mousePositionRef.current = { x: e.clientX, y: e.clientY };

    const rect = workzoneRef.current.getBoundingClientRect();
    const rawX = e.clientX - rect.left + workzoneRef.current.scrollLeft;
    const rawY = e.clientY - rect.top + workzoneRef.current.scrollTop;

    // Clamp coordinates to content bounds to prevent infinite extension
    const x = Math.max(0, Math.min(rawX, workzoneRef.current.scrollWidth));
    const y = Math.max(0, Math.min(rawY, workzoneRef.current.scrollHeight));

    // Update marquee visual immediately via DOM (no React re-render)
    marqueeEndRef.current = { x, y };
    if (marqueeBoxRef.current) {
      const left = Math.min(marqueeStart.x, x);
      const top = Math.min(marqueeStart.y, y);
      const width = Math.abs(x - marqueeStart.x);
      const height = Math.abs(y - marqueeStart.y);
      marqueeBoxRef.current.style.left = left + "px";
      marqueeBoxRef.current.style.top = top + "px";
      marqueeBoxRef.current.style.width = width + "px";
      marqueeBoxRef.current.style.height = height + "px";
      marqueeBoxRef.current.style.display = width > 5 && height > 5 ? "block" : "none";
    }

    // Throttle selection updates to 32ms (~30fps) for balanced performance
    const now = performance.now();
    if (now - lastSelectionUpdateRef.current > 32) {
      lastSelectionUpdateRef.current = now;
      updateMarqueeSelection(marqueeStart.x, marqueeStart.y, x, y);
    }
  }, [isMarqueeActive, marqueeStart, updateMarqueeSelection]);

  handleMarqueeMouseUp.current = useCallback(() => {
    // Final selection update on mouse up to ensure accuracy
    if (isMarqueeActive && workzoneRef.current) {
      updateMarqueeSelection(marqueeStart.x, marqueeStart.y, marqueeEndRef.current.x, marqueeEndRef.current.y);
    }
    // Hide marquee box
    if (marqueeBoxRef.current) {
      marqueeBoxRef.current.style.display = "none";
    }
    setIsMarqueeActive(false);
    if (scrollIntervalRef.current) {
      cancelAnimationFrame(scrollIntervalRef.current);
      scrollIntervalRef.current = null;
    }
  }, [isMarqueeActive, marqueeStart, updateMarqueeSelection]);

  // Global mouse up listener for marquee
  useEffect(() => {
    if (isMarqueeActive) {
      const handleGlobalMouseUp = () => {
        // Hide marquee box
        if (marqueeBoxRef.current) {
          marqueeBoxRef.current.style.display = "none";
        }
        setIsMarqueeActive(false);
        if (scrollIntervalRef.current) {
          cancelAnimationFrame(scrollIntervalRef.current);
          scrollIntervalRef.current = null;
        }
      };
      window.addEventListener('mouseup', handleGlobalMouseUp);
      return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
    }
  }, [isMarqueeActive]);

  // Auto-scroll while marquee is active and mouse is near edges (vertical only)
  useEffect(() => {
    if (!isMarqueeActive) return;

    const scrollSpeed = 12;
    const edgeThreshold = 50;

    const autoScroll = () => {
      if (!workzoneRef.current) return;

      const rect = workzoneRef.current.getBoundingClientRect();
      const { y: mouseY } = mousePositionRef.current;

      // Check if mouse is even initialized
      if (mouseY === 0) {
        scrollIntervalRef.current = requestAnimationFrame(autoScroll);
        return;
      }

      let scrolledY = 0;

      // Calculate distance from edges relative to the workzone
      const distanceFromTop = mouseY - rect.top;
      const distanceFromBottom = rect.bottom - mouseY;

      // Calculate scroll limits to prevent infinite scrolling
      const maxScrollTop = workzoneRef.current.scrollHeight - workzoneRef.current.clientHeight;
      const currentScrollTop = workzoneRef.current.scrollTop;

      // Scroll down when near OR BEYOND bottom edge (but not beyond content)
      // distanceFromBottom < edgeThreshold means cursor is near bottom
      // distanceFromBottom < 0 means cursor is BELOW the workzone
      if (distanceFromBottom < edgeThreshold && currentScrollTop < maxScrollTop) {
        // When beyond the edge (negative distance), use max intensity
        const intensity = distanceFromBottom < 0 ? 1 : (edgeThreshold - distanceFromBottom) / edgeThreshold;
        const desiredScroll = Math.ceil(scrollSpeed * intensity);
        // Clamp to not exceed max scroll
        scrolledY = Math.min(desiredScroll, maxScrollTop - currentScrollTop);
        if (scrolledY > 0) {
          workzoneRef.current.scrollTop += scrolledY;
        }
      }
      // Scroll up when near OR BEYOND top edge
      // distanceFromTop < 0 means cursor is ABOVE the workzone
      else if (distanceFromTop < edgeThreshold && currentScrollTop > 0) {
        // When beyond the edge (negative distance), use max intensity
        const intensity = distanceFromTop < 0 ? 1 : (edgeThreshold - distanceFromTop) / edgeThreshold;
        const desiredScroll = Math.ceil(scrollSpeed * intensity);
        // Clamp to not go below 0
        scrolledY = -Math.min(desiredScroll, currentScrollTop);
        if (scrolledY < 0) {
          workzoneRef.current.scrollTop += scrolledY;
        }
      }

      // Update marquee end position and selection if scrolled
      if (scrolledY !== 0) {
        // Clamp the new Y position to the actual content bounds
        const newEndY = Math.max(0, Math.min(
          marqueeEndRef.current.y + scrolledY,
          workzoneRef.current.scrollHeight
        ));
        marqueeEndRef.current = { x: marqueeEndRef.current.x, y: newEndY };
        // Update DOM directly for performance
        if (marqueeBoxRef.current) {
          const left = Math.min(marqueeStartRef.current.x, marqueeEndRef.current.x);
          const top = Math.min(marqueeStartRef.current.y, newEndY);
          const width = Math.abs(marqueeEndRef.current.x - marqueeStartRef.current.x);
          const height = Math.abs(newEndY - marqueeStartRef.current.y);
          marqueeBoxRef.current.style.left = left + "px";
          marqueeBoxRef.current.style.top = top + "px";
          marqueeBoxRef.current.style.width = width + "px";
          marqueeBoxRef.current.style.height = height + "px";
        }
        updateMarqueeSelection(marqueeStartRef.current.x, marqueeStartRef.current.y, marqueeEndRef.current.x, newEndY);
      }

      scrollIntervalRef.current = requestAnimationFrame(autoScroll);
    };

    scrollIntervalRef.current = requestAnimationFrame(autoScroll);

    const handleMouseMove = (event: MouseEvent) => {
      onMarqueeMouseMove(event);
    };

    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      if (scrollIntervalRef.current) {
        cancelAnimationFrame(scrollIntervalRef.current);
        scrollIntervalRef.current = null;
      }
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [isMarqueeActive, updateMarqueeSelection, onMarqueeMouseMove]);

  // marqueeRect is now calculated directly in the DOM via marqueeBoxRef

  // Load album details when viewing album detail
  useEffect(() => {
    if (albumId) {
      api.get(`/albums/${albumId}`).then(res => {
        setCurrentAlbum(res.data);
      }).catch(() => setCurrentAlbum(null));
      api.get(`/albums/${albumId}/files`).then(res => {
        setAlbumPhotoCount(res.data?.length || 0);
      }).catch(() => setAlbumPhotoCount(0));
    } else {
      setCurrentAlbum(null);
      setAlbumPhotoCount(0);
    }
  }, [albumId]);



  // Pages where context menu with upload/create options should appear
  const showContextMenu = isFilesPage || isDocumentsPage || isPhotosPage || isMusicPage;

  const handleContextMenu = (e: React.MouseEvent) => {
    if (!showContextMenu) return;

    const target = e.target as HTMLElement | null;
    const isOnItem = !!target?.closest?.('[data-file-item], [data-folder-item]');
    if (isOnItem) return;

    e.preventDefault();
    e.stopPropagation();
    clearSelection();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const closeContextMenu = () => {
    setContextMenu(null);
  };

  // Handle folder upload from context menu
  const handleFolderUpload = useCallback(() => {
    closeContextMenu();
    folderInputRef.current?.click();
  }, []);

  const handleFolderInputChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const filesWithPaths: { file: File; path: string }[] = [];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      filesWithPaths.push({ file, path });
    }

    const formData = new FormData();
    filesWithPaths.forEach(({ file, path }) => {
      formData.append('files', file);
      formData.append('paths', path);
    });

    if (currentFolderId) {
      formData.append('folderId', currentFolderId);
    }

    try {
      await ensureConfigLoaded();
      toast(t('files.uploading', { count: filesWithPaths.length }), 'info');
      await api.post('/files/upload-with-folders', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast(t('files.folderUploaded'), 'success');
      triggerRefresh();
      refreshUser(); // Update storage info in sidebar
    } catch (error: unknown) {
      const errorResponse = error as { response?: { data?: { error?: string; code?: string } } };
      const resolvedErrorMessage = getUploadErrorMessage(
        errorResponse.response?.data?.code,
        errorResponse.response?.data?.error
      );
      toast(resolvedErrorMessage || t('files.folderUploadError'), 'error');
    }

    e.target.value = '';
  }, [currentFolderId, t, refreshUser, getUploadErrorMessage]);

  // Event to trigger refresh in child components
  const triggerRefresh = () => {
    window.dispatchEvent(new CustomEvent('workzone-refresh'));
  };

  const workzoneContextMenuItems: ContextMenuItemOrDivider[] = [
    ...(isFilesPage
      ? [
        {
          id: 'select-all',
          label: t('layout.selectAll'),
          icon: CheckSquare,
          onClick: () => window.dispatchEvent(new CustomEvent('workzone-select-all')),
        },
        { id: 'divider-select-all', divider: true as const },
      ]
      : []),
    {
      id: 'upload-file',
      label: t('layout.addFile'),
      icon: Upload,
      onClick: () => setUploadModalOpen(true),
    },
    ...(isFilesPage
      ? [
        {
          id: 'upload-folder',
          label: t('layout.addFolder'),
          icon: FolderUp,
          onClick: handleFolderUpload,
        },
      ]
      : []),
    ...(isFilesPage
      ? [
        { id: 'divider-create', divider: true as const },
        {
          id: 'create-file',
          label: t('header.createFile'),
          icon: FilePlus,
          onClick: () => setCreateFileModalOpen(true),
        },
        {
          id: 'create-folder',
          label: t('header.createFolder'),
          icon: FolderPlus,
          onClick: () => setCreateFolderModalOpen(true),
        },
        { id: 'divider-refresh', divider: true as const },
        {
          id: 'refresh',
          label: t('layout.refresh'),
          icon: RefreshCw,
          onClick: triggerRefresh,
        },
      ]
      : []),
  ];

  return (
    <DndContextProvider onRefresh={triggerRefresh}>
      <SkipLink />
      <div className="flex h-screen bg-dark-100 dark:bg-dark-800 overflow-hidden font-sans select-none">
        <Sidebar mobileOpen={mobileMenuOpen} setMobileOpen={setMobileMenuOpen} />

        <div className="flex-1 flex flex-col min-w-0">
          <Header onMobileMenuToggle={() => setMobileMenuOpen(true)} />

          {/* Progress bar at the top - Fixed height to prevent layout shift */}
          <div className="h-1 bg-dark-100 dark:bg-dark-800"></div>

          {/* Content area */}
          <div className="flex-1 flex flex-col overflow-hidden p-3 pt-0 gap-3">
            {/* Top bar: Toggle + Breadcrumb */}
            <div className="flex items-center gap-3">
              {/* Sidebar toggle - separate circle */}
              <button
                onClick={toggleSidebar}
                className="w-11 h-11 flex items-center justify-center bg-white dark:bg-dark-800 text-dark-500 dark:text-white/70 hover:text-dark-900 dark:hover:text-white hover:bg-dark-100 dark:hover:bg-white/10 rounded-full border border-dark-200 dark:border-dark-700 shadow-sm transition-colors"
                title={sidebarOpen ? t('layout.hideSidebar') : t('layout.showSidebar')}
                aria-label={sidebarOpen ? t('layout.hideSidebar') : t('layout.showSidebar')}
              >
                {sidebarOpen ? (
                  <PanelLeftClose className="w-5 h-5" />
                ) : (
                  <PanelLeft className="w-5 h-5" />
                )}
              </button>

              {/* Breadcrumb bar */}
              <div className="flex-1 h-11 flex items-center justify-between pl-2 pr-1 bg-white dark:bg-dark-900 rounded-full shadow-sm border border-dark-200 dark:border-dark-700">
                {/* Settings title */}
                {isSettingsPage ? (
                  <div className="flex items-center gap-2 ml-2">
                    <Settings className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                    <span className="text-base font-semibold text-dark-900 dark:text-white">{t('layout.settings')}</span>
                  </div>
                ) : isAdminPage ? (
                  <div className="flex items-center gap-2 ml-2">
                    <ShieldCheck className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                    <span className="text-base font-semibold text-dark-900 dark:text-white">{t('layout.administration')}</span>
                  </div>
                ) : isSharedPage ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setSearchParams({ tab: 'my-shares' })}
                      className={cn(
                        'h-8 px-4 rounded-full text-base font-semibold transition-all duration-200 flex items-center justify-center gap-3 leading-none border border-transparent',
                        sharedTab === 'my-shares'
                          ? 'bg-primary-500/15 text-dark-900 dark:text-white border-primary-500/40 shadow-sm'
                          : 'text-dark-600 dark:text-white/80 hover:text-dark-900 dark:hover:text-white hover:bg-dark-100 dark:hover:bg-white/5'
                      )}
                    >
                      <LinkIcon className="w-5 h-5" />
                      {t('layout.myShares')}
                    </button>
                    <button
                      onClick={() => setSearchParams({ tab: 'shared-with-me' })}
                      className={cn(
                        'h-8 px-4 rounded-full text-base font-semibold transition-all duration-200 flex items-center justify-center gap-3 leading-none border border-transparent',
                        sharedTab === 'shared-with-me'
                          ? 'bg-primary-500/15 text-dark-900 dark:text-white border-primary-500/40 shadow-sm'
                          : 'text-dark-600 dark:text-white/80 hover:text-dark-900 dark:hover:text-white hover:bg-dark-100 dark:hover:bg-white/5'
                      )}
                    >
                      <Users className="w-5 h-5" />
                      {t('layout.sharedWithMe')}
                    </button>
                  </div>
                ) : isTrashPage ? (
                  <>
                    <div className="flex items-center gap-2 ml-2">
                      <Trash2 className="w-5 h-5 text-red-500" />
                      <span className="text-base font-semibold text-dark-900 dark:text-white">{t('layout.trash')}</span>
                    </div>
                    <button
                      onClick={() => window.dispatchEvent(new CustomEvent('empty-trash'))}
                      className="h-7 px-3 mr-1 flex items-center gap-2 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      {t('layout.emptyTrash')}
                    </button>
                  </>
                ) : isFavoritesPage ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => navigate('/files')}
                      className="p-1.5 rounded-full hover:bg-dark-100 dark:hover:bg-white/10 transition-colors"
                      aria-label={t('layout.backToFiles')}
                    >
                      <ArrowLeft className="w-5 h-5 text-dark-500" />
                    </button>
                    <Star className="w-5 h-5 text-yellow-500" />
                    <span className="text-base font-semibold text-dark-900 dark:text-white">{t('layout.favorites')}</span>
                  </div>
                ) : isAlbumDetailPage && currentAlbum ? (
                  <>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => navigate('/albums')}
                        className="p-1.5 rounded-full hover:bg-dark-100 dark:hover:bg-white/10 transition-colors"
                        aria-label={t('layout.backToAlbums')}
                      >
                        <ArrowLeft className="w-5 h-5 text-dark-500" />
                      </button>
                      <div className="flex items-center gap-2">
                        <FolderOpen className="w-5 h-5 text-primary-500" />
                        <span className="text-base font-semibold text-dark-900 dark:text-white">{currentAlbum.name}</span>
                        <span className="text-sm text-dark-500">• {albumPhotoCount} {t('layout.photos')}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => window.dispatchEvent(new CustomEvent('add-photos-to-album'))}
                      className="h-7 px-3 mr-1 flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-full transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      {t('layout.addPhotos')}
                    </button>
                  </>
                ) : isMusicPage ? (
                  <>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => navigate('/music?tab=all')}
                        className={cn(
                          'h-8 px-4 rounded-full text-base font-semibold transition-all duration-200 flex items-center justify-center gap-3 leading-none border border-transparent',
                          musicTab === 'all'
                            ? 'bg-primary-500/15 text-dark-900 dark:text-white border-primary-500/40 shadow-sm'
                            : 'text-dark-600 dark:text-white/80 hover:text-dark-900 dark:hover:text-white hover:bg-dark-100 dark:hover:bg-white/5'
                        )}
                        aria-label={t('layout.viewAllMusic')}
                      >
                        <Music className="w-5 h-5" />
                        {t('layout.all')}
                      </button>
                      <button
                        onClick={() => navigate('/music?tab=favorites')}
                        className={cn(
                          'h-8 px-4 rounded-full text-base font-semibold transition-all duration-200 flex items-center justify-center gap-3 leading-none border border-transparent',
                          musicTab === 'favorites'
                            ? 'bg-primary-500/15 text-dark-900 dark:text-white border-primary-500/40 shadow-sm'
                            : 'text-dark-600 dark:text-white/80 hover:text-dark-900 dark:hover:text-white hover:bg-dark-100 dark:hover:bg-white/5'
                        )}
                        aria-label={t('layout.viewFavoriteMusic')}
                      >
                        <Star className="w-5 h-5" />
                        {t('layout.favorites')}
                      </button>
                      <button
                        onClick={() => navigate('/music?tab=albums')}
                        className={cn(
                          'h-8 px-4 rounded-full text-base font-semibold transition-all duration-200 flex items-center justify-center gap-3 leading-none border border-transparent',
                          musicTab === 'albums'
                            ? 'bg-primary-500/15 text-dark-900 dark:text-white border-primary-500/40 shadow-sm'
                            : 'text-dark-600 dark:text-white/80 hover:text-dark-900 dark:hover:text-white hover:bg-dark-100 dark:hover:bg-white/5'
                        )}
                        aria-label={t('layout.viewMusicAlbums')}
                      >
                        <Disc className="w-5 h-5" />
                        {t('layout.albums')}
                      </button>
                    </div>
                    {(musicTab === 'all' || musicTab === 'albums') && (
                      <button
                        onClick={() => window.dispatchEvent(new CustomEvent('create-music-album'))}
                        className="h-7 px-3 mr-1 flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-full transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                        {t('layout.newAlbum')}
                      </button>
                    )}
                  </>
                ) : isDocumentsPage ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => navigate('/documents?tab=all')}
                      className={cn(
                        'h-8 px-4 rounded-full text-base font-semibold transition-all duration-200 flex items-center justify-center gap-3 leading-none border border-transparent',
                        documentsTab === 'all'
                          ? 'bg-primary-500/15 text-dark-900 dark:text-white border-primary-500/40 shadow-sm'
                          : 'text-dark-600 dark:text-white/80 hover:text-dark-900 dark:hover:text-white hover:bg-dark-100 dark:hover:bg-white/5'
                      )}
                      aria-label={t('layout.viewAllDocuments')}
                    >
                      <Files className="w-5 h-5" />
                      {t('layout.all')}
                    </button>
                    <button
                      onClick={() => navigate('/documents?tab=pdf')}
                      className={cn(
                        'h-8 px-4 rounded-full text-base font-semibold transition-all duration-200 flex items-center justify-center gap-3 leading-none border border-transparent',
                        documentsTab === 'pdf'
                          ? 'bg-primary-500/15 text-dark-900 dark:text-white border-primary-500/40 shadow-sm'
                          : 'text-dark-600 dark:text-white/80 hover:text-dark-900 dark:hover:text-white hover:bg-dark-100 dark:hover:bg-white/5'
                      )}
                      aria-label={t('layout.viewPDFs')}
                    >
                      <File className="w-5 h-5" />
                      {t('layout.pdfs')}
                    </button>
                    <button
                      onClick={() => navigate('/documents?tab=text')}
                      className={cn(
                        'h-8 px-4 rounded-full text-base font-semibold transition-all duration-200 flex items-center justify-center gap-3 leading-none border border-transparent',
                        documentsTab === 'text'
                          ? 'bg-primary-500/15 text-dark-900 dark:text-white border-primary-500/40 shadow-sm'
                          : 'text-dark-600 dark:text-white/80 hover:text-dark-900 dark:hover:text-white hover:bg-dark-100 dark:hover:bg-white/5'
                      )}
                      aria-label={t('layout.viewTextDocs')}
                    >
                      <AlignLeft className="w-5 h-5" />
                      {t('layout.text')}
                    </button>
                    <button
                      onClick={() => navigate('/documents?tab=spreadsheet')}
                      className={cn(
                        'h-8 px-4 rounded-full text-base font-semibold transition-all duration-200 flex items-center justify-center gap-3 leading-none border border-transparent',
                        documentsTab === 'spreadsheet'
                          ? 'bg-primary-500/15 text-dark-900 dark:text-white border-primary-500/40 shadow-sm'
                          : 'text-dark-600 dark:text-white/80 hover:text-dark-900 dark:hover:text-white hover:bg-dark-100 dark:hover:bg-white/5'
                      )}
                      aria-label={t('layout.viewSpreadsheets')}
                    >
                      <FileSpreadsheet className="w-5 h-5" />
                      {t('layout.spreadsheet')}
                    </button>
                    <button
                      onClick={() => navigate('/documents?tab=presentation')}
                      className={cn(
                        'h-8 px-4 rounded-full text-base font-semibold transition-all duration-200 flex items-center justify-center gap-3 leading-none border border-transparent',
                        documentsTab === 'presentation'
                          ? 'bg-primary-500/15 text-dark-900 dark:text-white border-primary-500/40 shadow-sm'
                          : 'text-dark-600 dark:text-white/80 hover:text-dark-900 dark:hover:text-white hover:bg-dark-100 dark:hover:bg-white/5'
                      )}
                      aria-label={t('layout.viewPresentations')}
                    >
                      <Presentation className="w-5 h-5" />
                      {t('layout.presentations')}
                    </button>
                    <button
                      onClick={() => navigate('/documents?tab=code')}
                      className={cn(
                        'h-8 px-4 rounded-full text-base font-semibold transition-all duration-200 flex items-center justify-center gap-3 leading-none border border-transparent',
                        documentsTab === 'code'
                          ? 'bg-primary-500/15 text-dark-900 dark:text-white border-primary-500/40 shadow-sm'
                          : 'text-dark-600 dark:text-white/80 hover:text-dark-900 dark:hover:text-white hover:bg-dark-100 dark:hover:bg-white/5'
                      )}
                      aria-label={t('layout.viewCode')}
                    >
                      <FileCode className="w-5 h-5" />
                      {t('layout.code')}
                    </button>
                  </div>
                ) : isGalleryPage ? (
                  <>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => navigate('/photos?tab=all')}
                        className={cn(
                          'h-8 px-4 rounded-full text-base font-semibold transition-all duration-200 flex items-center justify-center gap-3 leading-none border border-transparent',
                          isPhotosPage && photosTab === 'all'
                            ? 'bg-primary-500/15 text-dark-900 dark:text-white border-primary-500/40 shadow-sm'
                            : 'text-dark-600 dark:text-white/80 hover:text-dark-900 dark:hover:text-white hover:bg-dark-100 dark:hover:bg-white/5'
                        )}
                        aria-label={t('layout.viewAllPhotos')}
                      >
                        <Image className="w-5 h-5" />
                        {t('layout.all')}
                      </button>
                      <button
                        onClick={() => navigate('/photos?tab=favorites')}
                        className={cn(
                          'h-8 px-4 rounded-full text-base font-semibold transition-all duration-200 flex items-center justify-center gap-3 leading-none border border-transparent',
                          isPhotosPage && photosTab === 'favorites'
                            ? 'bg-primary-500/15 text-dark-900 dark:text-white border-primary-500/40 shadow-sm'
                            : 'text-dark-600 dark:text-white/80 hover:text-dark-900 dark:hover:text-white hover:bg-dark-100 dark:hover:bg-white/5'
                        )}
                        aria-label={t('layout.viewFavoritePhotos')}
                      >
                        <Star className="w-5 h-5" />
                        {t('layout.favorites')}
                      </button>
                      <button
                        onClick={() => navigate('/photos?tab=videos')}
                        className={cn(
                          'h-8 px-4 rounded-full text-base font-semibold transition-all duration-200 flex items-center justify-center gap-3 leading-none border border-transparent',
                          isPhotosPage && photosTab === 'videos'
                            ? 'bg-primary-500/15 text-dark-900 dark:text-white border-primary-500/40 shadow-sm'
                            : 'text-dark-600 dark:text-white/80 hover:text-dark-900 dark:hover:text-white hover:bg-dark-100 dark:hover:bg-white/5'
                        )}
                        aria-label={t('layout.viewVideos')}
                      >
                        <Video className="w-5 h-5" />
                        {t('layout.videos')}
                      </button>
                      <button
                        onClick={() => navigate('/photos?tab=screenshots')}
                        className={cn(
                          'h-8 px-4 rounded-full text-base font-semibold transition-all duration-200 flex items-center justify-center gap-3 leading-none border border-transparent',
                          isPhotosPage && photosTab === 'screenshots'
                            ? 'bg-primary-500/15 text-dark-900 dark:text-white border-primary-500/40 shadow-sm'
                            : 'text-dark-600 dark:text-white/80 hover:text-dark-900 dark:hover:text-white hover:bg-dark-100 dark:hover:bg-white/5'
                        )}
                        aria-label={t('layout.viewScreenshots')}
                      >
                        <Camera className="w-5 h-5" />
                        {t('layout.screenshots')}
                      </button>
                      <button
                        onClick={() => navigate('/albums')}
                        className={cn(
                          'h-8 px-4 rounded-full text-base font-semibold transition-all duration-200 flex items-center justify-center gap-3 leading-none border border-transparent',
                          isAlbumsPage
                            ? 'bg-primary-500/15 text-dark-900 dark:text-white border-primary-500/40 shadow-sm'
                            : 'text-dark-600 dark:text-white/80 hover:text-dark-900 dark:hover:text-white hover:bg-dark-100 dark:hover:bg-white/5'
                        )}
                        aria-label={t('layout.viewAlbums')}
                      >
                        <FolderOpen className="w-5 h-5" />
                        {t('layout.albums')}
                      </button>
                    </div>
                    {isAlbumsPage && (
                      <button
                        onClick={() => window.dispatchEvent(new CustomEvent('create-album'))}
                        className="h-7 px-3 mr-1 flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-full transition-colors"
                      >
                        <Plus className="w-4 h-4" />
                        {t('layout.newAlbum')}
                      </button>
                    )}
                  </>
                ) : showBreadcrumbs ? (
                  <Breadcrumbs
                    items={breadcrumbs}
                    basePath="/files"
                    onRefresh={triggerRefresh}
                  />
                ) : null}

                <div className="flex-1" />

                {(showViewControls || isMusicPage || isDocumentsPage || isGalleryPage || isSharedPage || isAlbumDetailPage) && (
                  <div className="flex items-center gap-1">
                    {/* Sort dropdown */}
                    <Dropdown
                      trigger={
                        <button
                          className="h-7 flex items-center justify-center gap-2 px-3 text-sm font-medium text-dark-600 dark:text-white/80 hover:text-dark-900 dark:hover:text-white hover:bg-dark-100 dark:hover:bg-white/5 rounded-full transition-colors border border-transparent"
                          aria-label={t('layout.sort')}
                        >
                          {sortOrder === 'asc' ? (
                            <SortAsc className="w-4 h-4" />
                          ) : (
                            <SortDesc className="w-4 h-4" />
                          )}
                          <span className="hidden sm:inline">{currentSortLabel}</span>
                        </button>
                      }
                      align="right"
                    >
                      <div>
                        {sortOptions.map((option) => (
                          <DropdownItem
                            key={option.value}
                            onClick={() => {
                              setSortBy(option.value as 'name' | 'size' | 'createdAt' | 'updatedAt');
                            }}
                          >
                            {t(option.labelKey)}
                            {sortBy === option.value && (
                              <Check className="w-4 h-4 ml-auto text-primary-600" />
                            )}
                          </DropdownItem>
                        ))}
                        <DropdownDivider />
                        <DropdownItem onClick={() => setSortOrder('asc')}>
                          <SortAsc className="w-4 h-4" /> {t('layout.ascending')}
                          {sortOrder === 'asc' && (
                            <Check className="w-4 h-4 ml-auto text-primary-600" />
                          )}
                        </DropdownItem>
                        <DropdownItem onClick={() => setSortOrder('desc')}>
                          <SortDesc className="w-4 h-4" /> {t('layout.descending')}
                          {sortOrder === 'desc' && (
                            <Check className="w-4 h-4 ml-auto text-primary-600" />
                          )}
                        </DropdownItem>
                      </div>
                    </Dropdown>

                    {/* View toggle */}
                    <div className="flex items-center bg-dark-100 dark:bg-dark-800 border border-dark-200 dark:border-dark-700 rounded-full p-0.5">
                      <button
                        onClick={() => setViewMode('grid')}
                        className={cn(
                          'p-1.5 rounded-full transition-colors flex items-center justify-center',
                          viewMode === 'grid'
                            ? 'bg-white dark:bg-white/10 text-dark-900 dark:text-white shadow-sm'
                            : 'text-dark-500 dark:text-white/70 hover:text-dark-900 dark:hover:text-white hover:bg-dark-200 dark:hover:bg-white/5'
                        )}
                        aria-label={t('layout.viewGrid')}
                        aria-pressed={viewMode === 'grid' ? "true" : "false"}
                      >
                        <Grid className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setViewMode('list')}
                        className={cn(
                          'p-1.5 rounded-full transition-colors flex items-center justify-center',
                          viewMode === 'list'
                            ? 'bg-white dark:bg-white/10 text-dark-900 dark:text-white shadow-sm'
                            : 'text-dark-500 dark:text-white/70 hover:text-dark-900 dark:hover:text-white hover:bg-dark-200 dark:hover:bg-white/5'
                        )}
                        aria-label={t('layout.viewList')}
                        aria-pressed={viewMode === 'list'}
                      >
                        <List className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Main workzone */}
            <div
              className={cn(
                "bg-white dark:bg-dark-900 rounded-2xl flex-1 flex flex-col overflow-hidden border border-dark-200 dark:border-dark-700 shadow-sm transition-opacity duration-200 relative select-none",
                isDragging && "opacity-50"
              )}
              onContextMenu={handleContextMenu}
              onClick={closeContextMenu}
            >
              <main
                id="main-content"
                tabIndex={-1}
                ref={workzoneRef}
                className="flex-1 overflow-y-auto overflow-x-hidden p-4 pb-8 relative focus:outline-none"
                onMouseDown={onMarqueeMouseDown}
                onMouseMove={onMarqueeMouseMove}
                onMouseUp={onMarqueeMouseUp}
              >
                <Outlet />

                {/* Marquee selection rectangle - DOM controlled for performance */}
                <div
                  ref={marqueeBoxRef}
                  className="absolute pointer-events-none z-40 border-2 rounded-lg"
                  style={{
                    display: "none",
                    backgroundColor: hexToRgba(accentColor, 0.15),
                    borderColor: hexToRgba(accentColor, 0.5),
                  }}
                />
              </main>

            </div>

          </div>
        </div>
        <UploadProgress />
        <ContextMenu items={workzoneContextMenuItems} position={contextMenu} onClose={closeContextMenu} />

        {/* Drag and Drop Overlay */}
        {isDragging && (
          <div className="fixed inset-0 z-[100] pointer-events-none flex items-end justify-center pb-8">
            <div className="bg-dark-900/80 dark:bg-white/90 backdrop-blur-sm rounded-full px-6 py-3 shadow-lg flex items-center gap-3 animate-breathing">
              <Upload className="w-5 h-5 text-white dark:text-dark-900" />
              <span className="text-sm font-medium text-white dark:text-dark-900">
                {t('layout.dropToUpload')}
              </span>
            </div>
          </div>
        )}

        {/* Hidden folder input for folder upload */}
        <input
          ref={folderInputRef}
          type="file"
          className="hidden"
          aria-label={t('layout.selectFolderToUpload')}
          // @ts-ignore - webkitdirectory is not in types but works in browsers
          webkitdirectory=""
          directory=""
          multiple
          onChange={handleFolderInputChange}
        />

        {/* Modals */}
        <UploadModal
          isOpen={isUploadModalOpen}
          onClose={() => setUploadModalOpen(false)}
          folderId={currentFolderId}
          onSuccess={triggerRefresh}
        />
        <CreateFolderModal
          isOpen={isCreateFolderModalOpen}
          onClose={() => setCreateFolderModalOpen(false)}
          parentId={currentFolderId}
          onSuccess={triggerRefresh}
        />
        <CreateFileModal
          isOpen={isCreateFileModalOpen}
          onClose={() => setCreateFileModalOpen(false)}
          folderId={currentFolderId}
          onSuccess={triggerRefresh}
        />
        <VerificationLockModal />

      </div>
    </DndContextProvider >
  );
}
type AnyMouseEvent = MouseEvent | ReactMouseEvent;
