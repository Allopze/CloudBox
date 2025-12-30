import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { Tabs, TabList, Tab, TabPanel } from '../ui/Tabs';
import { api } from '../../lib/api';
import { toast } from '../ui/Toast';
import { FileItem, Folder, Share } from '../../types';
import {
  Copy,
  Users,
  Lock,
  Calendar,
  Download,
  Trash2,
  Plus,
  X,
  Globe,
  Eye,
  Edit3,
  RefreshCw,
} from 'lucide-react';
import { formatDate, cn } from '../../lib/utils';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  file?: FileItem | null;
  folder?: Folder | null;
  onSuccess?: () => void;
}

export default function ShareModal({ isOpen, onClose, file, folder, onSuccess }: ShareModalProps) {
  const { t } = useTranslation();
  const [existingShare, setExistingShare] = useState<Share | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);

  // Configuración del enlace público
  const [shareType, setShareType] = useState<'PUBLIC' | 'PRIVATE'>('PUBLIC');
  const [password, setPassword] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [downloadLimit, setDownloadLimit] = useState('');

  // Colaboradores
  const [collaboratorEmail, setCollaboratorEmail] = useState('');
  const [collaboratorPermission, setCollaboratorPermission] = useState<'VIEWER' | 'EDITOR'>('VIEWER');
  const [addingCollaborator, setAddingCollaborator] = useState(false);

  const itemName = file?.name || folder?.name || 'Elemento';
  const itemId = file?.id || folder?.id;
  const isFile = !!file;

  useEffect(() => {
    if (isOpen && itemId) {
      loadExistingShare();
    } else {
      resetForm();
    }
  }, [isOpen, itemId]);

  const resetForm = () => {
    setExistingShare(null);
    setShareType('PUBLIC');
    setPassword('');
    setExpiresAt('');
    setDownloadLimit('');
    setCollaboratorEmail('');
    setCollaboratorPermission('VIEWER');
  };

  const loadExistingShare = async () => {
    setLoading(true);
    try {
      const response = await api.get('/shares/by-me');
      const shares = response.data || [];

      const share = shares.find(
        (s: Share) => (isFile && s.fileId === itemId) || (!isFile && s.folderId === itemId)
      );

      if (share) {
        setExistingShare(share);
        setShareType(share.type as 'PUBLIC' | 'PRIVATE');
        setPassword(''); // No mostramos la contraseña existente por seguridad
        if (share.expiresAt) {
          setExpiresAt(share.expiresAt.split('T')[0]);
        }
        if (share.downloadLimit) {
          setDownloadLimit(share.downloadLimit.toString());
        }
      }
    } catch (error) {
      console.error('Error al cargar el enlace compartido:', error);
    } finally {
      setLoading(false);
    }
  };

  const createShare = async () => {
    setCreating(true);
    try {
      const data: any = {
        type: shareType,
        ...(isFile ? { fileId: itemId } : { folderId: itemId }),
      };

      if (shareType === 'PUBLIC') {
        if (password) data.password = password;
        if (expiresAt) data.expiresAt = new Date(expiresAt).toISOString();
        if (downloadLimit) data.downloadLimit = parseInt(downloadLimit);
      }

      const response = await api.post('/shares', data);
      setExistingShare(response.data);
      setShareType(response.data.type);
      toast(t('modals.share.created'), 'success');
      onSuccess?.();
    } catch (error: any) {
      toast(error.response?.data?.error || t('modals.share.createError'), 'error');
    } finally {
      setCreating(false);
    }
  };

  const updateShare = async () => {
    if (!existingShare) return;
    setUpdating(true);
    try {
      const data: any = {};
      
      if (password) data.password = password;
      if (expiresAt) data.expiresAt = new Date(expiresAt).toISOString();
      if (downloadLimit) data.downloadLimit = parseInt(downloadLimit);

      await api.patch(`/shares/${existingShare.id}`, data);
      toast(t('modals.share.updated'), 'success');
      loadExistingShare();
      onSuccess?.();
    } catch (error: any) {
      toast(error.response?.data?.error || t('modals.share.updateError'), 'error');
    } finally {
      setUpdating(false);
    }
  };

  const deleteShare = async () => {
    if (!existingShare) return;
    try {
      await api.delete(`/shares/${existingShare.id}`);
      setExistingShare(null);
      resetForm();
      toast(t('modals.share.deleted'), 'success');
      onSuccess?.();
    } catch (error) {
      toast(t('modals.share.deleteError'), 'error');
    }
  };

  const addCollaborator = async () => {
    if (!existingShare || !collaboratorEmail) return;

    setAddingCollaborator(true);
    try {
      await api.post(`/shares/${existingShare.id}/collaborators`, {
        email: collaboratorEmail,
        permission: collaboratorPermission,
      });
      toast(t('modals.share.collaboratorAdded'), 'success');
      setCollaboratorEmail('');
      loadExistingShare();
    } catch (error: any) {
      toast(error.response?.data?.error || t('modals.share.collaboratorAddError'), 'error');
    } finally {
      setAddingCollaborator(false);
    }
  };

  const removeCollaborator = async (userId: string) => {
    if (!existingShare) return;

    try {
      await api.delete(`/shares/${existingShare.id}/collaborators/${userId}`);
      toast(t('modals.share.collaboratorRemoved'), 'success');
      loadExistingShare();
    } catch (error) {
      toast(t('modals.share.collaboratorRemoveError'), 'error');
    }
  };

  const copyShareLink = () => {
    if (!existingShare?.publicToken) return;
    const url = `${window.location.origin}/share/${existingShare.publicToken}`;
    navigator.clipboard.writeText(url);
    toast(t('modals.share.linkCopied'), 'success');
  };

  const getShareUrl = () => {
    if (!existingShare?.publicToken) return '';
    return `${window.location.origin}/share/${existingShare.publicToken}`;
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('modals.share.title', { name: itemName })} size="md">
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
        </div>
      ) : existingShare ? (
        <div className="space-y-6">
          {/* Sección de enlace público */}
          {existingShare.type === 'PUBLIC' && existingShare.publicToken && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-dark-700 dark:text-dark-300">
                <Globe className="w-5 h-5 text-green-500" />
                <span className="font-medium">{t('modals.share.publicLinkActive')}</span>
              </div>

              <div className="flex items-center gap-2">
                <Input 
                  value={getShareUrl()} 
                  readOnly 
                  className="flex-1" 
                  aria-label={t('modals.share.shareUrlLabel')}
                />
                <Button 
                  onClick={copyShareLink} 
                  icon={<Copy className="w-4 h-4" />}
                  aria-label={t('modals.share.copyToClipboard')}
                >
                  {t('modals.share.copy')}
                </Button>
              </div>

              {/* Estado actual del enlace */}
              <div className="flex flex-wrap gap-3 text-sm">
                {existingShare.password && (
                  <div className="flex items-center gap-1 px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded-lg">
                    <Lock className="w-4 h-4" />
                    <span>{t('modals.share.passwordProtected')}</span>
                  </div>
                )}
                {existingShare.expiresAt && (
                  <div className="flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-lg">
                    <Calendar className="w-4 h-4" />
                    <span>{t('modals.share.expires')}: {formatDate(existingShare.expiresAt)}</span>
                  </div>
                )}
                {existingShare.downloadLimit && (
                  <div className="flex items-center gap-1 px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 rounded-lg">
                    <Download className="w-4 h-4" />
                    <span>{existingShare.downloadCount}/{existingShare.downloadLimit} {t('modals.share.downloads')}</span>
                  </div>
                )}
              </div>

              {/* Editar configuración */}
              <div className="border-t border-dark-100 dark:border-dark-700 pt-4 space-y-3">
                <p className="text-sm font-medium text-dark-700 dark:text-dark-300">{t('modals.share.modifySettings')}</p>
                
                <Input
                  label={t('modals.share.newPassword')}
                  type="password"
                  placeholder={t('modals.share.leaveEmptyPassword')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />

                <Input
                  label={t('modals.share.expirationDate')}
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                />

                <Input
                  label={t('modals.share.downloadLimit')}
                  type="number"
                  placeholder={t('modals.share.noLimit')}
                  value={downloadLimit}
                  onChange={(e) => setDownloadLimit(e.target.value)}
                />

                <Button 
                  variant="secondary" 
                  onClick={updateShare} 
                  loading={updating}
                  icon={<RefreshCw className="w-4 h-4" />}
                  className="w-full"
                >
                  {t('modals.share.updateSettings')}
                </Button>
              </div>
            </div>
          )}

          {existingShare.type === 'PRIVATE' && (
            <div className="p-4 rounded-lg bg-dark-50 dark:bg-dark-700 text-sm text-dark-600 dark:text-dark-300">
              <div className="flex items-center gap-2 mb-2">
                <Lock className="w-5 h-5 text-orange-500" />
                <span className="font-medium">{t('modals.share.privateLink')}</span>
              </div>
              <p>{t('modals.share.privateLinkDescription')}</p>
            </div>
          )}

          {/* Sección de colaboradores */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-dark-700 dark:text-dark-300">
              <Users className="w-5 h-5" />
              <span className="font-medium">{t('modals.share.collaborators')}</span>
            </div>

            <div className="flex items-center gap-2">
              <Input
                placeholder={t('modals.share.collaboratorEmail')}
                value={collaboratorEmail}
                onChange={(e) => setCollaboratorEmail(e.target.value)}
                className="flex-1"
                aria-label={t('modals.share.collaboratorEmailLabel')}
              />
              <select
                value={collaboratorPermission}
                onChange={(e) => setCollaboratorPermission(e.target.value as 'VIEWER' | 'EDITOR')}
                className="input w-32"
                aria-label={t('modals.share.collaboratorPermission')}
              >
                <option value="VIEWER">{t('modals.share.viewOnly')}</option>
                <option value="EDITOR">{t('modals.share.edit')}</option>
              </select>
              <Button 
                onClick={addCollaborator} 
                loading={addingCollaborator} 
                icon={<Plus className="w-4 h-4" />}
                aria-label={t('modals.share.addCollaborator')}
              />
            </div>

            {existingShare.collaborators && existingShare.collaborators.length > 0 ? (
              <div className="space-y-2">
                {existingShare.collaborators.map((collab) => (
                  <div
                    key={collab.id}
                    className="flex items-center justify-between p-3 bg-dark-50 dark:bg-dark-700 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                        <span className="text-sm font-medium text-primary-600">
                          {collab.user?.name?.charAt(0).toUpperCase() || '?'}
                        </span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-dark-900 dark:text-white">
                          {collab.user?.name || 'Usuario'}
                        </p>
                        <p className="text-xs text-dark-500">{collab.user?.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'text-xs px-2 py-1 rounded-full flex items-center gap-1',
                          collab.permission === 'EDITOR'
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-dark-100 text-dark-600 dark:bg-dark-600 dark:text-dark-300'
                        )}
                      >
                        {collab.permission === 'EDITOR' ? (
                          <>
                            <Edit3 className="w-3 h-3" />
                            {t('modals.share.editor')}
                          </>
                        ) : (
                          <>
                            <Eye className="w-3 h-3" />
                            {t('modals.share.viewer')}
                          </>
                        )}
                      </span>
                      <button
                        onClick={() => removeCollaborator(collab.userId)}
                        className="p-1 text-dark-400 hover:text-red-500 transition-colors"
                        aria-label={t('modals.share.removeCollaborator', { name: collab.user?.name || collab.user?.email })}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-dark-500 text-center py-4">
                {t('modals.share.noCollaborators')}
              </p>
            )}
          </div>

          <div className="flex justify-between pt-4 border-t border-dark-100 dark:border-dark-700">
            <Button 
              variant="danger" 
              onClick={deleteShare} 
              icon={<Trash2 className="w-4 h-4" />}
              aria-label={t('modals.share.deleteLink')}
            >
              {t('modals.share.deleteLink')}
            </Button>
            <Button onClick={onClose}>{t('modals.share.close')}</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <Tabs
            defaultTab="public"
            onChange={(tab) => {
              setShareType(tab === 'public' ? 'PUBLIC' : 'PRIVATE');
            }}
          >
            <TabList>
              <Tab value="public">
                <Globe className="w-4 h-4" /> {t('modals.share.publicLinkTab')}
              </Tab>
              <Tab value="private">
                <Lock className="w-4 h-4" /> {t('modals.share.privateTab')}
              </Tab>
            </TabList>

            <TabPanel value="public">
              <div className="space-y-4 pt-4">
                <p className="text-sm text-dark-500 dark:text-dark-400">
                  {t('modals.share.publicDescription', { item: isFile ? t('modals.share.thisFile') : t('modals.share.thisFolder') })}
                </p>

                <Input
                  label={t('modals.share.passwordOptional')}
                  type="password"
                  placeholder={t('modals.share.leaveEmptyNoPassword')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />

                <Input
                  label={t('modals.share.expirationOptional')}
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                />

                <Input
                  label={t('modals.share.downloadLimitOptional')}
                  type="number"
                  placeholder={t('modals.share.noLimit')}
                  value={downloadLimit}
                  onChange={(e) => setDownloadLimit(e.target.value)}
                />
              </div>
            </TabPanel>

            <TabPanel value="private">
              <div className="space-y-4 pt-4">
                <p className="text-sm text-dark-500 dark:text-dark-400">
                  {t('modals.share.privateDescription')}
                </p>
                <p className="text-sm text-dark-400">
                  {t('modals.share.privateHint')}
                </p>
              </div>
            </TabPanel>
          </Tabs>

          <div className="flex justify-end gap-3 pt-4 border-t border-dark-100 dark:border-dark-700">
            <Button variant="ghost" onClick={onClose}>
              {t('modals.share.cancel')}
            </Button>
            <Button onClick={createShare} loading={creating}>
              {t('modals.share.createLink')}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
