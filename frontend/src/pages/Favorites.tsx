import { useEffect, useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { api, getFileUrl } from '../lib/api';
import { FileItem, Folder } from '../types';
import { useFileStore } from '../stores/fileStore';
import FileCard from '../components/files/FileCard';
import FolderCard from '../components/files/FolderCard';
import { Loader2 } from 'lucide-react';
import { toast } from '../components/ui/Toast';
import { cn, isImage, isVideo, isDocument } from '../lib/utils';
import ImageGallery from '../components/gallery/ImageGallery';
import VideoPreview from '../components/gallery/VideoPreview';
import DocumentViewer from '../components/gallery/DocumentViewer';
import ShareModal from '../components/modals/ShareModal';

export default function Favorites() {
  const { t } = useTranslation();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);

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

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [filesRes, foldersRes] = await Promise.all([
        api.get('/files', { params: { favorites: true, sortBy, sortOrder } }),
        api.get('/folders', { params: { favorites: true } }),
      ]);

      setFiles(filesRes.data.files || []);
      setFolders(foldersRes.data.filter((f: Folder) => f.isFavorite) || []);
    } catch (error) {
      console.error('Failed to load favorites:', error);
      toast(t('favorites.loadError'), 'error');
    } finally {
      setLoading(false);
    }
  }, [sortBy, sortOrder]);

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
      ) : (
        <div
          className={cn(
            viewMode === 'grid'
              ? 'grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3'
              : 'space-y-1'
          )}
        >
          {folders.map((folder) => (
            <FolderCard
              key={folder.id}
              folder={folder}
              view={viewMode}
              onRefresh={loadData}
            />
          ))}
          {files.map((file) => (
            <FileCard
              key={file.id}
              file={file}
              view={viewMode}
              onRefresh={loadData}
              onPreview={handleFilePreview}
            />
          ))}
        </div>
      )}

      {/* Image Gallery */}
      <ImageGallery
        images={imageFiles}
        initialIndex={galleryIndex}
        isOpen={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        onDownload={(file) => window.open(getFileUrl(file.id, 'download'), '_blank')}
        onShare={(file) => {
          setShareFile(file);
          setGalleryOpen(false);
        }}
      />

      {/* Video Preview */}
      {videoPreviewFile && (
        <VideoPreview
          file={videoPreviewFile}
          isOpen={!!videoPreviewFile}
          onClose={() => setVideoPreviewFile(null)}
          onDownload={(file) => window.open(getFileUrl(file.id, 'download'), '_blank')}
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
          onDownload={(file) => window.open(getFileUrl(file.id, 'download'), '_blank')}
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
