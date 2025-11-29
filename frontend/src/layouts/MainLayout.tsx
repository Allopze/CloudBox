import { useState, useCallback, useEffect, Fragment, useRef } from 'react';
import { Outlet, useLocation, useNavigate, useSearchParams, useParams } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import UploadProgress from '../components/UploadProgress';
import UploadModal from '../components/modals/UploadModal';
import CreateFolderModal from '../components/modals/CreateFolderModal';
import { useUIStore } from '../stores/uiStore';
import { useFileStore } from '../stores/fileStore';
import { useUploadStore } from '../stores/uploadStore';
import { useBrandingStore } from '../stores/brandingStore';
import { useGlobalProgressStore } from '../stores/globalProgressStore';
import { cn } from '../lib/utils';
import { PanelLeftClose, PanelLeft, Grid, List, SortAsc, SortDesc, Check, Link as LinkIcon, Users, Image, Star, Video, Camera, FolderOpen, Settings, ShieldCheck, Home, ChevronRight, Upload, FolderPlus, Trash2, Music, Disc, Plus, ArrowLeft } from 'lucide-react';
import { Album } from '../types';
import Dropdown, { DropdownItem, DropdownDivider } from '../components/ui/Dropdown';
import { api } from '../lib/api';
import { toast } from '../components/ui/Toast';

const sortOptions = [
  { value: 'name', label: 'Nombre' },
  { value: 'createdAt', label: 'Fecha de creación' },
  { value: 'updatedAt', label: 'Fecha de modificación' },
  { value: 'size', label: 'Tamaño' },
];

// Pages that show view/sort controls
const pagesWithViewControls = ['/files', '/documents', '/trash', '/favorites'];

// Pages that show breadcrumbs
const pagesWithBreadcrumbs = ['/files'];

