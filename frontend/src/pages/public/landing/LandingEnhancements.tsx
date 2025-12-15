import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import {
    Upload, Link2, Palette, Server, Check, Loader2, Copy, X,
    Folder, FileText, Users, Settings, Lock, Calendar,
    Zap, ArrowUpRight, Terminal, CheckCircle2
} from 'lucide-react';
import { cn } from '../../../lib/utils';

// ============================================================================
// REDUCED MOTION HOOK
// ============================================================================

export const useReducedMotion = () => {
    const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        setPrefersReducedMotion(mediaQuery.matches);

        const handleChange = (e: MediaQueryListEvent) => {
            setPrefersReducedMotion(e.matches);
        };

        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, []);

    return prefersReducedMotion;
};

// ============================================================================
// TOAST SYSTEM
// ============================================================================

interface Toast {
    id: string;
    message: string;
    type: 'success' | 'error' | 'info';
}

interface ToastContextValue {
    showToast: (message: string, type?: Toast['type']) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) throw new Error('useToast must be used within ToastProvider');
    return context;
};

export const ToastProvider = ({ children }: { children: React.ReactNode }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const reducedMotion = useReducedMotion();

    const showToast = useCallback((message: string, type: Toast['type'] = 'success') => {
        const id = Math.random().toString(36).substring(2, 9);
        setToasts(prev => [...prev, { id, message, type }]);

        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 3000);
    }, []);

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            {/* Toast Container */}
            <div
                className="fixed bottom-6 right-6 z-50 flex flex-col gap-2"
                role="region"
                aria-label="Notifications"
            >
                {toasts.map(toast => (
                    <div
                        key={toast.id}
                        role="alert"
                        aria-live="polite"
                        className={cn(
                            "flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border",
                            "bg-white dark:bg-dark-800 border-dark-200 dark:border-dark-700",
                            "text-dark-900 dark:text-white text-sm font-medium",
                            !reducedMotion && "animate-toast-slide-in"
                        )}
                    >
                        {toast.type === 'success' && (
                            <div className="w-6 h-6 rounded-full bg-emerald-500/10 flex items-center justify-center">
                                <Check className="w-4 h-4 text-emerald-500" />
                            </div>
                        )}
                        {toast.message}
                        <button
                            onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                            className="ml-2 p-1 hover:bg-dark-100 dark:hover:bg-dark-700 rounded-lg transition-colors"
                            aria-label="Dismiss"
                        >
                            <X className="w-3.5 h-3.5 text-dark-400" />
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
};

// ============================================================================
// INTERACTIVE BUTTON
// ============================================================================

interface InteractiveButtonProps {
    children: React.ReactNode;
    onClick?: () => void;
    href?: string;
    className?: string;
    simulateAsync?: boolean;
}

export const InteractiveButton = ({
    children,
    onClick,
    href,
    className = '',
    simulateAsync = true
}: InteractiveButtonProps) => {
    const [state, setState] = useState<'idle' | 'loading' | 'success'>('idle');
    const reducedMotion = useReducedMotion();

    const handleClick = async () => {
        if (state !== 'idle') return;

        if (simulateAsync) {
            setState('loading');
            await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 300));
            setState('success');
            await new Promise(resolve => setTimeout(resolve, 400));
            setState('idle');
        }

        if (onClick) onClick();
        if (href) window.location.href = href;
    };

    return (
        <button
            onClick={handleClick}
            disabled={state !== 'idle'}
            className={cn(
                "relative px-10 py-4 rounded-full text-lg font-medium",
                "bg-[#F44336] text-white shadow-xl shadow-[#F44336]/20",
                "hover:bg-[#e53935] active:scale-[0.97]",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F44336]/50 focus-visible:ring-offset-2",
                "disabled:cursor-wait",
                !reducedMotion && "transition-all duration-150",
                className
            )}
        >
            <span className={cn(
                "flex items-center justify-center gap-2",
                state !== 'idle' && "opacity-0"
            )}>
                {children}
            </span>

            {state === 'loading' && (
                <span className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className={cn("w-5 h-5", !reducedMotion && "animate-spin")} />
                </span>
            )}

            {state === 'success' && (
                <span className="absolute inset-0 flex items-center justify-center">
                    <Check className="w-5 h-5" />
                </span>
            )}
        </button>
    );
};

// ============================================================================
// COPY LINK BUTTON
// ============================================================================

interface CopyLinkButtonProps {
    link?: string;
    className?: string;
}

