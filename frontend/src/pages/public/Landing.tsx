import { useEffect, useMemo, useState, useRef } from 'react';
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
  Globe,
  ChevronDown,
  Camera,
  Briefcase,
  Code,
  Building2,
  ChevronRight,
  Sparkles,
  MousePointer2,
  Mail,
  BookOpen,
  type LucideIcon,
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

// --- Marquee Component (Baked.design inspired) ---
const Marquee = ({ items, speed = 30 }: { items: string[]; speed?: number }) => {
  const duplicatedItems = [...items, ...items];
  return (
    <div className="relative overflow-hidden py-4 bg-dark-50 dark:bg-dark-800/50 border-y border-dark-100 dark:border-dark-700">
      <div
        className="flex gap-8 animate-marquee whitespace-nowrap"
        style={{ animationDuration: `${speed}s` }}
      >
        {duplicatedItems.map((item, i) => (
          <span key={i} className="text-sm text-dark-500 dark:text-dark-400 font-medium flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#F44336]"></span>
            {item}
          </span>
        ))}
      </div>
    </div>
  );
};

// --- Trust Avatars Component (Granola.ai inspired) ---
const TrustAvatars = () => (
  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
    <div className="flex items-center gap-3">
      <div className="flex -space-x-2">
        {['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500'].map((color, i) => (
          <div
            key={i}
            className={`w-8 h-8 rounded-full ${color} border-2 border-white dark:border-dark-800 flex items-center justify-center text-white text-xs font-bold`}
          >
            {String.fromCharCode(65 + i)}
          </div>
        ))}
      </div>
      <div className="flex flex-col">
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map(i => (
            <Star key={i} className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
          ))}
          <span className="text-xs font-bold text-dark-700 dark:text-dark-300 ml-1">5.0</span>
        </div>
        <span className="text-xs text-dark-500 dark:text-dark-400">Beta testers satisfechos</span>
      </div>
    </div>
    <div className="hidden sm:block w-px h-8 bg-dark-200 dark:bg-dark-700" />
    <div className="flex items-center gap-4 text-sm">
      <div className="flex items-center gap-1.5">
        <Zap className="w-4 h-4 text-[#F44336]" />
        <span className="text-dark-600 dark:text-dark-400"><span className="font-bold text-dark-800 dark:text-dark-200">8</span> módulos</span>
      </div>
      <div className="flex items-center gap-1.5">
        <Globe className="w-4 h-4 text-[#F44336]" />
        <span className="text-dark-600 dark:text-dark-400"><span className="font-bold text-dark-800 dark:text-dark-200">6</span> idiomas</span>
      </div>
    </div>
  </div>
);

