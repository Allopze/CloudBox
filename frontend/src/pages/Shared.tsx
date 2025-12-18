import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
import ContextMenu, { type ContextMenuItemOrDivider } from '../components/ui/ContextMenu';
import { motion, useReducedMotion } from 'framer-motion';
import { waveIn } from '../lib/animations';

interface ContextMenuState {
  x: number;
  y: number;
  share: Share;
  isOwnShare: boolean;
}

export default function Shared() {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const [searchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'my-shares';

  const [myShares, setMyShares] = useState<Share[]>([]);
  const [sharedWithMe, setSharedWithMe] = useState<Share[]>([]);
  const [loading, setLoading] = useState(true);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

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
      toast(t('shared.loadError'), 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Listen for workzone refresh event
  useEffect(() => {
    const handleRefresh = () => loadData();
    window.addEventListener('workzone-refresh', handleRefresh);
    return () => window.removeEventListener('workzone-refresh', handleRefresh);
  }, [loadData]);

  const buildShareLink = (share: Share) => {
    const path = share.publicUrl || (share.publicToken ? `/share/${share.publicToken}` : null);
    return path ? `${window.location.origin}${path}` : null;
  };

  const copyShareLink = (share: Share) => {
    const url = buildShareLink(share);
    if (!url) {
      toast(t('shared.privateLinkNoUrl'), 'error');
      return;
    }
    navigator.clipboard.writeText(url);
    toast(t('shared.linkCopied'), 'success');
  };

  const openShareLink = (share: Share) => {
    const url = buildShareLink(share);
    if (!url) {
      toast(t('shared.privateLinkAccess'), 'info');
      return;
    }
    window.open(url, '_blank');
  };

  const deleteShare = async (shareId: string) => {
    try {
      await api.delete(`/shares/${shareId}`);
      toast(t('shared.shareDeleted'), 'success');
      loadData();
    } catch (error) {
      toast(t('shared.deleteError'), 'error');
    }
  };

  // Context menu handlers
  const handleContextMenu = (e: React.MouseEvent, share: Share, isOwnShare: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, share, isOwnShare });
  };

  const closeContextMenu = () => setContextMenu(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  const currentData = activeTab === 'my-shares' ? myShares : sharedWithMe;

  // Empty state configuration based on tab
  const getEmptyStateConfig = () => {
    if (activeTab === 'my-shares') {
      return {
        icon: Share2,
        title: t('shared.noMyShares'),
        subtitle: t('shared.startSharing'),
        color: 'text-primary-500'
      };
    }
    return {
      icon: Users,
      title: t('shared.noSharedWithMe'),
      subtitle: t('shared.waitForShares'),
      color: 'text-blue-500'
    };
  };

  const emptyState = getEmptyStateConfig();

  return (
    <div className="space-y-6">
      {/* Empty state */}
      {currentData.length === 0 && (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <emptyState.icon className={`w-16 h-16 ${emptyState.color} mb-4`} />
          <h3 className="text-lg font-medium text-dark-900 dark:text-white mb-2">
            {emptyState.title}
          </h3>
          <p className="text-dark-500 dark:text-dark-400 max-w-sm">
            {emptyState.subtitle}
          </p>
        </div>
      )}
      {/* Content - tabs are handled by MainLayout */}
      {currentData.length > 0 && (
        <div className="space-y-1">
          {activeTab === 'my-shares' ? (
            myShares.map((share, index) => (
              <motion.div
                key={share.id}
                {...waveIn(index, reducedMotion)}
                onContextMenu={(e) => handleContextMenu(e, share, true)}
                className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-dark-50 dark:hover:bg-dark-800 transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
                  <Share2 className="w-5 h-5 text-[#FF3B3B]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-dark-900 dark:text-white truncate">
                    {share.file?.name || share.folder?.name || t('shared.unknownItem')}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-dark-500 dark:text-dark-400 mt-0.5">
                    {share.type === 'PUBLIC' ? (
                      <span className="flex items-center gap-1">
                        <Globe className="w-3 h-3" />
                        {t('shared.public')}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <Lock className="w-3 h-3" />
                        {t('shared.private')}
                      </span>
                    )}
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      {share.permission === 'VIEWER' ? (
                        <>
                          <Eye className="w-3 h-3" />
                          {t('shared.viewOnly')}
                        </>
                      ) : (
                        <>
                          <Edit3 className="w-3 h-3" />
                          {t('shared.canEdit')}
                        </>
                      )}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {share.expiresAt ? formatDate(share.expiresAt) : t('shared.noExpiration')}
                    </span>
                    {share.password && (
                      <>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Lock className="w-3 h-3" />
                          {t('shared.protected')}
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
                      aria-label={t('shared.shareOptions')}
                    >
                      <MoreVertical className="w-5 h-5" />
                    </button>
                  }
                  align="right"
                >
                  <DropdownItem onClick={() => copyShareLink(share)}>
                    <Copy className="w-4 h-4" /> {t('shared.copyLink')}
                  </DropdownItem>
                  <DropdownItem onClick={() => openShareLink(share)}>
                    <ExternalLink className="w-4 h-4" /> {t('shared.openLink')}
                  </DropdownItem>
                  <DropdownDivider />
                  <DropdownItem danger onClick={() => deleteShare(share.id)}>
                    <Trash2 className="w-4 h-4" /> {t('common.delete')}
                  </DropdownItem>
                </Dropdown>
              </motion.div>
            ))
          ) : (
            sharedWithMe.map((share, index) => (
              <motion.div
                key={share.id}
                {...waveIn(index, reducedMotion)}
                onContextMenu={(e) => handleContextMenu(e, share, false)}
                className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-dark-50 dark:hover:bg-dark-800 transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                  <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-dark-900 dark:text-white truncate">
                    {share.file?.name || share.folder?.name || t('shared.unknownItem')}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-dark-500 dark:text-dark-400 mt-0.5">
                    <span>{t('shared.from')}: {share.owner?.name || share.owner?.email || t('shared.unknownUser')}</span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      {share.permission === 'VIEWER' ? (
                        <>
                          <Eye className="w-3 h-3" />
                          {t('shared.viewOnly')}
                        </>
                      ) : (
                        <>
                          <Edit3 className="w-3 h-3" />
                          {t('shared.canEditPermission')}
                        </>
                      )}
                    </span>
                  </div>
                </div>
                <Dropdown
                  trigger={
                    <button
                      className="p-2 text-dark-500 hover:text-dark-900 dark:hover:text-white rounded-lg hover:bg-dark-100 dark:hover:bg-dark-700 transition-colors"
                      aria-label={t('shared.itemOptions')}
                    >
                      <MoreVertical className="w-5 h-5" />
                    </button>
                  }
                  align="right"
                >
                  <DropdownItem onClick={() => openShareLink(share)}>
                    <ExternalLink className="w-4 h-4" /> {t('shared.open')}
                  </DropdownItem>
                  <DropdownItem onClick={() => copyShareLink(share)}>
                    <Copy className="w-4 h-4" /> {t('shared.copyLink')}
                  </DropdownItem>
                </Dropdown>
              </motion.div>
            ))
          )}
        </div>
      )}

      <ContextMenu
        items={
          contextMenu
            ? ([
                {
                  id: 'open',
                  label: t(contextMenu.isOwnShare ? 'shared.openLink' : 'shared.open'),
                  icon: ExternalLink,
                  onClick: () => openShareLink(contextMenu.share),
                },
                {
                  id: 'copy',
                  label: t('shared.copyLink'),
                  icon: Copy,
                  onClick: () => copyShareLink(contextMenu.share),
                },
                ...(contextMenu.isOwnShare
                  ? ([
                      { id: 'divider-delete', divider: true as const },
                      {
                        id: 'delete',
                        label: t('common.delete'),
                        icon: Trash2,
                        danger: true,
                        onClick: () => deleteShare(contextMenu.share.id),
                      },
                    ] as ContextMenuItemOrDivider[])
                  : []),
              ] as ContextMenuItemOrDivider[])
            : []
        }
        position={contextMenu ? { x: contextMenu.x, y: contextMenu.y } : null}
        onClose={closeContextMenu}
      />
    </div>
  );
}
