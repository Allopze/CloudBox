import { useState } from 'react';
import { Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Header from '../components/Header';
import UploadProgress from '../components/UploadProgress';
import UploadModal from '../components/modals/UploadModal';
import CreateFolderModal from '../components/modals/CreateFolderModal';
import { useUIStore } from '../stores/uiStore';
import { useFileStore } from '../stores/fileStore';
import { cn } from '../lib/utils';
import { PanelLeftClose, PanelLeft, Grid, List, SortAsc, SortDesc, Check, Link as LinkIcon, Users, Image, Star, Video, Camera, FolderOpen, Settings, ShieldCheck, Home, ChevronRight, Upload, FolderPlus } from 'lucide-react';
import Dropdown, { DropdownItem, DropdownDivider } from '../components/ui/Dropdown';

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
  const { viewMode, setViewMode, sortBy, sortOrder, setSortBy, setSortOrder, breadcrumbs } = useFileStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [isUploadModalOpen, setUploadModalOpen] = useState(false);
  const [isCreateFolderModalOpen, setCreateFolderModalOpen] = useState(false);

  const showViewControls = pagesWithViewControls.includes(location.pathname);
  const showBreadcrumbs = pagesWithBreadcrumbs.some(p => location.pathname.startsWith(p)) && breadcrumbs.length > 0;
  const currentSort = sortOptions.find((s) => s.value === sortBy);
  const isSharedPage = location.pathname === '/shared';
  const isPhotosPage = location.pathname === '/photos';
  const isAlbumsPage = location.pathname.startsWith('/albums');
  const isSettingsPage = location.pathname === '/settings';
  const isAdminPage = location.pathname.startsWith('/admin');
  const isFilesPage = location.pathname === '/files';
  const isDocumentsPage = location.pathname === '/documents';
  const isMusicPage = location.pathname === '/music';
  const isGalleryPage = isPhotosPage || isAlbumsPage;
  const sharedTab = searchParams.get('tab') || 'my-shares';
  const photosTab = searchParams.get('tab') || 'all';

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
              ) : isGalleryPage ? (
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
                    <div key={crumb.id} className="flex items-center">
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
                    </div>
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
                          <Grid className="w-4 h-4