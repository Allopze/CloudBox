import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  Check,
  Menu,
  Moon,
  Server,
  Sun,
  X,
  Search,
  LayoutGrid,
  List,
  Plus,
  Upload,
  Folder,
  FileText,
  Image as ImageIcon,
  Shield,
  Zap,
  Settings,
  Users,
  Trash2,
  Lock,
  Activity,
  Music,
  Star,
  Archive,
  Album,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useThemeStore } from '../../stores/themeStore';
import { useBrandingStore } from '../../stores/brandingStore';
import { FALLBACK_LANDING_CONFIG } from './landing/defaultConfig';
import type { LandingConfigV1 } from './landing/types';

// --- Atomic UI Components ---

const Button = ({
  children,
  variant = 'primary',
  className = '',
  ...props
}: {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'link';
  className?: string;
  [key: string]: any;
}) => {
  const baseStyle = "px-6 py-2 rounded-full text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2 active:scale-95 focus:outline-none focus:ring-2 focus:ring-[#F44336]/50";

  const variants: Record<string, string> = {
    primary: "bg-[#F44336] hover:bg-[#e53935] text-white shadow-sm border border-transparent hover:shadow-[#F44336]/20",
    secondary: "bg-white dark:bg-dark-800 text-dark-700 dark:text-dark-200 border border-dark-200 dark:border-dark-700 hover:border-dark-300 dark:hover:border-dark-600 hover:bg-dark-50 dark:hover:bg-dark-700",
    ghost: "text-dark-600 dark:text-dark-400 hover:text-dark-900 dark:hover:text-dark-100 hover:bg-dark-100 dark:hover:bg-dark-800",
    link: "text-[#F44336] hover:text-[#e53935] p-0 h-auto font-normal rounded-none"
  };

  return (
    <button className={`${baseStyle} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
};

const Badge = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-dark-100 dark:bg-dark-800 text-dark-600 dark:text-dark-300 border border-dark-200 dark:border-dark-700 ${className}`}>
    {children}
  </span>
);

const Panel = ({ children, className = '', noPadding = false, id }: { children: React.ReactNode; className?: string; noPadding?: boolean; id?: string }) => (
  <div id={id} className={`bg-white dark:bg-dark-800 border border-dark-200 dark:border-dark-700 rounded-2xl overflow-hidden transition-colors duration-300 ${noPadding ? '' : 'p-6'} ${className}`}>
    {children}
  </div>
);

// --- Brand Logo Component ---
const BrandLogo = ({ logoSrc, className = "h-8" }: { logoSrc?: string; className?: string }) => (
  <div className={`flex items-center gap-2 ${className}`}>
    {logoSrc ? (
      <img src={logoSrc} alt="CloudBox" className="h-8 w-auto" />
    ) : (
      <>
        {/* Light Mode */}
        <div className="dark:hidden flex items-center gap-2">
          <div className="w-8 h-8 bg-[#F44336] rounded-xl flex items-center justify-center shadow-md shadow-[#F44336]/20">
            <span className="text-white text-sm font-bold">C</span>
          </div>
          <span className="text-dark-900 font-bold tracking-tight text-xl">CloudBox</span>
        </div>

        {/* Dark Mode */}
        <div className="hidden dark:flex items-center gap-2">
          <div className="w-8 h-8 bg-white rounded-xl flex items-center justify-center shadow-md">
            <span className="text-[#F44336] text-sm font-bold">C</span>
          </div>
          <span className="text-white font-bold tracking-tight text-xl">CloudBox</span>
        </div>
      </>
    )}
  </div>
);


const HeroMockup = ({ isDark, logoLight, logoDark }: { isDark: boolean; logoLight?: string; logoDark?: string }) => {
  // Use the appropriate logo based on theme
  const logoSrc = isDark ? logoDark : logoLight;

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-dark-900 select-none overflow-hidden font-sans">
      {/* Header */}
      <div className="h-14 border-b border-dark-100 dark:border-dark-700 flex items-center justify-between px-4 bg-white dark:bg-dark-900 flex-shrink-0">
        <div className="flex items-center gap-4 flex-1">
          {/* Logo */}
          <div className="flex items-center gap-1.5">
            {logoSrc ? (
              <img src={logoSrc} alt="CloudBox" className="h-7 w-auto" />
            ) : (
              <>
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${isDark ? 'bg-white' : 'bg-[#F44336]'}`}>
                  <span className={`text-xs font-bold ${isDark ? 'text-[#F44336]' : 'text-white'}`}>C</span>
                </div>
                <span className="text-dark-800 dark:text-white font-bold text-sm hidden lg:block">CloudBox</span>
              </>
            )}
          </div>

          {/* Search */}
          <div className="flex-1 max-w-xs">
            <div className="flex items-center gap-2 h-8 bg-dark-100 dark:bg-dark-800 rounded-lg px-3">
              <Search className="w-3.5 h-3.5 text-dark-400" />
              <span className="text-xs text-dark-400">Buscar...</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="h-7 px-3 bg-[#F44336] rounded-lg text-white text-xs font-medium flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" /> Nuevo
          </div>
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#F44336] to-orange-500 flex items-center justify-center text-white text-[10px] font-bold">
            JS
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-44 flex-shrink-0 border-r border-dark-100 dark:border-dark-700 hidden md:flex flex-col py-3 bg-white dark:bg-dark-900">
          <div className="flex flex-col gap-0.5 px-2">
            {[
              { icon: LayoutGrid, label: 'Inicio', active: false },
              { icon: Folder, label: 'Mis archivos', active: true },
              { icon: FileText, label: 'Documentos', active: false },
              { icon: ImageIcon, label: 'Galería', active: false },
              { icon: Music, label: 'Música', active: false },
              { icon: Users, label: 'Compartidos', active: false },
            ].map((item, idx) => (
              <div key={idx} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium ${item.active ? 'bg-[#F44336]/10 text-[#F44336]' : 'text-dark-600 dark:text-dark-400'}`}>
                <item.icon className={`w-4 h-4 ${item.active ? 'text-[#F44336]' : ''}`} />
                {item.label}
              </div>
            ))}
          </div>

          <div className="mt-auto px-2">
            <div className="flex flex-col gap-0.5 mb-3">
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-dark-500">
                <Trash2 className="w-4 h-4" /> Papelera
              </div>
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-dark-500">
                <Settings className="w-4 h-4" /> Configuración
              </div>
            </div>
            <div className="px-2.5 pt-2 border-t border-dark-100 dark:border-dark-700">
              <span className="text-[10px] text-dark-400">Almacenamiento</span>
              <div className="h-1 bg-dark-200 dark:bg-dark-700 rounded-full mt-1 mb-1">
                <div className="h-full w-1/5 bg-[#F44336] rounded-full"></div>
              </div>
              <span className="text-[10px] text-dark-400">1.03 GB / 3.91 TB</span>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0 bg-dark-50 dark:bg-dark-800/50 overflow-hidden">
          {/* Breadcrumb */}
          <div className="h-10 flex items-center justify-between px-4 bg-white dark:bg-dark-900 border-b border-dark-100 dark:border-dark-700 flex-shrink-0">
            <div className="flex items-center gap-1 text-xs text-dark-500">
              <Folder className="w-3.5 h-3.5" />
              <span>Mis archivos</span>
            </div>
            <div className="flex items-center gap-1 bg-dark-100 dark:bg-dark-800 rounded-md p-0.5">
              <div className="p-1 bg-white dark:bg-dark-700 rounded shadow-sm">
                <LayoutGrid className="w-3 h-3 text-[#F44336]" />
              </div>
              <div className="p-1 text-dark-400">
                <List className="w-3 h-3" />
              </div>
            </div>
          </div>

          {/* File Grid */}
          <div className="flex-1 p-4 overflow-auto">
            <div className="grid grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
              {/* Folders */}
              {[
                { name: 'Contratos', count: 8 },
                { name: 'Facturas 2024', count: 24 },
                { name: 'Diseños', count: 15 },
                { name: 'Marketing', count: 32 },
                { name: 'Recursos', count: 47 },
                { name: 'Backups', count: 6 },
              ].map((folder, i) => (
                <div key={i} className="bg-white dark:bg-dark-900 rounded-xl p-3 border border-dark-100 dark:border-dark-700 hover:border-[#F44336]/30 transition-colors cursor-pointer group">
                  <div className="w-full aspect-square rounded-lg bg-[#F44336]/10 flex items-center justify-center mb-2">
                    <Folder className="w-8 h-8 text-[#F44336] fill-[#F44336]/80" />
                  </div>
                  <div className="text-xs font-medium text-dark-700 dark:text-dark-200 truncate">{folder.name}</div>
                  <div className="text-[10px] text-dark-400">{folder.count} elementos</div>
                </div>
              ))}

              {/* Files */}
              {[
                { name: 'Propuesta_Q4.pdf', color: 'bg-blue-500/10', iconColor: 'text-blue-500' },
                { name: 'Logo_final.svg', color: 'bg-purple-500/10', iconColor: 'text-purple-500' },
                { name: 'Base_datos.zip', color: 'bg-orange-500/10', iconColor: 'text-orange-500' },
              ].map((file, i) => (
                <div key={i} className="bg-white dark:bg-dark-900 rounded-xl p-3 border border-dark-100 dark:border-dark-700 hover:border-dark-300 transition-colors cursor-pointer">
                  <div className={`w-full aspect-square rounded-lg ${file.color} flex items-center justify-center mb-2`}>
                    <FileText className={`w-8 h-8 ${file.iconColor}`} />
                  </div>
                  <div className="text-xs font-medium text-dark-700 dark:text-dark-200 truncate">{file.name}</div>
                  <div className="text-[10px] text-dark-400">Hoy, 10:34</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Mini Mockups for Flow Section ---

const UploadMiniMockup = () => (
  <div className="h-36 bg-white dark:bg-dark-900 rounded-lg overflow-hidden flex flex-col">
    {/* Mini header */}
    <div className="h-6 bg-dark-50 dark:bg-dark-800 border-b border-dark-100 dark:border-dark-700 flex items-center px-2 gap-1">
      <div className="w-2 h-2 rounded-full bg-[#F44336]"></div>
      <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
      <div className="w-2 h-2 rounded-full bg-green-500"></div>
      <span className="text-[8px] text-dark-400 ml-2">Mis archivos</span>
    </div>
    {/* Upload zone */}
    <div className="flex-1 p-2 flex items-center justify-center">
      <div className="w-full h-full border-2 border-dashed border-[#F44336]/40 bg-[#F44336]/5 rounded-lg flex flex-col items-center justify-center gap-1">
        <Upload className="w-5 h-5 text-[#F44336]" />
        <span className="text-[8px] text-dark-500 font-medium">Suelta archivos aquí</span>
        <div className="w-16 h-1 bg-dark-200 dark:bg-dark-700 rounded-full mt-1">
          <div className="h-full w-2/3 bg-[#F44336] rounded-full animate-pulse"></div>
        </div>
      </div>
    </div>
  </div>
);

const OrganizeMiniMockup = () => (
  <div className="h-36 bg-white dark:bg-dark-900 rounded-lg overflow-hidden flex flex-col">
    {/* Mini header */}
    <div className="h-6 bg-dark-50 dark:bg-dark-800 border-b border-dark-100 dark:border-dark-700 flex items-center px-2">
      <Folder className="w-3 h-3 text-dark-400 mr-1" />
      <span className="text-[8px] text-dark-400">Mis archivos</span>
    </div>
    {/* Folder grid */}
    <div className="flex-1 p-2 grid grid-cols-3 gap-1">
      {['Fotos', 'Docs', 'Música'].map((name, i) => (
        <div key={i} className="flex flex-col items-center p-1 rounded hover:bg-dark-50 dark:hover:bg-dark-800">
          <div className="w-6 h-6 rounded bg-[#F44336]/10 flex items-center justify-center mb-0.5">
            <Folder className="w-3.5 h-3.5 text-[#F44336] fill-[#F44336]/80" />
          </div>
          <span className="text-[7px] text-dark-600 dark:text-dark-300 truncate w-full text-center">{name}</span>
        </div>
      ))}
      {['Doc.pdf', 'Foto.jpg', 'Data.zip'].map((name, i) => (
        <div key={i} className="flex flex-col items-center p-1 rounded hover:bg-dark-50 dark:hover:bg-dark-800">
          <div className="w-6 h-6 rounded bg-blue-500/10 flex items-center justify-center mb-0.5">
            <FileText className="w-3.5 h-3.5 text-blue-500" />
          </div>
          <span className="text-[7px] text-dark-500 truncate w-full text-center">{name}</span>
        </div>
      ))}
    </div>
  </div>
);

const ShareMiniMockup = () => (
  <div className="h-36 bg-white dark:bg-dark-900 rounded-lg overflow-hidden flex flex-col">
    {/* Modal header */}
    <div className="h-7 bg-dark-50 dark:bg-dark-800 border-b border-dark-100 dark:border-dark-700 flex items-center justify-between px-2">
      <span className="text-[8px] font-bold text-dark-700 dark:text-dark-200">Compartir archivo</span>
      <X className="w-3 h-3 text-dark-400" />
    </div>
    {/* Modal content */}
    <div className="flex-1 p-2 flex flex-col gap-1.5">
      <div className="flex items-center gap-1">
        <span className="text-[7px] text-dark-500 w-10">Enlace:</span>
        <div className="flex-1 h-4 bg-dark-100 dark:bg-dark-800 rounded text-[7px] text-dark-400 px-1 flex items-center font-mono">cloudbox.lat/s/x8kj2...</div>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-[7px] text-dark-500 w-10">Expira:</span>
        <div className="flex-1 h-4 bg-dark-100 dark:bg-dark-800 rounded text-[7px] text-dark-500 px-1 flex items-center">7 días</div>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-[7px] text-dark-500 w-10">Clave:</span>
        <div className="flex-1 h-4 bg-dark-100 dark:bg-dark-800 rounded text-[7px] text-dark-500 px-1 flex items-center">••••••</div>
      </div>
      <button className="mt-auto h-5 bg-[#F44336] rounded text-[8px] text-white font-medium flex items-center justify-center gap-1">
        <Check className="w-3 h-3" /> Copiar enlace
      </button>
    </div>
  </div>
);

const MusicMiniMockup = () => (
  <div className="h-36 bg-white dark:bg-dark-900 rounded-lg overflow-hidden flex flex-col">
    {/* Player header */}
    <div className="h-6 bg-dark-50 dark:bg-dark-800 border-b border-dark-100 dark:border-dark-700 flex items-center px-2">
      <Music className="w-3 h-3 text-[#F44336] mr-1" />
      <span className="text-[8px] text-dark-400">Reproductor</span>
    </div>
    {/* Player content */}
    <div className="flex-1 p-2 flex items-center gap-2">
      {/* Vinyl */}
      <div className="w-16 h-16 flex-shrink-0">
        <svg viewBox="0 0 64 64" className="w-full h-full animate-[spin_3s_linear_infinite]">
          <circle cx="32" cy="32" r="32" fill="#1a1a1a" />
          <circle cx="32" cy="32" r="28" fill="none" stroke="#2a2a2a" strokeWidth="0.5" />
          <circle cx="32" cy="32" r="24" fill="none" stroke="#252525" strokeWidth="0.5" />
          <circle cx="32" cy="32" r="20" fill="none" stroke="#2a2a2a" strokeWidth="0.5" />
          <circle cx="32" cy="32" r="11" fill="#F44336" />
          <circle cx="32" cy="32" r="3" fill="white" />
        </svg>
      </div>
      {/* Controls */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="text-[9px] font-bold text-dark-800 dark:text-dark-200 truncate">Mi Canción</div>
        <div className="text-[7px] text-dark-400 mb-1">1 de 12</div>
        <div className="w-full h-1 bg-[#F44336]/10 rounded-full mb-1">
          <div className="h-full w-1/3 bg-[#F44336] rounded-full"></div>
        </div>
        <div className="flex items-center justify-center gap-2">
          <div className="w-3 h-3 text-dark-400"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="19 20 9 12 19 4" /><line x1="5" y1="19" x2="5" y2="5" /></svg></div>
          <div className="w-5 h-5 rounded-full bg-dark-900 dark:bg-white flex items-center justify-center"><svg className="w-2 h-2 text-white dark:text-dark-900" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg></div>
          <div className="w-3 h-3 text-dark-400"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 4 15 12 5 20" /><line x1="19" y1="5" x2="19" y2="19" /></svg></div>
        </div>
      </div>
    </div>
  </div>
);

const AdminMiniMockup = () => (
  <div className="h-36 bg-white dark:bg-dark-900 rounded-lg overflow-hidden flex flex-col">
    {/* Settings header */}
    <div className="h-6 bg-dark-50 dark:bg-dark-800 border-b border-dark-100 dark:border-dark-700 flex items-center px-2">
      <Settings className="w-3 h-3 text-dark-400 mr-1" />
      <span className="text-[8px] text-dark-400">Configuración</span>
    </div>
    {/* Settings content */}
    <div className="flex-1 p-2 flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 rounded bg-[#F44336] flex items-center justify-center">
          <span className="text-[8px] text-white font-bold">C</span>
        </div>
        <div className="flex flex-col">
          <span className="text-[8px] font-bold text-dark-700 dark:text-dark-200">CloudBox</span>
          <span className="text-[6px] text-dark-400">Tu marca aquí</span>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[7px] text-dark-500">Tema oscuro</span>
        <div className="w-6 h-3 bg-[#F44336] rounded-full relative">
          <div className="w-2 h-2 bg-white rounded-full absolute right-0.5 top-0.5"></div>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[7px] text-dark-500">Color primario</span>
        <div className="flex gap-0.5">
          <div className="w-3 h-3 rounded-full bg-[#F44336] ring-1 ring-dark-300"></div>
          <div className="w-3 h-3 rounded-full bg-blue-500"></div>
          <div className="w-3 h-3 rounded-full bg-green-500"></div>
        </div>
      </div>
    </div>
  </div>
);

// --- Main Component ---

export default function Landing() {
  const { t } = useTranslation();
  const { isDark, toggleTheme } = useThemeStore();
  const { branding } = useBrandingStore();
  const [config, setConfig] = useState<LandingConfigV1>(FALLBACK_LANDING_CONFIG);
  const [loading, setLoading] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await api.get('/admin/settings/landing');
        if (!mounted) return;
        setConfig(res.data as LandingConfigV1);
      } catch {
        // Keep fallback
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const hero = config.sections.hero;
  const logoSrc = isDark ? branding.logoDarkUrl || branding.logoUrl : branding.logoLightUrl || branding.logoUrl;

  const navItems = useMemo(
    () => [
      { id: 'features', label: t('landing.nav.features'), enabled: config.sections.features.enabled },
      { id: 'hosted', label: 'Hosted', enabled: true },
      { id: 'self-hosted', label: 'Self-hosted', enabled: config.sections.github.enabled },
    ],
    [config.sections, t]
  );

  const flowSteps = [
    { title: 'Sube', desc: 'Drag & drop inteligente con soporte para archivos grandes.', mockup: UploadMiniMockup },
    { title: 'Organiza', desc: 'Mueve y ordena como en tu sistema operativo local.', mockup: OrganizeMiniMockup },
    { title: 'Reproduce', desc: 'Escucha tu música y explora tu galería de fotos.', mockup: MusicMiniMockup },
    { title: 'Comparte', desc: 'Genera enlaces públicos con contraseña y caducidad.', mockup: ShareMiniMockup },
    { title: 'Administra', desc: 'Personaliza colores y logo desde el panel visual.', mockup: AdminMiniMockup },
  ];

  const features = [
    { icon: Music, title: 'Reproductor de Música', text: 'Streaming integrado' },
    { icon: ImageIcon, title: 'Galería de Fotos', text: 'Lightbox y navegación' },
    { icon: Album, title: 'Álbumes', text: 'Organiza tus recuerdos' },
    { icon: Archive, title: 'Compresión ZIP', text: 'Comprimir y extraer' },
    { icon: Star, title: 'Favoritos', text: 'Acceso rápido' },
    { icon: Lock, title: 'Enlaces Privados', text: 'Contraseña y caducidad' },
    { icon: Trash2, title: 'Papelera', text: 'Recuperación segura' },
    { icon: Activity, title: 'Logs de Actividad', text: 'Historial completo' },
  ];

  return (
    <div className="bg-dark-50 dark:bg-dark-900 min-h-screen text-dark-600 dark:text-dark-400 transition-colors duration-300 selection:bg-[#F44336]/30 selection:text-[#F44336]">

      {/* Header */}
      <header className={`fixed top-0 w-full z-50 h-20 border-b transition-all duration-300 ${scrolled ? 'bg-white/90 dark:bg-dark-900/90 backdrop-blur-xl border-dark-200 dark:border-dark-700 shadow-sm' : 'bg-transparent border-transparent'}`}>
        <div className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between">

          {/* Logo */}
          <Link to="/" className="flex items-center cursor-pointer group flex-shrink-0 hover:opacity-80 transition-opacity">
            <BrandLogo logoSrc={logoSrc} />
          </Link>

          {/* Navigation */}
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium absolute left-1/2 transform -translate-x-1/2">
            {navItems.filter(n => n.enabled).map((n) => (
              <a key={n.id} href={`#${n.id}`} className="text-dark-600 dark:text-dark-400 hover:text-[#F44336] transition-colors">
                {n.label}
              </a>
            ))}
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-4">
            <Link to="/login" className="hidden sm:block text-sm font-semibold text-dark-600 dark:text-dark-300 hover:text-dark-900 dark:hover:text-white px-3 py-2 transition-colors">
              Iniciar sesión
            </Link>
            <Link to="/register">
              <Button variant="primary" className="hidden sm:flex px-6 h-11 shadow-lg shadow-[#F44336]/20 text-base">
                Registrarse
              </Button>
            </Link>
            <div className="w-px h-6 bg-dark-200 dark:bg-dark-700 mx-1 hidden sm:block"></div>
            <button
              onClick={toggleTheme}
              className="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer hover:bg-dark-200/50 dark:hover:bg-white/10 transition-colors text-dark-500 dark:text-dark-400"
              aria-label={isDark ? t('landing.theme.light') : t('landing.theme.dark')}
            >
              {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <button
              className="md:hidden p-2 rounded-lg hover:bg-dark-100 dark:hover:bg-white/10 transition-colors"
              onClick={() => setMobileNavOpen(true)}
              aria-label={t('landing.nav.open')}
            >
              <Menu className="w-6 h-6 text-dark-700 dark:text-dark-300" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Nav */}
      {mobileNavOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-black/50 backdrop-blur-sm">
          <div className="absolute right-0 top-0 h-full w-full max-w-sm bg-white dark:bg-dark-900 border-l border-dark-200 dark:border-dark-700 shadow-2xl">
            <div className="h-16 px-4 flex items-center justify-between border-b border-dark-200 dark:border-dark-700">
              <BrandLogo logoSrc={logoSrc} />
              <button
                className="p-2 rounded-lg hover:bg-dark-100 dark:hover:bg-white/10 transition-colors"
                onClick={() => setMobileNavOpen(false)}
                aria-label={t('landing.nav.close')}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 space-y-2">
              {navItems.filter(n => n.enabled).map((n) => (
                <a
                  key={n.id}
                  href={`#${n.id}`}
                  onClick={() => setMobileNavOpen(false)}
                  className="block px-3 py-2 rounded-lg text-dark-700 dark:text-dark-200 hover:bg-dark-100 dark:hover:bg-white/10"
                >
                  {n.label}
                </a>
              ))}
              <div className="pt-4 flex flex-col gap-2">
                <Link to="/login" className="btn btn-secondary w-full justify-center">
                  {t('landing.nav.login') || 'Iniciar sesión'}
                </Link>
                <Link to="/register" className="btn bg-[#F44336] text-white hover:bg-[#e53935] w-full justify-center">
                  {t('landing.nav.register') || 'Registrarse'}
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="pt-36 pb-20">
        {/* Hero Section */}
        {hero.enabled && (
          <section className="max-w-[1600px] mx-auto px-6 mb-16">
            <div className="grid lg:grid-cols-12 gap-12 items-center">
              <div className="lg:col-span-4 flex flex-col items-start text-left">
                <Badge className="mb-6 border-[#F44336]/20 bg-[#F44336]/10 text-[#F44336] px-4 py-1.5 text-sm font-semibold">
                  {t('landing.hero.badge')}
                </Badge>
                <h1 className="text-5xl lg:text-7xl font-bold text-dark-900 dark:text-white tracking-tight leading-[1.05] mb-8">
                  {hero.title.split(',')[0]},<br />
                  <span className="text-dark-400 dark:text-dark-600">{hero.title.split(',')[1] || 'ordenada.'}</span>
                </h1>
                <p className="text-xl text-dark-600 dark:text-dark-400 mb-10 leading-relaxed max-w-lg">
                  {hero.subtitle}
                </p>
                <div className="flex flex-wrap gap-4 mb-12 w-full">
                  <Link to={hero.primaryCta.href}>
                    <Button className="h-14 px-10 text-lg shadow-xl shadow-[#F44336]/20">
                      {hero.primaryCta.label}
                    </Button>
                  </Link>
                  <Link to={hero.secondaryCta.href}>
                    <Button variant="secondary" className="h-14 px-8 text-lg gap-2 rounded-full">
                      <Zap className="w-5 h-5" /> {hero.secondaryCta.label}
                    </Button>
                  </Link>
                </div>

                {/* Trust / Features Mini Line */}
                <div className="pt-8 border-t border-dark-200 dark:border-dark-700 w-full">
                  <div className="flex flex-wrap gap-3">
                    {['Subidas por chunks', 'Links con expiración', 'Reproductor de música', 'Galería de fotos'].map((feat, i) => (
                      <Badge key={i} className="bg-transparent border-dark-200 dark:border-dark-700 text-dark-500 py-1 px-3">
                        {feat}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>

              {/* Hero Graphic: Functional Mockup */}
              <div className="lg:col-span-8 relative w-full">
                <div className="relative aspect-[16/10] max-h-[650px]">
                  <div className="absolute inset-0 bg-gradient-to-tr from-dark-200 to-white dark:from-dark-800 dark:to-dark-900 rounded-[3rem] transform rotate-2 opacity-50 blur-3xl -z-10"></div>

                  <div className="relative w-full h-full shadow-2xl shadow-dark-300/50 dark:shadow-black/60 flex flex-col border border-dark-200 dark:border-dark-700 rounded-3xl overflow-hidden bg-white dark:bg-dark-900">
                    {config.assets?.heroImageUrl ? (
                      <img src={config.assets.heroImageUrl} alt="CloudBox" className="w-full h-full object-cover" />
                    ) : (
                      <HeroMockup
                        isDark={isDark}
                        logoLight={branding.logoLightUrl || branding.logoUrl}
                        logoDark={branding.logoDarkUrl || branding.logoUrl}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Flow Section */}
        {config.sections.howItWorks.enabled && (
          <section className="max-w-[1600px] mx-auto px-6 mb-24">
            <div className="mb-16 text-center md:text-left">
              <h2 className="text-3xl font-bold text-dark-900 dark:text-white mb-4">{config.sections.howItWorks.title}</h2>
              <p className="text-lg text-dark-500 dark:text-dark-400">Diseñado para imitar tu flujo mental, no para interrumpirlo.</p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
              {flowSteps.map((item, idx) => (
                <Panel key={idx} className="group hover:border-[#F44336]/20 transition-all hover:shadow-xl hover:shadow-dark-200/50 dark:hover:shadow-none hover:-translate-y-1">
                  <div className="mb-6 overflow-hidden rounded-2xl border border-dark-100 dark:border-dark-700">
                    <item.mockup />
                  </div>
                  <h3 className="text-xl font-bold text-dark-900 dark:text-white mb-3">{item.title}</h3>
                  <p className="text-sm text-dark-500 leading-relaxed">{item.desc}</p>
                </Panel>
              ))}
            </div>
          </section>
        )}

        {/* Features Section */}
        {config.sections.features.enabled && (
          <section id="features" className="max-w-[1600px] mx-auto px-6 mb-32">
            <div className="mb-12 text-center">
              <h2 className="text-3xl font-bold text-dark-900 dark:text-white mb-4">{config.sections.features.title}</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {features.map((feature, i) => (
                <div key={i} className="p-6 border border-dark-200 dark:border-dark-700 rounded-2xl hover:bg-dark-50 dark:hover:bg-dark-800 transition-colors group cursor-default">
                  <div className="w-10 h-10 rounded-full bg-dark-100 dark:bg-dark-800 flex items-center justify-center mb-4 group-hover:bg-[#F44336]/10 transition-colors">
                    <feature.icon className="w-5 h-5 text-dark-500 group-hover:text-[#F44336] transition-colors" />
                  </div>
                  <h4 className="font-bold text-dark-900 dark:text-white text-base mb-2">{feature.title}</h4>
                  <p className="text-sm text-dark-500 leading-relaxed">{feature.text}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Hosted vs Self-Hosted Section */}
        {config.sections.comparison.enabled && (
          <section className="max-w-[1600px] mx-auto px-6 mb-32" id="hosted">
            <div className="grid md:grid-cols-2 gap-8 lg:gap-12">
              {/* Hosted Panel */}
              <Panel className="relative p-10 md:p-14 flex flex-col h-full border-[#F44336]/10 shadow-xl shadow-[#F44336]/5">
                <div className="absolute top-0 right-0 p-6">
                  <div className="bg-[#F44336]/10 text-[#F44336] text-xs font-bold px-3 py-1.5 rounded-full uppercase tracking-wide">
                    Recomendado
                  </div>
                </div>
                <h3 className="text-3xl font-bold text-dark-900 dark:text-white mb-3">{config.sections.comparison.cloud.title}</h3>
                <p className="text-dark-500 mb-10 text-lg">{config.sections.comparison.cloud.description}</p>

                <ul className="space-y-5 mb-10 flex-1">
                  {config.sections.comparison.cloud.bullets.map((item, i) => (
                    <li key={i} className="flex items-center gap-4 text-base text-dark-700 dark:text-dark-300">
                      <div className="w-6 h-6 rounded-full bg-[#F44336]/10 flex items-center justify-center flex-shrink-0">
                        <Check className="w-3.5 h-3.5 text-[#F44336]" />
                      </div>
                      {item}
                    </li>
                  ))}
                </ul>

                <div className="mt-auto">
                  <Link to="/register">
                    <Button className="w-full justify-center h-12 text-base">Crear cuenta</Button>
                  </Link>
                </div>
              </Panel>

              {/* Self-Hosted Panel */}
              <Panel className="p-10 md:p-14 flex flex-col h-full bg-dark-50 dark:bg-dark-800 border-transparent" id="self-hosted">
                <h3 className="text-3xl font-bold text-dark-900 dark:text-white mb-3">{config.sections.comparison.selfHosted.title}</h3>
                <p className="text-dark-500 mb-10 text-lg">{config.sections.comparison.selfHosted.description}</p>

                <ul className="space-y-5 mb-10 flex-1">
                  {config.sections.comparison.selfHosted.bullets.map((item, i) => (
                    <li key={i} className="flex items-center gap-4 text-base text-dark-700 dark:text-dark-300">
                      <div className="w-6 h-6 rounded-full bg-dark-200 dark:bg-dark-700 flex items-center justify-center flex-shrink-0">
                        <Server className="w-3.5 h-3.5 text-dark-600 dark:text-dark-400" />
                      </div>
                      {item}
                    </li>
                  ))}
                </ul>

                <div className="mt-auto">
                  <div className="flex gap-2 mb-8">
                    {['Docker', 'Linux', 'Nginx'].map(badge => (
                      <Badge key={badge} className="bg-white dark:bg-dark-700 px-3 py-1">{badge}</Badge>
                    ))}
                  </div>
                  <a href={config.links.githubUrl} target="_blank" rel="noopener noreferrer">
                    <Button variant="secondary" className="w-full justify-center gap-2 h-12 text-base rounded-full">
                      <span className="font-bold">GitHub</span> Ver Repositorio
                    </Button>
                  </a>
                </div>
              </Panel>
            </div>
          </section>
        )}

        {/* Security Section */}
        {config.sections.security.enabled && (
          <section className="max-w-[1600px] mx-auto px-6 mb-32">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold text-dark-900 dark:text-white">{config.sections.security.title}</h2>
              <p className="text-lg text-dark-500 mt-3">Seguridad activa y auditoría transparente.</p>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              <Panel className="md:col-span-2 p-8 flex flex-col justify-between">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="font-bold text-dark-800 dark:text-dark-200 flex items-center gap-2 text-lg">
                    <Activity className="w-5 h-5 text-[#F44336]" /> Actividad Reciente
                  </h3>
                  <Badge className="bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400 border-green-200 dark:border-green-900">En vivo</Badge>
                </div>
                <div className="space-y-6">
                  {[
                    { user: 'Ana M.', action: 'descargó', file: 'Presupuesto_Final.pdf', time: '2m' },
                    { user: 'Carlos R.', action: 'subió', file: 'Assets_Web.zip', time: '15m' },
                    { user: 'Admin', action: 'compartió', file: 'Presentación Q4.pdf', time: '1h' },
                  ].map((log, i) => (
                    <div key={i} className="flex items-center text-sm gap-3 border-b border-dark-100 dark:border-dark-700 pb-3 last:border-0 last:pb-0">
                      <div className="w-8 h-8 rounded-full bg-dark-100 dark:bg-dark-700 flex items-center justify-center text-xs font-bold text-dark-600 dark:text-dark-300">
                        {log.user.charAt(0)}
                      </div>
                      <div className="flex-1 text-dark-600 dark:text-dark-400">
                        <span className="font-bold text-dark-900 dark:text-white">{log.user}</span> {log.action} <span className="text-dark-800 dark:text-dark-300 italic">{log.file}</span>
                      </div>
                      <span className="text-xs text-dark-400 font-medium">{log.time}</span>
                    </div>
                  ))}
                </div>
              </Panel>

              <div className="flex flex-col gap-8">
                <Panel className="flex-1 flex flex-col justify-center items-center text-center p-8">
                  <div className="w-14 h-14 bg-dark-100 dark:bg-dark-800 rounded-full flex items-center justify-center mb-4">
                    <Shield className="w-7 h-7 text-dark-500 dark:text-dark-400" />
                  </div>
                  <div className="text-xl font-bold text-dark-900 dark:text-white mb-2">HTTPS</div>
                  <p className="text-sm text-dark-500">Conexión cifrada en tránsito.</p>
                </Panel>
                <Panel className="flex-1 flex flex-col justify-center items-center text-center p-8 border-[#F44336]/10 bg-[#F44336]/5">
                  <div className="w-14 h-14 bg-[#F44336]/10 rounded-full flex items-center justify-center mb-4">
                    <Trash2 className="w-7 h-7 text-[#F44336]" />
                  </div>
                  <div className="text-xl font-bold text-dark-900 dark:text-white mb-2">Soft Delete</div>
                  <p className="text-sm text-dark-500">Recuperación ante desastres y errores.</p>
                </Panel>
              </div>
            </div>
          </section>
        )}

        {/* CTA Final */}
        <section className="max-w-4xl mx-auto px-6">
          <Panel className="text-center py-20 px-8 border-[#F44336]/10 shadow-2xl shadow-[#F44336]/10 rounded-[3rem]">
            <h2 className="text-4xl font-bold text-dark-900 dark:text-white mb-4">Empieza con CloudBox hoy</h2>
            <p className="text-dark-500 dark:text-dark-400 mb-10 text-xl">Hosted o self-hosted, elige tu camino.</p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-5 mb-10">
              <Link to="/register">
                <Button className="w-full sm:w-auto px-10 h-14 text-lg">Crear cuenta gratis</Button>
              </Link>
              <a href={config.links.githubUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="secondary" className="w-full sm:w-auto px-10 h-14 text-lg rounded-full">Ver documentación</Button>
              </a>
            </div>

            <div className="flex items-center justify-center gap-6 text-sm text-dark-400 font-medium">
              <Link to="/terms" className="hover:text-[#F44336] transition-colors">Términos de servicio</Link>
              <span className="w-1.5 h-1.5 bg-dark-300 rounded-full"></span>
              <Link to="/privacy" className="hover:text-[#F44336] transition-colors">Privacidad</Link>
            </div>
          </Panel>
        </section>
      </main>

      {/* Footer */}
      {config.sections.footer.enabled && (
        <footer className="border-t border-dark-200 dark:border-dark-700 bg-white dark:bg-dark-900 py-16">
          <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-dark-100 dark:bg-dark-700 rounded-full flex items-center justify-center">
                <span className="text-xs font-bold text-dark-500">C</span>
              </div>
              <span className="text-sm font-medium text-dark-500 dark:text-dark-400">{config.sections.footer.finePrint}</span>
            </div>

            <div className="flex items-center gap-8 text-sm font-medium text-dark-500 dark:text-dark-400">
              <a href={config.links.githubUrl} target="_blank" rel="noopener noreferrer" className="hover:text-dark-900 dark:hover:text-white transition-colors">GitHub</a>
              {config.sections.footer.groups.map((group) => (
                group.links.slice(0, 2).map((link) => (
                  <a key={link.id} href={link.href} className="hover:text-dark-900 dark:hover:text-white transition-colors">{link.label}</a>
                ))
              ))}
            </div>
          </div>
        </footer>
      )}

      {loading && <div className="fixed bottom-4 right-4 text-xs text-dark-400">{t('landing.loading')}</div>}
    </div>
  );
}
