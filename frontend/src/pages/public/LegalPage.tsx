import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { motion } from 'framer-motion';
import { Shield, FileText, Check } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { cn } from '../../lib/utils';
import { useMemo } from 'react';



const slugify = (text: string) => {
    return text
        .toString()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^\w-]+/g, '')
        .replace(/--+/g, '-');
};

// Helper to recursively extract text from React children
const extractText = (children: any): string => {
    if (!children) return '';
    if (typeof children === 'string') return children;
    if (Array.isArray(children)) return children.map(extractText).join('');
    if (typeof children === 'object' && children?.props?.children) return extractText(children.props.children);
    // Handle specific cases or fallback
    if (typeof children === 'object' && children.type) return ''; // Skip unknown elements without children?
    return '';
};

// Custom renderer to inject IDs into headings
const HeadingRenderer = ({ level, children, ...props }: any) => {
    // Extract plain text from children for ID generation
    const text = extractText(children);
    const id = text ? slugify(text) : '';
    const Tag = `h${level}` as keyof JSX.IntrinsicElements;

    return <Tag id={id} className="scroll-mt-24" {...props}>{children}</Tag>;
};

export default function LegalPage() {
    const { t, i18n } = useTranslation();
    const location = useLocation();
    const isPrivacy = location.pathname === '/privacy';
    const slug = isPrivacy ? 'privacy' : 'terms';
    const resolvedLanguage = i18n.resolvedLanguage?.toLowerCase() ?? '';
    const locale = resolvedLanguage.startsWith('es') ? 'es' : 'en';

    const { data: legalData, isLoading, isError } = useQuery({
        queryKey: ['legal', slug, locale],
        queryFn: async () => {
            const { data } = await api.get(`/admin/legal/${slug}`, {
                params: { locale },
            });
            return data;
        },
        staleTime: 5 * 60 * 1000, // 5 minutes cache to prevent 429 loops
    });

    const cleanContent = (text: string) => {
        return text.replace(/^[ \t]+/gm, '');
    };

    const rawContent = cleanContent(legalData?.content || '');

    const displayContent = isError
        ? (isPrivacy ? '# Error\nCould not fetch privacy policy.' : '# Error\nCould not fetch terms.')
        : rawContent;

    const dateLocale = locale === 'en' ? 'en-US' : 'es-ES';
    const lastUpdated = legalData?.updatedAt
        ? new Date(legalData.updatedAt).toLocaleDateString(dateLocale, { day: 'numeric', month: 'long', year: 'numeric' })
        : '';

    // Extract TOC from content
    const toc = useMemo(() => {
        if (!displayContent) return [];

        const items: Array<{ id: string; text: string; level: number }> = [];

        const addItem = (text: string, level: number) => {
            const trimmedText = text.trim();
            if (!trimmedText) return;
            const id = slugify(trimmedText);
            if (!id) return;
            items.push({ id, text: trimmedText, level });
        };

        // Prefer HTML headings when content includes them (default backend content uses <h2>).
        const hasHtmlHeadings = /<h[1-3][\s>]/i.test(displayContent);
        if (hasHtmlHeadings) {
            const htmlHeadingRegex = /<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi;
            let match: RegExpExecArray | null;

            while ((match = htmlHeadingRegex.exec(displayContent)) !== null) {
                const level = Number(match[1]);
                const text = match[2]
                    .replace(/<[^>]+>/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
                addItem(text, level);
            }

            return items;
        }

        // Markdown headings (#, ##, ###)
        const markdownHeadings = displayContent.match(/^#{1,3}\s+(.+)$/gm) || [];
        markdownHeadings.forEach(heading => {
            const level = heading.startsWith('###') ? 3 : heading.startsWith('##') ? 2 : 1;
            const text = heading.replace(/^#{1,3}\s+/, '').trim();
            addItem(text, level);
        });

        return items;
    }, [displayContent]);

    const displayTitle = isPrivacy ? t('legal.privacyPolicy', 'Política de Privacidad') : t('legal.termsOfService', 'Términos y Condiciones');
    const subtitle = isPrivacy
        ? t('legal.privacySubtitle', 'Tu confianza es nuestro activo más valioso. Así es como protegemos tus datos.')
        : t('legal.termsSubtitle', 'Las reglas del juego claras para todos. Por favor lee atentamente.');

    if (isLoading) {
        return <div className="flex h-96 items-center justify-center text-dark-500">{t('common.loading', 'Loading...')}</div>;
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 relative">
            {/* Left Sidebar: Table of Contents */}
            <aside className="hidden lg:block lg:col-span-2">
                <div className="sticky top-24 space-y-8">
                    <div>
                        <h3 className="text-xs font-bold text-dark-400 uppercase tracking-wider mb-4">
                            {t('legal.tableOfContents', 'Índice de Contenidos')}
                        </h3>
                        <nav className="space-y-1 border-l border-dark-200 dark:border-dark-700">
                            {toc.length > 0 ? toc.map((item, index) => (
                                <a
                                    key={index}
                                    href={`#${item.id}`}
                                    onClick={(e) => {
                                        e.preventDefault();
                                        const element = document.getElementById(item.id);
                                        if (element) {
                                            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                            window.history.pushState(null, '', `#${item.id}`);
                                        }
                                    }}
                                    className={cn(
                                        "block pl-4 py-2 text-sm transition-colors border-l -ml-px hover:border-dark-400 dark:hover:border-dark-500",
                                        "text-dark-500 dark:text-dark-400 hover:text-dark-900 dark:hover:text-dark-200"
                                    )}
                                >
                                    {item.text}
                                </a>
                            )) : (
                                <p className="pl-4 py-2 text-sm text-dark-400 italic">{t('legal.noToc', 'No sections found')}</p>
                            )}
                        </nav>
                    </div>

                    <div className="pt-8 border-t border-dark-200 dark:border-dark-700">
                        <h4 className="text-sm font-semibold text-dark-900 dark:text-white mb-2">
                            {t('legal.questions', '¿Dudas sobre tus datos?')}
                        </h4>
                        <a
                            href="#"
                            className="flex items-center gap-2 text-primary-600 font-medium hover:text-primary-700 transition-colors"
                        >
                            <Shield className="w-4 h-4" />
                            {t('legal.privacyCenter', 'Centro de Privacidad')}
                        </a>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <div className="lg:col-span-10">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                >
                    {/* Page Header */}
                    <div className="mb-12">
                        <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-primary-600 uppercase mb-4">
                            <span>{t('legal.legal', 'LEGAL')}</span>
                            <span>•</span>
                            <span>{t('legal.updated', 'Actualizado')}: {lastUpdated}</span>
                        </div>
                        <h1 className="text-4xl md:text-5xl font-bold text-dark-900 dark:text-white mb-6 tracking-tight">
                            {displayTitle}
                        </h1>
                        <p className="text-xl text-dark-500 dark:text-dark-300 max-w-2xl leading-relaxed">
                            {subtitle}
                        </p>
                    </div>

                    {/* TL;DR Card */}
                    <div className="bg-white dark:bg-dark-800 rounded-2xl p-8 mb-16 border border-dark-100 dark:border-dark-700/50 shadow-sm">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg text-primary-600">
                                <FileText className="w-5 h-5" />
                            </div>
                            <h3 className="text-lg font-bold text-dark-900 dark:text-white">
                                {t('legal.quickSummary', 'Resumen Rápido (TL;DR)')}
                            </h3>
                        </div>

                        <div className="grid md:grid-cols-2 gap-6">
                            {isPrivacy ? (
                                <>
                                    <div className="flex gap-3">
                                        <Check className="w-5 h-5 text-primary-600 shrink-0" />
                                        <p className="text-sm text-dark-600 dark:text-dark-300">{t('legal.privacyPoint1', 'Solo recopilamos lo esencial para que la app funcione.')}</p>
                                    </div>
                                    <div className="flex gap-3">
                                        <Check className="w-5 h-5 text-primary-600 shrink-0" />
                                        <p className="text-sm text-dark-600 dark:text-dark-300">{t('legal.privacyPoint2', 'Nunca vendemos tus datos personales a terceros.')}</p>
                                    </div>
                                    <div className="flex gap-3">
                                        <Check className="w-5 h-5 text-primary-600 shrink-0" />
                                        <p className="text-sm text-dark-600 dark:text-dark-300">{t('legal.privacyPoint3', 'Tus archivos están encriptados de extremo a extremo.')}</p>
                                    </div>
                                    <div className="flex gap-3">
                                        <Check className="w-5 h-5 text-primary-600 shrink-0" />
                                        <p className="text-sm text-dark-600 dark:text-dark-300">{t('legal.privacyPoint4', 'Puedes solicitar la eliminación de tu cuenta en cualquier momento.')}</p>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="flex gap-3">
                                        <Check className="w-5 h-5 text-primary-600 shrink-0" />
                                        <p className="text-sm text-dark-600 dark:text-dark-300">{t('legal.termsPoint1', 'Uso responsable de la plataforma.')}</p>
                                    </div>
                                    <div className="flex gap-3">
                                        <Check className="w-5 h-5 text-primary-600 shrink-0" />
                                        <p className="text-sm text-dark-600 dark:text-dark-300">{t('legal.termsPoint2', 'Respeto a los derechos de autor.')}</p>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Markdown Content */}
                    <div className="prose prose-lg dark:prose-invert max-w-none
                        prose-headings:text-dark-900 dark:prose-headings:text-white prose-headings:font-bold prose-headings:tracking-tight
                        prose-p:text-dark-600 dark:prose-p:text-dark-300 prose-p:leading-relaxed
                        prose-a:text-primary-600 dark:prose-a:text-primary-500 hover:prose-a:text-primary-700
                        prose-li:marker:text-primary-500
                        prose-img:rounded-xl
                        prose-hr:border-dark-100 dark:prose-hr:border-dark-700">
                        <ReactMarkdown
                            rehypePlugins={[rehypeRaw, rehypeSanitize]}
                            remarkPlugins={[remarkGfm]}
                            components={{
                                h1: (props) => <HeadingRenderer level={1} {...props} />,
                                h2: (props) => <HeadingRenderer level={2} {...props} />,
                                h3: (props) => <HeadingRenderer level={3} {...props} />,
                            }}
                        >
                            {displayContent}
                        </ReactMarkdown>
                    </div>
                </motion.div>
            </div>
        </div>
    );
}
