import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Folder } from '../../types';
import { useSearchParams, useLocation } from 'react-router-dom';
import { useFileStore } from '../../stores/fileStore';
import { useGlobalProgressStore } from '../../stores/globalProgressStore';
import {
  FolderIcon,
  MoreVertical,
  Star,
  Share2,
  Trash2,
  Edit,
  Move,
} from 'lucide-react';
import { formatDate, cn } from '../../lib/utils';
import Dropdown, { DropdownItem, DropdownDivider } from '../ui/Dropdown';
import { api } from '../../lib/api';
import { toast } from '../ui/Toast';
import ShareModal from '../modals/ShareModal';
import RenameModal from '../modals/RenameModal';
import MoveModal from '../modals/MoveModal';
import { motion, AnimatePresence } from 'framer-motion';

interface FolderCardProps {
  folder: Folder;
  view?: 'grid' | 'list';
  onRefresh?: () => void;
}

export default function FolderCard({ folder, view = 'grid', onRefresh }: FolderCardProps) {
  const [, setSearchParams] = useSearchParams();
  const location = useLocation();
  const { selectedItems, addToSelection, removeFromSelection, selectRange, selectSingle, lastSelectedId } = useFileStore();
  const { addOperation, incrementProgress, completeOperation, failOperation } = useGlobalProgressStore();
  const isSelected = selectedItems.has(folder.id);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Close context menu when location changes
  useEffect(() => {
    setContextMenu(null);
  }, [location.pathname, location.search]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    const handleScroll = () => setContextMenu(null);
    const handleContextMenuGlobal = () => setContextMenu(null);
    
    if (contextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('scroll', handleScroll, true);
      document.addEventListener('contextmenu', handleContextMenuGlobal, true);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('scroll', handleScroll, true);
        document.removeEventListener('contextmenu', handleContextMenuGlobal, true);
      };
    }
  }, [contextMenu]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // If this item is not already selected, select only this item
    // If it's already selected (possibly as part of multi-select), keep the selection
    if (!selectedItems.has(folder.id)) {
      selectSingle(folder.id);
    }
    
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleClick = (e: React.MouseEvent) => {
    // Shift+Click: Range selection
    if (e.shiftKey && lastSelectedId) {
      // Get all file items in the DOM to determine range
      const allItems = Array.from(document.querySelectorAll('[data-file-item], [data-folder-item]'));
      const ids = allItems.map(el => el.getAttribute('data-file-item') || el.getAttribute('data-folder-item')).filter(Boolean) as string[];
      selectRange(ids, folder.id);
    }
    // Ctrl/Meta+Click: Toggle selection
    else if (e.ctrlKey || e.metaKey) {
      if (isSelected) {
        removeFromSelection(folder.id);
      } else {
        addToSelection(folder.id);
      }
    }
    // Simple click: Select only this item
    else {
      selectSingle(folder.id);
    }
  };

  // Double click to navigate into folder
  const handleDoubleClick = () => {
    setSearchParams({ folder: folder.id });
  };

  const handleFavorite = async () => {
    setContextMenu(null);
    try {
      await api.patch(`/folders/${folder.id}/favorite`);
      toast(folder.isFavorite ? 'Eliminado de favoritos' : 'Añadido a favoritos', 'success');
      onRefresh?.();
    } catch {
      toast('Error al actualizar favorito', 'error');
    }
  };

  const handleDelete = async () => {
    setContextMenu(null);
    
    // Get fresh state from store to ensure we have the latest selection
    const currentSelectedItems = useFileStore.getState().selectedItems;
    const clearSelectionFn = useFileStore.getState().clearSelection;
    
    // If multiple items are selected and this folder is one of them, delete all selected
    if (currentSelectedItems.size > 1 && currentSelectedItems.has(folder.id)) {
      const itemIds = Array.from(currentSelectedItems);
      const total = itemIds.length;
      
      const opId = addOperation({
        id: `delete-context-${Date.now()}`,
        type: 'delete',
        title: `Eliminando ${total} elemento(s)`,
        totalItems: total,
      });
      
      try {
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
        clearSelectionFn();
        toast(`${total} elemento(s) movido(s) a papelera`, 'success');
        // Trigger refresh event and call onRefresh
        window.dispatchEvent(new CustomEvent('workzone-refresh'));
        onRefresh?.();
      } catch {
        failOperation(opId, 'Error al eliminar elementos');
        toast('Error al eliminar elementos', 'error');
      }
    } else {
      // Single item delete
      try {
        await api.delete(`/folders/${folder.id}`);
        toast('Carpeta movida a papelera', 'success');
        // Trigger refresh event and call onRefresh
        window.dispatchEvent(new CustomEvent('workzone-refresh'));
        onRefresh?.();
      } catch {
        toast('Error al eliminar carpeta', 'error');
      }
    }
  };

  const contextMenuContent = contextMenu ? createPortal(
    <AnimatePresence>
      <motion.div
        ref={contextMenuRef}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.1 }}
        className="fixed z-[9999] min-w-[180px] bg-white dark:bg-dark-800 rounded-xl shadow-lg border border-dark-200 dark:border-dark-700 py-1 overflow-hidden"
        style={{ top: contextMenu.y, left: contextMenu.x }}
      >
        <button
          onClick={handleFavorite}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-dark-700 dark:text-dark-200 hover:bg-dark-50 dark:hover:bg-dark-700"
        >
          <Star className="w-4 h-4" /> {folder.isFavorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}
        </button>
        <button
          onClick={() => { setContextMenu(null); setShowShareModal(true); }}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-dark-700 dark:text-dark-200 hover:bg-dark-50 dark:hover:bg-dark-700"
        >
          <Share2 className="w-4 h-4" /> Compartir
        </button>
        <div className="h-px bg-dark-200 dark:bg-dark-700 my-1" />
        <button
          onClick={() => { setContextMenu(null); setShowRenameModal(true); }}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-dark-700 dark:text-dark-200 hover:bg-dark-50 dark:hover:bg-dark-700"
        >
          <Edit className="w-4 h-4" /> Renombrar
        </button>
        <button
          onClick={() => { setContextMenu(null); setShowMoveModal(true); }}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-dark-700 dark:text-dark-200 hover:bg-dark-50 dark:hover:bg-dark-700"
        >
          <Move className="w-4 h-4" /> Mover
        </button>
        <div className="h-px bg-dark-200 dark:bg-dark-700 my-1" />
        <button
          onClick={handleDelete}
          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
        >
          <Trash2 className="w-4 h-4" /> Mover a papelera
        </button>
      </motion.div>
    </AnimatePresence>,
    document.body
  ) : null;

  const modals = (
    <>
      <ShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        folder={folder}
        onSuccess={onRefresh}
      />
      <RenameModal
        isOpen={showRenameModal}
        onClose={() => setShowRenameModal(false)}
        item={folder}
        type="folder"
        onSuccess={onRefresh}
      />
      <MoveModal
        isOpen={showMoveModal}
        onClose={() => setShowMoveModal(false)}
        items={[folder]}
        onSuccess={onRefresh}
      />
    </>
  );

  if (view === 'list') {
    return (
      <>
        <motion.div
          data-folder-item={folder.id}
          data-folder-name={folder.name}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onContextMenu={handleContextMenu}
          animate={isSelected ? { scale: 0.98 } : { scale: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          className={cn(
            'flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer transition-colors',
            isSelected
              ? 'bg-primary-50 dark:bg-primary-900/20 ring-2 ring-primary-500/50 ring-offset-1 ring-offset-white dark:ring-offset-dark-900'
              : 'hover:bg-dark-50 dark:hover:bg-dark-800'
          )}
        >
          <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center">
            <FolderIcon className="w-6 h-6 text-primary-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-dark-900 dark:text-white truncate">{folder.name}</p>
            <p className="text-sm text-dark-500">{folder._count?.files ?? 0} elementos • {formatDate(folder.createdAt)}</p>
          </div>
          {folder.isFavorite && <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />}
          <Dropdown
            trigger={
              <button onClick={(e) => e.stopPropagation()} className="p-2 text-dark-500 hover:text-dark-900 dark:hover:text-white rounded-lg hover:bg-dark-100 dark:hover:bg-dark-600">
                <MoreVertical className="w-5 h-5" />
              </button>
            }
            align="right"
          >
            <DropdownItem onClick={handleFavorite}><Star className="w-4 h-4" /> {folder.isFavorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}</DropdownItem>
            <DropdownItem onClick={() => setShowShareModal(true)}><Share2 className="w-4 h-4" /> Compartir</DropdownItem>
            <DropdownDivider />
            <DropdownItem onClick={() => setShowRenameModal(true)}><Edit className="w-4 h-4" /> Renombrar</DropdownItem>
            <DropdownItem onClick={() => setShowMoveModal(true)}><Move className="w-4 h-4" /> Mover</DropdownItem>
            <DropdownDivider />
            <DropdownItem danger onClick={handleDelete}><Trash2 className="w-4 h-4" /> Mover a papelera</DropdownItem>
          </Dropdown>
        </motion.div>
        {contextMenuContent}
        {modals}
      </>
    );
  }

  return (
    <>
      <motion.div
        data-folder-item={folder.id}
        data-folder-name={folder.name}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        animate={isSelected ? { scale: 0.97 } : { scale: 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        className={cn(
          'group relative flex items-center gap-3 px-3 py-2.5 rounded-2xl cursor-pointer transition-all border',
          isSelected
            ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-300 dark:border-primary-700 ring-2 ring-primary-500/40 ring-offset-1 ring-offset-white dark:ring-offset-dark-900'
            : 'bg-white dark:bg-dark-800 border-dark-100 dark:border-dark-700 hover:border-dark-200 dark:hover:border-dark-600'
        )}
      >
        <FolderIcon className="w-6 h-6 text-primary-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-dark-900 dark:text-white truncate">{folder.name}</p>
        </div>
        {folder.isFavorite && (
          <Star className="w-4 h-4 text-yellow-500 fill-yellow-500 flex-shrink-0" />
        )}
        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <Dropdown
            trigger={
              <button onClick={(e) => e.stopPropagation()} className="p-1.5 bg-white dark:bg-dark-700 text-dark-500 hover:text-dark-900 dark:hover:text-white rounded-lg shadow">
                <MoreVertical className="w-4 h-4" />
              </button>
            }
            align="right"
          >
            <DropdownItem onClick={handleFavorite}><Star className="w-4 h-4" /> {folder.isFavorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}</DropdownItem>
            <DropdownItem onClick={() => setShowShareModal(true)}><Share2 className="w-4 h-4" /> Compartir</DropdownItem>
            <DropdownDivider />
            <DropdownItem onClick={() => setShowRenameModal(true)}><Edit className="w-4 h-4" /> Renombrar</DropdownItem>
            <DropdownItem onClick={() => setShowMoveModal(true)}><Move className="w-4 h-4" /> Mover</DropdownItem>
            <DropdownDivider />
            <DropdownItem danger onClick={handleDelete}><Trash2 className="w-4 h-4" /> Mover a papelera</DropdownItem>
          </Dropdown>
        </div>
      </motion.div>
      {contextMenuContent}
      {modals}
    </>
  );
}