export const CopyLinkButton = ({
    link = 'cloudbox.lat/s/demo-x7k2',
    className = ''
}: CopyLinkButtonProps) => {
    const [copied, setCopied] = useState(false);
    const reducedMotion = useReducedMotion();

    // Try to get toast context, but make it optional for standalone use
    let showToast: ((msg: string, type?: 'success' | 'error' | 'info') => void) | null = null;
    try {
        const context = useContext(ToastContext);
        showToast = context?.showToast || null;
    } catch {
        // Context not available
    }

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(`https://${link}`);
            setCopied(true);
            if (showToast) showToast('Link copiado al portapapeles', 'success');
            setTimeout(() => setCopied(false), 2000);
        } catch {
            if (showToast) showToast('Error al copiar', 'error');
        }
    };

    return (
        <button
            onClick={handleCopy}
            className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium",
                "bg-dark-100 dark:bg-dark-800 text-dark-700 dark:text-dark-300",
                "border border-dark-200 dark:border-dark-700",
                "hover:bg-dark-200 dark:hover:bg-dark-700",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F44336]/50",
                !reducedMotion && "transition-all duration-150",
                className
            )}
        >
            {copied ? (
                <>
                    <Check className="w-4 h-4 text-emerald-500" />
                    <span className="text-emerald-600 dark:text-emerald-400">Copiado</span>
                </>
            ) : (
                <>
                    <Copy className="w-4 h-4" />
                    <span>Copiar link</span>
                </>
            )}
        </button>
    );
};

// ============================================================================
// LAYERED HERO MOCKUP
// ============================================================================

type MockupState = 'upload' | 'share' | 'branding' | 'selfhost';

interface LayeredHeroMockupProps {
    isDark: boolean;
    activeState?: MockupState;
    className?: string;
}

