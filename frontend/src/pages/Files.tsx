import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, getFileUrl } from '../lib/api';
import { FileItem, Folder } from '../types';
import { useFileStore } from '../stores/fileStore';
import { useGlobalProgressStore } from '../stores/globalProgressStore';
import FileCard from '../components/files/FileCard';
import FolderCard from '../components/files/FolderCard';
import { Loader2, Upload, FolderUp, FolderPlus, FilePlus, RefreshCw, CheckSquare } from 'lucide-react';
import { toast } from '../components/ui/Toast';
import { cn, isImage, isVideo, isDocument } from '../lib/utils';
import UploadModal from '../components/modals/UploadModal';
import CreateFolderModal from '../components/modals/CreateFolderModal';
import CreateFileModal from '../components/modals/CreateFileModal';
import ShareModal from '../components/modals/ShareModal';
import RenameModal from '../components/modals/RenameModal';
import ConfirmModal from '../components/ui/ConfirmModal';
import ImageGallery from '../components/gallery/ImageGallery';
import VideoPreview from '../components/gallery/VideoPreview';
import DocumentViewer from '../components/gallery/DocumentViewer';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { motion, AnimatePresence } from 'framer-motion';

export default function Files() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const folderId = searchParams.get('folder');
  const searchQuery = searchParams.get('search');

  const [files, setFiles] = useState<FileItem[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploadModalOpen, setUploadModalOpen] = useState(false);
  const [isCreateFolderModalOpen, setCreateFolderModalOpen] = useState(false);
  const [isCreateFileModalOpen, setCreateFileModalOpen] = useState(false);
  const [isShareModalOpen, setShareModalOpen] = useState(false);
  const [isRenameModalOpen, setRenameModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteConfirmData, setDeleteConfirmData] = useState<{ files: FileItem[]; folders: Folder[] } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedFileForAction, setSelectedFileForAction] = useState<FileItem | null>(null);

  // Workzone context menu state
  const [workzoneContextMenu, setWorkzoneContextMenu] = useState<{ x: number; y: number } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Gallery states
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [videoPreviewFile, setVideoPreviewFile] = useState<FileItem | null>(null);
  const [documentPreviewFile, setDocumentPreviewFile] = useState<FileItem | null>(null);

  const { viewMode, sortBy, sortOrder, selectedItems, clearSelection, setBreadcrumbs, selectAll } = useFileStore();
  const { addOperation, incrementProgress, completeOperation, failOperation } = useGlobalProgressStore();

  // Get all item IDs for keyboard shortcuts
  const allItemIds = useMemo(() => {
    return [...folders.map(f => f.id), ...files.map(f => f.id)];
  }, [folders, files]);

  // Get image files for gallery
  const imageFiles = useMemo(() => {
    return files.filter(f => isImage(f.mimeType));
  }, [files]);

  // Get document files for DocumentViewer navigation
  const documentFiles = useMemo(() => {
    return files.filter(f => isDocument(f.mimeType));
  }, [files]);

  // Get selected items
  const getSelectedItems = useCallback(() => {
    const selectedFiles = files.filter(f => selectedItems.has(f.id));
    const selectedFolders = folders.filter(f => selectedItems.has(f.id));
    return { selectedFiles, selectedFolders };
  }, [files, folders, selectedItems]);

  // Delete selected items - show confirmation modal
  const handleDeleteSelected = useCallback(() => {
    const { selectedFiles, selectedFolders } = getSelectedItems();
    const total = selectedFiles.length + selectedFolders.length;

    if (total === 0) return;

    setDeleteConfirmData({ files: selectedFiles, folders: selectedFolders });
    setDeleteConfirmOpen(true);
  }, [getSelectedItems]);

  // Perform the actual deletion after confirmation
  const performDelete = useCallback(async () => {
    if (!deleteConfirmData) return;

    const { files: selectedFiles, folders: selectedFolders } = deleteConfirmData;
    const total = selectedFiles.length + selectedFolders.length;

    setIsDeleting(true);

    const opId = addOperation({
      id: `delete-${Date.now()}`,
      type: 'delete',
      title: t('files.deletingItems', { count: total }),
      totalItems: total,
    });

    try {
      for (const file of selectedFiles) {
        await api.delete(`/files/${file.id}`);
        incrementProgress(opId, file.name);
      }
      for (const folder of selectedFolders) {
        await api.delete(`/folders/${folder.id}`);
        incrementProgress(opId, folder.name);
      }
      completeOperation(opId);
      clearSelection();
      loadData();
      toast(t('files.itemsDeleted', { count: total }), 'success');
    } catch (error) {
      failOperation(opId, t('files.deleteError'));
      toast(t('files.deleteError'), 'error');
    } finally {
      setIsDeleting(false);
      setDeleteConfirmOpen(false);
      setDeleteConfirmData(null);
    }
  }, [deleteConfirmData, addOperation, incrementProgress, completeOperation, failOperation, clearSelection]);

  // Download selected
  const handleDownloadSelected = useCallback(() => {
    const { selectedFiles } = getSelectedItems();
    selectedFiles.forEach(file => {
      const url = getFileUrl(file.id, 'download', true);
      window.open(url, '_blank');
    });
  }, [getSelectedItems]);

  // Share selected (only first file)
  const handleShareSelected = useCallback(() => {
    const { selectedFiles } = getSelectedItems();
    if (selectedFiles.length > 0) {
      setSelectedFileForAction(selectedFiles[0]);
      setShareModalOpen(true);
    }
  }, [getSelectedItems]);

  // Rename selected (only single selection)
  const handleRenameSelected = useCallback(() => {
    const { selectedFiles, selectedFolders } = getSelectedItems();
    if (selectedFiles.length === 1) {
      setSelectedFileForAction(selectedFiles[0]);
      setRenameModalOpen(true);
    } else if (selectedFolders.length === 1 && selectedFiles.length === 0) {
      // Handle folder rename - would need a separate modal
      toast(t('files.useContextMenuForFolders'), 'info');
    }
  }, [getSelectedItems]);

  // Preview selected item
  const handlePreviewSelected = useCallback(() => {
    const { selectedFiles } = getSelectedItems();
    if (selectedFiles.length === 1) {
      const file = selectedFiles[0];
      if (isImage(file.mimeType)) {
        const index = imageFiles.findIndex(f => f.id === file.id);
        if (index >= 0) {
          setGalleryIndex(index);
          setGalleryOpen(true);
        }
      } else if (isVideo(file.mimeType)) {
        setVideoPreviewFile(file);
      } else if (isDocument(file.mimeType)) {
        setDocumentPreviewFile(file);
      }
    }
  }, [getSelectedItems, imageFiles]);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    allItemIds,
    onDelete: handleDeleteSelected,
    onRename: handleRenameSelected,
    onDownload: handleDownloadSelected,
    onShare: handleShareSelected,
    onUpload: () => setUploadModalOpen(true),
    onNewFolder: () => setCreateFolderModalOpen(true),
    onPreview: handlePreviewSelected,
    enabled: !galleryOpen && !videoPreviewFile,
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const effectiveFolderId = folderId ?? 'null';

      const params: Record<string, string> = {
        sortBy,
        sortOrder,
        folderId: effectiveFolderId,
      };

      if (searchQuery) {
        params.search = searchQuery;
      }

      const [filesRes, foldersRes] = await Promise.all([
        api.get('/files', { params }),
        api.get('/folders', { params: { parentId: effectiveFolderId } }),
      ]);

      setFiles(filesRes.data.files || []);
      setFolders(foldersRes.data || []);

      // Cargar breadcrumbs si estamos en una carpeta
      if (folderId) {
        const folderRes = await api.get(`/folders/${folderId}`);
        const crumbs = folderRes.data?.breadcrumb ?? [];
        setBreadcrumbs(crumbs);
      } else {
        setBreadcrumbs([]);
      }
    } catch (error) {
      console.error('Error loading files:', error);
      toast(t('files.errorLoading'), 'error');
    } finally {
      setLoading(false);
    }
  }, [folderId, searchQuery, sortBy, sortOrder, setBreadcrumbs]);

  useEffect(() => {
    loadData();
    clearSelection();
  }, [loadData, clearSelection]);

  // Listen for workzone refresh event from MainLayout context menu
  useEffect(() => {
    const handleRefresh = () => loadData();
    window.addEventListener('workzone-refresh', handleRefresh);
    return () => window.removeEventListener('workzone-refresh', handleRefresh);
  }, [loadData]);

  // Listen for select all event from MainLayout context menu
  useEffect(() => {
    const handleSelectAll = () => {
      if (allItemIds.length > 0) {
        selectAll(allItemIds);
      }
    };
    window.addEventListener('workzone-select-all', handleSelectAll);
    return () => window.removeEventListener('workzone-select-all', handleSelectAll);
  }, [allItemIds, selectAll]);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setWorkzoneContextMenu(null);
      }
    };
    const handleScroll = () => setWorkzoneContextMenu(null);

    if (workzoneContextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('scroll', handleScroll, true);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('scroll', handleScroll, true);
      };
    }
  }, [workzoneContextMenu]);

  // Handle workzone context menu (right-click on empty area)
  const handleWorkzoneContextMenu = useCallback((e: React.MouseEvent) => {
    // Only show if clicking on the container, not on items
    const target = e.target as HTMLElement;
    const isOnItem = target.closest('[data-file-item]') || target.closest('[data-folder-item]');

    if (!isOnItem) {
      e.preventDefault();
      setWorkzoneContextMenu({ x: e.clientX, y: e.clientY });
      clearSelection();
    }
  }, [clearSelection]);

  // Handle folder upload
  const handleFolderUpload = useCallback(() => {
    setWorkzoneContextMenu(null);
    folderInputRef.current?.click();
  }, []);

  const handleFolderInputChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const filesWithPaths: { file: File; path: string }[] = [];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      // webkitRelativePath contains the folder structure
      const path = (file as any).webkitRelativePath || file.name;
      filesWithPaths.push({ file, path });
    }

    // Upload with folder structure
    const formData = new FormData();
    filesWithPaths.forEach(({ file, path }) => {
      formData.append('files', file);
      formData.append('paths', path);
    });

    if (folderId) {
      formData.append('folderId', folderId);
    }

    try {
      toast(t('files.uploadingFiles', { count: filesWithPaths.length }), 'info');
      await api.post('/files/upload-with-folders', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast(t('files.folderUploaded'), 'success');
      loadData();
    } catch (error: any) {
      toast(error.response?.data?.error || t('files.folderUploadError'), 'error');
    }

    // Reset input
    e.target.value = '';
  }, [folderId, loadData]);

  // Handle file click for gallery
  const handleFileClick = useCallback((file: FileItem) => {
    if (isImage(file.mimeType)) {
      const index = imageFiles.findIndex(f => f.id === file.id);
      if (index >= 0) {
        setGalleryIndex(index);
        setGalleryOpen(true);
      }
    } else if (isVideo(file.mimeType)) {
      setVideoPreviewFile(file);
    } else if (isDocument(file.mimeType)) {
      setDocumentPreviewFile(file);
    }
  }, [imageFiles]);

  return (
    <div
      className="min-h-[400px]"
      onContextMenu={handleWorkzoneContextMenu}
    >
      {/* Hidden folder input */}
      <input
        ref={folderInputRef}
        type="file"
        className="hidden"
        // @ts-ignore - webkitdirectory is not in types but works in browsers
        webkitdirectory=""
        directory=""
        multiple
        onChange={handleFolderInputChange}
        aria-label={t('files.uploadFolder')}
      />

      {/* Contenido */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
        </div>
      ) : (
        <div
          className={cn(
            viewMode === 'grid'
              ? 'grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3'
              : 'space-y-1'
          )}
        >
          {/* Carpetas primero */}
          {folders.map((folder) => (
            <FolderCard
              key={folder.id}
              folder={folder}
              view={viewMode}
              onRefresh={loadData}
            />
          ))}

          {/* Luego archivos */}
          {files.map((file) => (
            <FileCard
              key={file.id}
              file={file}
              view={viewMode}
              onRefresh={loadData}
              onPreview={handleFileClick}
            />
          ))}
        </div>
      )}

      {/* Workzone Context Menu */}
      <AnimatePresence>
        {workzoneContextMenu && createPortal(
          <motion.div
            ref={contextMenuRef}
            initial={{ opacity: 0, scale: 0.9, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -10 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="fixed z-[9999] min-w-[180px] bg-white dark:bg-dark-800 rounded-xl shadow-lg border border-dark-200 dark:border-dark-700 py-1 overflow-hidden"
            style={{
              top: Math.min(workzoneContextMenu.y, window.innerHeight - 300),
              left: Math.min(workzoneContextMenu.x, window.innerWidth - 220)
            }}
          >
            {/* Select All */}
            {allItemIds.length > 0 && (
              <>
                <button
                  onClick={() => {
                    setWorkzoneContextMenu(null);
                    selectAll(allItemIds);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-dark-700 dark:text-dark-200 hover:bg-dark-50 dark:hover:bg-dark-700 transition-colors"
                >
                  <CheckSquare className="w-4 h-4" />
                  <span>{t('layout.selectAll')}</span>
                </button>
                <div className="h-px bg-dark-200 dark:bg-dark-700 my-2" />
              </>
            )}

            <button
              onClick={() => {
                setWorkzoneContextMenu(null);
                setUploadModalOpen(true);
              }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-dark-700 dark:text-dark-200 hover:bg-dark-50 dark:hover:bg-dark-700 transition-colors"
            >
              <Upload className="w-4 h-4" />
              <span>{t('layout.addFile')}</span>
            </button>
            <button
              onClick={handleFolderUpload}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-dark-700 dark:text-dark-200 hover:bg-dark-50 dark:hover:bg-dark-700 transition-colors"
            >
              <FolderUp className="w-4 h-4" />
              <span>{t('layout.addFolder')}</span>
            </button>

            <div className="h-px bg-dark-200 dark:bg-dark-700 my-2" />

            <button
              onClick={() => {
                setWorkzoneContextMenu(null);
                setCreateFileModalOpen(true);
              }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-dark-700 dark:text-dark-200 hover:bg-dark-50 dark:hover:bg-dark-700 transition-colors"
            >
              <FilePlus className="w-4 h-4" />
              <span>{t('header.createFile')}</span>
            </button>
            <button
              onClick={() => {
                setWorkzoneContextMenu(null);
                setCreateFolderModalOpen(true);
              }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-dark-700 dark:text-dark-200 hover:bg-dark-50 dark:hover:bg-dark-700 transition-colors"
            >
              <FolderPlus className="w-4 h-4" />
              <span>{t('header.createFolder')}</span>
            </button>

            <div className="h-px bg-dark-200 dark:bg-dark-700 my-2" />

            <button
              onClick={() => {
                setWorkzoneContextMenu(null);
                loadData();
              }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-dark-700 dark:text-dark-200 hover:bg-dark-50 dark:hover:bg-dark-700 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              <span>{t('layout.refresh')}</span>
            </button>
          </motion.div>,
          document.body
        )}
      </AnimatePresence>

      {/* Modales */}
      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        folderId={folderId}
        onSuccess={loadData}
      />
      <CreateFolderModal
        isOpen={isCreateFolderModalOpen}
        onClose={() => setCreateFolderModalOpen(false)}
        parentId={folderId}
        onSuccess={loadData}
      />

      {/* Create File Modal */}
      <CreateFileModal
        isOpen={isCreateFileModalOpen}
        onClose={() => setCreateFileModalOpen(false)}
        folderId={folderId}
        onSuccess={loadData}
      />

      {/* Share Modal */}
      {selectedFileForAction && (
        <ShareModal
          isOpen={isShareModalOpen}
          onClose={() => {
            setShareModalOpen(false);
            setSelectedFileForAction(null);
          }}
          file={selectedFileForAction}
        />
      )}

      {/* Rename Modal */}
      {selectedFileForAction && (
        <RenameModal
          isOpen={isRenameModalOpen}
          onClose={() => {
            setRenameModalOpen(false);
            setSelectedFileForAction(null);
          }}
          item={selectedFileForAction}
          type="file"
          onSuccess={loadData}
        />
      )}

      {/* Image Gallery */}
      <ImageGallery
        images={imageFiles}
        initialIndex={galleryIndex}
        isOpen={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        onDownload={(file) => window.open(getFileUrl(file.id, 'download', true), '_blank')}
        onShare={(file) => {
          setSelectedFileForAction(file);
          setShareModalOpen(true);
          setGalleryOpen(false);
        }}
      />

      {/* Video Preview */}
      {videoPreviewFile && (
        <VideoPreview
          file={videoPreviewFile}
          isOpen={!!videoPreviewFile}
          onClose={() => setVideoPreviewFile(null)}
          onDownload={(file) => window.open(getFileUrl(file.id, 'download', true), '_blank')}
          onShare={(file) => {
            setSelectedFileForAction(file);
            setShareModalOpen(true);
            setVideoPreviewFile(null);
          }}
        />
      )}

      {/* Document Viewer */}
      {documentPreviewFile && (
        <DocumentViewer
          file={documentPreviewFile}
          isOpen={!!documentPreviewFile}
          onClose={() => setDocumentPreviewFile(null)}
          files={documentFiles}
          onNavigate={(file) => setDocumentPreviewFile(file)}
          onDownload={(file) => window.open(getFileUrl(file.id, 'download', true), '_blank')}
          onShare={(file) => {
            setSelectedFileForAction(file);
            setShareModalOpen(true);
            setDocumentPreviewFile(null);
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={isDeleteConfirmOpen}
        onClose={() => {
          setDeleteConfirmOpen(false);
          setDeleteConfirmData(null);
        }}
        onConfirm={performDelete}
        title={t('files.deleteItems')}
        message={
          deleteConfirmData ? (
            <>
              {t('files.confirmDeleteItems', { count: deleteConfirmData.files.length + deleteConfirmData.folders.length })}
              <br />
              <span className="text-sm">{t('files.moveToTrashWarning')}</span>
            </>
          ) : ''
        }
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        variant="danger"
        loading={isDeleting}
      />
    </div>
  );
}
