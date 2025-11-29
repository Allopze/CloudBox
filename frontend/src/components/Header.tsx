import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useThemeStore } from '../stores/themeStore';
import { useAuthStore } from '../stores/authStore';
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
} from 'lucide-react';
import Dropdown, { DropdownItem, DropdownDivider } from './ui/Dropdown';
import UploadModal from './modals/UploadModal';
import UploadFolderModal from './modals/UploadFolderModal';
import CreateFolderModal from './modals/CreateFolderModal';
import CreateFileModal from './modals/CreateFileModal';

export default function Header() {
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useThemeStore();
  const { user, logout } = useAuthStore();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchParams] = useSearchParams();
  const currentFolderId = searchParams.get('folder');
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [isUploadModalOpen, setUploadModalOpen] = useState(false);
  const [isUploadFolderModalOpen, setUploadFolderModalOpen] = useState(false);
  const [isCreateFolderModalOpen, setCreateFolderModalOpen] = useState(false);
  const [isCreateFileModalOpen, setCreateFileModalOpen] = useState(false);

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
    if (searchQuery.trim()) {
      navigate(`/files?search=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <header className="h-14 bg-dark-100 dark:bg-[#222222] flex items-center px-4 gap-4 text-dark-900 dark:text-white border-b border-dark-200 dark:border-transparent">
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
      />
      <UploadFolderModal
        isOpen={isUploadFolderModalOpen}
        onClose={() => setUploadFolderModalOpen(false)}
        folderId={currentFolderId}
      />
      <CreateFolderModal
        isOpen={isCreateFolderModalOpen}
        onClose={() => setCreateFolderModalOpen(false)}
        parentId={currentFolderId}
      />
      <CreateFileModal
        isOpen={isCreateFileModalOpen}
        onClose={() => setCreateFileModalOpen(false)}
        folderId={currentFolderId}
      />
    </header>
  );
}
