import { useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../../../lib/api';

interface UseOfficeConversionOptions {
    fileId: string;
    onPdfReady: (blobUrl: string) => void;
}

interface UseOfficeConversionReturn {
    isConverting: boolean;
    conversionMessage: string | null;
    conversionFailed: boolean;
    startConversion: () => Promise<void>;
    cleanup: () => void;
}

/**
 * Hook to handle Office document to PDF conversion with polling
 */
export function useOfficeConversion({
    fileId,
    onPdfReady,
}: UseOfficeConversionOptions): UseOfficeConversionReturn {
    const { t } = useTranslation();
    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const blobUrlRef = useRef<string | null>(null);

    const [isConverting, setIsConverting] = useState(false);
    const [conversionMessage, setConversionMessage] = useState<string | null>(null);
    const [conversionFailed, setConversionFailed] = useState(false);

    const cleanup = useCallback(() => {
        if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
        }
        if (blobUrlRef.current) {
            URL.revokeObjectURL(blobUrlRef.current);
            blobUrlRef.current = null;
        }
    }, []);

    const fetchPdfPreview = useCallback(async () => {
        const pdfResponse = await api.get(`/files/${fileId}/pdf-preview`, {
            responseType: 'arraybuffer',
        });
        const blob = new Blob([pdfResponse.data], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);

        // Clean up old blob URL
        if (blobUrlRef.current) {
            URL.revokeObjectURL(blobUrlRef.current);
        }
        blobUrlRef.current = url;
        onPdfReady(url);
    }, [fileId, onPdfReady]);

    const startPolling = useCallback(() => {
        let attempts = 0;
        const maxAttempts = 60; // 60 * 2s = 2 minutes max

        pollingRef.current = setInterval(async () => {
            attempts++;
            if (attempts > maxAttempts) {
                if (pollingRef.current) {
                    clearInterval(pollingRef.current);
                }
                setConversionMessage(t('gallery.conversionTimeout'));
                setConversionFailed(true);
                setIsConverting(false);
                return;
            }

            try {
                const statusResponse = await api.get(`/files/${fileId}/pdf-preview/status`, {
                    validateStatus: (status: number) => status < 500,
                });

                const status = statusResponse.data?.status;

                if (status === 'completed') {
                    if (pollingRef.current) {
                        clearInterval(pollingRef.current);
                    }
                    await fetchPdfPreview();
                    setIsConverting(false);
                    setConversionMessage(null);
                } else if (status === 'failed') {
                    if (pollingRef.current) {
                        clearInterval(pollingRef.current);
                    }
                    setConversionMessage(t('gallery.conversionFailed'));
                    setConversionFailed(true);
                    setIsConverting(false);
                } else {
                    setConversionMessage(t('gallery.convertingDocument'));
                }
            } catch (error) {
                console.error('Error polling conversion status:', error);
            }
        }, 2000);
    }, [fileId, t, fetchPdfPreview]);

    const startConversion = useCallback(async () => {
        setIsConverting(true);
        setConversionMessage(t('gallery.convertingDocument'));
        setConversionFailed(false);

        try {
            const response = await api.get(`/files/${fileId}/pdf-preview`, {
                validateStatus: (status: number) => status < 500,
            });

            if (response.status === 200) {
                await fetchPdfPreview();
                setIsConverting(false);
                setConversionMessage(null);
            } else if (response.status === 202) {
                // Conversion in progress - start polling
                const status = response.data?.status;
                if (status === 'queued') {
                    setConversionMessage(t('gallery.conversionQueued'));
                } else {
                    setConversionMessage(t('gallery.convertingDocument'));
                }
                startPolling();
            } else if (response.status === 404 || response.status === 503) {
                setConversionFailed(true);
                setIsConverting(false);
            } else {
                setConversionFailed(true);
                setIsConverting(false);
            }
        } catch (error) {
            console.error('Error requesting PDF preview:', error);
            setConversionFailed(true);
            setIsConverting(false);
        }
    }, [fileId, t, fetchPdfPreview, startPolling]);

    return {
        isConverting,
        conversionMessage,
        conversionFailed,
        startConversion,
        cleanup,
    };
}

export default useOfficeConversion;
