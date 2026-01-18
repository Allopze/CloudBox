import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { api, openSignedFileUrl } from '../lib/api';
import { FileItem, Folder } from '../types';
import { useFileStore } from '../stores/fileStore';
import FileCard from '../components/files/FileCard';
import FolderCard from '../components/files/FolderCard';
import { Loader2, Star } from 'lucide-react';
import { toast } from '../components/ui/Toast';
import { cn, isImage, isVideo, isDocument } from '../lib/utils';
import ImageGallery from '../components/gallery/ImageGallery';
import VideoPlayerModal from '../components/gallery/VideoPlayerModal';
import DocumentViewer from '../components/gallery/DocumentViewer';
import ShareModal from '../components/modals/ShareModal';
import { motion, useReducedMotion } from 'framer-motion';
import { waveIn } from '../lib/animations';

export default function Favorites() {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);

  // Pagination state
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Preview states
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [videoPreviewFile, setVideoPreviewFile] = useState<FileItem | null>(null);
  const [documentPreviewFile, setDocumentPreviewFile] = useState<FileItem | null>(null);
  const [shareFile, setShareFile] = useState<FileItem | null>(null);

  const { viewMode, sortBy, sortOrder, clearSelection } = useFileStore();

  // Get image files for gallery
  const imageFiles = useMemo(() => {
    return files.filter(f => isImage(f.mimeType));
  }, [files]);

  const loadData = useCallback(async (pageNum: number = 1, append: boolean = false) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setPage(1);
      setHasMore(true);
    }
    try {
      const filesRes = await api.get('/files', { params: { favorites: true, sortBy, sortOrder, page: pageNum.toString(), limit: '50' } });

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
        // Fetch folders only on initial load
        const foldersRes = await api.get('/folders', { params: { favorites: true } });
        setFiles(newFiles);
        setFolders(foldersRes.data.filter((f: Folder) => f.isFavorite) || []);
      }
    } catch (error) {
      console.error('Failed to load favorites:', error);
      toast(t('favorites.loadError'), 'error');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [sortBy, sortOrder]);

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

  // Listen for workzone refresh event from MainLayout
  useEffect(() => {
    const handleRefresh = () => loadData();
    window.addEventListener('workzone-refresh', handleRefresh);
    return () => window.removeEventListener('workzone-refresh', handleRefresh);
  }, [loadData]);

  // Handle file preview
  const handleFilePreview = useCallback((file: FileItem) => {
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
    <div>
      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
        </div>
      ) : files.length === 0 && folders.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-dark-500">
          <Star className="w-16 h-16 mb-4 opacity-50 text-yellow-400" />
          <p className="text-lg font-medium">{t('favorites.noFavorites')}</p>
          <p className="text-sm">{t('favorites.addFavorites')}</p>
        </div>
      ) : (
        <div
          className={cn(
            viewMode === 'grid'
              ? 'grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3'
              : 'space-y-1'
          )}
        >
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
                onPreview={handleFilePreview}
                onFavoriteToggle={(fileId, isFavorite) => {
                  // In favorites page, unfavoriting removes the file from the list
                  if (!isFavorite) {
                    setFiles(prev => prev.filter(f => f.id !== fileId));
                  } else {
                    setFiles(prev => prev.map(f => f.id === fileId ? { ...f, isFavorite } : f));
                  }
                }}
              />
            </motion.div>
          ))}
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

      {/* Image Gallery */}
      <ImageGallery
        images={imageFiles}
        initialIndex={galleryIndex}
        isOpen={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        onDownload={(file) => void openSignedFileUrl(file.id, 'download')}
        onShare={(file) => {
          setShareFile(file);
          setGalleryOpen(false);
        }}
      />

      {/* Video Preview */}
      {videoPreviewFile && (
        <VideoPlayerModal
          file={videoPreviewFile}
          onClose={() => setVideoPreviewFile(null)}
          onDownload={(file) => void openSignedFileUrl(file.id, 'download')}
          onShare={(file) => {
            setShareFile(file);
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
          onDownload={(file) => void openSignedFileUrl(file.id, 'download')}
          onShare={(file) => {
            setShareFile(file);
            setDocumentPreviewFile(null);
          }}
        />
      )}

      {/* Share Modal */}
      {shareFile && (
        <ShareModal
          isOpen={!!shareFile}
          onClose={() => setShareFile(null)}
          file={shareFile}
        />
      )}
    </div>
  );
}
