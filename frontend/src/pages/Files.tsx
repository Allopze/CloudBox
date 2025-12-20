import { useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, openSignedFileUrl } from '../lib/api';
import { FileItem, Folder } from '../types';
import { useFileStore } from '../stores/fileStore';
import { useGlobalProgressStore } from '../stores/globalProgressStore';
import FileCard from '../components/files/FileCard';
import FolderCard from '../components/files/FolderCard';
import { Loader2, FolderPlus } from 'lucide-react';
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
import { motion, useReducedMotion } from 'framer-motion';
import { waveIn } from '../lib/animations';

export default function Files() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const folderId = searchParams.get('folder');
  const searchQuery = searchParams.get('search');
  const reducedMotion = useReducedMotion();

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

  // Gallery states
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [videoPreviewFile, setVideoPreviewFile] = useState<FileItem | null>(null);
  const [documentPreviewFile, setDocumentPreviewFile] = useState<FileItem | null>(null);

  const viewMode = useFileStore((state) => state.viewMode);
  const sortBy = useFileStore((state) => state.sortBy);
  const sortOrder = useFileStore((state) => state.sortOrder);
  const clearSelection = useFileStore((state) => state.clearSelection);
  const setBreadcrumbs = useFileStore((state) => state.setBreadcrumbs);
  const selectAll = useFileStore((state) => state.selectAll);
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
    const selectedIds = useFileStore.getState().selectedItems;
    const selectedFiles = files.filter(f => selectedIds.has(f.id));
    const selectedFolders = folders.filter(f => selectedIds.has(f.id));
    return { selectedFiles, selectedFolders };
  }, [files, folders]);

  // Delete selected items - show confirmation modal
  const handleDeleteSelected = useCallback(() => {
    const { selectedFiles, selectedFolders } = getSelectedItems();
    const total = selectedFiles.length + selectedFolders.length;

    if (total === 0) return;

    setDeleteConfirmData({ files: selectedFiles, folders: selectedFolders });
    setDeleteConfirmOpen(true);
  }, [getSelectedItems]);

  // Open delete confirmation for a provided list of ids (used by card context menus)
  const openDeleteConfirmForIds = useCallback((ids: string[]) => {
    if (!ids || ids.length === 0) return;
    const selectedFiles = files.filter(f => ids.includes(f.id));
    const selectedFolders = folders.filter(f => ids.includes(f.id));
    const total = selectedFiles.length + selectedFolders.length;
    if (total === 0) return;
    setDeleteConfirmData({ files: selectedFiles, folders: selectedFolders });
    setDeleteConfirmOpen(true);
  }, [files, folders]);

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
      // Note: No toast here - GlobalProgressIndicator already shows completion
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
      void openSignedFileUrl(file.id, 'download');
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
        api.get('/folders', { params: { parentId: effectiveFolderId, ...(searchQuery && { search: searchQuery }) } }),
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

  // Listen for delete requests from cards (to avoid duplicate confirm modals)
  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<{ ids?: string[] }>;
      const ids = custom.detail?.ids || [];
      openDeleteConfirmForIds(ids);
    };
    window.addEventListener('file-delete-request', handler as EventListener);
    return () => window.removeEventListener('file-delete-request', handler as EventListener);
  }, [openDeleteConfirmForIds]);

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
    <div className="min-h-[400px]">

      {/* Contenido */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
        </div>
      ) : files.length === 0 && folders.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center h-64 text-dark-500">
          <FolderPlus className={`w-16 h-16 mb-4 opacity-50 ${searchQuery ? 'text-dark-400' : 'text-primary-400'}`} />
          <p className="text-lg font-medium">{searchQuery ? t('files.noSearchResults') : t('files.noFiles')}</p>
          <p className="text-sm">{searchQuery ? t('files.tryDifferentSearch') : t('files.uploadOrCreate')}</p>
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
          {folders.map((folder, index) => (
            <motion.div
              key={folder.id}
              {...waveIn(index, reducedMotion)}
              className={viewMode === 'grid' ? undefined : 'w-full'}
            >
              <FolderCard
                folder={folder}
                view={viewMode}
                onRefresh={loadData}
              />
            </motion.div>
          ))}

          {/* Luego archivos */}
          {files.map((file, index) => (
            <motion.div
              key={file.id}
              {...waveIn(folders.length + index, reducedMotion)}
              className={viewMode === 'grid' ? undefined : 'w-full'}
            >
              <FileCard
                file={file}
                view={viewMode}
                onRefresh={loadData}
                onPreview={handleFileClick}
                onFavoriteToggle={(fileId, isFavorite) => {
                  setFiles(prev => prev.map(f => f.id === fileId ? { ...f, isFavorite } : f));
                }}
              />
            </motion.div>
          ))}
        </div>
      )}

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
        onDownload={(file) => void openSignedFileUrl(file.id, 'download')}
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
          onDownload={(file) => void openSignedFileUrl(file.id, 'download')}
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
          onDownload={(file) => void openSignedFileUrl(file.id, 'download')}
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
