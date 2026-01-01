import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useThemeStore } from "../stores/themeStore";
import { useAuthStore } from "../stores/authStore";
import { useUploadStore } from "../stores/uploadStore";
import { useFileStore } from "../stores/fileStore";
import { useGlobalProgressStore } from "../stores/globalProgressStore";
import { motion, AnimatePresence } from "framer-motion";
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
  FolderUp,
  Star,
  X,
  Trash2,
  Download,
  PanelLeft,
} from "lucide-react";
import Dropdown, { DropdownItem, DropdownDivider } from "./ui/Dropdown";
import UploadModal from "./modals/UploadModal";
import UploadFolderModal from "./modals/UploadFolderModal";
import CreateFolderModal from "./modals/CreateFolderModal";
import CreateFileModal from "./modals/CreateFileModal";
import { formatBytes } from "../lib/utils";
import { api, openSignedFileUrl } from "../lib/api";
import { toast } from "./ui/Toast";

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

interface HeaderProps {
  onMobileMenuToggle: () => void;
}

export default function Header({ onMobileMenuToggle }: HeaderProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isDark, toggleTheme } = useThemeStore();
  const { user, logout } = useAuthStore();
  const { isUploading, uploadedBytes, totalBytes, speed } = useUploadStore();
  const { selectedItems, clearSelection } = useFileStore();
  const { addOperation, incrementProgress, completeOperation, failOperation } =
    useGlobalProgressStore();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchParams] = useSearchParams();
  const location = useLocation();

  // Helper to get current folder ID from URL (path or query)
  const getFolderId = () => {
    // Check path first: /files/:folderId
    const match = location.pathname.match(/^\/files\/([^/]+)\/?$/);
    if (match) return match[1];

    // Fallback to query param (legacy/search support)
    return searchParams.get("folder");
  };

  const currentFolderId = getFolderId();
  const urlSearchQuery = searchParams.get("search") || "";
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [isUploadModalOpen, setUploadModalOpen] = useState(false);
  const [isUploadFolderModalOpen, setUploadFolderModalOpen] = useState(false);
  const [isCreateFolderModalOpen, setCreateFolderModalOpen] = useState(false);
  const [isCreateFileModalOpen, setCreateFileModalOpen] = useState(false);

  const selectedCount = selectedItems.size;

  // Issue #18: Debounce search query (300ms delay)
  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  // Build search URL for current page context
  const buildSearchUrl = useCallback(
    (query: string, goToSearchPage = false) => {
      const params = new URLSearchParams();
      const trimmed = query.trim();

      // If explicitly going to search page or on non-searchable page
      if (goToSearchPage) {
        if (trimmed) {
          params.set("q", trimmed);
        }
        const qs = params.toString();
        return qs ? `/search?${qs}` : '/search';
      }

      // Preserve current folder if on files page
      if (currentFolderId && location.pathname === '/files') {
        params.set("folder", currentFolderId);
      }
      if (trimmed) {
        params.set("search", trimmed);
      }

      // Stay on current page - only navigate for pages that support search
      const searchablePaths = ['/files', '/photos', '/music', '/documents', '/search'];
      const currentPath = searchablePaths.includes(location.pathname)
        ? location.pathname
        : '/search'; // Default to dedicated search page

      const qs = params.toString();
      return qs ? `${currentPath}?${qs}` : currentPath;
    },
    [currentFolderId, location.pathname],
  );

  // Keep input in sync with URL (back/forward, refresh, external navigation)
  // Also clear search when navigating to a different page
  useEffect(() => {
    // On /search page, use 'q' param; elsewhere use 'search' param
    if (location.pathname === '/search') {
      const qParam = searchParams.get('q') || '';
      setSearchQuery(qParam);
    } else {
      setSearchQuery(urlSearchQuery);
    }
  }, [urlSearchQuery, location.pathname, searchParams]);

  // Navigate when debounced search changes - only on searchable pages
  useEffect(() => {
    const searchablePaths = ['/files', '/photos', '/music', '/documents', '/search'];
    if (!searchablePaths.includes(location.pathname)) return;

    const trimmed = debouncedSearchQuery.trim();

    // For /search page, check 'q' param instead of 'search'
    if (location.pathname === '/search') {
      const urlQ = searchParams.get('q') || '';
      if (trimmed === urlQ.trim()) return;
      const params = new URLSearchParams(searchParams);
      if (trimmed) {
        params.set('q', trimmed);
      } else {
        params.delete('q');
      }
      navigate(`/search?${params.toString()}`, { replace: true });
      return;
    }

    if (trimmed === urlSearchQuery.trim()) return;

    navigate(buildSearchUrl(trimmed), { replace: true });
  }, [debouncedSearchQuery, urlSearchQuery, buildSearchUrl, navigate, location.pathname, searchParams]);

  // Calculate upload progress percentage
  const uploadProgress =
    totalBytes > 0 ? Math.round((uploadedBytes / totalBytes) * 100) : 0;

  // Selection action handlers
  const handleDeleteSelected = async () => {
    const itemIds = Array.from(selectedItems);
    const total = itemIds.length;

    const opId = addOperation({
      id: `delete-header-${Date.now()}`,
      type: "delete",
      title: t("header.deletingItems", { count: total }),
      totalItems: total,
    });

    try {
      for (const id of itemIds) {
        const fileEl = document.querySelector(`[data-file-item="${id}"]`);
        const folderEl = document.querySelector(`[data-folder-item="${id}"]`);
        const itemName =
          fileEl?.getAttribute("data-file-name") ||
          folderEl?.getAttribute("data-folder-name") ||
          id;

        if (fileEl) {
          await api.delete(`/files/${id}`);
        } else if (folderEl) {
          await api.delete(`/folders/${id}`);
        }
        incrementProgress(opId, itemName);
      }

      completeOperation(opId, t("header.itemsMovedToTrash", { count: total }));
      clearSelection();
      window.dispatchEvent(new CustomEvent("workzone-refresh"));
    } catch {
      failOperation(opId, t("header.deleteError"));
      toast(t("header.deleteError"), "error");
    }
  };

  const handleDownloadSelected = () => {
    const itemIds = Array.from(selectedItems);
    itemIds.forEach((id) => {
      const fileEl = document.querySelector(`[data-file-item="${id}"]`);
      if (fileEl) {
        void openSignedFileUrl(id, "download");
      }
    });
  };

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(e.target as Node)
      ) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // Issue #18: Allow immediate search on form submit (Enter key)
    const trimmed = searchQuery.trim();
    if (!trimmed && !urlSearchQuery) return;
    navigate(buildSearchUrl(trimmed));
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <header className="h-14 bg-dark-100 dark:bg-dark-800 flex items-center px-2 md:px-4 gap-2 md:gap-4 text-dark-900 dark:text-white">
      {/* Mobile Menu Toggle */}
      <button
        onClick={onMobileMenuToggle}
        className="md:hidden flex w-11 h-11 items-center justify-center bg-white dark:bg-dark-800 text-dark-500 dark:text-white/70 hover:text-dark-900 dark:hover:text-white hover:bg-dark-100 dark:hover:bg-white/10 rounded-full border border-dark-200 dark:border-dark-700 shadow-sm transition-colors"
      >
        <PanelLeft className="w-5 h-5" />
      </button>

      {/* Search */}
      <div className="flex-1 md:flex-none md:w-full md:max-w-xl flex items-center justify-end min-w-0">
        <motion.form
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          onSubmit={handleSearch}
          className="flex items-center gap-2 w-full"
          role="search"
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-400" />
            <input
              type="text"
              placeholder={t("header.search")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-9 pl-9 pr-4 bg-white border border-dark-200 dark:border-dark-700 rounded-full text-sm text-dark-900 placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              aria-label={t("header.searchFilesAndFolders")}
            />
          </div>
        </motion.form>
      </div>

      {/* Selection / New Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <AnimatePresence mode="wait">
          {selectedCount > 0 ? (
            <motion.div
              key="selection-toolbar"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-2"
            >
              <div
                className="flex items-center gap-2 bg-primary-100 dark:bg-primary-900/50 px-3 py-1.5 rounded-full"
                title={t("header.itemsSelected", { count: selectedCount })}
                aria-label={t("header.itemsSelected", { count: selectedCount })}
              >
                <span className="text-sm font-medium text-primary-700 dark:text-primary-300 whitespace-nowrap">
                  {selectedCount}
                </span>
                <button
                  onClick={clearSelection}
                  className="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-primary-600 dark:text-primary-400"
                  title={t("header.clearSelection")}
                  aria-label={t("header.clearSelection")}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-1">
                {location.pathname.startsWith('/files') && (
                  <>
                    <button
                      onClick={() => window.dispatchEvent(new CustomEvent('workzone-open-move-modal'))}
                      className="p-2 text-dark-500 hover:text-primary-600 dark:text-dark-400 dark:hover:text-primary-400 hover:bg-dark-100 dark:hover:bg-dark-700/50 rounded-lg transition-colors"
                      title={t('header.moveSelected')}
                      aria-label={t('header.moveSelected')}
                    >
                      <FolderUp className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => window.dispatchEvent(new CustomEvent('workzone-bulk-favorite'))}
                      className="p-2 text-dark-500 hover:text-yellow-600 dark:text-dark-400 dark:hover:text-yellow-400 hover:bg-dark-100 dark:hover:bg-dark-700/50 rounded-lg transition-colors"
                      title={t('header.favoriteSelected')}
                      aria-label={t('header.favoriteSelected')}
                    >
                      <Star className="w-5 h-5" />
                    </button>
                  </>
                )}
                <button
                  onClick={handleDownloadSelected}
                  className="p-2 text-dark-500 hover:text-primary-600 dark:text-dark-400 dark:hover:text-primary-400 hover:bg-dark-100 dark:hover:bg-dark-700/50 rounded-lg transition-colors"
                  title={t("header.downloadSelected")}
                  aria-label={t("header.downloadSelected")}
                >
                  <Download className="w-5 h-5" />
                </button>
                <button
                  onClick={handleDeleteSelected}
                  className="p-2 text-dark-500 hover:text-red-600 dark:text-dark-400 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                  title={t("header.deleteSelected")}
                  aria-label={t("header.deleteSelected")}
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="new-dropdown"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              <Dropdown
                trigger={
                  <button
                    type="button"
                    className="h-9 px-3 md:px-4 flex items-center gap-2 rounded-full bg-primary-600 text-white font-semibold text-sm transition-colors shadow-sm hover:bg-primary-700"
                    aria-label={t("header.createNewItem")}
                  >
                    <Plus className="w-4 h-4" />
                    <span className="hidden sm:inline">{t("header.new")}</span>
                  </button>
                }
                align="right"
              >
                <DropdownItem onClick={() => setUploadModalOpen(true)}>
                  <Upload className="w-4 h-4 text-dark-500" />
                  {t("header.uploadFile")}
                </DropdownItem>
                <DropdownItem onClick={() => setUploadFolderModalOpen(true)}>
                  <FolderOpen className="w-4 h-4 text-dark-500" />
                  {t("header.uploadFolder")}
                </DropdownItem>
                <DropdownDivider />
                <DropdownItem onClick={() => setCreateFileModalOpen(true)}>
                  <FilePlus className="w-4 h-4 text-dark-500" />
                  {t("header.createFile")}
                </DropdownItem>
                <DropdownItem onClick={() => setCreateFolderModalOpen(true)}>
                  <FolderPlus className="w-4 h-4 text-dark-500" />
                  {t("header.createFolder")}
                </DropdownItem>
              </Dropdown>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Upload Progress Indicator - Hidden on mobile, shows in UploadProgress component instead */}
      <div className="hidden md:block w-64 flex-shrink-0">
        {isUploading && totalBytes > 0 && (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-dark-200 dark:bg-dark-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary-500 transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <span className="text-xs font-medium text-dark-600 dark:text-dark-300 tabular-nums whitespace-nowrap min-w-[90px] text-right">
              {t("header.uploadProgress", {
                percent: uploadProgress,
                speed: formatBytes(speed),
              })}
            </span>
          </div>
        )}
      </div>

      {/* Spacer - only on desktop */}
      <div className="hidden md:block flex-1" />

      {/* Right actions */}
      <div className="flex items-center gap-1">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="p-2 text-dark-500 dark:text-white/70 hover:text-dark-900 dark:hover:text-white rounded-lg hover:bg-dark-100 dark:hover:bg-white/10 transition-colors"
          title={isDark ? t("header.lightMode") : t("header.darkMode")}
          aria-label={isDark ? t("header.lightMode") : t("header.darkMode")}
        >
          {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>

        {/* User menu */}
        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="p-1 rounded-full hover:bg-dark-100 dark:hover:bg-white/10 transition-colors"
            aria-label={t("header.userMenu")}
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
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="absolute right-0 mt-2 w-48 bg-white dark:bg-dark-900 rounded-lg shadow-lg border border-dark-200 dark:border-dark-700 py-1 z-50 text-dark-900 dark:text-white"
              >
                <div className="px-4 py-2 border-b border-dark-200 dark:border-dark-700">
                  <p className="font-medium text-dark-900 dark:text-white text-sm truncate">
                    {user?.name}
                  </p>
                  <p className="text-xs text-dark-500 dark:text-white/70 truncate">
                    {user?.email}
                  </p>
                </div>
                <button
                  onClick={() => {
                    navigate("/settings");
                    setShowUserMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-dark-700 dark:text-white hover:bg-dark-50 dark:hover:bg-white/10 transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  {t("header.settings")}
                </button>
                {user?.role === "ADMIN" && (
                  <button
                    onClick={() => {
                      navigate("/admin");
                      setShowUserMenu(false);
                    }}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-dark-700 dark:text-white hover:bg-dark-50 dark:hover:bg-white/10 transition-colors"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    {t("header.admin")}
                  </button>
                )}
                <div className="border-t border-dark-200 dark:border-dark-700 mt-1 pt-1">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    {t("header.logout")}
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
        onSuccess={() =>
          window.dispatchEvent(new CustomEvent("workzone-refresh"))
        }
      />
      <UploadFolderModal
        isOpen={isUploadFolderModalOpen}
        onClose={() => setUploadFolderModalOpen(false)}
        folderId={currentFolderId}
        onSuccess={() =>
          window.dispatchEvent(new CustomEvent("workzone-refresh"))
        }
      />
      <CreateFolderModal
        isOpen={isCreateFolderModalOpen}
        onClose={() => setCreateFolderModalOpen(false)}
        parentId={currentFolderId}
        onSuccess={() =>
          window.dispatchEvent(new CustomEvent("workzone-refresh"))
        }
      />
      <CreateFileModal
        isOpen={isCreateFileModalOpen}
        onClose={() => setCreateFileModalOpen(false)}
        folderId={currentFolderId}
        onSuccess={() =>
          window.dispatchEvent(new CustomEvent("workzone-refresh"))
        }
      />
    </header>
  );
}
