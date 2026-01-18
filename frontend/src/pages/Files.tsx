import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useSearchParams, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, openSignedFileUrl } from '../lib/api';
import { FileItem, Folder } from '../types';
import { useFileStore } from '../stores/fileStore';
import { useMusicStore } from '../stores/musicStore';
import { useGlobalProgressStore } from '../stores/globalProgressStore';
import FileCard from '../components/files/FileCard';
import FolderCard from '../components/files/FolderCard';
import VirtualizedGrid from '../components/ui/VirtualizedGrid';
import { FolderPlus, Loader2 } from 'lucide-react';
import { toast } from '../components/ui/Toast';
import { isAudio, isImage, isVideo, isDocument } from '../lib/utils';
import UploadModal from '../components/modals/UploadModal';
import CreateFolderModal from '../components/modals/CreateFolderModal';
import CreateFileModal from '../components/modals/CreateFileModal';
import ShareModal from '../components/modals/ShareModal';
import RenameModal from '../components/modals/RenameModal';
import ConfirmModal from '../components/ui/ConfirmModal';
import ImageGallery from '../components/gallery/ImageGallery';
import VideoPlayerModal from '../components/gallery/VideoPlayerModal';
import DocumentViewer from '../components/gallery/DocumentViewer';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { SkeletonGrid } from '../components/ui/Skeleton';

import MoveModal from '../components/modals/MoveModal';

