import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { Share } from '../types';
import { 
  Loader2, 
  Share2, 
  Users, 
  Copy, 
  Trash2, 
  ExternalLink, 
  MoreVertical,
  Lock,
  Globe,
  Eye,
  Edit3,
  Calendar,
  Download
} from 'lucide-react';
import { toast } from '../components/ui/Toast';
import { formatDate } from '../lib/utils';
import Dropdown, { DropdownItem, DropdownDivider } from '../components/ui/Dropdown';

export default function Shared() {
  const [searchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'my-shares';

  const [myShares, setMyShares] = useState<Share[]>([]);
  const [sharedWithMe, setSharedWithMe] = useState<Share[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [mySharesRes, sharedWithMeRes] = await Promise.all([
        api.get('/shares/by-me'),
        api.get('/shares/with-me'),
      ]);

      setMyShares(mySharesRes.data || []);
      setSharedWithMe(sharedWithMeRes.data || []);
    } catch (error) {
      console.error('Error al cargar compartidos:', error);
      toast('Error al cargar los elementos compartidos', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const buildShareLink = (share: Share) => {
    const path = share.publicUrl || (share.publicToken ? `/share/${share.publicToken}` : null);
    return path ? `${window.location.origin}${path}` : null;
  };

  const copyShareLink = (share: Share) => {
    const url = buildShareLink(share);
    if (!url) {
      toast('Este enlace es privado y no tiene URL pública', 'error');
      return;
    }
    navigator.clipboard.writeText(url);
    toast('Enlace copiado al portapapeles', 'success');
  };

  const openShareLink = (share: Share) => {
    const url = buildShareLink(share);
    if (!url) {
      toast('Este enlace es privado, accede desde tus archivos', 'info');
      return;
    }
    window.open(url, '_blank');
  };

  const deleteShare = async (shareId: string) => {
    try {
      await api.delete(`/shares/${shareId}`);
      toast('Enlace compartido eliminado', 'success');
      loadData();
    } catch (error) {
      toast('Error al eliminar el enlace compartido', 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  const currentData = activeTab === 'my-shares' ? myShares : sharedWithMe;

  return (
    <div className="space-y-6">
      {/* Content - tabs are handled by MainLayout */}
      {currentData.length > 0 && (
        <div className="space-y-1">
          {activeTab === 'my-shares' ? (
            myShares.map((share) => (
              <div
                key={share.id}
                className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-dark-50 dark:hover:bg-dark-800 transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                  <Share2 className="w-5 h-5 text-[#FF3B3B]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-dark-900 dark:text-white truncate">
                    {share.file?.name || share.folder?.name || 'Elemento desconocido'}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-dark-500 dark:text-dark-400 mt-0.5">
                    {share.type === 'PUBLIC' ? (
                      <span className="flex items-center gap-1">
                        <Globe className="w-3 h-3" />
                        Público
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <Lock className="w-3 h-3" />
                        Privado
                      </span>
                    )}
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      {share.permission === 'VIEWER' ? (
                        <>
                          <Eye className="w-3 h-3" />
                          Solo lectura
                        </>
                      ) : (
                        <>
                          <Edit3 className="w-3 h-3" />
                          Edición
                        </>
                      )}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {share.expiresAt ? formatDate(share.expiresAt) : 'Sin expiración'}
                    </span>
                    {share.password && (
                      <>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Lock className="w-3 h-3" />
                          Protegido
                        </span>
                      </>
                    )}
                    {share.downloadLimit && (
                      <>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Download className="w-3 h-3" />
                          {share.downloadCount}/{share.downloadLimit}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <Dropdown
                  trigger={
                    <button 
                      className="p-2 text-dark-500 hover:text-dark-900 dark:hover:text-white rounded-lg hover:bg-dark-100 dark:hover:bg-dark-700 transition-colors"
                      aria-label="Opciones del enlace compartido"
                    >
                      <MoreVertical className="w-5 h-5" />
                    </button>
                  }
                  align="right"
                >
                  <DropdownItem onClick={() => copyShareLink(share)}>
                    <Copy className="w-4 h-4" /> Copiar enlace
                  </DropdownItem>
                  <DropdownItem onClick={() => openShareLink(share)}>
                    <ExternalLink className="w-4 h-4" /> Abrir enlace
                  </DropdownItem>
                  <DropdownDivider />
                  <DropdownItem danger onClick={() => deleteShare(share.id)}>
                    <Trash2 className="w-4 h-4" /> Eliminar
                  </DropdownItem>
                </Dropdown>
              </div>
            ))
          ) : (
            sharedWithMe.map((share) => (
              <div
                key={share.id}
                className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-dark-50 dark:hover:bg-dark-800 transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                  <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-dark-900 dark:text-white truncate">
                    {share.file?.name || share.folder?.name || 'Elemento desconocido'}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-dark-500 dark:text-dark-400 mt-0.5">
                    <span>De: {share.owner?.name || share.owner?.email || 'Usuario desconocido'}</span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      {share.permission === 'VIEWER' ? (
                        <>
                          <Eye className="w-3 h-3" />
                          Solo lectura
                        </>
                      ) : (
                        <>
                          <Edit3 className="w-3 h-3" />
                          Puedes editar
                        </>
                      )}
                    </span>
                  </div>
                </div>
                <Dropdown
                  trigger={
                    <button 
                      className="p-2 text-dark-500 hover:text-dark-900 dark:hover:text-white rounded-lg hover:bg-dark-100 dark:hover:bg-dark-700 transition-colors"
                      aria-label="Opciones del elemento compartido"
                    >
                      <MoreVertical className="w-5 h-5" />
                    </button>
                  }
                  align="right"
                >
                  <DropdownItem onClick={() => openShareLink(share)}>
                    <ExternalLink className="w-4 h-4" /> Abrir
                  </DropdownItem>
                  <DropdownItem onClick={() => copyShareLink(share)}>
                    <Copy className="w-4 h-4" /> Copiar enlace
                  </DropdownItem>
                </Dropdown>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
