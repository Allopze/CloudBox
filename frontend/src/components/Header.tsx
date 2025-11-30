import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useThemeStore } from '../stores/themeStore';
import { useAuthStore } from '../stores/authStore';
import { useUploadStore } from '../stores/uploadStore';
import { useFileStore } from '../stores/fileStore';
import { useGlobalProgressStore } from '../stores/globalProgressStore';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Moon,
  Sun,
  Settings,
  ShieldCheck,
  LogOut,
  Plus,
  Upload,
  FolderOpen,
  FolderPlus,
  FilePlus,
  X,
  Trash2,
  Download,
} from 'lucide-react';
import Dropdown, { DropdownItem, DropdownDivider } from './ui/Dropdown';
import UploadModal from './modals/UploadModal';
import UploadFolderModal from './modals/UploadFolderModal';
import CreateFolderModal from './modals/CreateFolderModal';
import CreateFileModal from './modals/CreateFileModal';
import { formatBytes } from '../lib/utils';
import { api, getFileUrl } from '../lib/api';
import { toast } from './ui/Toast';

// Issue #18: Debounce hook for search
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export default function Header() {
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useThemeStore();
  const { user, logout } = useAuthStore();
  const { isUploading, uploadedBytes, totalBytes, speed } = useUploadStore();
  const { selectedItems, clearSelection } = useFileStore();
  const { addOperation, incrementProgress, completeOperation, failOperation } = useGlobalProgressStore();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchParams] = useSearchParams();
  const currentFolderId = searchParams.get('folder');
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [isUploadModalOpen, setUploadModalOpen] = useState(false);
  const [isUploadFolderModalOpen, setUploadFolderModalOpen] = useState(false);
  const [isCreateFolderModalOpen, setCreateFolderModalOpen] = useState(false);
  const [isCreateFileModalOpen, setCreateFileModalOpen] = useState(false);

  const selectedCount = selectedItems.size;

  // Issue #18: Debounce search query (300ms delay)
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  // Effect to navigate when debounced search changes
  useEffect(() => {
    if (debouncedSearchQuery.trim()) {
      navigate(`/files?search=${encodeURIComponent(debouncedSearchQuery.trim())}`);
    }
  }, [debouncedSearchQuery, navigate]);

  // Calculate upload progress percentage
  const uploadProgress = totalBytes > 0 ? Math.round((uploadedBytes / totalBytes) * 100) : 0;

  // Selection action handlers
  const handleDeleteSelected = async () => {
    const itemIds = Array.from(selectedItems);
    const total = itemIds.length;
    
    const opId = addOperation({
      id: `delete-header-${Date.now()}`,
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
      clearSelection();
      toast(`${total} elemento${total > 1 ? 's' : ''} movido${total > 1 ? 's' : ''} a papelera`, 'success');
      window.dispatchEvent(new CustomEvent('workzone-refresh'));
    } catch {
      failOperation(opId, 'Error al eliminar elementos');
      toast('Error al eliminar elementos', 'error');
    }
  };

  const handleDownloadSelected = () => {
    const itemIds = Array.from(selectedItems);
    itemIds.forEach((id) => {
      const fileEl = document.querySelector(`[data-file-item="${id}"]`);
      if (fileEl) {
        window.open(getFileUrl(`/files/${id}/download`), '_blank');
      }
    });
  };

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // Issue #18: Allow immediate search on form submit (Enter key)
    if (searchQuery.trim()) {
      navigate(`/files?search=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <header className="h-14 bg-dark-100 dark:bg-[#222222] flex items-center px-4 gap-4 text-dark-900 dark:text-white">
      {/* Search + Nuevo */}
      <form onSubmit={handleSearch} className="flex-1 max-w-xl" role="search">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-400" />
            <input
              type="text"
              placeholder="Buscar..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-9 pl-9 pr-4 bg-white border border-dark-200 dark:border-[#2a2a2a] rounded-full text-sm text-dark-900 placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              aria-label="Buscar archivos y carpetas"
            />
          </div>
          <Dropdown
            trigger={
              <button
                type="button"
                className="h-9 px-4 flex items-center gap-2 rounded-full bg-primary-600 text-white font-semibold text-sm transition-colors shadow-sm hover:bg-primary-700"
                aria-label="Crear nuevo elemento"
              >
                <Plus className="w-4 h-4" />
                Nuevo
              </button>
            }
            align="left"
          >
            <DropdownItem onClick={() => setUploadModalOpen(true)}>
              <Upload className="w-4 h-4 text-dark-500" />
              Subir archivo
            </DropdownItem>
            <DropdownItem onClick={() => setUploadFolderModalOpen(true)}>
              <FolderOpen className="w-4 h-4 text-dark-500" />
              Subir carpeta
            </DropdownItem>
            <DropdownDivider />
            <DropdownItem onClick={() => setCreateFileModalOpen(true)}>
              <FilePlus className="w-4 h-4 text-dark-500" />
              Crear archivo
            </DropdownItem>
            <DropdownItem onClick={() => setCreateFolderModalOpen(true)}>
              <FolderPlus className="w-4 h-4 text-dark-500" />
              Crear carpeta
            </DropdownItem>
          </Dropdown>
        </div>
      </form>

      {/* Selection Toolbar */}
      <AnimatePresence>
        {selectedCount > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, x: -20 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.9, x: -20 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="flex items-center gap-1 px-2 py-1 bg-primary-50 dark:bg-primary-900/30 rounded-full border border-primary-200 dark:border-primary-800"
          >
            <button
              onClick={clearSelection}
              className="p-1.5 text-primary-600 hover:text-primary-700 hover:bg-primary-100 dark:hover:bg-primary-800/50 rounded-full transition-colors"
              title="Limpiar selección"
            >
              <X className="w-4 h-4" />
            </button>
            <span className="text-sm font-medium text-primary-700 dark:text-primary-300 px-2">
              {selectedCount} seleccionado{selectedCount > 1 ? 's' : ''}
            </span>
            <div className="w-px h-5 bg-primary-200 dark:bg-primary-700" />
            <button
              onClick={handleDownloadSelected}
              className="p-1.5 text-primary-600 hover:text-primary-700 hover:bg-primary-100 dark:hover:bg-primary-800/50 rounded-full transition-colors"
              title="Descargar seleccionados"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={handleDeleteSelected}
              className="p-1.5 text-red-500 hover:text-red-600 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-full transition-colors"
              title="Eliminar seleccionados"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upload Progress Indicator - Fixed width to prevent layout shift */}
      <div className="w-56 flex-shrink-0">
        {isUploading && totalBytes > 0 && (
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-dark-200 dark:bg-dark-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary-500 transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <span className="text-sm font-medium text-dark-600 dark:text-dark-300 tabular-nums whitespace-nowrap">
              {uploadProgress}% · {formatBytes(speed)}/s
            </span>
          </div>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Right actions */}
      <div className="flex items-center gap-1">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="p-2 text-dark-500 dark:text-white/70 hover:text-dark-900 dark:hover:text-white rounded-lg hover:bg-dark-100 dark:hover:bg-white/10 transition-colors"
          title={isDark ? 'Modo claro' : 'Modo oscuro'}
          aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        >
          {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>

        {/* User menu */}
        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="p-1 rounded-full hover:bg-dark-100 dark:hover:bg-white/10 transition-colors"
            aria-label="Menú de usuario"
            aria-expanded={showUserMenu}
            aria-haspopup="menu"
          >
            {user?.avatar ? (
              <img
                src={user.avatar}
                alt={user.name}
                className="w-8 h-8 rounded-full object-cover"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center">
                <span className="text-white font-medium text-sm">
                  {user?.name?.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
          </button>
          <AnimatePresence>
            {showUserMenu && (
              <motion.div
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                className="absolute right-0 mt-2 w-48 bg-white dark:bg-[#121212] rounded-lg shadow-lg border border-dark-200 dark:border-[#2a2a2a] py-1 z-50 text-dark-900 dark:text-white"
              >
                <div className="px-4 py-2 border-b border-dark-200 dark:border-[#2a2a2a]">
                  <p className="font-medium text-dark-900 dark:text-white text-sm truncate">
                    {user?.name}
                  </p>
                  <p className="text-xs text-dark-500 dark:text-white/70 truncate">
                    {user?.email}
                  </p>
                </div>
                <button
                  onClick={() => {
                    navigate('/settings');
                    setShowUserMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-dark-700 dark:text-white hover:bg-dark-50 dark:hover:bg-white/10 transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  Configuración
                </button>
                {user?.role === 'ADMIN' && (
                  <button
                    onClick={() => {
                      navigate('/admin');
                      setShowUserMenu(false);
                    }}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-dark-700 dark:text-white hover:bg-dark-50 dark:hover:bg-white/10 transition-colors"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    Administración
                  </button>
                )}
                <div className="border-t border-dark-200 dark:border-[#2a2a2a] mt-1 pt-1">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Cerrar sesión
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        folderId={currentFolderId}
        onSuccess={() => window.dispatchEvent(new CustomEvent('workzone-refresh'))}
      />
      <UploadFolderModal
        isOpen={isUploadFolderModalOpen}
        onClose={() => setUploadFolderModalOpen(false)}
        folderId={currentFolderId}
        onSuccess={() => window.dispatchEvent(new CustomEvent('workzone-refresh'))}
      />
      <CreateFolderModal
        isOpen={isCreateFolderModalOpen}
        onClose={() => setCreateFolderModalOpen(false)}
        parentId={currentFolderId}
        onSuccess={() => window.dispatchEvent(new CustomEvent('workzone-refresh'))}
      />
      <CreateFileModal
        isOpen={isCreateFileModalOpen}
        onClose={() => setCreateFileModalOpen(false)}
        folderId={currentFolderId}
        onSuccess={() => window.dispatchEvent(new CustomEvent('workzone-refresh'))}
      />
    </header>
  );
}