export const LayeredHeroMockup = ({
    isDark,
    activeState = 'upload',
    className = ''
}: LayeredHeroMockupProps) => {
    const reducedMotion = useReducedMotion();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const animationClass = !reducedMotion && mounted
        ? 'animate-layer-enter'
        : 'opacity-100';

    return (
        <div className={cn(
            "relative w-full h-full min-h-[400px] select-none",
            className
        )}>
            {/* === LAYER 1: Base Dashboard Panel === */}
            <div className={cn(
                "absolute inset-0 rounded-3xl overflow-hidden",
                "bg-white dark:bg-dark-900",
                "border border-dark-200 dark:border-dark-700",
                "shadow-2xl shadow-dark-200/50 dark:shadow-black/50",
                animationClass,
                !reducedMotion && "animation-delay-0"
            )}>
                {/* Window Header */}
                <div className="h-12 bg-white dark:bg-dark-900 border-b border-dark-100 dark:border-dark-700 flex items-center px-4 gap-3">
                    <div className="flex gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-red-400/80" />
                        <div className="w-3 h-3 rounded-full bg-amber-400/80" />
                        <div className="w-3 h-3 rounded-full bg-emerald-400/80" />
                    </div>
                    <div className="flex-1 flex items-center justify-center">
                        <div className="flex items-center gap-2 px-4 py-1.5 bg-dark-100 dark:bg-dark-800 rounded-lg">
                            <div className={cn(
                                "w-5 h-5 rounded flex items-center justify-center",
                                isDark ? "bg-white" : "bg-[#F44336]"
                            )}>
                                <span className={cn(
                                    "text-[10px] font-bold",
                                    isDark ? "text-[#F44336]" : "text-white"
                                )}>C</span>
                            </div>
                            <span className="text-xs font-medium text-dark-600 dark:text-dark-400">CloudBox</span>
                        </div>
                    </div>
                </div>

                {/* Dashboard Content */}
                <div className="flex h-[calc(100%-3rem)]">
                    {/* Sidebar */}
                    <div className="w-48 border-r border-dark-100 dark:border-dark-700 p-3 hidden md:block">
                        {[
                            { icon: Folder, label: 'Mis archivos', active: true },
                            { icon: FileText, label: 'Documentos', active: false },
                            { icon: Users, label: 'Compartidos', active: false },
                            { icon: Settings, label: 'Ajustes', active: false },
                        ].map((item, i) => (
                            <div
                                key={i}
                                className={cn(
                                    "flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium mb-1",
                                    item.active
                                        ? "bg-[#F44336]/10 text-[#F44336]"
                                        : "text-dark-500 hover:bg-dark-100 dark:hover:bg-dark-800"
                                )}
                            >
                                <item.icon className="w-4 h-4" />
                                {item.label}
                            </div>
                        ))}
                    </div>

                    {/* Main Area - background grid pattern */}
                    <div className="flex-1 p-6 bg-dark-50/50 dark:bg-dark-800/30 relative overflow-hidden">
                        {/* Subtle grid pattern */}
                        <div className="absolute inset-0 opacity-30"
                            style={{
                                backgroundImage: `radial-gradient(circle at 1px 1px, ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'} 1px, transparent 0)`,
                                backgroundSize: '24px 24px'
                            }}
                        />
                        {/* File cards placeholder */}
                        <div className="grid grid-cols-3 gap-3 relative z-10">
                            {[1, 2, 3, 4, 5, 6].map(i => (
                                <div
                                    key={i}
                                    className="aspect-square bg-white dark:bg-dark-800 rounded-xl border border-dark-200 dark:border-dark-700 opacity-40"
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* === LAYER 2: Floating Modal Card === */}
            <div className={cn(
                "absolute bottom-8 right-8 w-72 md:w-80",
                "bg-white dark:bg-dark-800 rounded-2xl",
                "border border-dark-200 dark:border-dark-700",
                "shadow-2xl shadow-dark-300/50 dark:shadow-black/60",
                "overflow-hidden",
                animationClass,
                !reducedMotion && "animation-delay-100"
            )}>
                {/* Modal content based on state */}
                {activeState === 'upload' && <UploadModalContent />}
                {activeState === 'share' && <ShareModalContent />}
                {activeState === 'branding' && <BrandingModalContent />}
                {activeState === 'selfhost' && <SelfHostModalContent isDark={isDark} />}
            </div>

            {/* === LAYER 3: Floating Chips/Badges === */}
            <div className={cn(
                "absolute top-16 right-8 flex flex-col gap-2",
                animationClass,
                !reducedMotion && "animation-delay-200"
            )}>
                <StatusChip
                    icon={<Zap className="w-3 h-3 text-emerald-500" />}
                    label="Upload rápido"
                    className="bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800"
                />
                <StatusChip
                    icon={<Lock className="w-3 h-3 text-blue-500" />}
                    label="Encriptado"
                    className="bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800"
                />
            </div>

            {/* Floating metric badge */}
            <div className={cn(
                "absolute bottom-28 left-8 md:left-16",
                animationClass,
                !reducedMotion && "animation-delay-300"
            )}>
                <div className="bg-white dark:bg-dark-800 rounded-xl px-4 py-3 shadow-xl border border-dark-200 dark:border-dark-700">
                    <div className="text-2xl font-bold text-dark-900 dark:text-white">99.9%</div>
                    <div className="text-xs text-dark-500">Uptime</div>
                </div>
            </div>
        </div>
    );
};

// --- Modal Content Variants ---

const UploadModalContent = () => (
    <div className="p-5">
        <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-[#F44336]/10 flex items-center justify-center">
                <Upload className="w-5 h-5 text-[#F44336]" />
            </div>
            <div>
                <div className="font-bold text-dark-900 dark:text-white text-sm">Subiendo archivo...</div>
                <div className="text-xs text-dark-500">Propuesta_Q4.pdf</div>
            </div>
        </div>
        <div className="h-2 bg-dark-100 dark:bg-dark-700 rounded-full overflow-hidden mb-2">
            <div
                className="h-full bg-gradient-to-r from-[#F44336] to-orange-500 rounded-full transition-all duration-300"
                style={{ width: '67%' }}
            />
        </div>
        <div className="flex justify-between text-xs text-dark-500">
            <span>2.4 MB / 3.6 MB</span>
            <span className="text-[#F44336] font-medium">67%</span>
        </div>
    </div>
);

const ShareModalContent = () => (
    <div className="p-5">
        <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                <Link2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
                <div className="font-bold text-dark-900 dark:text-white text-sm">Link generado</div>
                <div className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Público
                </div>
            </div>
        </div>
        <div className="flex items-center gap-2 bg-dark-50 dark:bg-dark-900 rounded-lg p-2 border border-dark-200 dark:border-dark-700">
            <span className="flex-1 text-xs font-mono text-dark-600 dark:text-dark-400 truncate">
                cloudbox.lat/s/k29s-x92j
            </span>
            <button className="p-1.5 bg-white dark:bg-dark-800 rounded-md hover:bg-dark-100 dark:hover:bg-dark-700 transition-colors">
                <Copy className="w-3.5 h-3.5 text-dark-500" />
            </button>
        </div>
        <div className="flex items-center gap-4 mt-3 text-xs text-dark-500">
            <div className="flex items-center gap-1">
                <Lock className="w-3 h-3" /> Contraseña
            </div>
            <div className="flex items-center gap-1">
                <Calendar className="w-3 h-3" /> 7 días
            </div>
        </div>
    </div>
);

const BrandingModalContent = () => (
    <div className="p-5">
        <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                <Palette className="w-5 h-5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
                <div className="font-bold text-dark-900 dark:text-white text-sm">Tu marca</div>
                <div className="text-xs text-dark-500">Personalización completa</div>
            </div>
        </div>
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <span className="text-xs text-dark-600 dark:text-dark-400">Color primario</span>
                <div className="flex gap-1">
                    {['#F44336', '#2196F3', '#4CAF50', '#9C27B0'].map(color => (
                        <div
                            key={color}
                            className={cn(
                                "w-5 h-5 rounded-full border-2",
                                color === '#F44336' ? "border-dark-400 scale-110" : "border-transparent"
                            )}
                            style={{ backgroundColor: color }}
                        />
                    ))}
                </div>
            </div>
            <div className="flex items-center justify-between">
                <span className="text-xs text-dark-600 dark:text-dark-400">Logo personalizado</span>
                <div className="w-5 h-5 rounded bg-[#F44336] flex items-center justify-center">
                    <Check className="w-3 h-3 text-white" />
                </div>
            </div>
        </div>
    </div>
);

const SelfHostModalContent = ({ isDark }: { isDark: boolean }) => (
    <div className="p-5">
        <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <Server className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
                <div className="font-bold text-dark-900 dark:text-white text-sm">Self-hosted</div>
                <div className="text-xs text-dark-500">Despliega en tu servidor</div>
            </div>
        </div>
        <div className={cn(
            "font-mono text-[11px] p-3 rounded-lg",
            isDark ? "bg-dark-900 text-emerald-400" : "bg-dark-900 text-emerald-400"
        )}>
            <div className="flex items-center gap-2 mb-1">
                <Terminal className="w-3 h-3" />
                <span className="text-dark-500">terminal</span>
            </div>
            <div>$ docker-compose up -d</div>
            <div className="text-emerald-500 mt-1">✓ CloudBox running on :3000</div>
        </div>
    </div>
);

// --- Status Chip Component ---

const StatusChip = ({
    icon,
    label,
    className = ''
}: {
    icon: React.ReactNode;
    label: string;
    className?: string;
}) => (
    <div className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium",
        "bg-white dark:bg-dark-800 border border-dark-200 dark:border-dark-700",
        "shadow-lg",
        className
    )}>
        {icon}
        <span className="text-dark-700 dark:text-dark-300">{label}</span>
    </div>
);

// ============================================================================
// CHAPTER SECTION (SCROLL STORYTELLING)
// ============================================================================

interface Chapter {
    id: string;
    title: string;
    description: string;
    mockupState: MockupState;
    badge?: string;
    icon: React.ReactNode;
}

const CHAPTERS: Chapter[] = [
    {
        id: 'upload',
        title: 'Sube en 2 clics',
        description: 'Arrastra y suelta tus archivos. Subidas por chunks que nunca fallan, sin importar el tamaño.',
        mockupState: 'upload',
        badge: 'Rápido',
        icon: <Upload className="w-5 h-5" />
    },
    {
        id: 'share',
        title: 'Comparte con link',
        description: 'Genera enlaces protegidos con contraseña, fecha de expiración y límite de descargas.',
        mockupState: 'share',
        badge: 'Seguro',
        icon: <Link2 className="w-5 h-5" />
    },
    {
        id: 'branding',
        title: 'Tu marca, tu estilo',
        description: 'Personaliza colores, logos y dominio. White-label completo para tu organización.',
        mockupState: 'branding',
        badge: 'Pro',
        icon: <Palette className="w-5 h-5" />
    },
    {
        id: 'selfhost',
        title: 'Self-host listo',
        description: 'Docker compose y listo. Código abierto, tus datos en tu servidor.',
        mockupState: 'selfhost',
        badge: 'Open Source',
        icon: <Server className="w-5 h-5" />
    }
];

interface ChapterSectionProps {
    isDark: boolean;
}

export const ChapterSection = ({ isDark }: ChapterSectionProps) => {
    const [activeChapter, setActiveChapter] = useState<MockupState>('upload');
    const chapterRefs = useRef<(HTMLDivElement | null)[]>([]);
    const reducedMotion = useReducedMotion();

    useEffect(() => {
        const observers: IntersectionObserver[] = [];

        chapterRefs.current.forEach((ref, index) => {
            if (!ref) return;

            const observer = new IntersectionObserver(
                (entries) => {
                    entries.forEach((entry) => {
                        if (entry.isIntersecting) {
                            setActiveChapter(CHAPTERS[index].mockupState);
                        }
                    });
                },
                { threshold: 0.5, rootMargin: '-20% 0px -20% 0px' }
            );

            observer.observe(ref);
            observers.push(observer);
        });

        return () => observers.forEach(obs => obs.disconnect());
    }, []);

    return (
        <section className="max-w-[1600px] mx-auto px-6 py-24">
            {/* Section Header */}
            <div className="text-center mb-16">
                <span className="inline-flex items-center px-4 py-1.5 rounded-full text-sm font-semibold bg-[#F44336]/10 text-[#F44336] border border-[#F44336]/20 mb-4">
                    Flujo de trabajo
                </span>
                <h2 className="text-4xl md:text-5xl font-bold text-dark-900 dark:text-white mb-4">
                    Simple, potente, tuyo
                </h2>
                <p className="text-lg text-dark-500 dark:text-dark-400 max-w-2xl mx-auto">
                    Desde subir tu primer archivo hasta desplegar en tu propio servidor
                </p>
            </div>

            {/* Two-column layout (desktop) / Stacked (mobile) */}
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-24 items-start">
                {/* Left: Chapter Cards */}
                <div className="space-y-8 lg:space-y-16">
                    {CHAPTERS.map((chapter, index) => (
                        <div
                            key={chapter.id}
                            ref={el => { chapterRefs.current[index] = el; }}
                            className={cn(
                                "relative p-6 md:p-8 rounded-2xl border",
                                "bg-white dark:bg-dark-800",
                                activeChapter === chapter.mockupState
                                    ? "border-[#F44336]/30 shadow-xl shadow-[#F44336]/5"
                                    : "border-dark-200 dark:border-dark-700",
                                !reducedMotion && "transition-all duration-300"
                            )}
                        >
                            {/* Chapter number */}
                            <div className="absolute -left-3 top-8 w-6 h-6 rounded-full bg-[#F44336] text-white text-xs font-bold flex items-center justify-center shadow-lg">
                                {index + 1}
                            </div>

                            {/* Badge */}
                            {chapter.badge && (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-dark-100 dark:bg-dark-700 text-dark-600 dark:text-dark-300 mb-4">
                                    {chapter.badge}
                                </span>
                            )}

                            {/* Content */}
                            <div className="flex items-start gap-4">
                                <div className={cn(
                                    "w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0",
                                    activeChapter === chapter.mockupState
                                        ? "bg-[#F44336]/10 text-[#F44336]"
                                        : "bg-dark-100 dark:bg-dark-700 text-dark-500"
                                )}>
                                    {chapter.icon}
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-dark-900 dark:text-white mb-2">
                                        {chapter.title}
                                    </h3>
                                    <p className="text-dark-500 dark:text-dark-400 leading-relaxed">
                                        {chapter.description}
                                    </p>
                                </div>
                            </div>

                            {/* Mobile: Show inline mockup */}
                            <div className="lg:hidden mt-6">
                                <div className="h-64 rounded-xl overflow-hidden border border-dark-200 dark:border-dark-700">
                                    <LayeredHeroMockup
                                        isDark={isDark}
                                        activeState={chapter.mockupState}
                                        className="!min-h-0 h-full"
                                    />
                                </div>
                            </div>

                            {/* Interactive detail */}
                            <div className="mt-4 flex items-center gap-2">
                                <button className="flex items-center gap-1.5 text-sm font-medium text-[#F44336] hover:underline">
                                    Ver más <ArrowUpRight className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Right: Sticky Mockup (desktop only) */}
                <div className="hidden lg:block">
                    <div className="sticky top-32">
                        <div className="aspect-[4/3] rounded-3xl overflow-hidden">
                            <LayeredHeroMockup
                                isDark={isDark}
                                activeState={activeChapter}
                                className="h-full"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};

// ============================================================================
// EXPORTS
// ============================================================================

export {
    type MockupState,
    type Chapter
};
