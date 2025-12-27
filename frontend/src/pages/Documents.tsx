import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, getSignedFileUrl, openSignedFileUrl } from '../lib/api';
import { FileItem } from '../types';
import { useFileStore } from '../stores/fileStore';
import FileCard from '../components/files/FileCard';
import DocumentThumbnail from '../components/files/DocumentThumbnail';
import VirtualizedGrid from '../components/ui/VirtualizedGrid';
import { SkeletonGrid } from '../components/ui/Skeleton';
import {
  FileText, FileSpreadsheet, File, Eye, Check,
  Download, Share2, Trash2, Info, Copy, Star, Code, Presentation, Loader2
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

  // Pagination state
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  // Store unfiltered docs for append
  const [allDocs, setAllDocs] = useState<FileItem[]>([]);

  const tab = searchParams.get('tab') || 'all';
  const searchQuery = searchParams.get('search') || '';

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
            (mimeType.includes('xml') && !mimeType.includes('openxmlformats')) ||
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

  // Keep filtered list in sync with source docs + active tab filter
  useEffect(() => {
    setDocuments(filterByCategory(allDocs));
  }, [allDocs, filterByCategory]);

  const loadData = useCallback(async (pageNum: number = 1, append: boolean = false) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setPage(1);
      setHasMore(true);
    }
    try {
      const response = await api.get('/files', {
        params: {
          type: 'documents',
          sortBy,
          sortOrder,
          page: pageNum.toString(),
          limit: '50',
          ...(searchQuery && { search: searchQuery }),
        },
      });
      const docs = response.data.files || [];
      const pagination = response.data.pagination;

      // Update hasMore based on pagination
      if (pagination) {
        setHasMore(pagination.page < pagination.totalPages);
        setPage(pagination.page);
      } else {
        setHasMore(docs.length === 50);
      }

      if (append) {
        setAllDocs(prev => [...prev, ...docs]);
      } else {
        setAllDocs(docs);
      }
    } catch (error) {
      console.error('Failed to load documents:', error);
      toast(t('documents.loadError'), 'error');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [sortBy, sortOrder, searchQuery, t]);

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
    void openSignedFileUrl(file.id, 'download');
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
      const url = await getSignedFileUrl(doc.id, 'view');
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
      setAllDocs(prev => prev.map(d => (
        d.id === doc.id ? { ...d, isFavorite: !d.isFavorite } : d
      )));
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

  // Remove file extension from name for display
  const getDisplayName = (name: string) => {
    return name.replace(/\.[^/.]+$/, '');
  };

  if (loading) {
    return <div className="p-4"><SkeletonGrid count={12} view={viewMode} /></div>;
  }

  return (
    <div>
      {/* Content - Visual card grid view */}
      {documents.length > 0 ? (
        <VirtualizedGrid
          items={documents}
          viewMode={viewMode}
          scrollElementId="main-content"
          estimateListItemHeight={60}
          renderItem={(doc, _index, style) => {
            if (viewMode === 'list') {
              return (
                <div style={style}>
                  <FileCard
                    file={doc}
                    view={viewMode}
                    onRefresh={loadData}
                    onPreview={handlePreview}
                  />
                </div>
              );
            }

            // Grid view with custom card
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
              <div style={style}>
                <motion.div
                  key={doc.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: isSelected ? 0.95 : 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  data-file-item={doc.id}
                  onClick={handleDocClick}
                  onDoubleClick={() => handlePreview(doc)}
                  onContextMenu={(e) => handleContextMenu(e, doc)}
                  className={cn(
                    'premium-card group',
                    isSelected && 'selected'
                  )}
                >
                  {/* Selection indicator */}
                  {isSelected && (
                    <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-primary-500 flex items-center justify-center shadow-lg z-20">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                  )}

                  {/* Favorite badge - top left */}
                  {doc.isFavorite && !isSelected && (
                    <div className="absolute top-2 left-2 z-10">
                      <Star className="w-4 h-4 text-yellow-400 fill-yellow-400 drop-shadow-md" />
                    </div>
                  )}

                  {/* Document thumbnail */}
                  <div className="premium-card-thumbnail">
                    <DocumentThumbnail
                      fileId={doc.id}
                      fileName={doc.name}
                      mimeType={doc.mimeType}
                      thumbnailPath={doc.thumbnailPath}
                    />
                  </div>

                  {/* Content Area */}
                  <div className="premium-card-content">
                    <p className="premium-card-name" title={doc.name}>
                      {getDisplayName(doc.name)}
                    </p>
                    <div className="premium-card-meta">
                      <span>{formatBytes(doc.size)}</span>
                      <span>·</span>
                      <span>{formatDate(doc.createdAt)}</span>
                    </div>
                  </div>
                </motion.div>
              </div>
            );
          }}
        />
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

      {/* Load More Sentinel */}
      {documents.length > 0 && (
        <div ref={loadMoreRef} className="flex justify-center py-8">
          {loadingMore && (
            <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
          )}
          {!hasMore && documents.length >= 50 && (
            <p className="text-sm text-dark-400">{t('common.noMoreItems')}</p>
          )}
        </div>
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
                  <button
                    onClick={() => { handlePreview(contextMenu.doc); closeContextMenu(); }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-dark-700 dark:text-dark-200 hover:bg-dark-50 dark:hover:bg-dark-700 transition-colors"
                  >
                    <Eye className="w-4 h-4" />
                    <span>{t('documents.preview')}</span>
                  </button>

                  <div className="h-px bg-dark-200 dark:bg-dark-700 my-1" />

                  {/* Acciones de archivo */}
                  <button
                    onClick={() => handleDownload(contextMenu.doc)}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-dark-700 dark:text-dark-200 hover:bg-dark-50 dark:hover:bg-dark-700 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span>{t('common.download')}</span>
                  </button>
                  <button
                    onClick={() => handleShare(contextMenu.doc)}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-dark-700 dark:text-dark-200 hover:bg-dark-50 dark:hover:bg-dark-700 transition-colors"
                  >
                    <Share2 className="w-4 h-4" />
                    <span>{t('common.share')}</span>
                  </button>
                  <button
                    onClick={() => handleCopyLink(contextMenu.doc)}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-dark-700 dark:text-dark-200 hover:bg-dark-50 dark:hover:bg-dark-700 transition-colors"
                  >
                    <Copy className="w-4 h-4" />
                    <span>{t('common.copyLink')}</span>
                  </button>

                  <div className="h-px bg-dark-200 dark:bg-dark-700 my-1" />

                  {/* Organización */}
                  <button
                    onClick={() => handleFavorite(contextMenu.doc)}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-dark-700 dark:text-dark-200 hover:bg-dark-50 dark:hover:bg-dark-700 transition-colors"
                  >
                    <Star className={cn('w-4 h-4', contextMenu.doc.isFavorite && 'fill-yellow-500 text-yellow-500')} />
                    <span>{contextMenu.doc.isFavorite ? t('common.removeFromFavorites') : t('common.addToFavorites')}</span>
                  </button>
                  <button
                    onClick={() => handleShowInfo(contextMenu.doc)}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-dark-700 dark:text-dark-200 hover:bg-dark-50 dark:hover:bg-dark-700 transition-colors"
                  >
                    <Info className="w-4 h-4" />
                    <span>{t('common.info')}</span>
                  </button>

                  <div className="h-px bg-dark-200 dark:bg-dark-700 my-1" />
                </>
              )}

              {/* Multi-select actions */}
              {isMultiSelect && (
                <>
                  <button
                    onClick={() => {
                      const selected = documents.filter(d => currentSelectedItems.has(d.id));
                      selected.forEach(d => handleDownload(d));
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm text-dark-700 dark:text-dark-200 hover:bg-dark-50 dark:hover:bg-dark-700 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span>{t('documents.downloadCount', { count: selectedCount })}</span>
                  </button>

                  <div className="h-px bg-dark-200 dark:bg-dark-700 my-1" />
                </>
              )}

              {/* Eliminar - siempre visible */}
              <button
                onClick={() => handleDelete(contextMenu.doc)}
                className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isMultiSelect ? t('documents.deleteCount', { count: selectedCount }) : t('common.delete')}</span>
              </button>
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
