import { useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, openSignedFileUrl } from '../lib/api';
import { FileItem, Folder } from '../types';
import { useFileStore } from '../stores/fileStore';
import { useMusicStore } from '../stores/musicStore';
import FileCard from '../components/files/FileCard';
import FolderCard from '../components/files/FolderCard';
import { Search, Filter, X, Loader2, FolderOpen } from 'lucide-react';
import { toast } from '../components/ui/Toast';
import { isAudio, isImage, isVideo, isDocument } from '../lib/utils';
import ShareModal from '../components/modals/ShareModal';
import ImageGallery from '../components/gallery/ImageGallery';
import VideoPreview from '../components/gallery/VideoPreview';
import DocumentViewer from '../components/gallery/DocumentViewer';
import Button from '../components/ui/Button';

export default function SearchResults() {
    const { t } = useTranslation();
    const [searchParams, setSearchParams] = useSearchParams();

    const query = searchParams.get('q') || '';
    const typeFilter = searchParams.get('type') || '';
    const favoriteFilter = searchParams.get('favorite') === 'true';
    const dateFromFilter = searchParams.get('dateFrom') || '';
    const dateToFilter = searchParams.get('dateTo') || '';
    const sizeMinFilter = searchParams.get('sizeMin') || '';
    const sizeMaxFilter = searchParams.get('sizeMax') || '';

    const [files, setFiles] = useState<FileItem[]>([]);
    const [folders, setFolders] = useState<Folder[]>([]);
    const [loading, setLoading] = useState(true);
    const [pagination, setPagination] = useState({ total: 0, totalFiles: 0, totalFolders: 0 });

    // Filters state
    const [showFilters, setShowFilters] = useState(false);
    const [localQuery, setLocalQuery] = useState(query);
    const [localType, setLocalType] = useState(typeFilter);
    const [localFavorite, setLocalFavorite] = useState(favoriteFilter);
    const [localDateFrom, setLocalDateFrom] = useState(dateFromFilter);
    const [localDateTo, setLocalDateTo] = useState(dateToFilter);
    const [localSizeMin, setLocalSizeMin] = useState(sizeMinFilter);
    const [localSizeMax, setLocalSizeMax] = useState(sizeMaxFilter);

    // Gallery states
    const [galleryOpen, setGalleryOpen] = useState(false);
    const [galleryIndex, setGalleryIndex] = useState(0);
    const [videoPreviewFile, setVideoPreviewFile] = useState<FileItem | null>(null);
    const [documentPreviewFile, setDocumentPreviewFile] = useState<FileItem | null>(null);
    const [isShareModalOpen, setShareModalOpen] = useState(false);
    const [selectedFileForAction, setSelectedFileForAction] = useState<FileItem | null>(null);

    const viewMode = useFileStore((state) => state.viewMode);
    const clearSelection = useFileStore((state) => state.clearSelection);
    const { play } = useMusicStore();

    // Get image files for gallery
    const imageFiles = files.filter(f => isImage(f.mimeType));
    const documentFiles = files.filter(f => isDocument(f.mimeType));

    const loadData = useCallback(async () => {
        if (!query && !typeFilter && !favoriteFilter && !dateFromFilter && !dateToFilter && !sizeMinFilter && !sizeMaxFilter) {
            setFiles([]);
            setFolders([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            const params: Record<string, string> = {};
            if (query) params.q = query;
            if (typeFilter) params.type = typeFilter;
            if (favoriteFilter) params.favorite = 'true';
            if (dateFromFilter) params.dateFrom = dateFromFilter;
            if (dateToFilter) params.dateTo = dateToFilter;
            if (sizeMinFilter) params.sizeMin = sizeMinFilter;
            if (sizeMaxFilter) params.sizeMax = sizeMaxFilter;

            const response = await api.get('/files/search', { params });
            setFiles(response.data.files || []);
            setFolders(response.data.folders || []);
            setPagination(response.data.pagination || { total: 0, totalFiles: 0, totalFolders: 0 });
        } catch (error) {
            console.error('Search error:', error);
            toast(t('search.searchError'), 'error');
        } finally {
            setLoading(false);
        }
    }, [query, typeFilter, favoriteFilter, dateFromFilter, dateToFilter, sizeMinFilter, sizeMaxFilter, t]);

    useEffect(() => {
        loadData();
        clearSelection();
    }, [loadData, clearSelection]);

    // Update local state when URL params change
    useEffect(() => {
        setLocalQuery(query);
        setLocalType(typeFilter);
        setLocalFavorite(favoriteFilter);
        setLocalDateFrom(dateFromFilter);
        setLocalDateTo(dateToFilter);
        setLocalSizeMin(sizeMinFilter);
        setLocalSizeMax(sizeMaxFilter);
    }, [query, typeFilter, favoriteFilter, dateFromFilter, dateToFilter, sizeMinFilter, sizeMaxFilter]);

    const handleSearch = () => {
        const params = new URLSearchParams();
        if (localQuery) params.set('q', localQuery);
        if (localType) params.set('type', localType);
        if (localFavorite) params.set('favorite', 'true');
        if (localDateFrom) params.set('dateFrom', localDateFrom);
        if (localDateTo) params.set('dateTo', localDateTo);
        if (localSizeMin) params.set('sizeMin', localSizeMin);
        if (localSizeMax) params.set('sizeMax', localSizeMax);
        setSearchParams(params);
    };

    const handleClearFilters = () => {
        setLocalQuery('');
        setLocalType('');
        setLocalFavorite(false);
        setLocalDateFrom('');
        setLocalDateTo('');
        setLocalSizeMin('');
        setLocalSizeMax('');
        setSearchParams(new URLSearchParams());
    };

    // Helper for size conversion
    const sizeOptions = [
        { label: '1 MB', value: '1048576' },
        { label: '10 MB', value: '10485760' },
        { label: '100 MB', value: '104857600' },
        { label: '1 GB', value: '1073741824' },
    ];

    const audioQueue = useMemo(() => {
        return files.filter((file) => isAudio(file.mimeType));
    }, [files]);

    const handleAudioOpen = useCallback((file: FileItem) => {
        const queue = audioQueue.length > 0 ? audioQueue : [file];
        play(file, queue);
    }, [audioQueue, play]);

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

    const hasFilters = query || typeFilter || favoriteFilter || dateFromFilter || dateToFilter || sizeMinFilter || sizeMaxFilter;

    return (
        <div className="min-h-[400px]">
            {/* Search Header */}
            <div className="mb-6">
                <div className="flex items-center gap-3 mb-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-400" />
                        <input
                            type="text"
                            value={localQuery}
                            onChange={(e) => setLocalQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                            placeholder={t('search.placeholder')}
                            className="w-full pl-10 pr-4 py-2.5 bg-dark-50 dark:bg-dark-800 border border-dark-200 dark:border-dark-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                    </div>
                    <Button onClick={handleSearch}>
                        {t('search.title')}
                    </Button>
                    <Button
                        variant="ghost"
                        onClick={() => setShowFilters(!showFilters)}
                        icon={<Filter className="w-4 h-4" />}
                    >
                        {t('search.filters')}
                    </Button>
                    {hasFilters && (
                        <Button variant="ghost" onClick={handleClearFilters} icon={<X className="w-4 h-4" />}>
                            {t('search.clearFilters')}
                        </Button>
                    )}
                </div>

                {/* Filters Panel */}
                {showFilters && (
                    <div className="p-4 bg-dark-50 dark:bg-dark-800 rounded-xl border border-dark-200 dark:border-dark-700 mb-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            {/* Type Filter */}
                            <div>
                                <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">
                                    {t('search.type')}
                                </label>
                                <select
                                    value={localType}
                                    onChange={(e) => setLocalType(e.target.value)}
                                    className="w-full px-3 py-2 bg-white dark:bg-dark-900 border border-dark-200 dark:border-dark-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                                >
                                    <option value="">{t('search.allTypes')}</option>
                                    <option value="images">{t('search.images')}</option>
                                    <option value="videos">{t('search.videos')}</option>
                                    <option value="audio">{t('search.audio')}</option>
                                    <option value="documents">{t('search.documents')}</option>
                                </select>
                            </div>

                            {/* Date From */}
                            <div>
                                <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">
                                    {t('search.from')}
                                </label>
                                <input
                                    type="date"
                                    value={localDateFrom}
                                    onChange={(e) => setLocalDateFrom(e.target.value)}
                                    className="w-full px-3 py-2 bg-white dark:bg-dark-900 border border-dark-200 dark:border-dark-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                                />
                            </div>

                            {/* Date To */}
                            <div>
                                <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">
                                    {t('search.to')}
                                </label>
                                <input
                                    type="date"
                                    value={localDateTo}
                                    onChange={(e) => setLocalDateTo(e.target.value)}
                                    className="w-full px-3 py-2 bg-white dark:bg-dark-900 border border-dark-200 dark:border-dark-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                                />
                            </div>

                            {/* Size Min */}
                            <div>
                                <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">
                                    {t('search.sizeMin')}
                                </label>
                                <select
                                    value={localSizeMin}
                                    onChange={(e) => setLocalSizeMin(e.target.value)}
                                    className="w-full px-3 py-2 bg-white dark:bg-dark-900 border border-dark-200 dark:border-dark-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                                >
                                    <option value="">-</option>
                                    {sizeOptions.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Size Max */}
                            <div>
                                <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">
                                    {t('search.sizeMax')}
                                </label>
                                <select
                                    value={localSizeMax}
                                    onChange={(e) => setLocalSizeMax(e.target.value)}
                                    className="w-full px-3 py-2 bg-white dark:bg-dark-900 border border-dark-200 dark:border-dark-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                                >
                                    <option value="">-</option>
                                    {sizeOptions.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Favorites Filter */}
                            <div className="flex items-end">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={localFavorite}
                                        onChange={(e) => setLocalFavorite(e.target.checked)}
                                        className="w-4 h-4 rounded text-primary-600 focus:ring-primary-500"
                                    />
                                    <span className="text-sm text-dark-700 dark:text-dark-300">
                                        {t('toolbar.favorite')}
                                    </span>
                                </label>
                            </div>
                        </div>
                    </div>
                )}

                {/* Results Count */}
                {!loading && hasFilters && (
                    <div className="text-sm text-dark-500">
                        {pagination.totalFiles > 0 && (
                            <span className="mr-4">{t('search.filesFound', { count: pagination.totalFiles })}</span>
                        )}
                        {pagination.totalFolders > 0 && (
                            <span>{t('search.foldersFound', { count: pagination.totalFolders })}</span>
                        )}
                    </div>
                )}
            </div>

            {/* Content */}
            {loading ? (
                <div className="flex items-center justify-center h-64">
                    <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
                </div>
            ) : !hasFilters ? (
                <div className="flex flex-col items-center justify-center h-64 text-dark-500">
                    <Search className="w-16 h-16 mb-4 opacity-50" />
                    <p className="text-lg font-medium">{t('search.title')}</p>
                    <p className="text-sm">{t('search.placeholder')}</p>
                </div>
            ) : files.length === 0 && folders.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-dark-500">
                    <FolderOpen className="w-16 h-16 mb-4 opacity-50" />
                    <p className="text-lg font-medium">{t('search.noResults')}</p>
                    <p className="text-sm">{t('search.tryDifferent')}</p>
                </div>
            ) : (
                <div className={viewMode === 'grid'
                    ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4'
                    : 'space-y-2'}
                >
                    {/* Folders first */}
                    {folders.map((folder) => (
                        <FolderCard
                            key={folder.id}
                            folder={folder}
                            view={viewMode}
                            onRefresh={loadData}
                        />
                    ))}
                    {/* Then files */}
                    {files.map((file) => (
                        <FileCard
                            key={file.id}
                            file={file}
                            view={viewMode}
                            onRefresh={loadData}
                            onPreview={handleFileClick}
                            onFavoriteToggle={(fileId, isFavorite) => {
                                setFiles(prev => prev.map(f => f.id === fileId ? { ...f, isFavorite } : f));
                            }}
                        />
                    ))}
                </div>
            )}

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
        </div>
    );
}