export default function Files() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const { folderId: paramFolderId } = useParams();
  const folderId = paramFolderId || searchParams.get('folder');
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
  const [isMoveModalOpen, setMoveModalOpen] = useState(false);

  // Gallery states
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [videoPreviewFile, setVideoPreviewFile] = useState<FileItem | null>(null);
  const [documentPreviewFile, setDocumentPreviewFile] = useState<FileItem | null>(null);

  // Pagination state
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const loadAbortRef = useRef<AbortController | null>(null);

  const viewMode = useFileStore((state) => state.viewMode);
  const sortBy = useFileStore((state) => state.sortBy);
  const sortOrder = useFileStore((state) => state.sortOrder);
  const clearSelection = useFileStore((state) => state.clearSelection);
  const setBreadcrumbs = useFileStore((state) => state.setBreadcrumbs);
  const selectAll = useFileStore((state) => state.selectAll);
  const selectSingle = useFileStore((state) => state.selectSingle);
  const selectedItems = useFileStore((state) => state.selectedItems);
  const { addOperation, incrementProgress, completeOperation, failOperation } = useGlobalProgressStore();
  const { play } = useMusicStore();

  // Get selected file and folder IDs
  const selectedFileIds = useMemo(() => {
    return files.filter(f => selectedItems.has(f.id)).map(f => f.id);
  }, [files, selectedItems]);

  const selectedFolderIds = useMemo(() => {
    return folders.filter(f => selectedItems.has(f.id)).map(f => f.id);
  }, [folders, selectedItems]);

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
      loadData(1, false, false);
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

  // Bulk move selected items
  const handleMoveSelected = useCallback(() => {
    const total = selectedFileIds.length + selectedFolderIds.length;
    if (total === 0) return;
    setMoveModalOpen(true);
  }, [selectedFileIds, selectedFolderIds]);

  // Get items to move for MoveModal
  const itemsToMove = useMemo(() => {
    const { selectedFiles, selectedFolders } = getSelectedItems();
    return [...selectedFiles, ...selectedFolders];
  }, [getSelectedItems]);

  // Bulk favorite selected items
  const handleFavoriteSelected = useCallback(async () => {
    const total = selectedFileIds.length + selectedFolderIds.length;
    if (total === 0) return;

    try {
      if (selectedFileIds.length > 0) {
        await api.post('/files/bulk/favorite', {
          fileIds: selectedFileIds,
          isFavorite: true,
        });
      }
      if (selectedFolderIds.length > 0) {
        await api.post('/folders/bulk/favorite', {
          folderIds: selectedFolderIds,
          isFavorite: true,
        });
      }
      toast(t('toolbar.bulkFavoriteSuccess', { count: total }), 'success');
      clearSelection();
      // Dispatch refresh event instead of calling loadData directly
      window.dispatchEvent(new CustomEvent('workzone-refresh'));
    } catch (error) {
      toast(t('toolbar.bulkError'), 'error');
    }
  }, [selectedFileIds, selectedFolderIds, clearSelection, t]);

  // Bulk actions triggered from the global Header selection toolbar
  useEffect(() => {
    const onOpenMoveModal = () => handleMoveSelected();
    const onBulkFavorite = () => { void handleFavoriteSelected(); };

    window.addEventListener('workzone-open-move-modal', onOpenMoveModal);
    window.addEventListener('workzone-bulk-favorite', onBulkFavorite);

    return () => {
      window.removeEventListener('workzone-open-move-modal', onOpenMoveModal);
      window.removeEventListener('workzone-bulk-favorite', onBulkFavorite);
    };
  }, [handleMoveSelected, handleFavoriteSelected]);

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

  const handleFavoriteFromGallery = useCallback(async (file: FileItem) => {
    try {
      await api.patch(`/files/${file.id}/favorite`);
      toast(file.isFavorite ? t('fileCard.removedFromFavorites') : t('fileCard.addedToFavorites'), 'success');
      setFiles((prev) => prev.map((item) => (
        item.id === file.id ? { ...item, isFavorite: !item.isFavorite } : item
      )));
    } catch {
      toast(t('fileCard.favoriteError'), 'error');
    }
  }, [t]);

  const audioQueue = useMemo(() => {
    return files.filter((f) => isAudio(f.mimeType));
  }, [files]);

  const handleAudioOpen = useCallback((file: FileItem) => {
    const queue = audioQueue.length > 0 ? audioQueue : [file];
    play(file, queue);
  }, [audioQueue, play]);

  const handleMoveFromGallery = useCallback((file: FileItem) => {
    selectSingle(file.id);
    setMoveModalOpen(true);
  }, [selectSingle]);

  const handleRenameFromGallery = useCallback((file: FileItem) => {
    setSelectedFileForAction(file);
    setRenameModalOpen(true);
  }, []);

  const handleDeleteFromGallery = useCallback((file: FileItem) => {
    openDeleteConfirmForIds([file.id]);
  }, [openDeleteConfirmForIds]);

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
      } else if (isAudio(file.mimeType)) {
        handleAudioOpen(file);
      }
    }
  }, [getSelectedItems, imageFiles, handleAudioOpen]);

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

  const loadData = useCallback(async (pageNum: number = 1, append: boolean = false, showLoading: boolean = true) => {
    loadAbortRef.current?.abort();
    const abortController = new AbortController();
    loadAbortRef.current = abortController;

    if (append) {
      setLoadingMore(true);
    } else {
      if (showLoading) {
        setLoading(true);
      }
      setPage(1);
      setHasMore(true);
    }
    try {
      const effectiveFolderId = folderId ?? 'null';

      const params: Record<string, string> = {
        sortBy,
        sortOrder,
        folderId: effectiveFolderId,
        page: pageNum.toString(),
        limit: '50',
      };

      if (searchQuery) {
        params.search = searchQuery;
      }

      const filesPromise = api.get('/files', { params, signal: abortController.signal });

      const foldersPromise = append
        ? Promise.resolve(null)
        : api.get('/folders', {
          params: { parentId: effectiveFolderId, ...(searchQuery && { search: searchQuery }) },
          signal: abortController.signal,
        });

      const breadcrumbPromise = !append && folderId
        ? api.get(`/folders/${folderId}`, { signal: abortController.signal })
        : Promise.resolve(null);

      const [filesRes, foldersRes, folderRes] = await Promise.all([
        filesPromise,
        foldersPromise,
        breadcrumbPromise,
      ]);

      const newFiles = filesRes.data.files || [];
      const pagination = filesRes.data.pagination;

      // Update hasMore based on pagination
      if (pagination) {
        setHasMore(pagination.page < pagination.totalPages);
        setPage(pagination.page);
      } else {
        setHasMore(newFiles.length === 50);
      }

      if (append) {
        setFiles(prev => [...prev, ...newFiles]);
      } else {
        setFiles(newFiles);
        setFolders(foldersRes?.data || []);
      }

      // Load breadcrumbs only on first page
      if (!append && folderId) {
        const crumbs = folderRes?.data?.breadcrumb ?? [];
        setBreadcrumbs(crumbs);
      } else if (!append) {
        setBreadcrumbs([]);
      }
    } catch (error) {
      const err = error as { code?: string; name?: string };
      if (abortController.signal.aborted || err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') {
        return;
      }
      console.error('Error loading files:', error);
      toast(t('files.errorLoading'), 'error');
    } finally {
      if (!abortController.signal.aborted) {
        if (showLoading) {
          setLoading(false);
        }
        setLoadingMore(false);
      }
    }
  }, [folderId, searchQuery, sortBy, sortOrder, setBreadcrumbs]);

  const refreshData = useCallback(() => {
    void loadData(1, false, false);
  }, [loadData]);

  // Load more function for pagination
  const loadMore = useCallback(() => {
    if (!loadingMore && hasMore && !loading) {
      loadData(page + 1, true);
    }
  }, [loadData, page, loadingMore, hasMore, loading]);

  // Infinite scroll observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    const currentRef = loadMoreRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [hasMore, loadingMore, loading, loadMore]);

  useEffect(() => {
    loadData();
    clearSelection();
  }, [loadData, clearSelection]);

  useEffect(() => () => loadAbortRef.current?.abort(), []);

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
    const handleRefresh = () => loadData(1, false, false);
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
    } else if (isAudio(file.mimeType)) {
      handleAudioOpen(file);
    }
  }, [imageFiles, handleAudioOpen]);

  return (
    <div className="min-h-[400px]">

      {/* Contenido */}
      {loading ? (
        <SkeletonGrid count={12} view={viewMode} />
      ) : files.length === 0 && folders.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center h-64 text-dark-500">
          <FolderPlus className={`w-16 h-16 mb-4 opacity-50 ${searchQuery ? 'text-dark-400' : 'text-primary-400'}`} />
          <p className="text-lg font-medium">{searchQuery ? t('files.noSearchResults') : t('files.noFiles')}</p>
          <p className="text-sm">{searchQuery ? t('files.tryDifferentSearch') : t('files.uploadOrCreate')}</p>
        </div>
      ) : (
        <div>
          <VirtualizedGrid
            items={[...folders, ...files]}
            viewMode={viewMode}
            scrollElementId="main-content"
            estimateListItemHeight={85}
            renderItem={(item, _index, _style) => (
              'parentId' in item ? (
                <FolderCard
                  folder={item as Folder}
                  view={viewMode}
                  onRefresh={refreshData}
                  disableAnimation
                />
              ) : (
                <FileCard
                  file={item as FileItem}
                  view={viewMode}
                  onRefresh={refreshData}
                  onPreview={handleFileClick}
                  disableAnimation
                  onFavoriteToggle={(fileId, isFavorite) => {
                    setFiles(prev => prev.map(f => f.id === fileId ? { ...f, isFavorite } : f));
                  }}
                />
              )
            )}
          />
        </div>
      )}

      {/* Load More Sentinel */}
      {(files.length > 0 || folders.length > 0) && (
        <div ref={loadMoreRef} className="flex justify-center py-8">
          {loadingMore && (
            <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
          )}
          {!hasMore && files.length >= 50 && (
            <p className="text-sm text-dark-400">{t('common.noMoreItems')}</p>
          )}
        </div>
      )}

      {/* Modales */}
      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        folderId={folderId}
        onSuccess={refreshData}
      />
      <CreateFolderModal
        isOpen={isCreateFolderModalOpen}
        onClose={() => setCreateFolderModalOpen(false)}
        parentId={folderId}
        onSuccess={refreshData}
      />

      {/* Create File Modal */}
      <CreateFileModal
        isOpen={isCreateFileModalOpen}
        onClose={() => setCreateFileModalOpen(false)}
        folderId={folderId}
        onSuccess={refreshData}
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
          onSuccess={refreshData}
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
          onSuccess={refreshData}
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
        onFavorite={handleFavoriteFromGallery}
        onMove={handleMoveFromGallery}
        onRename={handleRenameFromGallery}
        onDelete={handleDeleteFromGallery}
      />

      {/* Video Preview */}
      {videoPreviewFile && (
        <VideoPlayerModal
          file={videoPreviewFile}
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

      {/* File Toolbar for bulk actions - Removed as it's now in Header */}

      {/* Move Modal */}
      <MoveModal
        isOpen={isMoveModalOpen}
        onClose={() => {
          setMoveModalOpen(false);
          clearSelection();
        }}
        items={itemsToMove}
        onSuccess={() => {
          clearSelection();
          window.dispatchEvent(new CustomEvent('workzone-refresh'));
        }}
      />

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
