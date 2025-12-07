import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, getFileUrl } from '../lib/api';
import { FileItem } from '../types';
import { useFileStore } from '../stores/fileStore';
import FileCard from '../components/files/FileCard';
import DocumentThumbnail from '../components/files/DocumentThumbnail';
import {
  Loader2, FileText, FileSpreadsheet, File, Eye, Heart, Check,
  Download, Share2, Trash2, Info, Copy, Star, Code, Presentation
} from 'lucide-react';
import { toast } from '../components/ui/Toast';
import { cn, formatBytes, formatDate } from '../lib/utils';
import UploadModal from '../components/modals/UploadModal';
import DocumentViewer from '../components/gallery/DocumentViewer';
import ShareModal from '../components/modals/ShareModal';
import { motion, AnimatePresence } from 'framer-motion';
import Button from '../components/ui/Button';

interface ContextMenuState {
  x: number;
  y: number;
  doc: FileItem;
}

// Get icon and color based on document type
const getDocumentStyle = (mimeType: string, fileName: string) => {
  if (mimeType === 'application/pdf' || fileName.endsWith('.pdf')) {
    return {
      icon: FileText,
      gradient: ['from-red-400', 'to-red-600'],
      color: 'text-red-500'
    };
  }
  if (mimeType.includes('word') || fileName.endsWith('.doc') || fileName.endsWith('.docx')) {
    return {
      icon: FileText,
      gradient: ['from-blue-400', 'to-blue-600'],
      color: 'text-blue-500'
    };
  }
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet') ||
    fileName.endsWith('.xls') || fileName.endsWith('.xlsx') || fileName.endsWith('.csv')) {
    return {
      icon: FileSpreadsheet,
      gradient: ['from-green-400', 'to-green-600'],
      color: 'text-green-500'
    };
  }
  if (mimeType.includes('presentation') || fileName.endsWith('.ppt') || fileName.endsWith('.pptx')) {
    return {
      icon: FileText,
      gradient: ['from-orange-400', 'to-orange-600'],
      color: 'text-orange-500'
    };
  }
  if (mimeType === 'text/plain' || fileName.endsWith('.txt')) {
    return {
      icon: FileText,
      gradient: ['from-gray-400', 'to-gray-600'],
      color: 'text-gray-500'
    };
  }
  if (mimeType === 'text/markdown' || fileName.endsWith('.md')) {
    return {
      icon: FileText,
      gradient: ['from-purple-400', 'to-purple-600'],
      color: 'text-purple-500'
    };
  }
  return {
    icon: File,
    gradient: ['from-slate-400', 'to-slate-600'],
    color: 'text-slate-500'
  };
};

// Get file extension for badge
const getExtension = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toUpperCase() || '';
  return ext.length <= 4 ? ext : '';
};

