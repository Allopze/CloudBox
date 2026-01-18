import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X, Loader2 } from 'lucide-react';
import { FileItem } from '../../types';
import { getSignedFileUrl } from '../../lib/api';
import VideoPlayer from './VideoPlayer';

interface VideoPlayerModalProps {
    file: FileItem;
    onClose: () => void;
    onShare?: (file: FileItem) => void;
    onDownload?: (file: FileItem) => void;
}

/**
 * Modal wrapper for VideoPlayer that handles URL resolution.
 * Use this for standalone video playback from file lists.
 */
export default function VideoPlayerModal({
    file,
    onClose,
    onShare,
    onDownload,
}: VideoPlayerModalProps) {
    const { t } = useTranslation();
    const [signedUrl, setSignedUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Fetch signed URL when file changes
    useEffect(() => {
        setLoading(true);
        setError(null);

        getSignedFileUrl(file.id, 'stream')
            .then(url => {
                setSignedUrl(url);
                setLoading(false);
            })
            .catch(err => {
                console.error('Failed to get video URL:', err);
                setError(t('gallery.loadError'));
                setLoading(false);
            });
    }, [file.id, t]);

    // Loading state
    if (loading) {
        return createPortal(
            <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-12 h-12 text-white animate-spin" />
                    <p className="text-white/70 text-sm">{t('gallery.loading')}</p>
                </div>
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                    title={t('common.close')}
                    aria-label={t('common.close')}
                >
                    <X className="w-5 h-5" />
                </button>
            </div>,
            document.body
        );
    }

    // Error state
    if (error || !signedUrl) {
        return createPortal(
            <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
                <div className="flex flex-col items-center gap-4 text-center">
                    <p className="text-red-400 text-lg">{error || t('gallery.loadError')}</p>
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
                    >
                        {t('common.close')}
                    </button>
                </div>
            </div>,
            document.body
        );
    }

    // Video player
    return (
        <VideoPlayer
            src={signedUrl}
            file={file}
            showChrome={true}
            showControls={true}
            onClose={onClose}
            onShare={onShare}
            onDownload={onDownload}
        />
    );
}
