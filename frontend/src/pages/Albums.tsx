import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, getFileUrl } from '../lib/api';
import { Album, FileItem } from '../types';
import { Loader2, Album as AlbumIcon, Plus, ArrowLeft, Trash2, X, FolderPlus } from 'lucide-react';
import { toast } from '../components/ui/Toast';
import { formatDate, cn } from '../lib/utils';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';

export default function Albums() {
  const { albumId } = useParams<{ albumId: string }>();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [currentAlbum, setCurrentAlbum] = useState<Album | null>(null);
  const [albumPhotos, setAlbumPhotos] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAddPhotosModal, setShowAddPhotosModal] = useState(false);
  const [newAlbumName, setNewAlbumName] = useState('');
  const [creating, setCreating] = useState(false);
  const [availablePhotos, setAvailablePhotos] = useState<FileItem[]>([]);
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([]);
  
  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  const loadAlbums = useCallback(async () => {
    try {
      const response = await api.get('/albums');
      setAlbums(response.data || []);
    } catch (error) {
      console.error('Failed to load albums:', error);
      toast('Error al cargar los álbumes', 'error');
    }
  }, []);

  const loadAlbumDetails = useCallback(async (id: string) => {
    try {
      const [albumRes, photosRes] = await Promise.all([
        api.get(`/albums/${id}`),
        api.get(`/albums/${id}/files`),
      ]);
      setCurrentAlbum(albumRes.data);
      setAlbumPhotos(photosRes.data || []);
    } catch (error) {
      console.error('Failed to load album:', error);
      toast('Error al cargar el álbum', 'error');
    }
  }, []);

  const loadAvailablePhotos = useCallback(async () => {
    try {
      const response = await api.get('/files', {
        params: { type: 'images' },
      });
      setAvailablePhotos(response.data.files || []);
    } catch (error) {
      console.error('Failed to load photos:', error);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    if (albumId) {
      loadAlbumDetails(albumId).finally(() => setLoading(false));
    } else {
      loadAlbums().finally(() => setLoading(false));
    }
  }, [albumId, loadAlbums, loadAlbumDetails]);

  const createAlbum = async () => {
    if (!newAlbumName.trim()) return;
    setCreating(true);
    try {
      await api.post('/albums', { name: newAlbumName.trim() });
      toast('Álbum creado correctamente', 'success');
      setNewAlbumName('');
      setShowCreateModal(false);
      loadAlbums();
    } catch (error) {
      toast('Error al crear el álbum', 'error');
    } finally {
      setCreating(false);
    }
  };

  const deleteAlbum = async (id: string) => {
    try {
      await api.delete(`/albums/${id}`);
      toast('Álbum eliminado', 'success');
      loadAlbums();
    } catch (error) {
      toast('Error al eliminar el álbum', 'error');
    }
  };

  const openAddPhotosModal = () => {
    setSelectedPhotos([]);
    loadAvailablePhotos();
    setShowAddPhotosModal(true);
  };

  const togglePhotoSelection = (photoId: string) => {
    setSelectedPhotos((prev) =>
      prev.includes(photoId)
        ? prev.filter((id) => id !== photoId)
        : [...prev, photoId]
    );
  };

  const addPhotosToAlbum = async () => {
    if (!currentAlbum || selectedPhotos.length === 0) return;
    try {
      await api.post(`/albums/${currentAlbum.id}/files`, {
        fileIds: selectedPhotos,
      });
      toast('Fotos añadidas al álbum', 'success');
      setShowAddPhotosModal(false);
      loadAlbumDetails(currentAlbum.id);
    } catch (error) {
      toast('Error al añadir fotos', 'error');
    }
  };

  const removePhotoFromAlbum = async (fileId: string) => {
    if (!currentAlbum) return;
    try {
      await api.delete(`/albums/${currentAlbum.id}/files`, {
        data: { fileIds: [fileId] },
      });
      toast('Foto eliminada del álbum', 'success');
      loadAlbumDetails(currentAlbum.id);
    } catch (error) {
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

  // Album detail view
  if (albumId && currentAlbum) {
    return (
      <div>
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link to="/albums">
            <Button variant="ghost" size="sm" icon={<ArrowLeft className="w-4 h-4" />}>
              Volver
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-dark-900 dark:text-white">
              {currentAlbum.name}
            </h1>
            <p className="text-dark-500 dark:text-dark-400 mt-1">
              {albumPhotos.length} fotos • Creado {formatDate(currentAlbum.createdAt)}
            </p>
          </div>
          <Button onClick={openAddPhotosModal} icon={<Plus className="w-4 h-4" />}>
            Añadir fotos
          </Button>
        </div>

        {/* Photos grid */}
        {albumPhotos.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {albumPhotos.map((photo) => (
              <div
                key={photo.id}
                className="group relative aspect-square rounded-xl overflow-hidden bg-dark-100 dark:bg-dark-700"
              >
                <img
                  src={getFileUrl(`/files/${photo.id}/thumbnail`)}
                  alt={photo.name}
                  className="w-full h-full object-cover"
                />
                <button
                  onClick={() => removePhotoFromAlbum(photo.id)}
                  className="absolute top-2 right-2 p-1 bg-black/50 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add photos modal */}
        <Modal
          isOpen={showAddPhotosModal}
          onClose={() => setShowAddPhotosModal(false)}
          title="Añadir fotos al álbum"
          size="lg"
        >
          <div className="max-h-96 overflow-y-auto">
            {availablePhotos.length === 0 ? (
              <p className="text-center text-dark-500 py-8">No hay fotos disponibles</p>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {availablePhotos.map((photo) => (
                  <div
                    key={photo.id}
                    onClick={() => togglePhotoSelection(photo.id)}
                    className={cn(
                      'aspect-square rounded-lg overflow-hidden cursor-pointer ring-2 transition-all',
                      selectedPhotos.includes(photo.id)
                        ? 'ring-primary-600'
                        : 'ring-transparent hover:ring-dark-300'
                    )}
                  >
                    <img
                      src={getFileUrl(`/files/${photo.id}/thumbnail`)}
                      alt={photo.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="ghost" onClick={() => setShowAddPhotosModal(false)}>
              Cancelar
            </Button>
            <Button
              onClick={addPhotosToAlbum}
              disabled={selectedPhotos.length === 0}
            >
              Añadir {selectedPhotos.length} foto(s)
            </Button>
          </div>
        </Modal>
      </div>
    );
  }

  // Albums list view
  return (
    <div 
      className="h-full"
      onContextMenu={(e) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY });
      }}
      onClick={() => setContextMenu(null)}
    >
      {/* Header with New Album button */}
      <div className="flex items-center justify-end mb-6">
        <Button 
          onClick={() => setShowCreateModal(true)} 
          icon={<Plus className="w-4 h-4" />}
          aria-label="Crear nuevo álbum"
        >
          Nuevo álbum
        </Button>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-white dark:bg-dark-800 rounded-xl shadow-lg border border-dark-100 dark:border-dark-700 py-1 min-w-48"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              setShowCreateModal(true);
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-dark-700 dark:text-dark-300 hover:bg-dark-50 dark:hover:bg-dark-700"
          >
            <FolderPlus className="w-4 h-4 text-dark-400" />
            Crear álbum
          </button>
        </div>
      )}

      {/* Albums grid */}
      {albums.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
          {albums.map((album) => (
            <Link
              key={album.id}
              to={`/albums/${album.id}`}
              className="group rounded-lg border border-dark-100 dark:border-dark-700 overflow-hidden hover:border-dark-200 dark:hover:border-dark-600 transition-colors"
            >
              <div className="aspect-square bg-dark-50 dark:bg-dark-800 flex items-center justify-center">
                {album.coverPath ? (
                  <img
                    src={`/api/files/${album.coverPath}/thumbnail`}
                    alt={album.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <AlbumIcon className="w-10 h-10 text-dark-400" />
                )}
              </div>
              <div className="p-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-dark-900 dark:text-white truncate">
                    {album.name}
                  </h3>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      deleteAlbum(album.id);
                    }}
                    className="p-1 text-dark-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs text-dark-500">
                  {album._count?.files || 0} fotos
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Create album modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Crear álbum"
        size="sm"
      >
        <Input
          label="Nombre del álbum"
          placeholder="Mi álbum"
          value={newAlbumName}
          onChange={(e) => setNewAlbumName(e.target.value)}
          autoFocus
        />
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="ghost" onClick={() => setShowCreateModal(false)}>
            Cancelar
          </Button>
          <Button onClick={createAlbum} loading={creating}>
            Crear
          </Button>
        </div>
      </Modal>
    </div>
  );
}