// --- Use Case Card Component (Replaces Testimonials for pre-launch) ---
const UseCaseCard = ({ icon: Icon, title, description, color }: { icon: LucideIcon; title: string; description: string; color: string }) => (
  <div className={`group p-6 bg-white dark:bg-dark-800 border border-dark-200 dark:border-dark-700 rounded-2xl hover:shadow-xl transition-all hover:-translate-y-1 hover:border-${color}-300 dark:hover:border-${color}-700`}>
    <div className={`w-14 h-14 rounded-2xl bg-${color}-100 dark:bg-${color}-900/30 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
      <Icon className={`w-7 h-7 text-${color}-600 dark:text-${color}-400`} />
    </div>
    <h3 className="text-lg font-bold text-dark-900 dark:text-white mb-2">{title}</h3>
    <p className="text-dark-500 dark:text-dark-400 text-sm leading-relaxed">{description}</p>
  </div>
);

// --- Tech Stack Logos Component ---
const TechStackLogos = () => {
  const technologies = [
    { name: 'React', color: '#61DAFB', letter: 'R' },
    { name: 'Node.js', color: '#339933', letter: 'N' },
    { name: 'TypeScript', color: '#3178C6', letter: 'TS' },
    { name: 'PostgreSQL', color: '#4169E1', letter: 'PG' },
    { name: 'Docker', color: '#2496ED', letter: 'D' },
    { name: 'Vite', color: '#646CFF', letter: 'V' },
  ];

  return (
    <div className="flex flex-wrap items-center justify-center gap-6 md:gap-10">
      {technologies.map((tech) => (
        <div key={tech.name} className="flex flex-col items-center gap-2 group cursor-default">
          <div
            className="w-14 h-14 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-lg group-hover:scale-110 transition-transform"
            style={{ backgroundColor: tech.color }}
          >
            {tech.letter}
          </div>
          <span className="text-xs font-medium text-dark-500 dark:text-dark-400 group-hover:text-dark-700 dark:group-hover:text-dark-200 transition-colors">{tech.name}</span>
        </div>
      ))}
    </div>
  );
};

// --- Beta Access Section Component ---
const BetaAccessSection = () => (
  <section className="max-w-[1600px] mx-auto px-6 mb-24">
    <div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-r from-[#F44336] via-[#FF5722] to-orange-500 p-10 md:p-16">
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-black/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

      <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
        <div className="text-center md:text-left">
          <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm px-4 py-2 rounded-full mb-6">
            <Sparkles className="w-4 h-4 text-white" />
            <span className="text-white text-sm font-semibold">Acceso Anticipado</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Sé de los primeros en probar CloudBox</h2>
          <p className="text-white/80 text-lg max-w-xl">Únete al programa beta y obtén almacenamiento extra gratis. Ayúdanos a mejorar con tu feedback.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-4">
          <a href="/register">
            <button className="px-8 py-4 bg-white text-[#F44336] font-bold rounded-full hover:bg-dark-50 transition-colors shadow-xl shadow-black/20 flex items-center gap-2">
              <Sparkles className="w-5 h-5" />
              Probar Beta
            </button>
          </a>
          <a href="#features">
            <button className="px-8 py-4 bg-white/10 backdrop-blur-sm text-white font-medium rounded-full hover:bg-white/20 transition-colors border border-white/20 flex items-center gap-2">
              Explorar Features
              <ChevronRight className="w-4 h-4" />
            </button>
          </a>
        </div>
      </div>
    </div>
  </section>
);

// --- Scroll Indicator Component ---
const ScrollIndicator = () => (
  <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 animate-bounce opacity-60 hover:opacity-100 transition-opacity cursor-pointer">
    <span className="text-xs font-medium text-dark-500 dark:text-dark-400">Scroll</span>
    <MousePointer2 className="w-5 h-5 text-dark-400 dark:text-dark-500 rotate-180" />
  </div>
);

// --- FAQ Accordion Item ---
const FAQItem = ({ question, answer, isOpen, onClick }: { question: string; answer: string; isOpen: boolean; onClick: () => void }) => (
  <div className="border-b border-dark-200 dark:border-dark-700 last:border-0">
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between py-5 text-left hover:text-[#F44336] transition-colors"
    >
      <span className="font-semibold text-dark-900 dark:text-white">{question}</span>
      <span className={`text-2xl text-dark-400 transition-transform ${isOpen ? 'rotate-45' : ''}`}>+</span>
    </button>
    <div className={`overflow-hidden transition-all duration-300 ${isOpen ? 'max-h-40 pb-5' : 'max-h-0'}`}>
      <p className="text-dark-500 text-sm leading-relaxed">{answer}</p>
    </div>
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


// --- Language Selector Component ---
const LANGUAGES = [
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'it', name: 'Italiano', flag: '🇮🇹' },
  { code: 'pt', name: 'Português', flag: '🇧🇷' },
];

const LanguageSelector = () => {
  const { i18n, t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentLang = LANGUAGES.find(l => l.code === i18n.language) || LANGUAGES[0];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLanguageChange = (langCode: string) => {
    i18n.changeLanguage(langCode);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-full text-sm font-medium text-dark-600 dark:text-dark-300 hover:bg-dark-100 dark:hover:bg-dark-800 transition-all duration-200"
        aria-label={t('language.label')}
      >
        <Globe className="w-4 h-4" />
        <span className="hidden sm:inline">{currentLang.flag}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-dark-800 border border-dark-200 dark:border-dark-700 rounded-xl shadow-xl shadow-dark-200/50 dark:shadow-black/30 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="py-1">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => handleLanguageChange(lang.code)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${i18n.language === lang.code
                  ? 'bg-[#F44336]/10 text-[#F44336] font-medium'
                  : 'text-dark-700 dark:text-dark-300 hover:bg-dark-50 dark:hover:bg-dark-700'
                  }`}
              >
                <span className="text-lg">{lang.flag}</span>
                <span>{lang.name}</span>
                {i18n.language === lang.code && (
                  <Check className="w-4 h-4 ml-auto text-[#F44336]" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};


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

const GalleryMiniMockup = () => (
  <div className="h-36 bg-white dark:bg-dark-900 rounded-lg overflow-hidden flex flex-col">
    {/* Gallery header */}
    <div className="h-6 bg-dark-50 dark:bg-dark-800 border-b border-dark-100 dark:border-dark-700 flex items-center px-2">
      <ImageIcon className="w-3 h-3 text-[#F44336] mr-1" />
      <span className="text-[8px] text-dark-400">Galería</span>
    </div>
    {/* Photo grid */}
    <div className="flex-1 p-1.5 grid grid-cols-3 gap-1">
      {[
        'bg-gradient-to-br from-blue-400 to-purple-500',
        'bg-gradient-to-br from-orange-400 to-pink-500',
        'bg-gradient-to-br from-green-400 to-teal-500',
        'bg-gradient-to-br from-pink-400 to-rose-500',
        'bg-gradient-to-br from-yellow-400 to-orange-500',
        'bg-gradient-to-br from-indigo-400 to-blue-500',
      ].map((gradient, i) => (
        <div key={i} className={`${gradient} rounded aspect-square flex items-center justify-center`}>
          <ImageIcon className="w-3 h-3 text-white/60" />
        </div>
      ))}
    </div>
  </div>
);

const FavoritesMiniMockup = () => (
  <div className="h-36 bg-white dark:bg-dark-900 rounded-lg overflow-hidden flex flex-col">
    {/* Favorites header */}
    <div className="h-6 bg-dark-50 dark:bg-dark-800 border-b border-dark-100 dark:border-dark-700 flex items-center px-2">
      <Star className="w-3 h-3 text-yellow-500 fill-yellow-500 mr-1" />
      <span className="text-[8px] text-dark-400">Favoritos</span>
    </div>
    {/* Favorites list */}
    <div className="flex-1 p-2 flex flex-col gap-1.5">
      {[
        { name: 'Proyecto.pdf', icon: FileText, color: 'text-blue-500' },
        { name: 'Diseños', icon: Folder, color: 'text-[#F44336]' },
        { name: 'Música', icon: Music, color: 'text-purple-500' },
      ].map((item, i) => (
        <div key={i} className="flex items-center gap-2 p-1 rounded hover:bg-dark-50 dark:hover:bg-dark-800">
          <item.icon className={`w-4 h-4 ${item.color}`} />
          <span className="text-[8px] text-dark-700 dark:text-dark-300 flex-1 truncate">{item.name}</span>
          <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
        </div>
      ))}
    </div>
  </div>
);

const TrashMiniMockup = () => (
  <div className="h-36 bg-white dark:bg-dark-900 rounded-lg overflow-hidden flex flex-col">
    {/* Trash header */}
    <div className="h-6 bg-dark-50 dark:bg-dark-800 border-b border-dark-100 dark:border-dark-700 flex items-center justify-between px-2">
      <div className="flex items-center">
        <Trash2 className="w-3 h-3 text-dark-400 mr-1" />
        <span className="text-[8px] text-dark-400">Papelera</span>
      </div>
      <span className="text-[6px] text-dark-400 bg-dark-100 dark:bg-dark-700 px-1.5 py-0.5 rounded">3 elementos</span>
    </div>
    {/* Trash items */}
    <div className="flex-1 p-2 flex flex-col gap-1">
      {[
        { name: 'Borrador_v1.docx', date: 'Hace 2 días' },
        { name: 'Imagen_temp.jpg', date: 'Hace 5 días' },
        { name: 'old_backup.zip', date: 'Hace 1 semana' },
      ].map((item, i) => (
        <div key={i} className="flex items-center gap-2 p-1 rounded bg-dark-50/50 dark:bg-dark-800/50">
          <FileText className="w-3.5 h-3.5 text-dark-400" />
          <div className="flex-1 min-w-0">
            <span className="text-[7px] text-dark-600 dark:text-dark-300 truncate block">{item.name}</span>
            <span className="text-[6px] text-dark-400">{item.date}</span>
          </div>
          <button className="text-[6px] text-[#F44336] font-medium">Restaurar</button>
        </div>
      ))}
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
  const [openFAQ, setOpenFAQ] = useState<number | null>(null);

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
    { title: 'Explora', desc: 'Visualiza tus fotos en una galería moderna con lightbox.', mockup: GalleryMiniMockup },
    { title: 'Reproduce', desc: 'Escucha tu música con reproductor integrado y colas.', mockup: MusicMiniMockup },
    { title: 'Favoritos', desc: 'Marca archivos importantes para acceso rápido.', mockup: FavoritesMiniMockup },
    { title: 'Comparte', desc: 'Genera enlaces públicos con contraseña y caducidad.', mockup: ShareMiniMockup },
    { title: 'Recupera', desc: 'Restaura archivos eliminados desde la papelera.', mockup: TrashMiniMockup },
    { title: 'Administra', desc: 'Personaliza colores y logo desde el panel visual.', mockup: AdminMiniMockup },
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
                Probar Beta
              </Button>
            </Link>
            <div className="w-px h-6 bg-dark-200 dark:bg-dark-700 mx-1 hidden sm:block"></div>
            <LanguageSelector />
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

                {/* Trust Avatars */}
                <div className="pt-8 border-t border-dark-200 dark:border-dark-700 w-full">
                  <TrustAvatars />
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

            {/* Scroll Indicator */}
            <div className="hidden lg:flex justify-center mt-12">
              <ScrollIndicator />
            </div>
          </section>
        )}

        {/* Marquee Social Proof */}
        <Marquee
          items={[
            'Subidas por chunks',
            'Links con expiración',
            'Reproductor de música integrado',
            'Galería de fotos',
            'Compresión ZIP',
            'Favoritos',
            'Panel de administración',
            '99.9% uptime'
          ]}
        />

        {/* Flow Section */}
        {config.sections.howItWorks.enabled && (
          <section className="max-w-[1600px] mx-auto px-6 mt-20 mb-24">
            <div className="mb-16 text-center md:text-left">
              <h2 className="text-3xl font-bold text-dark-900 dark:text-white mb-4">Todo lo que necesitas, en un solo lugar</h2>
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

        {/* Features Section - Bento Grid */}
        {config.sections.features.enabled && (
          <section id="features" className="max-w-[1600px] mx-auto px-6 mb-32">
            <div className="mb-16 text-center">
              <Badge className="mb-4 border-[#F44336]/20 bg-[#F44336]/10 text-[#F44336] px-4 py-1.5 text-sm font-semibold">
                Características
              </Badge>
              <h2 className="text-4xl md:text-5xl font-bold text-dark-900 dark:text-white mb-4">
                Potencia en cada detalle
              </h2>
              <p className="text-lg text-dark-500 dark:text-dark-400 max-w-2xl mx-auto">
                Herramientas diseñadas para que gestiones tus archivos como un profesional
              </p>
            </div>

            {/* Bento Grid Layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 auto-rows-[180px]">

              {/* Feature 1 - Large Card */}
              <div className="md:col-span-2 md:row-span-2 group relative overflow-hidden rounded-3xl bg-rose-100 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 p-8 cursor-default hover:shadow-xl hover:shadow-rose-500/10 transition-all hover:-translate-y-1">
                <div className="relative z-10 h-full flex flex-col">
                  <div className="w-14 h-14 bg-rose-200 dark:bg-rose-900/50 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                    <Music className="w-7 h-7 text-rose-600 dark:text-rose-400" />
                  </div>
                  <h3 className="text-2xl font-bold text-rose-900 dark:text-rose-100 mb-3">Reproductor de Música</h3>
                  <p className="text-rose-700 dark:text-rose-300 text-lg leading-relaxed flex-1">
                    Streaming integrado con cola de reproducción, shuffle, repeat y visualización de carátulas. Soporta MP3, WAV, FLAC y más.
                  </p>
                  <div className="flex items-center gap-2 mt-4">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                    <span className="text-rose-600 dark:text-rose-400 text-sm">Reproduciendo ahora</span>
                  </div>
                </div>
              </div>

              {/* Feature 2 */}
              <div className="group relative overflow-hidden rounded-3xl bg-sky-100 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-900/50 p-6 cursor-default hover:shadow-xl hover:shadow-sky-500/10 transition-all hover:-translate-y-1">
                <div className="relative z-10 h-full flex flex-col">
                  <div className="w-12 h-12 bg-sky-200 dark:bg-sky-900/50 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <ImageIcon className="w-6 h-6 text-sky-600 dark:text-sky-400" />
                  </div>
                  <h3 className="text-lg font-bold text-sky-900 dark:text-sky-100 mb-2">Galería de Fotos</h3>
                  <p className="text-sky-700 dark:text-sky-300 text-sm">Lightbox moderno con navegación táctil</p>
                </div>
              </div>

              {/* Feature 3 */}
              <div className="group relative overflow-hidden rounded-3xl bg-violet-100 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-900/50 p-6 cursor-default hover:shadow-xl hover:shadow-violet-500/10 transition-all hover:-translate-y-1">
                <div className="relative z-10 h-full flex flex-col">
                  <div className="w-12 h-12 bg-violet-200 dark:bg-violet-900/50 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Album className="w-6 h-6 text-violet-600 dark:text-violet-400" />
                  </div>
                  <h3 className="text-lg font-bold text-violet-900 dark:text-violet-100 mb-2">Álbumes</h3>
                  <p className="text-violet-700 dark:text-violet-300 text-sm">Organiza fotos y música en colecciones</p>
                </div>
              </div>

              {/* Feature 4 */}
              <div className="group relative overflow-hidden rounded-3xl bg-amber-100 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 p-6 cursor-default hover:shadow-xl hover:shadow-amber-500/10 transition-all hover:-translate-y-1">
                <div className="relative z-10 h-full flex flex-col">
                  <div className="w-12 h-12 bg-amber-200 dark:bg-amber-900/50 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Archive className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                  </div>
                  <h3 className="text-lg font-bold text-amber-900 dark:text-amber-100 mb-2">Compresión ZIP</h3>
                  <p className="text-amber-700 dark:text-amber-300 text-sm">Comprime y extrae archivos al instante</p>
                </div>
              </div>

              {/* Feature 5 */}
              <div className="group relative overflow-hidden rounded-3xl bg-yellow-100 dark:bg-yellow-950/40 border border-yellow-200 dark:border-yellow-900/50 p-6 cursor-default hover:shadow-xl hover:shadow-yellow-500/10 transition-all hover:-translate-y-1">
                <div className="relative z-10 h-full flex flex-col">
                  <div className="w-12 h-12 bg-yellow-200 dark:bg-yellow-900/50 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Star className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
                  </div>
                  <h3 className="text-lg font-bold text-yellow-900 dark:text-yellow-100 mb-2">Favoritos</h3>
                  <p className="text-yellow-700 dark:text-yellow-300 text-sm">Acceso rápido a lo importante</p>
                </div>
              </div>

              {/* Feature 6 - Wide Card */}
              <div className="md:col-span-2 group relative overflow-hidden rounded-3xl bg-emerald-100 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 p-6 cursor-default hover:shadow-xl hover:shadow-emerald-500/10 transition-all hover:-translate-y-1">
                <div className="relative z-10 h-full flex flex-col md:flex-row md:items-center gap-4">
                  <div className="w-12 h-12 bg-emerald-200 dark:bg-emerald-900/50 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Lock className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-emerald-900 dark:text-emerald-100 mb-1">Enlaces Privados</h3>
                    <p className="text-emerald-700 dark:text-emerald-300 text-sm">Comparte con contraseña, límite de descargas y fecha de expiración</p>
                  </div>
                  <div className="hidden md:flex items-center gap-2 bg-emerald-200 dark:bg-emerald-900/50 rounded-full px-4 py-2">
                    <Shield className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-emerald-700 dark:text-emerald-300 text-sm">Protegido</span>
                  </div>
                </div>
              </div>

              {/* Feature 7 */}
              <div className="group relative overflow-hidden rounded-3xl bg-slate-100 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/50 p-6 cursor-default hover:shadow-xl hover:shadow-slate-500/10 transition-all hover:-translate-y-1">
                <div className="relative z-10 h-full flex flex-col">
                  <div className="w-12 h-12 bg-slate-200 dark:bg-slate-700/50 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Trash2 className="w-6 h-6 text-slate-600 dark:text-slate-400" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">Papelera</h3>
                  <p className="text-slate-700 dark:text-slate-300 text-sm">Recupera archivos eliminados</p>
                </div>
              </div>

              {/* Feature 8 */}
              <div className="group relative overflow-hidden rounded-3xl bg-indigo-100 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900/50 p-6 cursor-default hover:shadow-xl hover:shadow-indigo-500/10 transition-all hover:-translate-y-1">
                <div className="relative z-10 h-full flex flex-col">
                  <div className="w-12 h-12 bg-indigo-200 dark:bg-indigo-900/50 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Activity className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <h3 className="text-lg font-bold text-indigo-900 dark:text-indigo-100 mb-2">Logs de Actividad</h3>
                  <p className="text-indigo-700 dark:text-indigo-300 text-sm">Historial completo de acciones</p>
                </div>
              </div>

            </div>
          </section>
        )}

        {/* Use Cases Section - "Ideal para..." */}
        <section className="max-w-[1600px] mx-auto px-6 mb-24">
          <div className="mb-12 text-center">
            <Badge className="mb-4 border-[#F44336]/20 bg-[#F44336]/10 text-[#F44336] px-4 py-1.5 text-sm font-semibold">
              Casos de Uso
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold text-dark-900 dark:text-white mb-4">Diseñado para ti</h2>
            <p className="text-lg text-dark-500 dark:text-dark-400 max-w-2xl mx-auto">
              Profesionales, equipos y familias que necesitan organizar sus archivos de forma segura
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <UseCaseCard
              icon={Camera}
              title="Fotógrafos"
              description="Galería privada con lightbox, álbumes organizados y descarga masiva de imágenes."
              color="rose"
            />
            <UseCaseCard
              icon={Music}
              title="Músicos"
              description="Tu biblioteca musical en streaming desde cualquier lugar con cola de reproducción."
              color="violet"
            />
            <UseCaseCard
              icon={Briefcase}
              title="Equipos de Trabajo"
              description="Colaboración segura con enlaces protegidos, logs de actividad y permisos."
              color="blue"
            />
            <UseCaseCard
              icon={Users}
              title="Familias"
              description="Comparte recuerdos de forma privada con tus seres queridos de manera segura."
              color="emerald"
            />
            <UseCaseCard
              icon={Code}
              title="Desarrolladores"
              description="Self-hosted con Docker, código abierto, API documentada y personalizable."
              color="amber"
            />
            <UseCaseCard
              icon={Building2}
              title="Empresas"
              description="Cumple con compliance y políticas de datos con tu propia infraestructura."
              color="slate"
            />
          </div>
        </section>

        {/* Tech Stack Section */}
        <section className="max-w-[1600px] mx-auto px-6 mb-24">
          <div className="text-center mb-10">
            <p className="text-sm font-semibold text-dark-400 dark:text-dark-500 uppercase tracking-wider mb-2">Tecnología de primer nivel</p>
            <h3 className="text-xl font-bold text-dark-700 dark:text-dark-300">Construido con el stack moderno</h3>
          </div>
          <TechStackLogos />
        </section>

        {/* Beta Access Section */}
        <BetaAccessSection />

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
                      Ver en GitHub
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
              <Badge className="mb-4 border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-4 py-1.5 text-sm font-semibold">
                Seguridad
              </Badge>
              <h2 className="text-4xl md:text-5xl font-bold text-dark-900 dark:text-white mb-4">
                Tus datos, protegidos
              </h2>
              <p className="text-lg text-dark-500 dark:text-dark-400 max-w-2xl mx-auto">
                Seguridad de nivel empresarial con auditoría transparente y control total
              </p>
            </div>

            {/* Main Security Card */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-dark-900 via-dark-800 to-dark-900 dark:from-dark-950 dark:via-dark-900 dark:to-dark-950 p-8 md:p-12 mb-8">
              {/* Background decoration */}
              <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl"></div>
              <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl"></div>

              <div className="relative z-10 grid md:grid-cols-2 gap-12 items-center">
                {/* Left - Stats & Features */}
                <div>
                  <div className="flex items-center gap-3 mb-8">
                    <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center">
                      <Shield className="w-6 h-6 text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold text-white">Seguridad Activa</h3>
                      <p className="text-dark-400 text-sm">Monitoreo 24/7</p>
                    </div>
                  </div>

                  {/* Security Features Grid */}
                  <div className="grid grid-cols-2 gap-4 mb-8">
                    {[
                      { icon: Lock, label: 'HTTPS/TLS', desc: 'Cifrado en tránsito' },
                      { icon: Shield, label: 'Contraseñas', desc: 'Enlaces protegidos' },
                      { icon: Activity, label: 'Audit Logs', desc: 'Historial completo' },
                      { icon: Trash2, label: 'Soft Delete', desc: 'Recuperación segura' },
                    ].map((item, i) => (
                      <div key={i} className="flex items-start gap-3 p-4 bg-white/5 rounded-xl hover:bg-white/10 transition-colors">
                        <item.icon className="w-5 h-5 text-emerald-400 mt-0.5" />
                        <div>
                          <div className="text-white font-medium text-sm">{item.label}</div>
                          <div className="text-dark-400 text-xs">{item.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Uptime Stats */}
                  <div className="flex items-center gap-6">
                    <div>
                      <div className="text-4xl font-bold text-white">99.9%</div>
                      <div className="text-dark-400 text-sm">Uptime</div>
                    </div>
                    <div className="w-px h-12 bg-dark-700"></div>
                    <div>
                      <div className="text-4xl font-bold text-emerald-400">0</div>
                      <div className="text-dark-400 text-sm">Brechas de seguridad</div>
                    </div>
                    <div className="w-px h-12 bg-dark-700"></div>
                    <div>
                      <div className="text-4xl font-bold text-white">24/7</div>
                      <div className="text-dark-400 text-sm">Soporte</div>
                    </div>
                  </div>
                </div>

                {/* Right - Live Activity Feed */}
                <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
                  <div className="flex items-center justify-between mb-6">
                    <h4 className="text-white font-bold flex items-center gap-2">
                      <Activity className="w-4 h-4 text-emerald-400" />
                      Actividad Reciente
                    </h4>
                    <span className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 px-2 py-1 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      En vivo
                    </span>
                  </div>

                  <div className="space-y-4">
                    {[
                      { user: 'Ana M.', action: 'descargó', file: 'Presupuesto_Final.pdf', time: 'Hace 2m', avatar: 'A' },
                      { user: 'Carlos R.', action: 'subió', file: 'Assets_Web.zip', time: 'Hace 15m', avatar: 'C' },
                      { user: 'Admin', action: 'compartió', file: 'Presentación Q4.pdf', time: 'Hace 1h', avatar: 'AD' },
                      { user: 'María L.', action: 'movió a favoritos', file: 'Diseño_v2.fig', time: 'Hace 2h', avatar: 'M' },
                    ].map((log, i) => (
                      <div key={i} className="flex items-center gap-3 text-sm py-2 border-b border-white/5 last:border-0">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-[10px] font-bold text-white">
                          {log.avatar}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-white font-medium">{log.user}</span>
                          <span className="text-dark-400"> {log.action} </span>
                          <span className="text-dark-300 truncate">{log.file}</span>
                        </div>
                        <span className="text-xs text-dark-500 shrink-0">{log.time}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Cards */}
            <div className="grid md:grid-cols-3 gap-4">
              <div className="group p-6 bg-white dark:bg-dark-800 border border-dark-200 dark:border-dark-700 rounded-2xl hover:shadow-xl hover:shadow-emerald-500/5 transition-all hover:-translate-y-1">
                <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Server className="w-6 h-6 text-emerald-500" />
                </div>
                <h4 className="text-lg font-bold text-dark-900 dark:text-white mb-2">Self-Hosted</h4>
                <p className="text-dark-500 text-sm">Control total sobre tu infraestructura. Despliega en tu propio servidor.</p>
              </div>

              <div className="group p-6 bg-white dark:bg-dark-800 border border-dark-200 dark:border-dark-700 rounded-2xl hover:shadow-xl hover:shadow-blue-500/5 transition-all hover:-translate-y-1">
                <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Lock className="w-6 h-6 text-blue-500" />
                </div>
                <h4 className="text-lg font-bold text-dark-900 dark:text-white mb-2">Open Source</h4>
                <p className="text-dark-500 text-sm">Código abierto y auditable. Sin backdoors, sin sorpresas.</p>
              </div>

              <div className="group p-6 bg-white dark:bg-dark-800 border border-dark-200 dark:border-dark-700 rounded-2xl hover:shadow-xl hover:shadow-purple-500/5 transition-all hover:-translate-y-1">
                <div className="w-12 h-12 bg-purple-500/10 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Users className="w-6 h-6 text-purple-500" />
                </div>
                <h4 className="text-lg font-bold text-dark-900 dark:text-white mb-2">Privacidad</h4>
                <p className="text-dark-500 text-sm">Sin rastreo, sin analytics invasivos. Tu privacidad es prioridad.</p>
              </div>
            </div>
          </section>
        )}

        {/* FAQ Section */}
        <section className="max-w-[1600px] mx-auto px-6 mb-24">
          <div className="grid md:grid-cols-2 gap-12 items-start">
            <div>
              <h2 className="text-3xl font-bold text-dark-900 dark:text-white mb-4">{t('landing.faq.title')}</h2>
              <p className="text-lg text-dark-500">{t('landing.faq.subtitle')}</p>
            </div>
            <div className="bg-white dark:bg-dark-800 rounded-2xl border border-dark-200 dark:border-dark-700 p-6">
              <FAQItem
                question={t('landing.faq.q1.question')}
                answer={t('landing.faq.q1.answer')}
                isOpen={openFAQ === 0}
                onClick={() => setOpenFAQ(openFAQ === 0 ? null : 0)}
              />
              <FAQItem
                question={t('landing.faq.q2.question')}
                answer={t('landing.faq.q2.answer')}
                isOpen={openFAQ === 1}
                onClick={() => setOpenFAQ(openFAQ === 1 ? null : 1)}
              />
              <FAQItem
                question={t('landing.faq.q3.question')}
                answer={t('landing.faq.q3.answer')}
                isOpen={openFAQ === 2}
                onClick={() => setOpenFAQ(openFAQ === 2 ? null : 2)}
              />
              <FAQItem
                question={t('landing.faq.q4.question')}
                answer={t('landing.faq.q4.answer')}
                isOpen={openFAQ === 3}
                onClick={() => setOpenFAQ(openFAQ === 3 ? null : 3)}
              />
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section id="pricing" className="max-w-4xl mx-auto px-6 mb-24">
          <div className="text-center mb-12">
            <Badge className="mb-4 border-[#F44336]/20 bg-[#F44336]/10 text-[#F44336]">{t('landing.pricing.badge')}</Badge>
            <h2 className="text-4xl font-bold text-dark-900 dark:text-white mb-4">{t('landing.pricing.title')}</h2>
            <p className="text-lg text-dark-500 max-w-2xl mx-auto">{t('landing.pricing.subtitle')}</p>
          </div>

          <div className="relative">
            <Panel className="p-8 border-2 border-[#F44336]/30 shadow-2xl shadow-[#F44336]/10">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="bg-[#F44336] text-white text-xs font-bold px-4 py-1.5 rounded-full">
                  {t('landing.pricing.beta.badge')}
                </span>
              </div>

              <div className="text-center mb-8">
                <h3 className="text-2xl font-bold text-dark-900 dark:text-white mb-2">{t('landing.pricing.beta.name')}</h3>
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-5xl font-bold text-[#F44336]">{t('landing.pricing.beta.price')}</span>
                  <span className="text-dark-500">{t('landing.pricing.beta.period')}</span>
                </div>
                <p className="text-dark-500 mt-2">{t('landing.pricing.beta.storage')}</p>
              </div>

              <ul className="space-y-3 mb-8">
                {(t('landing.pricing.beta.features', { returnObjects: true }) as string[]).map((feature, i) => (
                  <li key={i} className="flex items-center gap-3 text-dark-700 dark:text-dark-300">
                    <Check className="w-5 h-5 text-emerald-500 shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <Link to="/register" className="block">
                <Button className="w-full h-14 text-lg">{t('landing.pricing.beta.cta')}</Button>
              </Link>
            </Panel>
          </div>
        </section>

        {/* Roadmap Section */}
        <section id="roadmap" className="max-w-[1200px] mx-auto px-6 mb-24">
          <div className="text-center mb-12">
            <Badge className="mb-4">{t('landing.roadmap.badge')}</Badge>
            <h2 className="text-4xl font-bold text-dark-900 dark:text-white mb-4">{t('landing.roadmap.title')}</h2>
            <p className="text-lg text-dark-500">{t('landing.roadmap.subtitle')}</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { key: 'i18n', status: 'completed', color: 'emerald' },
              { key: 'mobile', status: 'inProgress', color: 'blue' },
              { key: 'collaboration', status: 'inProgress', color: 'purple' },
              { key: 'api', status: 'planned', color: 'orange' },
              { key: 'e2e', status: 'planned', color: 'red' },
              { key: 'ai', status: 'planned', color: 'pink' },
            ].map((item) => (
              <Panel key={item.key} className="group hover:shadow-lg transition-all hover:-translate-y-1">
                <div className="flex items-start justify-between mb-4">
                  <div className={`px-2.5 py-1 rounded-full text-xs font-medium ${item.status === 'completed' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
                    item.status === 'inProgress' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' :
                      'bg-dark-100 dark:bg-dark-700 text-dark-500'
                    }`}>
                    {t(`landing.roadmap.status.${item.status}`)}
                  </div>
                </div>
                <h3 className="text-lg font-bold text-dark-900 dark:text-white mb-2">
                  {t(`landing.roadmap.items.${item.key}.title`)}
                </h3>
                <p className="text-sm text-dark-500">
                  {t(`landing.roadmap.items.${item.key}.desc`)}
                </p>
              </Panel>
            ))}
          </div>
        </section>

        {/* Contact Section */}
        <section id="contact" className="max-w-[1200px] mx-auto px-6 mb-24">
          <div className="text-center mb-12">
            <Badge className="mb-4">{t('landing.contact.badge')}</Badge>
            <h2 className="text-4xl font-bold text-dark-900 dark:text-white mb-4">{t('landing.contact.title')}</h2>
            <p className="text-lg text-dark-500">{t('landing.contact.subtitle')}</p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <a href="mailto:allopze@gmail.com" className="block">
              <Panel className="group h-full hover:shadow-lg hover:border-[#F44336]/20 transition-all hover:-translate-y-1 cursor-pointer">
                <div className="w-12 h-12 bg-[#F44336]/10 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Mail className="w-6 h-6 text-[#F44336]" />
                </div>
                <h3 className="text-lg font-bold text-dark-900 dark:text-white mb-2">{t('landing.contact.email.title')}</h3>
                <p className="text-sm text-dark-500 mb-4">{t('landing.contact.email.desc')}</p>
                <span className="text-[#F44336] text-sm font-medium flex items-center gap-1">
                  {t('landing.contact.email.cta')} <ChevronRight className="w-4 h-4" />
                </span>
              </Panel>
            </a>

            <a href={`${config.links.githubUrl}/issues`} target="_blank" rel="noopener noreferrer" className="block">
              <Panel className="group h-full hover:shadow-lg hover:border-dark-300 dark:hover:border-dark-600 transition-all hover:-translate-y-1 cursor-pointer">
                <div className="w-12 h-12 bg-dark-100 dark:bg-dark-700 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Code className="w-6 h-6 text-dark-600 dark:text-dark-300" />
                </div>
                <h3 className="text-lg font-bold text-dark-900 dark:text-white mb-2">{t('landing.contact.github.title')}</h3>
                <p className="text-sm text-dark-500 mb-4">{t('landing.contact.github.desc')}</p>
                <span className="text-dark-600 dark:text-dark-300 text-sm font-medium flex items-center gap-1">
                  {t('landing.contact.github.cta')} <ChevronRight className="w-4 h-4" />
                </span>
              </Panel>
            </a>

            <a href={config.links.githubUrl} target="_blank" rel="noopener noreferrer" className="block">
              <Panel className="group h-full hover:shadow-lg hover:border-blue-200 dark:hover:border-blue-900 transition-all hover:-translate-y-1 cursor-pointer">
                <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <BookOpen className="w-6 h-6 text-blue-500" />
                </div>
                <h3 className="text-lg font-bold text-dark-900 dark:text-white mb-2">{t('landing.contact.docs.title')}</h3>
                <p className="text-sm text-dark-500 mb-4">{t('landing.contact.docs.desc')}</p>
                <span className="text-blue-500 text-sm font-medium flex items-center gap-1">
                  {t('landing.contact.docs.cta')} <ChevronRight className="w-4 h-4" />
                </span>
              </Panel>
            </a>
          </div>
        </section>

        {/* CTA Final */}
        <section className="max-w-4xl mx-auto px-6">
          <Panel className="text-center py-20 px-8 border-[#F44336]/10 shadow-2xl shadow-[#F44336]/10 rounded-[3rem]">
            <h2 className="text-4xl font-bold text-dark-900 dark:text-white mb-4">{t('landing.cta.title')}</h2>
            <p className="text-dark-500 dark:text-dark-400 mb-10 text-xl">{t('landing.cta.subtitle')}</p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-5 mb-10">
              <Link to="/register">
                <Button className="w-full sm:w-auto px-10 h-14 text-lg">{t('landing.cta.primary')}</Button>
              </Link>
              <a href={config.links.githubUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="secondary" className="w-full sm:w-auto px-10 h-14 text-lg rounded-full">{t('landing.cta.secondary')}</Button>
              </a>
            </div>

            <div className="flex items-center justify-center gap-6 text-sm text-dark-400 font-medium">
              <Link to="/terms" className="hover:text-[#F44336] transition-colors">{t('landing.cta.terms')}</Link>
              <span className="w-1.5 h-1.5 bg-dark-300 rounded-full"></span>
              <Link to="/privacy" className="hover:text-[#F44336] transition-colors">{t('landing.cta.privacy')}</Link>
            </div>
          </Panel>
        </section>
      </main>

      {/* Footer */}
      {config.sections.footer.enabled && (
        <footer className="border-t border-dark-200 dark:border-dark-700 bg-white dark:bg-dark-900 py-16">
          <div className="max-w-7xl mx-auto px-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
              {/* Brand */}
              <div className="col-span-2 md:col-span-1">
                <div className="flex items-center gap-3 mb-4">
                  <BrandLogo logoSrc={isDark ? branding.logoDarkUrl : branding.logoLightUrl} className="h-8" />
                </div>
                <p className="text-sm text-dark-500 dark:text-dark-400">{t('landing.footer.note')}</p>
              </div>

              {/* Product */}
              <div>
                <h4 className="text-sm font-semibold text-dark-900 dark:text-white mb-4">{t('landing.footer.product.title')}</h4>
                <ul className="space-y-3 text-sm text-dark-500 dark:text-dark-400">
                  <li><a href="#features" className="hover:text-[#F44336] transition-colors">{t('landing.footer.product.features')}</a></li>
                  <li><a href="#pricing" className="hover:text-[#F44336] transition-colors">{t('landing.footer.product.pricing')}</a></li>
                  <li><a href="#roadmap" className="hover:text-[#F44336] transition-colors">{t('landing.footer.product.roadmap')}</a></li>
                </ul>
              </div>

              {/* Resources */}
              <div>
                <h4 className="text-sm font-semibold text-dark-900 dark:text-white mb-4">{t('landing.footer.resources.title')}</h4>
                <ul className="space-y-3 text-sm text-dark-500 dark:text-dark-400">
                  <li><a href={config.links.githubUrl} target="_blank" rel="noopener noreferrer" className="hover:text-[#F44336] transition-colors">{t('landing.footer.resources.docs')}</a></li>
                  <li><a href={config.links.githubUrl} target="_blank" rel="noopener noreferrer" className="hover:text-[#F44336] transition-colors">{t('landing.footer.resources.github')}</a></li>
                  <li><a href="#contact" className="hover:text-[#F44336] transition-colors">{t('landing.footer.resources.support')}</a></li>
                </ul>
              </div>

              {/* Legal */}
              <div>
                <h4 className="text-sm font-semibold text-dark-900 dark:text-white mb-4">{t('landing.footer.legal.title')}</h4>
                <ul className="space-y-3 text-sm text-dark-500 dark:text-dark-400">
                  <li><Link to="/terms" className="hover:text-[#F44336] transition-colors">{t('landing.footer.legal.terms')}</Link></li>
                  <li><Link to="/privacy" className="hover:text-[#F44336] transition-colors">{t('landing.footer.legal.privacy')}</Link></li>
                </ul>
              </div>
            </div>

            {/* Bottom bar */}
            <div className="pt-8 border-t border-dark-200 dark:border-dark-700 flex flex-col md:flex-row justify-between items-center gap-4">
              <p className="text-sm text-dark-400">{t('landing.footer.copyright', { year: new Date().getFullYear() })}</p>
              <div className="flex items-center gap-6">
                <a href={config.links.githubUrl} target="_blank" rel="noopener noreferrer" className="text-dark-400 hover:text-dark-900 dark:hover:text-white transition-colors">
                  <Code className="w-5 h-5" />
                </a>
              </div>
            </div>
          </div>
        </footer>
      )}

      {loading && <div className="fixed bottom-4 right-4 text-xs text-dark-400">{t('landing.loading')}</div>}
    </div>
  );
}
