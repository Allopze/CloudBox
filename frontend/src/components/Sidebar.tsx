import { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';
import { useThemeStore } from '../stores/themeStore';
import { useBrandingStore } from '../stores/brandingStore';
import { useSidebarStore, NavItem } from '../stores/sidebarStore';
import { useDragDropStore, fileMatchesCategory, getCategoryFromPath } from '../stores/dragDropStore';
import { useFileStore } from '../stores/fileStore';
import { cn, formatBytes } from '../lib/utils';
import { api } from '../lib/api';
import { toast } from './ui/Toast';
import { motion, AnimatePresence } from 'framer-motion';
import { FileItem, Folder } from '../types';
import {
  LayoutDashboard,
  FolderOpen,
  FileText,
  Image,
  Music,
  Users,
  Trash2,
  Settings,
} from 'lucide-react';

// Icon mapping
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard,
  FolderOpen,
  FileText,
  Image,
  Music,
  Users,
  Trash2,
  Settings,
};

export default function Sidebar() {
  const { user, refreshUser } = useAuthStore();
  const { sidebarOpen } = useUIStore();
  const { isDark } = useThemeStore();
  const { branding } = useBrandingStore();
  const { navItems, bottomNavItems, setNavItems, setBottomNavItems } = useSidebarStore();
  const { isDragging: isFileDragging, draggedItems: fileDraggedItems, endDrag: endFileDrag } = useDragDropStore();
  const navigate = useNavigate();

  const [draggedItem, setDraggedItem] = useState<NavItem | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dragSection, setDragSection] = useState<'main' | 'bottom' | null>(null);
  const [dropTargetSection, setDropTargetSection] = useState<'main' | 'bottom' | null>(null);
  const [dropPosition, setDropPosition] = useState<'before' | 'after'>('before');
  const [dragPosition, setDragPosition] = useState({ x: 0, y: 0 });
  const [fileDropTarget, setFileDropTarget] = useState<string | null>(null);
  const dragImageRef = useRef<HTMLDivElement>(null);
  
  // Context menu for Trash
  const [trashContextMenu, setTrashContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [emptyingTrash, setEmptyingTrash] = useState(false);
  const trashContextMenuRef = useRef<HTMLDivElement>(null);

  // Close trash context menu on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (trashContextMenuRef.current && !trashContextMenuRef.current.contains(e.target as Node)) {
        setTrashContextMenu(null);
      }
    };
    if (trashContextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [trashContextMenu]);

  const handleEmptyTrash = async () => {
    setTrashContextMenu(null);
    setEmptyingTrash(true);
    try {
      await api.delete('/trash/empty');
      toast('Papelera vaciada correctamente', 'success');
      window.dispatchEvent(new CustomEvent('workzone-refresh'));
      refreshUser(); // Update storage info in sidebar
    } catch {
      toast('Error al vaciar la papelera', 'error');
    } finally {
      setEmptyingTrash(false);
    }
  };

  const storageUsedPercent = user && parseInt(user.storageQuota) > 0
    ? Math.round(
        (parseInt(user.storageUsed) / parseInt(user.storageQuota)) * 100
      )
    : 0;

  const handleDragStart = (e: React.DragEvent, item: NavItem, section: 'main' | 'bottom') => {
    setDraggedItem(item);
    setDragSection(section);
    e.dataTransfer.effectAllowed = 'move';
    // Hide default drag image
    const emptyImg = document.createElement('img');
    emptyImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    e.dataTransfer.setDragImage(emptyImg, 0, 0);
  };

  const handleDrag = (e: React.DragEvent) => {
    if (e.clientX !== 0 || e.clientY !== 0) {
      setDragPosition({ x: e.clientX, y: e.clientY });
    }
  };

  const handleDragOver = (e: React.DragEvent, index: number, section: 'main' | 'bottom') => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const midPoint = rect.top + rect.height / 2;
    const position = e.clientY < midPoint ? 'before' : 'after';
    
    setDragOverIndex(index);
    setDropTargetSection(section);
    setDropPosition(position);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setDragOverIndex(null);
    setDragSection(null);
    setDropTargetSection(null);
    setDropPosition('before');
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number, targetSection: 'main' | 'bottom') => {
    e.preventDefault();
    if (!draggedItem || !dragSection) return;

    const sourceItems = dragSection === 'main' ? [...navItems] : [...bottomNavItems];
    const targetItems = targetSection === 'main' ? [...navItems] : [...bottomNavItems];
    
    const sourceIndex = sourceItems.findIndex(item => item.id === draggedItem.id);
    
    // Calculate actual insert index based on drop position
    let insertIndex = dropPosition === 'after' ? targetIndex + 1 : targetIndex;
    
    if (dragSection === targetSection) {
      // Reorder within same section
      sourceItems.splice(sourceIndex, 1);
      // Adjust index if we removed an item before the insert position
      if (sourceIndex < insertIndex) {
        insertIndex--;
      }
      sourceItems.splice(insertIndex, 0, draggedItem);
      
      if (targetSection === 'main') {
        setNavItems(sourceItems);
      } else {
        setBottomNavItems(sourceItems);
      }
    } else {
      // Move between sections
      sourceItems.splice(sourceIndex, 1);
      targetItems.splice(insertIndex, 0, draggedItem);
      
      if (dragSection === 'main') {
        setNavItems(sourceItems);
        setBottomNavItems(targetItems);
      } else {
        setBottomNavItems(sourceItems);
        setNavItems(targetItems);
      }
    }

    handleDragEnd();
  };

  // Handle file/folder drops on sidebar categories
  const handleFileDragOver = (e: React.DragEvent, path: string) => {
    if (!isFileDragging) return;
    
    const category = getCategoryFromPath(path);
    if (!category) return;
    
    // Check if any of the dragged items can be dropped here
    const canDrop = fileDraggedItems.some(item => {
      if (item.type === 'folder') return category === 'files'; // Only Files accepts folders
      return fileMatchesCategory(item.item as FileItem, category);
    });
    
    if (canDrop) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setFileDropTarget(path);
    }
  };

  const handleFileDragLeave = () => {
    setFileDropTarget(null);
  };

  const handleFileDrop = async (e: React.DragEvent, path: string) => {
    e.preventDefault();
    setFileDropTarget(null);
    
    if (!isFileDragging || fileDraggedItems.length === 0) return;
    
    const category = getCategoryFromPath(path);
    if (!category) return;
    
    const itemsToMove = fileDraggedItems;
    endFileDrag();
    
    // Filter items that match the category
    const validItems = itemsToMove.filter(item => {
      if (item.type === 'folder') return category === 'files';
      return fileMatchesCategory(item.item as FileItem, category);
    });
    
    if (validItems.length === 0) {
      toast('Los elementos seleccionados no son compatibles con esta categoría', 'error');
      return;
    }
    
    const clearSelectionFn = useFileStore.getState().clearSelection;
    
    try {
      // Move items to root folder (null) when dropping on category
      for (const dragItem of validItems) {
        if (dragItem.type === 'file') {
          // Only move if not already in root
          if ((dragItem.item as FileItem).folderId !== null) {
            await api.patch(`/files/${dragItem.item.id}/move`, { folderId: null });
          }
        } else {
          // Only move if not already in root
          if ((dragItem.item as Folder).parentId !== null) {
            await api.patch(`/folders/${dragItem.item.id}/move`, { parentId: null });
          }
        }
      }
      
      const categoryNames: Record<string, string> = {
        'files': 'Archivos',
        'photos': 'Fotos',
        'music': 'Música',
        'documents': 'Documentos',
      };
      
      toast(`${validItems.length} elemento(s) movido(s) a ${categoryNames[category] || category}`, 'success');
      clearSelectionFn();
      window.dispatchEvent(new CustomEvent('workzone-refresh'));
      
      // Navigate to the category
      navigate(path);
    } catch (error: any) {
      toast(error.response?.data?.error || 'Error al mover elementos', 'error');
    }
  };

  const renderNavItem = (item: NavItem, index: number, section: 'main' | 'bottom') => {
    const IconComponent = iconMap[item.icon];
    const isDragging = draggedItem?.id === item.id;
    const isDropTarget = dragOverIndex === index && dropTargetSection === section;
    const showDropBefore = isDropTarget && dropPosition === 'before';
    const showDropAfter = isDropTarget && dropPosition === 'after';
    const isTrash = item.path === '/trash';
    const isFileDropTarget = fileDropTarget === item.path;
    
    // Check if this nav item can accept file drops
    const category = getCategoryFromPath(item.path);
    const canAcceptFileDrop = isFileDragging && category && fileDraggedItems.some(dragItem => {
      if (dragItem.type === 'folder') return category === 'files';
      return fileMatchesCategory(dragItem.item as FileItem, category);
    });

    const handleContextMenu = (e: React.MouseEvent) => {
      if (isTrash) {
        e.preventDefault();
        setTrashContextMenu({ x: e.clientX, y: e.clientY });
      }
    };

    return (
      <div
        key={item.id}
        draggable={!isFileDragging}
        onDragStart={(e) => !isFileDragging && handleDragStart(e, item, section)}
        onDrag={(e) => !isFileDragging && handleDrag(e)}
        onDragOver={(e) => {
          if (isFileDragging) {
            handleFileDragOver(e, item.path);
          } else {
            handleDragOver(e, index, section);
          }
        }}
        onDragLeave={(e) => {
          if (isFileDragging) {
            handleFileDragLeave();
          }
        }}
        onDragEnd={() => !isFileDragging && handleDragEnd()}
        onDrop={(e) => {
          if (isFileDragging) {
            handleFileDrop(e, item.path);
          } else {
            handleDrop(e, index, section);
          }
        }}
        onContextMenu={handleContextMenu}
        className={cn(
          'relative group',
          isDragging && 'opacity-30'
        )}
      >
        {showDropBefore && !isFileDragging && (
          <div className="absolute inset-x-2 -top-0.5 h-0.5 bg-primary-500 rounded-full z-10" />
        )}
        {showDropAfter && !isFileDragging && (
          <div className="absolute inset-x-2 -bottom-0.5 h-0.5 bg-primary-500 rounded-full z-10" />
        )}
        <NavLink
          to={item.path}
          draggable={false}
          onClick={(e) => draggedItem && e.preventDefault()}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 px-4 py-3 rounded-full text-base font-semibold transition-colors border border-transparent',
              isActive
                ? 'bg-primary-500/15 text-primary-600 dark:text-primary-400 border-primary-500/25'
                : 'text-dark-600 dark:text-white/80 hover:text-dark-900 dark:hover:text-white hover:bg-white dark:hover:bg-[#121212]',
              isFileDropTarget && canAcceptFileDrop && 'bg-primary-500/20 border-primary-500 ring-2 ring-primary-500/50'
            )
          }
          end={item.path === '/'}
        >
          {IconComponent && <IconComponent className="w-5 h-5 flex-shrink-0" />}
          <span>{item.label}</span>
        </NavLink>
      </div>
    );
  };

  // Drag preview card rendered via portal
  const renderDragPreview = () => {
    if (!draggedItem) return null;
    const IconComponent = iconMap[draggedItem.icon];
    
    return createPortal(
      <div
        ref={dragImageRef}
        className="fixed pointer-events-none z-[9999] transition-none"
        style={{
          left: dragPosition.x - 80,
          top: dragPosition.y - 20,
        }}
      >
        <div className="flex items-center gap-3 px-4 py-3 rounded-full text-base font-semibold bg-primary-500/15 text-primary-600 dark:text-primary-400 border border-primary-500/25 shadow-lg backdrop-blur-sm">
          {IconComponent && <IconComponent className="w-5 h-5 flex-shrink-0" />}
          <span>{draggedItem.label}</span>
        </div>
      </div>,
      document.body
    );
  };

  // Trash context menu rendered via portal
  const renderTrashContextMenu = () => {
    if (!trashContextMenu) return null;
    
    return createPortal(
      <AnimatePresence>
        <motion.div
          ref={trashContextMenuRef}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.1 }}
          className="fixed z-[9999] min-w-[180px] bg-white dark:bg-dark-800 rounded-xl shadow-lg border border-dark-200 dark:border-dark-700 py-1 overflow-hidden"
          style={{ top: trashContextMenu.y, left: trashContextMenu.x }}
        >
          <button
            onClick={handleEmptyTrash}
            disabled={emptyingTrash}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            {emptyingTrash ? 'Vaciando...' : 'Vaciar papelera'}
          </button>
        </motion.div>
      </AnimatePresence>,
      document.body
    );
  };

  return (
    <>
      {renderDragPreview()}
      {renderTrashContextMenu()}
      <aside
        className={cn(
          'w-48 bg-dark-100 dark:bg-[#222222] text-dark-900 dark:text-white flex flex-col h-screen overflow-hidden transition-all duration-300',
          !sidebarOpen && 'w-0 opacity-0'
        )}
      >
        {/* Logo */}
        <div className="h-14 px-3 flex items-center justify-center flex-shrink-0">
          {((isDark ? branding.logoDarkUrl : branding.logoLightUrl) || branding.logoUrl) ? (
            <img
              src={(isDark ? branding.logoDarkUrl : branding.logoLightUrl) || branding.logoUrl}
              alt="Logo"
              className="h-10 object-contain"
            />
          ) : (
            <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/>
              </svg>
            </div>
          )}
        </div>

        {/* Main Navigation */}
        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto mt-10">
          {navItems.map((item, index) => renderNavItem(item, index, 'main'))}
        </nav>

        {/* Bottom Navigation */}
        <div className="px-3 py-2 space-y-1">
          {bottomNavItems.map((item, index) => renderNavItem(item, index, 'bottom'))}
        </div>

        {/* Storage info */}
        <div className="p-4 border-t border-dark-200 dark:border-[#2a2a2a]">
          <p className="text-xs text-dark-500 dark:text-white/70 mb-2">Almacenamiento</p>
          <div className="w-full h-1.5 bg-dark-200 dark:bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary-500 rounded-full transition-all"
              style={{ width: `${Math.min(storageUsedPercent, 100)}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-dark-500 dark:text-white/70">
            {formatBytes(user?.storageUsed || 0)} / {formatBytes(user?.storageQuota || 0)}
          </p>
        </div>
      </aside>
    </>
  );
}