export default function Documents() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [documents, setDocuments] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<FileItem | null>(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareFile, setShareFile] = useState<FileItem | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [infoDoc, setInfoDoc] = useState<FileItem | null>(null);

  const tab = searchParams.get('tab') || 'all';

  const { viewMode, sortBy, sortOrder, selectedItems, addToSelection, removeFromSelection, selectRange, selectSingle, lastSelectedId, clearSelection } = useFileStore();

  // Filter documents based on category tab
  const filterByCategory = useCallback((docs: FileItem[]) => {
    if (tab === 'all') return docs;

    return docs.filter(doc => {
      const mimeType = doc.mimeType.toLowerCase();
      const fileName = doc.name.toLowerCase();

      switch (tab) {
        case 'pdf':
          return mimeType === 'application/pdf' || fileName.endsWith('.pdf');
        case 'text':
          return mimeType.includes('word') ||
            mimeType === 'text/plain' ||
            mimeType === 'text/markdown' ||
            fileName.endsWith('.doc') ||
            fileName.endsWith('.docx') ||
            fileName.endsWith('.txt') ||
            fileName.endsWith('.md') ||
            fileName.endsWith('.rtf');
        case 'spreadsheet':
          return mimeType.includes('excel') ||
            mimeType.includes('spreadsheet') ||
            fileName.endsWith('.xls') ||
            fileName.endsWith('.xlsx') ||
            fileName.endsWith('.csv');
        case 'presentation':
          return mimeType.includes('presentation') ||
            mimeType.includes('powerpoint') ||
            fileName.endsWith('.ppt') ||
            fileName.endsWith('.pptx');
        case 'code':
          return mimeType.includes('javascript') ||
            mimeType.includes('typescript') ||
            mimeType.includes('json') ||
            mimeType.includes('xml') ||
            mimeType.includes('html') ||
            mimeType.includes('css') ||
            fileName.endsWith('.js') ||
            fileName.endsWith('.ts') ||
            fileName.endsWith('.jsx') ||
            fileName.endsWith('.tsx') ||
            fileName.endsWith('.json') ||
            fileName.endsWith('.xml') ||
            fileName.endsWith('.html') ||
            fileName.endsWith('.css') ||
            fileName.endsWith('.py') ||
            fileName.endsWith('.java') ||
            fileName.endsWith('.c') ||
            fileName.endsWith('.cpp') ||
            fileName.endsWith('.h') ||
            fileName.endsWith('.go') ||
            fileName.endsWith('.rs') ||
            fileName.endsWith('.php') ||
            fileName.endsWith('.rb') ||
            fileName.endsWith('.swift') ||
            fileName.endsWith('.kt') ||
            fileName.endsWith('.sql') ||
            fileName.endsWith('.sh') ||
            fileName.endsWith('.yaml') ||
            fileName.endsWith('.yml');
        default:
          return true;
      }
    });
  }, [tab]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/files', {
        params: {
          type: 'documents',
          sortBy,
          sortOrder,
        },
      });
      const allDocs = response.data.files || [];
      setDocuments(filterByCategory(allDocs));
    } catch (error) {
      console.error('Failed to load documents:', error);
      toast(t('documents.loadError'), 'error');
    } finally {
      setLoading(false);
    }
  }, [sortBy, sortOrder, filterByCategory]);

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

  // Context menu handlers
  const handleContextMenu = (e: React.MouseEvent, doc: FileItem) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, doc });
  };

  const closeContextMenu = () => setContextMenu(null);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClick = () => closeContextMenu();
    if (contextMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu]);

  const handlePreview = (file: FileItem) => {
    setSelectedDocument(file);
    setViewerOpen(true);
  };

  const handleDownload = (file: FileItem) => {
    window.open(getFileUrl(file.id, 'download'), '_blank');
    closeContextMenu();
  };

  const handleShare = (file: FileItem) => {
    setShareFile(file);
    setShareModalOpen(true);
    closeContextMenu();
  };

  const handleNavigate = (file: FileItem) => {
    setSelectedDocument(file);
  };

  const handleCopyLink = async (doc: FileItem) => {
    try {
      const url = `${window.location.origin}${getFileUrl(doc.id, 'view')}`;
      await navigator.clipboard.writeText(url);
      toast(t('documents.linkCopied'), 'success');
    } catch {
      toast(t('documents.linkCopyError'), 'error');
    }
    closeContextMenu();
  };

  const handleShowInfo = (doc: FileItem) => {
    setInfoDoc(doc);
    closeContextMenu();
  };

  const handleFavorite = async (doc: FileItem) => {
    try {
      await api.patch(`/files/${doc.id}/favorite`);
      setDocuments(prev => prev.map(d =>
        d.id === doc.id ? { ...d, isFavorite: !d.isFavorite } : d
      ));
      toast(doc.isFavorite ? t('documents.removedFromFavorites') : t('documents.addedToFavorites'), 'success');
    } catch {
      toast(t('documents.favoriteError'), 'error');
    }
    closeContextMenu();
  };

  const handleDelete = async (doc: FileItem) => {
    try {
      await api.delete(`/files/${doc.id}`);
      toast(t('documents.movedToTrash'), 'success');
      clearSelection();
      loadData();
    } catch {
      toast(t('documents.deleteError'), 'error');
    }
    closeContextMenu();
  };

  const toggleFavorite = async (e: React.MouseEvent, doc: FileItem) => {
    e.stopPropagation();
    try {
      await api.patch(`/files/${doc.id}/favorite`);
      setDocuments(prev => prev.map(d =>
        d.id === doc.id ? { ...d, isFavorite: !d.isFavorite } : d
      ));
      toast(doc.isFavorite ? t('documents.removedFromFavorites') : t('documents.addedToFavorites'), 'success');
    } catch {
      toast(t('documents.favoriteError'), 'error');
    }
  };

  // Remove file extension from name for display
  const getDisplayName = (name: string) => {
    return name.replace(/\.[^/.]+$/, '');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div>
      {/* Content - Visual card grid view */}
      {documents.length > 0 ? (
        viewMode === 'grid' ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
            {documents.map((doc) => {
              const isSelected = selectedItems.has(doc.id);

              const handleDocClick = (e: React.MouseEvent) => {
                // Shift+Click: Range selection
                if (e.shiftKey && lastSelectedId) {
                  const ids = documents.map(d => d.id);
                  selectRange(ids, doc.id);
                }
                // Ctrl/Meta+Click: Toggle selection
                else if (e.ctrlKey || e.metaKey) {
                  if (isSelected) {
                    removeFromSelection(doc.id);
                  } else {
                    addToSelection(doc.id);
                  }
                }
                // Simple click with selection: select single
                else if (selectedItems.size > 0 && !isSelected) {
                  selectSingle(doc.id);
                }
                // Simple click: preview document
                else {
                  handlePreview(doc);
                }
              };

              return (
                <motion.div
                  key={doc.id}
                  data-file-item={doc.id}
                  onClick={handleDocClick}
                  onDoubleClick={() => handlePreview(doc)}
                  onContextMenu={(e) => handleContextMenu(e, doc)}
                  animate={isSelected ? { scale: 0.95 } : { scale: 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  className={cn(
                    'group cursor-pointer rounded-xl transition-all duration-200 p-2',
                    'hover:bg-dark-100 dark:hover:bg-dark-800',
                    isSelected && 'ring-3 ring-primary-500 ring-offset-2 ring-offset-white dark:ring-offset-dark-900'
                  )}
                >
                  {/* Document preview / Cover */}
                  <div className="relative aspect-[3/4] rounded-lg overflow-hidden mb-3 shadow-md">
                    {/* Document thumbnail with live preview */}
                    <DocumentThumbnail
                      fileId={doc.id}
                      fileName={doc.name}
                      mimeType={doc.mimeType}
                    />

                    {/* Selection indicator */}
                    {isSelected && (
                      <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-primary-500 flex items-center justify-center shadow-lg z-20">
                        <Check className="w-4 h-4 text-white" />
                      </div>
                    )}

                    {/* Favorite button */}
                    <button
                      onClick={(e) => toggleFavorite(e, doc)}
                      className={cn(
                        'absolute top-2 right-2 p-1.5 rounded-full transition-all z-10',
                        doc.isFavorite
                          ? 'bg-red-500 text-white'
                          : 'bg-black/40 text-white opacity-0 group-hover:opacity-100 hover:bg-black/60'
                      )}
                      aria-label={doc.isFavorite ? t('common.removeFromFavorites') : t('common.addToFavorites')}
                    >
                      <Heart className={cn('w-4 h-4', doc.isFavorite && 'fill-current')} />
                    </button>

                    {/* Preview overlay on hover */}
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="w-12 h-12 rounded-full bg-primary-500 flex items-center justify-center shadow-lg transform transition-transform group-hover:scale-110">
                        <Eye className="w-6 h-6 text-white" />
                      </div>
                    </div>

                    {/* File size badge */}
                    <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/60 rounded text-xs text-white font-medium z-10">
                      {formatBytes(doc.size)}
                    </div>
                  </div>

                  {/* Document info */}
                  <div className="px-1">
                    <p className="font-medium text-sm truncate text-dark-900 dark:text-white">
                      {getDisplayName(doc.name)}
                    </p>
                    <p className="text-xs text-dark-500 truncate">
                      {formatDate(doc.createdAt)}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        ) : (
          // List view - use FileCard for consistency
          <div className="space-y-1">
            {documents.map((doc) => (
              <FileCard
                key={doc.id}
                file={doc}
                view={viewMode}
                onRefresh={loadData}
                onPreview={handlePreview}
              />
            ))}
          </div>
        )
      ) : (
        (() => {
          // Get icon and text based on current tab
          const getEmptyStateConfig = () => {
            switch (tab) {
              case 'pdf':
                return {
                  icon: FileText,
                  title: t('documents.noPdfs'),
                  subtitle: t('documents.uploadPdfs'),
                  color: 'text-red-400'
                };
              case 'text':
                return {
                  icon: FileText,
                  title: t('documents.noText'),
                  subtitle: t('documents.uploadText'),
                  color: 'text-blue-400'
                };
              case 'spreadsheet':
                return {
                  icon: FileSpreadsheet,
                  title: t('documents.noSpreadsheets'),
                  subtitle: t('documents.uploadSpreadsheets'),
                  color: 'text-green-400'
                };
              case 'presentation':
                return {
                  icon: Presentation,
                  title: t('documents.noPresentations'),
                  subtitle: t('documents.uploadPresentations'),
                  color: 'text-orange-400'
                };
              case 'code':
                return {
                  icon: Code,
                  title: t('documents.noCode'),
                  subtitle: t('documents.uploadCode'),
                  color: 'text-purple-400'
                };
              default:
                return {
                  icon: FileText,
                  title: t('documents.noDocuments'),
                  subtitle: t('documents.uploadDocuments'),
                  color: 'text-dark-400'
                };
            }
          };
          const { icon: EmptyIcon, title, subtitle, color } = getEmptyStateConfig();
          return (
            <div className="flex flex-col items-center justify-center h-64 text-dark-500">
              <EmptyIcon className={`w-16 h-16 mb-4 opacity-50 ${color}`} />
              <p className="text-lg font-medium">{title}</p>
              <p className="text-sm">{subtitle}</p>
            </div>
          );
        })()
      )}

      {/* Context Menu */}
      <AnimatePresence>
        {contextMenu && (() => {
          // Get current selection state
          const currentSelectedItems = useFileStore.getState().selectedItems;
          const isMultiSelect = currentSelectedItems.size > 1 && currentSelectedItems.has(contextMenu.doc.id);
          const selectedCount = isMultiSelect ? currentSelectedItems.size : 1;

          const menuWidth = 288;
          const baseHeight = isMultiSelect ? 180 : 380;
          const padding = 20;

          let left = contextMenu.x + menuWidth > window.innerWidth ? contextMenu.x - menuWidth : contextMenu.x;
          let top = contextMenu.y;

          if (contextMenu.y + baseHeight > window.innerHeight - padding) {
            top = Math.max(padding, contextMenu.y - baseHeight);
          }

          return (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.1 }}
              style={{ position: 'fixed', left, top }}
              className="z-50 min-w-[180px] bg-white dark:bg-dark-800 rounded-xl shadow-lg border border-dark-200 dark:border-dark-700 py-1 overflow-hidden"
            >
              {/* Header for multi-select */}
              {isMultiSelect && (
                <>
                  <div className="px-4 py-2 text-sm font-medium text-dark-500 dark:text-dark-400">
                    {t('documents.selectedDocuments', { count: selectedCount })}
                  </div>
                  <div className="h-px bg-dark-200 dark:bg-dark-700 my-1" />
                </>
              )}

              {/* Single item actions */}
              {!isMultiSelect && (
                <>
                  {/* Vista previa */}
                  <div className="px-2 py-1">
                    <button
                      onClick={() => { handlePreview(contextMenu.doc); closeContextMenu(); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-base text-dark-700 dark:text-dark-200 hover:bg-dark-100 dark:hover:bg-dark-700 rounded-lg transition-colors"
                    >
                      <Eye className="w-5 h-5" />
                      <span>{t('documents.preview')}</span>
                    </button>
                  </div>

                  <div className="h-px bg-dark-200 dark:bg-dark-700 my-1" />

                  {/* Acciones de archivo */}
                  <div className="px-2 py-1">
                    <button
                      onClick={() => handleDownload(contextMenu.doc)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-base text-dark-700 dark:text-dark-200 hover:bg-dark-100 dark:hover:bg-dark-700 rounded-lg transition-colors"
                    >
                      <Download className="w-5 h-5" />
                      <span>{t('common.download')}</span>
                    </button>
                    <button
                      onClick={() => handleShare(contextMenu.doc)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-base text-dark-700 dark:text-dark-200 hover:bg-dark-100 dark:hover:bg-dark-700 rounded-lg transition-colors"
                    >
                      <Share2 className="w-5 h-5" />
                      <span>{t('common.share')}</span>
                    </button>
                    <button
                      onClick={() => handleCopyLink(contextMenu.doc)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-base text-dark-700 dark:text-dark-200 hover:bg-dark-100 dark:hover:bg-dark-700 rounded-lg transition-colors"
                    >
                      <Copy className="w-5 h-5" />
                      <span>{t('common.copyLink')}</span>
                    </button>
                  </div>

                  <div className="h-px bg-dark-200 dark:bg-dark-700 my-1" />

                  {/* Organización */}
                  <div className="px-2 py-1">
                    <button
                      onClick={() => handleFavorite(contextMenu.doc)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-base text-dark-700 dark:text-dark-200 hover:bg-dark-100 dark:hover:bg-dark-700 rounded-lg transition-colors"
                    >
                      <Star className={cn('w-5 h-5', contextMenu.doc.isFavorite && 'fill-yellow-500 text-yellow-500')} />
                      <span>{contextMenu.doc.isFavorite ? t('common.removeFromFavorites') : t('common.addToFavorites')}</span>
                    </button>
                    <button
                      onClick={() => handleShowInfo(contextMenu.doc)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-base text-dark-700 dark:text-dark-200 hover:bg-dark-100 dark:hover:bg-dark-700 rounded-lg transition-colors"
                    >
                      <Info className="w-5 h-5" />
                      <span>{t('common.info')}</span>
                    </button>
                  </div>

                  <div className="h-px bg-dark-200 dark:bg-dark-700 my-1" />
                </>
              )}

              {/* Multi-select actions */}
              {isMultiSelect && (
                <>
                  <div className="px-2 py-1">
                    <button
                      onClick={() => {
                        const selected = documents.filter(d => currentSelectedItems.has(d.id));
                        selected.forEach(d => handleDownload(d));
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-base text-dark-700 dark:text-dark-200 hover:bg-dark-100 dark:hover:bg-dark-700 rounded-lg transition-colors"
                    >
                      <Download className="w-5 h-5" />
                      <span>{t('documents.downloadCount', { count: selectedCount })}</span>
                    </button>
                  </div>

                  <div className="h-px bg-dark-200 dark:bg-dark-700 my-1" />
                </>
              )}

              {/* Eliminar - siempre visible */}
              <div className="px-2 py-1">
                <button
                  onClick={() => handleDelete(contextMenu.doc)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-base text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                >
                  <Trash2 className="w-5 h-5" />
                  <span>{isMultiSelect ? t('documents.deleteCount', { count: selectedCount }) : t('common.delete')}</span>
                </button>
              </div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* Document Viewer */}
      <DocumentViewer
        file={selectedDocument}
        isOpen={viewerOpen}
        onClose={() => setViewerOpen(false)}
        files={documents}
        onNavigate={handleNavigate}
        onDownload={handleDownload}
        onShare={handleShare}
      />

      {/* Share Modal */}
      {shareFile && (
        <ShareModal
          isOpen={shareModalOpen}
          onClose={() => {
            setShareModalOpen(false);
            setShareFile(null);
          }}
          file={shareFile}
          onSuccess={loadData}
        />
      )}

      {/* Info Modal */}
      {infoDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setInfoDoc(null)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-dark-800 rounded-xl shadow-2xl max-w-lg w-full p-8"
          >
            <div className="flex items-center gap-4 mb-6">
              {(() => {
                const { icon: DocIcon, gradient } = getDocumentStyle(infoDoc.mimeType, infoDoc.name);
                return (
                  <div className={cn(
                    'w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center',
                    `bg-gradient-to-br ${gradient[0]} ${gradient[1]}`
                  )}>
                    <DocIcon className="w-10 h-10 text-white/80" />
                  </div>
                );
              })()}
              <div className="flex-1 min-w-0">
                <h3 className="text-xl font-semibold text-dark-900 dark:text-white truncate">
                  {getDisplayName(infoDoc.name)}
                </h3>
                <p className="text-sm text-dark-500">{infoDoc.mimeType}</p>
              </div>
            </div>

            <div className="space-y-3 mb-6">
              <div className="flex justify-between py-2 border-b border-dark-200 dark:border-dark-700">
                <span className="text-dark-500">{t('documents.size')}</span>
                <span className="text-dark-900 dark:text-white font-medium">{formatBytes(infoDoc.size)}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-dark-200 dark:border-dark-700">
                <span className="text-dark-500">{t('documents.extension')}</span>
                <span className="text-dark-900 dark:text-white font-medium">{getExtension(infoDoc.name) || 'N/A'}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-dark-200 dark:border-dark-700">
                <span className="text-dark-500">{t('documents.uploadDate')}</span>
                <span className="text-dark-900 dark:text-white font-medium">{formatDate(infoDoc.createdAt)}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-dark-500">{t('documents.favorite')}</span>
                <span className="text-dark-900 dark:text-white font-medium">{infoDoc.isFavorite ? t('common.yes') : t('common.no')}</span>
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={() => setInfoDoc(null)}>
                {t('common.close')}
              </Button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Upload Modal */}
      <UploadModal
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onSuccess={loadData}
      />
    </div>
  );
}
