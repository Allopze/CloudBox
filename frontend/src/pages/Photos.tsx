import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, getFileUrl } from '../lib/api';
import { FileItem } from '../types';
import { Loader2, X, ChevronLeft, ChevronRight, Download, Trash2, Star } from 'lucide-react';
import { toast } from '../components/ui/Toast';
import { formatDate, cn } from '../lib/utils';
import Button from '../components/ui/Button';

type TabType = 'all' | 'favorites' | 'videos' | 'screenshots';

export default function Photos() {
  const [searchParams] = useSearchParams();
  const activeTab = (searchParams.get('tab') || 'all') as TabType;
  
  const [photos, setPhotos] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState<FileItem | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);


  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      let params: any = { sortBy: 'createdAt', sortOrder: 'desc' };

      if (activeTab === 'all' || activeTab === 'screenshots') {
        params.type = 'images';
      } else if (activeTab === 'videos') {
        params.type = 'videos';
      } else if (activeTab === 'favorites') {
        params.type = 'images';
        params.favorite = 'true';
      }

      const response = await api.get('/files', { params });
      let files = response.data.files || [];

      if (activeTab === 'favorites') {
        files = files.filter((f: FileItem) => f.isFavorite);
      }

      setPhotos(files);
    } catch (error) {
      console.error('Failed to load photos:', error);
      toast('Error al cargar las fotos', 'error');
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Listen for workzone refresh event from MainLayout context menu
  useEffect(() => {
    const handleRefresh = () => loadData();
    window.addEventListener('workzone-refresh', handleRefresh);
    return () => window.removeEventListener('workzone-refresh', handleRefresh);
  }, [loadData]);

  const openLightbox = (photo: FileItem, index: number) => {
    setSelectedPhoto(photo);
    setLightboxIndex(index);
  };

  const closeLightbox = () => {
    setSelectedPhoto(null);
  };

  const navigateLightbox = (direction: 'prev' | 'next') => {
    const newIndex = direction === 'prev'
      ? (lightboxIndex - 1 + photos.length) % photos.length
      : (lightboxIndex + 1) % photos.length;
    setLightboxIndex(newIndex);
    setSelectedPhoto(photos[newIndex]);
  };

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!selectedPhoto) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') navigateLightbox('prev');
    if (e.key === 'ArrowRight') navigateLightbox('next');
  }, [selectedPhoto, lightboxIndex, photos]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleFavorite = async (photo: FileItem) => {
    try {
      await api.patch(`/files/${photo.id}/favorite`);
      toast(photo.isFavorite ? 'Eliminado de favoritos' : 'Añadido a favoritos', 'success');
      loadData();
    } catch {
      toast('Error al actualizar favorito', 'error');
    }
  };

  const handleDelete = async (photo: FileItem) => {
    try {
      await api.delete(`/files/${photo.id}`);
      toast('Foto movida a la papelera', 'success');
      closeLightbox();
      loadData();
    } catch {
      toast('Error al eliminar la foto', 'error');
    }
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

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
          {photos.map((photo, index) => (
            <div
              key={photo.id}
              onClick={() => openLightbox(photo, index)}
              className="group relative aspect-square rounded-lg overflow-hidden cursor-pointer bg-dark-100 dark:bg-dark-800"
            >
              <img
                src={photo.thumbnailPath ? getFileUrl(`/files/${photo.id}/thumbnail`) : getFileUrl(`/files/${photo.id}/view`)}
                alt={photo.name}
                className="w-full h-full object-cover"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-end">
                <div className="p-2 w-full">
                  <p className="text-white text-xs font-medium truncate">{photo.name}</p>
                </div>
              </div>
              {photo.isFavorite && (
                <div className="absolute top-2 right-2">
                  <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-50 bg-black flex items-center justify-center" role="dialog" aria-label="Visor de imagen">
          {/* Close button */}
          <button
            onClick={closeLightbox}
            className="absolute top-4 right-4 p-2 text-white/70 hover:text-white rounded-full hover:bg-white/10 transition-colors z-10"
            aria-label="Cerrar visor"
          >
            <X className="w-6 h-6" />
          </button>

          {/* Navigation */}
          <button
            onClick={() => navigateLightbox('prev')}
            className="absolute left-4 p-2 text-white/70 hover:text-white rounded-full hover:bg-white/10 transition-colors"
            aria-label="Foto anterior"
          >
            <ChevronLeft className="w-8 h-8" />
          </button>
          <button
            onClick={() => navigateLightbox('next')}
            className="absolute right-4 p-2 text-white/70 hover:text-white rounded-full hover:bg-white/10 transition-colors"
            aria-label="Foto siguiente"
          >
            <ChevronRight className="w-8 h-8" />
          </button>

          {/* Image */}
          <img
            src={getFileUrl(`/files/${selectedPhoto.id}/view`)}
            alt={selectedPhoto.name}
            className="max-w-full max-h-full object-contain"
          />

          {/* Bottom bar */}
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
            <div className="flex items-center justify-between max-w-4xl mx-auto">
              <div>
                <p className="text-white font-medium">{selectedPhoto.name}</p>
                <p className="text-white/70 text-sm">{formatDate(selectedPhoto.createdAt)}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleFavorite(selectedPhoto)}
                  className="text-white hover:bg-white/10"
                  aria-label={selectedPhoto.isFavorite ? 'Quitar de favoritos' : 'Añadir a favoritos'}
                >
                  <Star className={cn('w-5 h-5', selectedPhoto.isFavorite && 'fill-yellow-500 text-yellow-500')} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => window.open(getFileUrl(`/files/${selectedPhoto.id}/download`), '_blank')}
                  className="text-white hover:bg-white/10"
                  aria-label="Descargar"
                >
                  <Download className="w-5 h-5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(selectedPhoto)}
    