export default function MainLayout() {
  const { sidebarOpen, toggleSidebar } = useUIStore();
  const { viewMode, setViewMode, sortBy, sortOrder, setSortBy, setSortOrder, breadcrumbs, selectAll, clearSelection, selectedItems } = useFileStore();
  const { setGlobalProgress, resetGlobalProgress } = useUploadStore();
  const { branding } = useBrandingStore();
  const { addOperation, incrementProgress, completeOperation, failOperation } = useGlobalProgressStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { albumId } = useParams<{ albumId: string }>();

  // Album detail state
  const [currentAlbum, setCurrentAlbum] = useState<Album | null>(null);
  const [albumPhotoCount, setAlbumPhotoCount] = useState(0);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [isUploadModalOpen, setUploadModalOpen] = useState(false);
  const [isCreateFolderModalOpen, setCreateFolderModalOpen] = useState(false);
  
  // Drag and drop state
  const [isDragging, setIsDragging] = useState(false);
  const [, setDragCounter] = useState(0);

  // Marquee selection state
  const workzoneRef = useRef<HTMLDivElement>(null);
  const scrollIntervalRef = useRef<number | null>(null);
  const mousePositionRef = useRef({ x: 0, y: 0 });
  const [isMarqueeActive, setIsMarqueeActive] = useState(false);
  const [marqueeStart, setMarqueeStart] = useState({ x: 0, y: 0 });
  const [marqueeEnd, setMarqueeEnd] = useState({ x: 0, y: 0 });

  // Get accent color with fallback
  const accentColor = branding.primaryColor || '#dc2626';

  // Convert hex to rgba
  const hexToRgba = (hex: string, alpha: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  // Global drag and drop handlers
  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter((prev) => prev + 1);
    if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter((prev) => {
      const newCount = prev - 1;
      if (newCount === 0) {
        setIsDragging(false);
      }
      return newCount;
    });
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

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

  const handleDrop = useCallback(async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    setDragCounter(0);

    const items = e.dataTransfer?.items;
    if (!items || items.length === 0) return;

    // Get current folder ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const folderId = urlParams.get('folder');

    const allFiles: { file: File; relativePath: string }[] = [];

    // Process each dropped item
    for (const item of Array.from(items)) {
      if (item.kind !== 'file') continue;
      
      const entry = item.webkitGetAsEntry?.();
      if (!entry) {
        // Fallback for browsers without webkitGetAsEntry
        const file = item.getAsFile();
        if (file) {
          allFiles.push({ file, relativePath: file.name });
        }
        continue;
      }

      if (entry.isFile) {
        const fileEntry = entry as FileSystemFileEntry;
        const file = await new Promise<File>((resolve, reject) => {
          fileEntry.file(resolve, reject);
        });
        allFiles.push({ file, relativePath: file.name });
      } else if (entry.isDirectory) {
        const dirFiles = await readDirectoryEntries(
          entry as FileSystemDirectoryEntry,
          entry.name
        );
        allFiles.push(...dirFiles);
      }
    }

    if (allFiles.length === 0) return;

    // Calculate total size
    const totalSize = allFiles.reduce((sum, { file }) => sum + file.size, 0);

    // Upload all files with progress tracking
    try {
      const formData = new FormData();
      for (const { file, relativePath } of allFiles) {
        formData.append('files', file);
        formData.append('paths', relativePath);
      }
      if (folderId) {
        formData.append('folderId', folderId);
      }

      let lastTime = Date.now();
      let lastLoaded = 0;

      await api.post('/files/upload-with-folders', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          const loaded = progressEvent.loaded || 0;
          const total = progressEvent.total || totalSize;
          const now = Date.now();
          const timeDiff = (now - lastTime) / 1000; // seconds
          
          let speed = 0;
          if (timeDiff > 0.1) { // Update speed every 100ms
            speed = (loaded - lastLoaded) / timeDiff;
            lastTime = now;
            lastLoaded = loaded;
          }
          
          setGlobalProgress(loaded, total, speed);
        },
      });
      
      resetGlobalProgress();
      toast(`${allFiles.length} archivo(s) subido(s) correctamente`, 'success');
      triggerRefresh();
    } catch {
      resetGlobalProgress();
      toast('Error al subir los archivos', 'error');
    }
  }, [setGlobalProgress, resetGlobalProgress]);

  // Set up global drag and drop listeners
  useEffect(() => {
    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, [handleDragEnter, handleDragLeave, handleDragOver, handleDrop]);

  // Close context menu on any click outside
  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    
    if (contextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [contextMenu]);

  // Global keyboard shortcuts for selection
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      // Ctrl/Cmd + A: Select all
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
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
      if (e.key === 'Delete' && selectedItems.size > 0) {
        e.preventDefault();
        const itemIds = Array.from(selectedItems);
        const total = itemIds.length;
        
        const opId = addOperation({
          id: `delete-keyboard-${Date.now()}`,
          type: 'delete',
          title: `Eliminando ${total} elemento(s)`,
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
          toast(`${total} elemento${total > 1 ? 's' : ''} movido${total > 1 ? 's' : ''} a papelera`, 'success');
          // Trigger a refresh by dispatching a custom event
          window.dispatchEvent(new CustomEvent('workzone-refresh'));
        } catch {
          failOperation(opId, 'Error al eliminar elementos');
          toast('Error al eliminar elementos', 'error');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectAll, clearSelection, selectedItems, addOperation, incrementProgress, completeOperation, failOperation]);

  // Helper function to update selection based on marquee bounds
  const updateMarqueeSelection = useCallback((startX: number, startY: number, endX: number, endY: number) => {
    if (!workzoneRef.current) return;
    
    const rect = workzoneRef.current.getBoundingClientRect();
    const minX = Math.min(startX, endX);
    const maxX = Math.max(startX, endX);
    const minY = Math.min(startY, endY);
    const maxY = Math.max(startY, endY);

    const marqueeWidth = maxX - minX;
    const marqueeHeight = maxY - minY;
    if (marqueeWidth < 5 || marqueeHeight < 5) return;

    const items = workzoneRef.current.querySelectorAll('[data-file-item], [data-folder-item]');
    const selectedIds: string[] = [];

    items.forEach((item) => {
      const itemRect = item.getBoundingClientRect();
      const itemX = itemRect.left - rect.left + workzoneRef.current!.scrollLeft;
      const itemY = itemRect.top - rect.top + workzoneRef.current!.scrollTop;
      const itemRight = itemX + itemRect.width;
      const itemBottom = itemY + itemRect.height;

      if (itemX < maxX && itemRight > minX && itemY < maxY && itemBottom > minY) {
        const id = item.getAttribute('data-file-item') || item.getAttribute('data-folder-item');
        if (id) selectedIds.push(id);
      }
    });

    selectAll(selectedIds);
  }, [selectAll]);

  // Marquee selection handlers
  const handleMarqueeMouseDown = useCallback((e: React.MouseEvent) => {
    // Only start marquee on left click and if clicking on the workzone background (not on items)
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    
    // Check if clicking on the main element or its direct scrollable child
    if (!target.closest('[data-file-item]') && !target.closest('[data-folder-item]')) {
      const rect = workzoneRef.current?.getBoundingClientRect();
      if (rect) {
        const x = e.clientX - rect.left + (workzoneRef.current?.scrollLeft || 0);
        const y = e.clientY - rect.top + (workzoneRef.current?.scrollTop || 0);
        setMarqueeStart({ x, y });
        setMarqueeEnd({ x, y });
        setIsMarqueeActive(true);
        clearSelection();
      }
    }
  }, [clearSelection]);

  // Store marquee state in refs for auto-scroll access
  const marqueeStartRef = useRef(marqueeStart);
  const marqueeEndRef = useRef(marqueeEnd);
  useEffect(() => { marqueeStartRef.current = marqueeStart; }, [marqueeStart]);
  useEffect(() => { marqueeEndRef.current = marqueeEnd; }, [marqueeEnd]);

  // Throttle ref for selection updates
  const lastSelectionUpdateRef = useRef(0);
  
  const handleMarqueeMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isMarqueeActive || !workzoneRef.current) return;
    
    // Store current mouse position in ref for auto-scroll
    mousePositionRef.current = { x: e.clientX, y: e.clientY };
    
    const rect = workzoneRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + workzoneRef.current.scrollLeft;
    const y = e.clientY - rect.top + workzoneRef.current.scrollTop;
    
    // Update marquee visual immediately via ref
    marqueeEndRef.current = { x, y };
    setMarqueeEnd({ x, y });

    // Throttle selection updates to every 32ms (~30fps) to reduce lag
    const now = performance.now();
    if (now - lastSelectionUpdateRef.current > 32) {
      lastSelectionUpdateRef.current = now;
      updateMarqueeSelection(marqueeStart.x, marqueeStart.y, x, y);
    }
  }, [isMarqueeActive, marqueeStart, updateMarqueeSelection]);

  const handleMarqueeMouseUp = useCallback(() => {
    // Final selection update on mouse up to ensure accuracy
    if (isMarqueeActive && workzoneRef.current) {
      updateMarqueeSelection(marqueeStart.x, marqueeStart.y, marqueeEndRef.current.x, marqueeEndRef.current.y);
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
      
      // Scroll down when near bottom edge
      if (distanceFromBottom < edgeThreshold && distanceFromBottom >= 0) {
        const intensity = Math.min((edgeThreshold - distanceFromBottom) / edgeThreshold, 1);
        scrolledY = Math.ceil(scrollSpeed * intensity);
        workzoneRef.current.scrollTop += scrolledY;
      }
      // Scroll up when near top edge
      else if (distanceFromTop < edgeThreshold && distanceFromTop >= 0 && workzoneRef.current.scrollTop > 0) {
        const intensity = Math.min((edgeThreshold - distanceFromTop) / edgeThreshold, 1);
        scrolledY = -Math.ceil(scrollSpeed * intensity);
        workzoneRef.current.scrollTop += scrolledY;
      }
      
      // Update marquee end position and selection if scrolled
      if (scrolledY !== 0) {
        const newEndY = marqueeEndRef.current.y + scrolledY;
        marqueeEndRef.current = { x: marqueeEndRef.current.x, y: newEndY };
        setMarqueeEnd({ x: marqueeEndRef.current.x, y: newEndY });
        updateMarqueeSelection(marqueeStartRef.current.x, marqueeStartRef.current.y, marqueeEndRef.current.x, newEndY);
      }
      
      scrollIntervalRef.current = requestAnimationFrame(autoScroll);
    };
    
    scrollIntervalRef.current = requestAnimationFrame(autoScroll);
    
    return () => {
      if (scrollIntervalRef.current) {
        cancelAnimationFrame(scrollIntervalRef.current);
        scrollIntervalRef.current = null;
      }
    };
  }, [isMarqueeActive, updateMarqueeSelection]);

  // Calculate marquee rectangle
  const marqueeRect = isMarqueeActive ? {
    left: Math.min(marqueeStart.x, marqueeEnd.x),
    top: Math.min(marqueeStart.y, marqueeEnd.y),
    width: Math.abs(marqueeEnd.x - marqueeStart.x),
    height: Math.abs(marqueeEnd.y - marqueeStart.y),
  } : null;

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

  const showViewControls = pagesWithViewControls.includes(location.pathname);
  const showBreadcrumbs = pagesWithBreadcrumbs.some(p => location.pathname.startsWith(p)) && breadcrumbs.length > 0;
  const currentSort = sortOptions.find((s) => s.value === sortBy);
  const isSharedPage = location.pathname === '/shared';
  const isAlbumDetailPage = !!albumId && location.pathname.startsWith('/albums/');
  const isPhotosPage = location.pathname === '/photos';
  const isAlbumsPage = location.pathname.startsWith('/albums');
  const isSettingsPage = location.pathname === '/settings';
  const isAdminPage = location.pathname.startsWith('/admin');
  const isFilesPage = location.pathname === '/files';
  const isDocumentsPage = location.pathname === '/documents';
  const isMusicPage = location.pathname === '/music';
  const isTrashPage = location.pathname === '/trash';
  const isFavoritesPage = location.pathname === '/favorites';
  const isGalleryPage = isPhotosPage || isAlbumsPage;
  const sharedTab = searchParams.get('tab') || 'my-shares';
  const photosTab = searchParams.get('tab') || 'all';
  const musicTab = searchParams.get('tab') || 'all';

  // Get current folder ID from search params
  const currentFolderId = searchParams.get('folder');

  // Pages where context menu with upload/create options should appear
  const showContextMenu = isFilesPage || isDocumentsPage || isPhotosPage || isMusicPage;

  const handleContextMenu = (e: React.MouseEvent) => {
    if (!showContextMenu) return;
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const closeContextMenu = () => {
    setContextMenu(null);
  };

  // Event to trigger refresh in child components
  const triggerRefresh = () => {
    window.dispatchEvent(new CustomEvent('workzone-refresh'));
  };

  return (
    <div className="flex h-screen bg-dark-100 dark:bg-[#222222]">
      {/* Sidebar */}
      <div
        className={cn(
          'transition-all duration-300 ease-in-out',
          sidebarOpen ? 'w-48' : 'w-0'
        )}
      >
        <Sidebar />
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <Header />

        {/* Content area */}
        <div className="flex-1 flex flex-col overflow-hidden p-3 pt-0 gap-3">
          {/* Top bar: Toggle + Breadcrumb */}
          <div className="flex items-center gap-3">
            {/* Sidebar toggle - separate circle */}
            <button
              onClick={toggleSidebar}
              className="w-11 h-11 flex items-center justify-center bg-white dark:bg-[#222222] text-dark-500 dark:text-white/70 hover:text-dark-900 dark:hover:text-white hover:bg-dark-100 dark:hover:bg-white/10 rounded-full border border-dark-200 dark:border-[#2a2a2a] shadow-sm transition-colors"
              title={sidebarOpen ? 'Ocultar sidebar' : 'Mostrar sidebar'}
            >
              {sidebarOpen ? (
                <PanelLeftClose className="w-5 h-5" />
              ) : (
                <PanelLeft className="w-5 h-5" />
              )}
            </button>

            {/* Breadcrumb bar */}
            <div className="flex-1 h-11 flex items-center justify-between pl-2 pr-1 bg-white dark:bg-[#121212] rounded-full shadow-sm border border-dark-200 dark:border-[#2a2a2a]">
              {/* Settings title */}
              {isSettingsPage ? (
                <div className="flex items-center gap-2 ml-2">
                  <Settings className="w-5 h-5 text-[#FF3B3B]" />
                  <span className="text-base font-semibold text-dark-900 dark:text-white">Configuración</span>
                </div>
              ) : isAdminPage ? (
                <div className="flex items-center gap-2 ml-2">
                  <ShieldCheck className="w-5 h-5 text-[#FF3B3B]" />
                  <span className="text-base font-semibold text-dark-900 dark:text-white">Administración</span>
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
                    Mis compartidos
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
                    Compartidos conmigo
                  </button>
                </div>
              ) : isTrashPage ? (
                <>
                  <div className="flex items-center gap-2 ml-2">
                    <Trash2 className="w-5 h-5 text-red-500" />
                    <span className="text-base font-semibold text-dark-900 dark:text-white">Papelera</span>
                  </div>
                  <button
                    onClick={() => window.dispatchEvent(new CustomEvent('empty-trash'))}
                    className="h-7 px-3 mr-1 flex items-center gap-2 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Vaciar papelera
                  </button>
                </>
              ) : isFavoritesPage ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => navigate('/files')}
                    className="p-1.5 rounded-full hover:bg-dark-100 dark:hover:bg-white/10 transition-colors"
                    aria-label="Volver a archivos"
                  >
                    <ArrowLeft className="w-5 h-5 text-dark-500" />
                  </button>
                  <Star className="w-5 h-5 text-yellow-500" />
                  <span className="text-base font-semibold text-dark-900 dark:text-white">Favoritos</span>
                </div>
              ) : isAlbumDetailPage && currentAlbum ? (
                <>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => navigate('/albums')}
                      className="p-1.5 rounded-full hover:bg-dark-100 dark:hover:bg-white/10 transition-colors"
                      aria-label="Volver a álbumes"
                    >
                      <ArrowLeft className="w-5 h-5 text-dark-500" />
                    </button>
                    <div className="flex items-center gap-2">
                      <FolderOpen className="w-5 h-5 text-primary-500" />
                      <span className="text-base font-semibold text-dark-900 dark:text-white">{currentAlbum.name}</span>
                      <span className="text-sm text-dark-500">• {albumPhotoCount} fotos</span>
                    </div>
                  </div>
                  <button
                    onClick={() => window.dispatchEvent(new CustomEvent('add-photos-to-album'))}
                    className="h-7 px-3 mr-1 flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-full transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Añadir fotos
                  </button>
                </>
              ) : isMusicPage ? (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => navigate('/music?tab=all')}
                    className={cn(
                      'h-8 px-4 rounded-full text-base font-semibold transition-all duration-200 flex items-center justify-center gap-3 leading-none border border-transparent',
                      musicTab === 'all'
                        ? 'bg-primary-500/15 text-dark-900 dark:text-white border-primary-500/40 shadow-sm'
                        : 'text-dark-600 dark:text-white/80 hover:text-dark-900 dark:hover:text-white hover:bg-dark-100 dark:hover:bg-white/5'
                    )}
                    aria-label="Ver toda la música"
                  >
                    <Music className="w-5 h-5" />
                    Todo
                  </button>
                  <button
                    onClick={() => navigate('/music?tab=favorites')}
                    className={cn(
                      'h-8 px-4 rounded-full text-base font-semibold transition-all duration-200 flex items-center justify-center gap-3 leading-none border border-transparent',
                      musicTab === 'favorites'
                        ? 'bg-primary-500/15 text-dark-900 dark:text-white border-primary-500/40 shadow-sm'
                        : 'text-dark-600 dark:text-white/80 hover:text-dark-900 dark:hover:text-white hover:bg-dark-100 dark:hover:bg-white/5'
                    )}
                    aria-label="Ver música favorita"
                  >
                    <Star className="w-5 h-5" />
                    Favoritos
                  </button>
                  <button
                    onClick={() => navigate('/music?tab=albums')}
                    className={cn(
                      'h-8 px-4 rounded-full text-base font-semibold transition-all duration-200 flex items-center justify-center gap-3 leading-none border border-transparent',
                      musicTab === 'albums'
                        ? 'bg-primary-500/15 text-dark-900 dark:text-white border-primary-500/40 shadow-sm'
                        : 'text-dark-600 dark:text-white/80 hover:text-dark-900 dark:hover:text-white hover:bg-dark-100 dark:hover:bg-white/5'
                    )}
                    aria-label="Ver álbumes de música"
                  >
                    <Disc className="w-5 h-5" />
                    Álbumes
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
                    aria-label="Ver todas las fotos"
                  >
                    <Image className="w-5 h-5" />
                    Todo
                  </button>
                  <button
                    onClick={() => navigate('/photos?tab=favorites')}
                    className={cn(
                      'h-8 px-4 rounded-full text-base font-semibold transition-all duration-200 flex items-center justify-center gap-3 leading-none border border-transparent',
                      isPhotosPage && photosTab === 'favorites'
                        ? 'bg-primary-500/15 text-dark-900 dark:text-white border-primary-500/40 shadow-sm'
                        : 'text-dark-600 dark:text-white/80 hover:text-dark-900 dark:hover:text-white hover:bg-dark-100 dark:hover:bg-white/5'
                    )}
                    aria-label="Ver fotos favoritas"
                  >
                    <Star className="w-5 h-5" />
                    Favoritos
                  </button>
                  <button
                    onClick={() => navigate('/photos?tab=videos')}
                    className={cn(
                      'h-8 px-4 rounded-full text-base font-semibold transition-all duration-200 flex items-center justify-center gap-3 leading-none border border-transparent',
                      isPhotosPage && photosTab === 'videos'
                        ? 'bg-primary-500/15 text-dark-900 dark:text-white border-primary-500/40 shadow-sm'
                        : 'text-dark-600 dark:text-white/80 hover:text-dark-900 dark:hover:text-white hover:bg-dark-100 dark:hover:bg-white/5'
                    )}
                    aria-label="Ver videos"
                  >
                    <Video className="w-5 h-5" />
                    Videos
                  </button>
                  <button
                    onClick={() => navigate('/photos?tab=screenshots')}
                    className={cn(
                      'h-8 px-4 rounded-full text-base font-semibold transition-all duration-200 flex items-center justify-center gap-3 leading-none border border-transparent',
                      isPhotosPage && photosTab === 'screenshots'
                        ? 'bg-primary-500/15 text-dark-900 dark:text-white border-primary-500/40 shadow-sm'
                        : 'text-dark-600 dark:text-white/80 hover:text-dark-900 dark:hover:text-white hover:bg-dark-100 dark:hover:bg-white/5'
                    )}
                    aria-label="Ver capturas de pantalla"
                  >
                    <Camera className="w-5 h-5" />
                    Capturas
                  </button>
                  <button
                    onClick={() => navigate('/albums')}
                    className={cn(
                      'h-8 px-4 rounded-full text-base font-semibold transition-all duration-200 flex items-center justify-center gap-3 leading-none border border-transparent',
                      isAlbumsPage
                        ? 'bg-primary-500/15 text-dark-900 dark:text-white border-primary-500/40 shadow-sm'
                        : 'text-dark-600 dark:text-white/80 hover:text-dark-900 dark:hover:text-white hover:bg-dark-100 dark:hover:bg-white/5'
                    )}
                    aria-label="Ver álbumes"
                  >
                    <FolderOpen className="w-5 h-5" />
                    Álbumes
                  </button>
                </div>
                {isAlbumsPage && (
                  <button
                    onClick={() => window.dispatchEvent(new CustomEvent('create-album'))}
                    className="h-7 px-3 mr-1 flex items-center gap-2 text-sm font-medium text-primary-600 hover:text-primary-700 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-full transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Nuevo álbum
                  </button>
                )}
                </>
              ) : showBreadcrumbs ? (
                <div className="flex items-center gap-1 overflow-x-auto">
                  <button
                    onClick={() => navigate('/files')}
                    className="flex items-center gap-1 px-2 py-1 text-sm font-medium text-dark-600 dark:text-white/80 hover:text-dark-900 dark:hover:text-white hover:bg-dark-100 dark:hover:bg-white/5 rounded-lg transition-colors"
                    aria-label="Ir a la raíz de archivos"
                  >
                    <Home className="w-4 h-4" />
                    <span>Inicio</span>
                  </button>
                  {breadcrumbs.map((crumb, index) => (
                    <Fragment key={`${crumb.id}-${index}`}>
                      <ChevronRight className="w-4 h-4 text-dark-400 mx-1" />
                      <button
                        onClick={() => navigate(`/files?folder=${crumb.id}`)}
                        className={cn(
                          'px-2 py-1 text-sm font-medium rounded-lg transition-colors truncate max-w-32',
                          index === breadcrumbs.length - 1
                            ? 'text-dark-900 dark:text-white bg-dark-100 dark:bg-white/10'
                            : 'text-dark-600 dark:text-white/80 hover:text-dark-900 dark:hover:text-white hover:bg-dark-100 dark:hover:bg-white/5'
                        )}
                        aria-label={`Ir a carpeta ${crumb.name}`}
                      >
                        {crumb.name}
                      </button>
                    </Fragment>
                  ))}
                </div>
              ) : (
                showViewControls ? (
                  <>
                    <div className="flex-1" />
                    <div className="flex items-center gap-1">
                      {/* Sort dropdown */}
                      <Dropdown
                        trigger={
                          <button className="h-7 flex items-center justify-center gap-2 px-3 text-sm font-medium text-dark-600 dark:text-white/80 hover:text-dark-900 dark:hover:text-white hover:bg-dark-100 dark:hover:bg-white/5 rounded-full transition-colors border border-transparent">
                            {sortOrder === 'asc' ? (
                              <SortAsc className="w-4 h-4" />
                            ) : (
                              <SortDesc className="w-4 h-4" />
                            )}
                            <span className="hidden sm:inline">{currentSort?.label || 'Ordenar'}</span>
                          </button>
                        }
                        align="right"
                      >
                        <div>
                          {sortOptions.map((option) => (
                            <DropdownItem
                              key={option.value}
                              onClick={() => setSortBy(option.value as any)}
                            >
                              {option.label}
                              {sortBy === option.value && (
                                <Check className="w-4 h-4 ml-auto text-primary-600" />
                              )}
                            </DropdownItem>
                          ))}
                          <DropdownDivider />
                          <DropdownItem onClick={() => setSortOrder('asc')}>
                            <SortAsc className="w-4 h-4" /> Ascendente
                            {sortOrder === 'asc' && (
                              <Check className="w-4 h-4 ml-auto text-primary-600" />
                            )}
                          </DropdownItem>
                          <DropdownItem onClick={() => setSortOrder('desc')}>
                            <SortDesc className="w-4 h-4" /> Descendente
                            {sortOrder === 'desc' && (
                              <Check className="w-4 h-4 ml-auto text-primary-600" />
                            )}
                          </DropdownItem>
                        </div>
                      </Dropdown>

                      {/* View toggle */}
                      <div className="flex items-center bg-dark-100 dark:bg-[#222222] border border-dark-200 dark:border-[#2a2a2a] rounded-full p-0.5">
                        <button
                          onClick={() => setViewMode('grid')}
                            className={cn(
                            'p-1.5 rounded-full transition-colors flex items-center justify-center',
                            viewMode === 'grid'
                              ? 'bg-white dark:bg-white/10 text-dark-900 dark:text-white shadow-sm'
                              : 'text-dark-500 dark:text-white/70 hover:text-dark-900 dark:hover:text-white hover:bg-dark-200 dark:hover:bg-white/5'
                          )}
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
                        >
                          <List className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </>
                ) : null
              )}
            </div>
          </div>

          {/* Main workzone - separated */}
          <div 
            className={cn(
              "bg-white dark:bg-[#121212] rounded-2xl flex-1 flex flex-col overflow-hidden border border-dark-200 dark:border-[#2a2a2a] shadow-sm transition-opacity duration-200 relative select-none",
              isDragging && "opacity-50"
            )}
            onContextMenu={handleContextMenu}
            onClick={closeContextMenu}
          >
            <main 
              ref={workzoneRef}
              className="flex-1 overflow-y-auto overflow-x-hidden p-4 relative"
              onMouseDown={handleMarqueeMouseDown}
              onMouseMove={handleMarqueeMouseMove}
              onMouseUp={handleMarqueeMouseUp}
            >
              <Outlet />

              {/* Marquee selection rectangle */}
              {marqueeRect && marqueeRect.width > 5 && marqueeRect.height > 5 && (
                <div
                  className="absolute pointer-events-none z-40 border-2 rounded-lg"
                  style={{
                    left: marqueeRect.left,
                    top: marqueeRect.top,
                    width: marqueeRect.width,
                    height: marqueeRect.height,
                    backgroundColor: hexToRgba(accentColor, 0.15),
                    borderColor: hexToRgba(accentColor, 0.5),
                  }}
                />
              )}
            </main>

            {/* Context Menu */}
            {contextMenu && (() => {
              const menuWidth = 200;
              const menuHeight = 100;
              const padding = 16;
              
              let left = contextMenu.x;
              let top = contextMenu.y;
              
              if (left + menuWidth > window.innerWidth - padding) {
                left = contextMenu.x - menuWidth;
              }
              if (top + menuHeight > window.innerHeight - padding) {
                top = contextMenu.y - menuHeight;
              }
              if (left < padding) left = padding;
              if (top < padding) top = padding;
              
              return (
              <div
                className="fixed z-50 bg-white dark:bg-dark-800 rounded-xl shadow-lg border border-dark-100 dark:border-dark-700 py-1 min-w-48"
                style={{ left, top }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setUploadModalOpen(true);
                    closeContextMenu();
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm text-dark-700 dark:text-dark-300 hover:bg-dark-50 dark:hover:bg-dark-700"
                >
                  <Upload className="w-4 h-4 text-dark-400" />
                  Subir archivos
                </button>
                {isFilesPage && (
                  <button
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setCreateFolderModalOpen(true);
                      closeContextMenu();
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-dark-700 dark:text-dark-300 hover:bg-dark-50 dark:hover:bg-dark-700"
                  >
                    <FolderPlus className="w-4 h-4 text-dark-400" />
                    Crear carpeta
                  </button>
                )}
              </div>
              );
            })()}
          </div>
        </div>
      </div>
      <UploadProgress />

      {/* Drag and Drop Overlay */}
      {isDragging && (
        <div className="fixed inset-0 z-[100] pointer-events-none flex items-end justify-center pb-8">
          <div className="bg-dark-900/80 dark:bg-white/90 backdrop-blur-sm rounded-full px-6 py-3 shadow-lg flex items-center gap-3">
            <Upload className="w-5 h-5 text-white dark:text-dark-900" />
            <span className="text-sm font-medium text-white dark:text-dark-900">
              Suelta para subir
            </span>
          </div>
        </div>
      )}

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
    </div>
  );
}
