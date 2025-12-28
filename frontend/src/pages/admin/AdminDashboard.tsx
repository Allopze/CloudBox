import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { AdminSection } from '../../components/Sidebar';
import OverviewSection from '../../components/admin/sections/OverviewSection';
import UsersSection from '../../components/admin/sections/UsersSection';
import FileIconsAdmin from '../../components/admin/FileIconsAdmin';
import SettingsSection from '../../components/admin/sections/SettingsSection';
import BrandingSection from '../../components/admin/sections/BrandingSection';
import EmailSection from '../../components/admin/sections/EmailSection';
import LegalSection from '../../components/admin/sections/LegalSection';
import ActivitySection from '../../components/admin/sections/ActivitySection';
import StorageRequestsSection from '../../components/admin/sections/StorageRequestsSection';
import QueuesSection from '../../components/admin/sections/QueuesSection';
import { toast } from '../../components/ui/Toast';

export default function AdminDashboard() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();

  // Get active section from URL, default to 'overview'
  const activeSection = (searchParams.get('section') as AdminSection) || 'overview';

  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Only load summary if we are on the overview
    if (activeSection === 'overview') {
      loadSummary();
    }
  }, [activeSection]);

  const loadSummary = async () => {
    try {
      setLoading(true);
      const response = await api.get('/admin/summary');
      setSummary(response.data);
    } catch (error) {
      console.error('Failed to load admin summary', error);
      toast(t('admin.loadError'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const renderContent = () => {
    switch (activeSection) {
      case 'overview':
        if (loading && !summary) {
          return (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
          );
        }
        return <OverviewSection summary={summary} />;
      case 'users':
        return <UsersSection />;
      case 'settings':
        return <SettingsSection />;
      case 'branding':
        return <BrandingSection />;
      case 'email':
        return <EmailSection />;
      case 'file-icons':
        return (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-dark-900 dark:text-white">{t('admin.fileIcons.title', 'Iconos de Archivo')}</h2>
              <p className="text-dark-500 dark:text-dark-400 mt-1">{t('admin.fileIcons.description', 'Gestiona los iconos personalizados para cada tipo de archivo.')}</p>
            </div>
            <FileIconsAdmin />
          </div>
        );
      case 'legal':
        return <LegalSection />;
      case 'activity':
        return <ActivitySection />;
      case 'storage-requests':
        return <StorageRequestsSection />;
      case 'queues':
        return <QueuesSection />;
      default:
        return <div>Section not found</div>;
    }
  };

  return (
    <div className="h-full bg-white dark:bg-dark-950 overflow-y-auto">
      {/* Main Content Area - now uses full width since sidebar is handled by MainLayout */}
      <main className="p-6 h-full">
        <div className="animate-fade-in-up">
          {renderContent()}
        </div>
      </main>
    </div>
  );
}
