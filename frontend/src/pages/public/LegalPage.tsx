import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, Cloud, FileText, Shield } from 'lucide-react';
import { useBrandingStore } from '../../stores/brandingStore';
import { useThemeStore } from '../../stores/themeStore';
import api from '../../lib/api';

interface LegalPageData {
  slug: string;
  title: string;
  content: string;
  isActive: boolean;
  updatedAt?: string;
}

export default function LegalPage() {
  const location = useLocation();
  const slug = location.pathname.replace('/', ''); // Get slug from path: /privacy -> privacy
  const { branding } = useBrandingStore();
  const { isDark } = useThemeStore();
  const [page, setPage] = useState<LegalPageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const logo = (isDark ? branding.logoDarkUrl : branding.logoLightUrl) || branding.logoUrl;

  useEffect(() => {
    const loadPage = async () => {
      if (!slug || !['privacy', 'terms'].includes(slug)) {
        setError('Página no encontrada');
        setLoading(false);
        return;
      }

      try {
        const response = await api.get(`/admin/legal/${slug}`);
        setPage(response.data);
      } catch (err) {
        setError('Error al cargar la página');
      } finally {
        setLoading(false);
      }
    };

    loadPage();
  }, [slug]);

  const getIcon = () => {
    if (slug === 'privacy') {
      return <Shield className="w-8 h-8 text-primary-600" />;
    }
    return <FileText className="w-8 h-8 text-primary-600" />;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] dark:bg-dark-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-500 border-t-transparent"></div>
      </div>
    );
  }

  if (error || !page) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] dark:bg-dark-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-dark-600 dark:text-dark-400 mb-4">{error || 'Página no encontrada'}</p>
          <Link 
            to="/login" 
            className="text-primary-600 hover:text-primary-700 font-medium"
          >
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB] dark:bg-dark-950">
      {/* Header */}
      <header className="bg-white dark:bg-dark-800 border-b border-dark-200 dark:border-dark-700">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/login" className="flex items-center gap-3">
            {logo ? (
              <img src={logo} alt="Logo" className="h-10 object-contain" />
            ) : (
              <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center">
                <Cloud className="w-6 h-6 text-white" />
              </div>
            )}
          </Link>
          <Link 
            to="/login" 
            className="flex items-center gap-2 text-dark-600 dark:text-dark-400 hover:text-dark-900 dark:hover:text-dark-200 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">Volver</span>
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 py-8 md:py-12">
        <article className="bg-white dark:bg-dark-800 rounded-2xl shadow-lg overflow-hidden">
          {/* Page header */}
          <div className="px-6 md:px-10 py-8 border-b border-dark-200 dark:border-dark-700 bg-gradient-to-r from-primary-50 to-transparent dark:from-primary-900/20">
            <div className="flex items-center gap-4 mb-4">
              {getIcon()}
              <h1 className="text-2xl md:text-3xl font-bold text-dark-900 dark:text-white">
                {page.title}
              </h1>
            </div>
            {page.updatedAt && (
              <p className="text-sm text-dark-500 dark:text-dark-400">
                Última actualización: {new Date(page.updatedAt).toLocaleDateString('es-ES', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </p>
            )}
          </div>

          {/* Page content */}
          <div 
            className="px-6 md:px-10 py-8 prose prose-dark dark:prose-invert max-w-none
                       prose-headings:text-dark-900 dark:prose-headings:text-white
                       prose-h2:text-xl prose-h2:font-semibold prose-h2:mt-8 prose-h2:mb-4
                       prose-p:text-dark-600 dark:prose-p:text-dark-300 prose-p:leading-relaxed
                       prose-ul:text-dark-600 dark:prose-ul:text-dark-300
                       prose-li:my-1
                       prose-a:text-primary-600 hover:prose-a:text-primary-700"
            dangerouslySetInnerHTML={{ __html: page.content }}
          />
        </article>

        {/* Footer links */}
        <div className="mt-8 flex flex-wrap justify-center gap-6 text-sm text-dark-500 dark:text-dark-400">
          <Link 
            to="/privacy" 
            className={`hover:text-primary-600 transition-colors ${slug === 'privacy' ? 'text-primary-600 font-medium' : ''}`}
          >
            Política de Privacidad
          </Link>
          <span className="hidden sm:inline">•</span>
          <Link 
            to="/terms" 
            className={`hover:text-primary-600 transition-colors ${slug === 'terms' ? 'text-primary-600 font-medium' : ''}`}
          >
            Términos de Servicio
          </Link>
          <span className="hidden sm:inline">•</span>
          <Link 
            to="/login" 
            className="hover:text-primary-600 transition-colors"
          >
            Iniciar Sesión
          </Link>
        </div>
      </main>
    </div>
  );
}
