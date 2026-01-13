import { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate, useLocation, useSearchParams, Link } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { DragOverlay, useDndMonitor, useDraggable, useDroppable } from '@dnd-kit/core';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';
import { useThemeStore } from '../stores/themeStore';
import { useBrandingStore } from '../stores/brandingStore';
import { useSidebarStore, NavItem, AdminNavItem } from '../stores/sidebarStore';
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
  Mail,
  Palette,
  FileType,
  Activity,
  ArrowLeft,
  HardDrive,
  Layers,
  FilePen,
} from 'lucide-react';
import MobileDrawer from './ui/MobileDrawer';

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
  Mail,
  Palette,
  FileType,
  Activity,
  ArrowLeft,
  HardDrive,
  Layers,
  FilePen,
};

// Admin section type
export type AdminSection = 'overview' | 'users' | 'settings' | 'wopi' | 'queues' | 'email' | 'branding' | 'file-icons' | 'legal' | 'activity' | 'storage-requests';

interface SidebarProps {
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}

export default function Sidebar({ mobileOpen, setMobileOpen }: SidebarProps) {
  const { t } = useTranslation();
  const { user, refreshUser } = useAuthStore();
  const { sidebarOpen } = useUIStore();
  const { isDark } = useThemeStore();
  const { branding } = useBrandingStore();
  const { navItems, bottomNavItems, adminNavItems, setNavItems, setBottomNavItems, setAdminNavItems } = useSidebarStore();
  const { isDragging: isFileDragging, draggedItems: fileDraggedItems, endDrag: endFileDrag } = useDragDropStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  // Detect admin section - when path starts with /admin
  const isAdminPage = location.pathname.startsWith('/admin');
  const activeAdminSection = (searchParams.get('section') as AdminSection) || 'overview';

  const [activeDrag, setActiveDrag] = useState<{ type: 'nav' | 'admin'; item: NavItem | AdminNavItem } | null>(null);
  const [dropIndicator, setDropIndicator] = useState<{ type: 'nav' | 'admin'; overId: string; position: 'before' | 'after'; section?: 'main' | 'bottom' } | null>(null);
  const [fileDropTarget, setFileDropTarget] = useState<string | null>(null);

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
      toast(t('sidebar.trashEmptied'), 'success');
      window.dispatchEvent(new CustomEvent('workzone-refresh'));
      refreshUser(); // Update storage info in sidebar
    } catch {
      toast(t('sidebar.trashEmptyError'), 'error');
    } finally {
      setEmptyingTrash(false);
    }
  };

  const storageUsedPercent = user && parseInt(user.storageQuota) > 0
    ? Math.round(
      (parseInt(user.storageUsed) / parseInt(user.storageQuota)) * 100
    )
    : 0;

  const getDropPosition = (
    activeRect?: { top: number; height: number } | null,
    overRect?: { top: number; height: number } | null
  ) => {
    if (!activeRect || !overRect) return 'after';
    const activeCenter = activeRect.top + activeRect.height / 2;
    const overCenter = overRect.top + overRect.height / 2;
    return activeCenter < overCenter ? 'before' : 'after';
  };

  const resetDragState = () => {
    setActiveDrag(null);
    setDropIndicator(null);
  };

  useDndMonitor({
    onDragStart: ({ active }) => {
      const activeData = active.data.current as { type?: string; section?: 'main' | 'bottom' } | undefined;

      if (activeData?.type === 'sidebar-nav') {
        const sourceItems = activeData.section === 'bottom' ? bottomNavItems : navItems;
        const item = sourceItems.find((navItem) => navItem.id === active.id);
        if (item) {
          setActiveDrag({ type: 'nav', item });
        }
        return;
      }

      if (activeData?.type === 'sidebar-admin') {
        const item = adminNavItems.find((navItem) => navItem.id === active.id);
        if (item) {
          setActiveDrag({ type: 'admin', item });
        }
        return;
      }

      if (activeDrag) {
        resetDragState();
      }
    },
    onDragOver: ({ active, over }) => {
      if (!over) {
        if (dropIndicator) setDropIndicator(null);
        return;
      }

      const activeData = active.data.current as { type?: string; section?: 'main' | 'bottom' } | undefined;
      const overData = over.data.current as { type?: string; section?: 'main' | 'bottom' } | undefined;

      if (activeData?.type === 'sidebar-nav' && overData?.type === 'sidebar-nav') {
        if (active.id === over.id) {
          if (dropIndicator) setDropIndicator(null);
          return;
        }

        const position = getDropPosition(active.rect.current.translated, over.rect);
        const nextIndicator = {
          type: 'nav' as const,
          overId: String(over.id),
          position: position as 'before' | 'after',
          section: overData.section,
        };

        if (
          !dropIndicator ||
          dropIndicator.type !== nextIndicator.type ||
          dropIndicator.overId !== nextIndicator.overId ||
          dropIndicator.position !== nextIndicator.position ||
          dropIndicator.section !== nextIndicator.section
        ) {
          setDropIndicator(nextIndicator);
        }
        return;
      }

      if (activeData?.type === 'sidebar-admin' && overData?.type === 'sidebar-admin') {
        if (active.id === over.id) {
          if (dropIndicator) setDropIndicator(null);
          return;
        }

        const position = getDropPosition(active.rect.current.translated, over.rect);
        const nextIndicator = {
          type: 'admin' as const,
          overId: String(over.id),
          position: position as 'before' | 'after',
        };

        if (
          !dropIndicator ||
          dropIndicator.type !== nextIndicator.type ||
          dropIndicator.overId !== nextIndicator.overId ||
          dropIndicator.position !== nextIndicator.position
        ) {
          setDropIndicator(nextIndicator);
        }
        return;
      }

      if (dropIndicator) setDropIndicator(null);
    },
    onDragEnd: ({ active, over }) => {
      const activeData = active.data.current as { type?: string; section?: 'main' | 'bottom' } | undefined;
      const overData = over?.data.current as { type?: string; section?: 'main' | 'bottom' } | undefined;

      if (!over || !activeData || !overData) {
        resetDragState();
        return;
      }

      if (activeData.type === 'sidebar-nav' && overData.type === 'sidebar-nav') {
        if (active.id === over.id) {
          resetDragState();
          return;
        }

        const sourceSection = activeData.section;
        const targetSection = overData.section;

        if (!sourceSection || !targetSection) {
          resetDragState();
          return;
        }

        const sourceItems = sourceSection === 'main' ? [...navItems] : [...bottomNavItems];
        const targetItems = targetSection === 'main' ? [...navItems] : [...bottomNavItems];

        const sourceIndex = sourceItems.findIndex((item) => item.id === active.id);
        const targetIndex = targetItems.findIndex((item) => item.id === over.id);

        if (sourceIndex === -1 || targetIndex === -1) {
          resetDragState();
          return;
        }

        const position = getDropPosition(active.rect.current.translated, over.rect);
        let insertIndex = position === 'after' ? targetIndex + 1 : targetIndex;
        const [movedItem] = sourceItems.splice(sourceIndex, 1);

        if (sourceSection === targetSection) {
          if (sourceIndex < insertIndex) {
            insertIndex--;
          }
          sourceItems.splice(insertIndex, 0, movedItem);

          if (targetSection === 'main') {
            setNavItems(sourceItems);
          } else {
            setBottomNavItems(sourceItems);
          }
        } else {
          targetItems.splice(insertIndex, 0, movedItem);

          if (sourceSection === 'main') {
            setNavItems(sourceItems);
            setBottomNavItems(targetItems);
          } else {
            setBottomNavItems(sourceItems);
            setNavItems(targetItems);
          }
        }

        resetDragState();
        return;
      }

      if (activeData.type === 'sidebar-admin' && overData.type === 'sidebar-admin') {
        if (active.id === over.id) {
          resetDragState();
          return;
        }

        const items = [...adminNavItems];
        const sourceIndex = items.findIndex((item) => item.id === active.id);
        const targetIndex = items.findIndex((item) => item.id === over.id);

        if (sourceIndex === -1 || targetIndex === -1) {
          resetDragState();
          return;
        }

        const position = getDropPosition(active.rect.current.translated, over.rect);
        let insertIndex = position === 'after' ? targetIndex + 1 : targetIndex;
        const [movedItem] = items.splice(sourceIndex, 1);

        if (sourceIndex < insertIndex) {
          insertIndex--;
        }
        items.splice(insertIndex, 0, movedItem);
        setAdminNavItems(items);

        resetDragState();
        return;
      }

      resetDragState();
    },
    onDragCancel: () => {
      resetDragState();
    },
  });

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
      toast(t('sidebar.incompatibleItems'), 'error');
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
        'files': t('sidebar.categories.files'),
        'photos': t('sidebar.categories.photos'),
        'music': t('sidebar.categories.music'),
        'documents': t('sidebar.categories.documents'),
      };

      toast(t('sidebar.movedTo', { count: validItems.length, category: categoryNames[category] || category }), 'success');
      clearSelectionFn();
      window.dispatchEvent(new CustomEvent('workzone-refresh'));

      // Navigate to the category
      navigate(path);
    } catch (error: any) {
      toast(error.response?.data?.error || 'Error al mover elementos', 'error');
    }
  };

  const isNavReordering = activeDrag?.type === 'nav';
  const isAdminReordering = activeDrag?.type === 'admin';

  const SidebarNavItem = ({ item, section }: { item: NavItem; section: 'main' | 'bottom' }) => {
    const IconComponent = iconMap[item.icon];
    const isTrash = item.path === '/trash';

    const { setNodeRef: setDroppableRef, isOver } = useDroppable({
      id: item.id,
      data: { type: 'sidebar-nav', section, fileDropTarget: isTrash ? 'trash' : undefined },
    });

    const { attributes, listeners, setNodeRef: setDraggableRef, isDragging } = useDraggable({
      id: item.id,
      data: { type: 'sidebar-nav', section },
      disabled: isFileDragging,
    });

    const setNodeRef = (node: HTMLElement | null) => {
      setDraggableRef(node);
      setDroppableRef(node);
    };

    const category = getCategoryFromPath(item.path);
    const canAcceptFileDrop = isFileDragging && (
      isTrash ||
      (category && fileDraggedItems.some(dragItem => {
        if (dragItem.type === 'folder') return category === 'files';
        return fileMatchesCategory(dragItem.item as FileItem, category);
      }))
    );
    const baseFileDropTarget = fileDropTarget === item.path;
    const fileDropActive = canAcceptFileDrop && (baseFileDropTarget || (isTrash && isOver));

    const isDropTarget = dropIndicator?.type === 'nav' && dropIndicator.overId === item.id && dropIndicator.section === section;
    const showDropBefore = isDropTarget && dropIndicator.position === 'before';
    const showDropAfter = isDropTarget && dropIndicator.position === 'after';

    const handleContextMenu = (e: React.MouseEvent) => {
      if (isTrash) {
        e.preventDefault();
        setTrashContextMenu({ x: e.clientX, y: e.clientY });
      }
    };

    return (
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        onDragOver={(e) => {
          if (isFileDragging) {
            handleFileDragOver(e, item.path);
          }
        }}
        onDragLeave={() => {
          if (isFileDragging) {
            handleFileDragLeave();
          }
        }}
        onDrop={(e) => {
          if (isFileDragging) {
            handleFileDrop(e, item.path);
          }
        }}
        onContextMenu={handleContextMenu}
        className={cn(
          'relative group',
          isDragging && 'opacity-30'
        )}
      >
        {showDropBefore && (
          <div className="absolute inset-x-2 -top-0.5 h-0.5 bg-primary-500 rounded-full z-10" />
        )}
        {showDropAfter && (
          <div className="absolute inset-x-2 -bottom-0.5 h-0.5 bg-primary-500 rounded-full z-10" />
        )}
        <NavLink
          to={item.path}
          draggable={false}
          onClick={(e) => isNavReordering && e.preventDefault()}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 px-4 py-3 rounded-full text-base font-semibold transition-colors border border-transparent',
              isActive
                ? 'bg-primary-500/15 text-primary-600 dark:text-primary-400 border-primary-500/25'
                : 'text-dark-600 dark:text-white/80 hover:text-dark-900 dark:hover:text-white hover:bg-white dark:hover:bg-dark-900',
              fileDropActive && 'bg-primary-500/20 border-primary-500 ring-2 ring-primary-500/50'
            )
          }
          end={item.path === '/'}
        >
          {IconComponent && <IconComponent className="w-5 h-5 flex-shrink-0" />}
          <span>{t(item.labelKey)}</span>
        </NavLink>
      </div>
    );
  };

  const SidebarAdminItem = ({ item }: { item: AdminNavItem }) => {
    const IconComponent = iconMap[item.icon];
    const isActive = activeAdminSection === item.id;

    const { setNodeRef: setDroppableRef } = useDroppable({
      id: item.id,
      data: { type: 'sidebar-admin' },
    });

    const { attributes, listeners, setNodeRef: setDraggableRef, isDragging } = useDraggable({
      id: item.id,
      data: { type: 'sidebar-admin' },
      disabled: isFileDragging,
    });

    const setNodeRef = (node: HTMLElement | null) => {
      setDraggableRef(node);
      setDroppableRef(node);
    };

    const isDropTarget = dropIndicator?.type === 'admin' && dropIndicator.overId === item.id;
    const showDropBefore = isDropTarget && dropIndicator.position === 'before';
    const showDropAfter = isDropTarget && dropIndicator.position === 'after';

    return (
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        className={cn(
          'relative group',
          isDragging && 'opacity-30'
        )}
      >
        {showDropBefore && (
          <div className="absolute inset-x-2 -top-0.5 h-0.5 bg-primary-500 rounded-full z-10" />
        )}
        {showDropAfter && (
          <div className="absolute inset-x-2 -bottom-0.5 h-0.5 bg-primary-500 rounded-full z-10" />
        )}
        <button
          onClick={() => !isAdminReordering && setSearchParams({ section: item.id })}
          className={cn(
            'w-full flex items-center gap-3 px-4 py-3 rounded-full text-base font-semibold transition-colors border border-transparent',
            isActive
              ? 'bg-primary-500/15 text-primary-600 dark:text-primary-400 border-primary-500/25'
              : 'text-dark-600 dark:text-white/80 hover:text-dark-900 dark:hover:text-white hover:bg-white dark:hover:bg-dark-900'
          )}
        >
          {IconComponent && <IconComponent className="w-5 h-5 flex-shrink-0" />}
          <span>{t(item.labelKey)}</span>
        </button>
      </div>
    );
  };

  const renderDragOverlay = () => {
    if (!activeDrag) return null;
    const IconComponent = iconMap[activeDrag.item.icon];

    return (
      <div className="pointer-events-none z-[9999]">
        <div className="flex items-center gap-3 px-4 py-3 rounded-full text-base font-semibold bg-primary-500/15 text-primary-600 dark:text-primary-400 border border-primary-500/25 shadow-lg backdrop-blur-sm">
          {IconComponent && <IconComponent className="w-5 h-5 flex-shrink-0" />}
          <span>{t(activeDrag.item.labelKey)}</span>
        </div>
      </div>
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
            {emptyingTrash ? t('sidebar.emptying') : t('sidebar.emptyTrash')}
          </button>
        </motion.div>
      </AnimatePresence>,
      document.body
    );
  };

  // Refactored Sidebar Content for reuse
  const SidebarContent = () => (
    <>
      {/* Logo */}
      <Link to="/files" className="h-20 px-3 flex items-center justify-center flex-shrink-0 cursor-pointer">
        {((isDark ? branding.logoDarkUrl : branding.logoLightUrl) || branding.logoUrl) ? (
          <img
            src={(isDark ? branding.logoDarkUrl : branding.logoLightUrl) || branding.logoUrl}
            alt="Logo"
            className="h-12 object-contain"
          />
        ) : (
          <div className="w-12 h-12 bg-primary-600 rounded-xl flex items-center justify-center">
            <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" />
            </svg>
          </div>
        )}
      </Link>

      {isAdminPage ? (
        <>
          {/* Admin Navigation */}
          <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto mt-10">
            {/* Admin section items */}
            {adminNavItems.map((item) => (
              <SidebarAdminItem key={item.id} item={item} />
            ))}
          </nav>

          {/* Back to files button - positioned like Trash in regular sidebar */}
          <div className="px-3 py-2">
            <button
              onClick={() => navigate('/files')}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-full text-base font-semibold transition-colors border border-transparent text-dark-600 dark:text-white/80 hover:text-dark-900 dark:hover:text-white hover:bg-white dark:hover:bg-dark-900"
            >
              <ArrowLeft className="w-5 h-5 flex-shrink-0" />
              <span>{t('sidebar.backToFiles')}</span>
            </button>
          </div>

          {/* Storage info - same as regular sidebar */}
          <div className="p-4 border-t border-dark-200 dark:border-dark-700">
            <p className="text-xs text-dark-500 dark:text-white/70 mb-2">{t('sidebar.storage')}</p>
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
        </>
      ) : (
        <>
          {/* Main Navigation */}
          <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto mt-10">
            {navItems.map((item) => (
              <SidebarNavItem key={item.id} item={item} section="main" />
            ))}
          </nav>

          {/* Bottom Navigation */}
          <div className="px-3 py-2 space-y-1">
            {bottomNavItems.map((item) => (
              <SidebarNavItem key={item.id} item={item} section="bottom" />
            ))}
          </div>

          {/* Storage info */}
          <div className="p-4 border-t border-dark-200 dark:border-dark-700">
            <p className="text-xs text-dark-500 dark:text-white/70 mb-2">{t('sidebar.storage')}</p>
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
        </>
      )}
    </>
  );

  return (
    <>
      <DragOverlay zIndex={9999}>
        {renderDragOverlay()}
      </DragOverlay>
      {renderTrashContextMenu()}

      {/* Desktop Sidebar - Hidden on mobile */}
      <aside
        className={cn(
          'hidden md:flex w-48 bg-dark-100 dark:bg-dark-800 text-dark-900 dark:text-white flex-col h-screen overflow-hidden transition-all duration-300',
          !sidebarOpen && 'w-0 opacity-0'
        )}
      >
        <SidebarContent />
      </aside>

      {/* Mobile Drawer - Visible on mobile */}
      <MobileDrawer
        isOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
        className="md:hidden bg-dark-100 dark:bg-dark-800 text-dark-900 dark:text-white"
      >
        <div className="flex flex-col h-full">
          <SidebarContent />
        </div>
      </MobileDrawer>
    </>
  );
}
