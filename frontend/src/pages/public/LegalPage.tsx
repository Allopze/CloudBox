import { useEffect, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, FileText, ArrowUp, ChevronLeft, Menu, X, Globe, Clock, ChevronRight } from 'lucide-react';
import { cn, formatDate } from '../../lib/utils';
import { api } from '../../lib/api';
import Button from '../../components/ui/Button';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';

interface LegalContent {
    slug: string;
    title: string;
    content: string;
    updatedAt: string;
}

export default function LegalPage() {
    const { t } = useTranslation();
    const location = useLocation();
    const [showScrollTop, setShowScrollTop] = useState(false);
    const [loading, setLoading] = useState(true);
    const [content, setContent] = useState<LegalContent | null>(null);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const isPrivacy = location.pathname === '/privacy';
    const currentSlug = isPrivacy ? 'privacy' : 'terms';

    useEffect(() => {
        const fetchContent = async () => {
            setLoading(true);
            try {
                const response = await api.get(`/admin/legal/${currentSlug}`);
                setContent(response.data);
            } catch (err) {
                console.error('Failed to fetch legal content', err);
            } finally {
                setLoading(false);
            }
        };

        fetchContent();
        window.scrollTo(0, 0);
    }, [currentSlug]);

    useEffect(() => {
        const handleScroll = () => {
            setShowScrollTop(window.scrollY > 400);
        };

        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const scrollToTop = () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // Fallback content if API fails or content is missing
    const getFallbackContent = () => {
        if (isPrivacy) {
            return `
### ${t('legal.privacySections.collection', '1. Information We Collect')}

${t('legal.privacyContent.collection', 'We collect information you provide directly to us...')}

### ${t('legal.privacySections.usage', '2. How We Use Your Information')}

${t('legal.privacyContent.usage', 'We use the information we collect to provide, maintain, and improve our services...')}
      `;
        }
        return `
### ${t('legal.termsSections.acceptance', '1. Acceptance of Terms')}

${t('legal.termsContent.acceptance', 'By accessing or using our services, you agree to be bound by these Terms of Service...')}

### ${t('legal.termsSections.accounts', '2. User Accounts')}

${t('legal.termsContent.accounts', 'You are responsible for safeguarding the password that you use to access the service...')}
    `;
    };

    const displayTitle = content?.title || (isPrivacy ? t('legal.privacyPolicy', 'Privacy Policy') : t('legal.termsOfService', 'Terms of Service'));
    const displayContent = content?.content || getFallbackContent();
    const lastUpdated = content?.updatedAt ? formatDate(content.updatedAt) : new Date().toLocaleDateString();

    return (
        <div className="min-h-screen bg-dark-50 dark:bg-dark-900 font-sans text-dark-900 dark:text-dark-100">
            {/* Mobile Navigation Bar */}
            <nav className="lg:hidden fixed top-0 inset-x-0 z-50 bg-white/80 dark:bg-dark-800/80 backdrop-blur-md border-b border-dark-200 dark:border-dark-700 h-16 flex items-center justify-between px-4">
                <Link to="/" className="flex items-center gap-2 text-dark-600 dark:text-dark-300">
                    <ChevronLeft className="w-5 h-5" />
                    <span className="font-medium">Back</span>
                </Link>
                <span className="font-semibold text-dark-900 dark:text-white truncate max-w-[50%]">
                    {isPrivacy ? t('legal.privacy', 'Privacy') : t('legal.terms', 'Terms')}
                </span>
                <button
                    onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                    className="p-2 rounded-lg hover:bg-dark-100 dark:hover:bg-dark-700 transition-colors"
                >
                    {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                </button>
            </nav>

            {/* Mobile Menu Overlay */}
            <AnimatePresence>
                {mobileMenuOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="fixed inset-0 z-40 bg-white dark:bg-dark-900 pt-20 px-4 lg:hidden"
                    >
                        <div className="space-y-4">
                            <Link
                                to="/privacy"
                                onClick={() => setMobileMenuOpen(false)}
                                className={cn(
                                    "flex items-center justify-between p-4 rounded-xl border transition-all",
                                    isPrivacy
                                        ? "border-primary-500 bg-primary-50 dark:bg-primary-900/10 text-primary-600"
                                        : "border-dark-200 dark:border-dark-700 hover:border-dark-300 dark:hover:border-dark-600"
                                )}
                            >
                                <div className="flex items-center gap-3">
                                    <Shield className="w-5 h-5" />
                                    <span className="font-medium">{t('legal.privacyPolicy', 'Privacy Policy')}</span>
                                </div>
                                {isPrivacy && <ChevronRight className="w-5 h-5" />}
                            </Link>
                            <Link
                                to="/terms"
                                onClick={() => setMobileMenuOpen(false)}
                                className={cn(
                                    "flex items-center justify-between p-4 rounded-xl border transition-all",
                                    !isPrivacy
                                        ? "border-primary-500 bg-primary-50 dark:bg-primary-900/10 text-primary-600"
                                        : "border-dark-200 dark:border-dark-700 hover:border-dark-300 dark:hover:border-dark-600"
                                )}
                            >
                                <div className="flex items-center gap-3">
                                    <FileText className="w-5 h-5" />
                                    <span className="font-medium">{t('legal.termsOfService', 'Terms of Service')}</span>
                                </div>
                                {!isPrivacy && <ChevronRight className="w-5 h-5" />}
                            </Link>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="max-w-7xl mx-auto flex items-start pt-20 lg:pt-8 min-h-screen">
                {/* Desktop Sidebar */}
                <aside className="hidden lg:block w-80 shrink-0 sticky top-8 h-[calc(100vh-4rem)] overflow-y-auto px-6 py-8 border-r border-dark-200 dark:border-dark-800">
                    <div className="mb-8">
                        <Link
                            to="/"
                            className="inline-flex items-center gap-2 text-sm font-medium text-dark-500 hover:text-primary-600 transition-colors mb-6"
                        >
                            <div className="w-8 h-8 rounded-full bg-dark-100 dark:bg-dark-800 flex items-center justify-center">
                                <ChevronLeft className="w-4 h-4" />
                            </div>
                            {t('common.backToHome', 'Back to Home')}
                        </Link>
                        <h1 className="text-2xl font-bold text-dark-900 dark:text-white mb-2">
                            {t('legal.center', 'Legal Center')}
                        </h1>
                        <p className="text-sm text-dark-500 dark:text-dark-400">
                            {t('legal.mission', 'Transparency and trust are core to our mission.')}
                        </p>
                    </div>

                    <nav className="space-y-2">
                        <Link
                            to="/privacy"
                            className={cn(
                                "group flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
                                isPrivacy
                                    ? "bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400"
                                    : "text-dark-600 dark:text-dark-400 hover:bg-dark-100 dark:hover:bg-dark-800"
                            )}
                        >
                            <Shield className={cn("w-5 h-5", isPrivacy ? "fill-primary-600/20" : "")} />
                            <span className="font-medium">{t('legal.privacyPolicy', 'Privacy Policy')}</span>
                        </Link>
                        <Link
                            to="/terms"
                            className={cn(
                                "group flex items-center gap-3 px-4 py-3 rounded-xl transition-all",
                                !isPrivacy
                                    ? "bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400"
                                    : "text-dark-600 dark:text-dark-400 hover:bg-dark-100 dark:hover:bg-dark-800"
                            )}
                        >
                            <FileText className={cn("w-5 h-5", !isPrivacy ? "fill-primary-600/20" : "")} />
                            <span className="font-medium">{t('legal.termsOfService', 'Terms of Service')}</span>
                        </Link>
                    </nav>

                    <div className="mt-10 pt-8 border-t border-dark-200 dark:border-dark-800">
                        <h3 className="text-xs font-semibold text-dark-400 uppercase tracking-wider mb-4">
                            {t('legal.contact', 'Contact')}
                        </h3>
                        <div className="flex items-center gap-3 text-sm text-dark-600 dark:text-dark-300 mb-2">
                            <Globe className="w-4 h-4" />
                            <span>www.cloudbox.lat</span>
                        </div>
                        <div className="flex items-center gap-3 text-sm text-dark-600 dark:text-dark-300">
                            <Clock className="w-4 h-4" />
                            <span>{t('legal.workingHours', 'Mon-Fri 9am-6pm')}</span>
                        </div>
                    </div>
                </aside>

                {/* Main Content */}
                <main className="flex-1 min-w-0 px-4 lg:px-12 py-8 lg:py-12">
                    {loading ? (
                        <div className="space-y-8 animate-pulse max-w-3xl">
                            <div className="h-12 w-3/4 bg-dark-200 dark:bg-dark-800 rounded-lg"></div>
                            <div className="h-4 w-1/4 bg-dark-200 dark:bg-dark-800 rounded"></div>
                            <div className="space-y-4 pt-8">
                                <div className="h-4 w-full bg-dark-200 dark:bg-dark-800 rounded"></div>
                                <div className="h-4 w-full bg-dark-200 dark:bg-dark-800 rounded"></div>
                                <div className="h-4 w-2/3 bg-dark-200 dark:bg-dark-800 rounded"></div>
                            </div>
                        </div>
                    ) : (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.4 }}
                            className="max-w-3xl"
                        >
                            {/* Header */}
                            <div className="mb-10 pb-10 border-b border-dark-200 dark:border-dark-800">
                                <div className="flex items-center gap-3 mb-4 text-primary-600 dark:text-primary-400">
                                    {isPrivacy ? <Shield className="w-8 h-8" /> : <FileText className="w-8 h-8" />}
                                    <span className="text-sm font-semibold tracking-wider uppercase bg-primary-50 dark:bg-primary-900/30 px-3 py-1 rounded-full">
                                        {t('legal.officialDocument', 'Official Document')}
                                    </span>
                                </div>
                                <h1 className="text-4xl lg:text-5xl font-bold text-dark-900 dark:text-white mb-6">
                                    {displayTitle}
                                </h1>
                                <p className="text-lg text-dark-500 dark:text-dark-400 flex items-center gap-2">
                                    <Clock className="w-5 h-5" />
                                    {t('legal.lastUpdated', 'Last updated')}: <span className="text-dark-900 dark:text-dark-200 font-medium">{lastUpdated}</span>
                                </p>
                            </div>

                            {/* Content */}
                            <div className="prose prose-lg dark:prose-invert max-w-none
                  prose-headings:text-dark-900 dark:prose-headings:text-white
                  prose-p:text-dark-600 dark:prose-p:text-dark-300
                  prose-a:text-primary-600 dark:prose-a:text-primary-400 hover:prose-a:text-primary-700
                  prose-strong:text-dark-900 dark:prose-strong:text-white
                  prose-ul:text-dark-600 dark:prose-ul:text-dark-300
                  prose-li:marker:text-primary-500">
                                <ReactMarkdown
                                    rehypePlugins={[rehypeRaw]}
                                    remarkPlugins={[remarkGfm]}
                                >
                                    {displayContent}
                                </ReactMarkdown>
                            </div>

                            {/* Footer Actions */}
                            <div className="mt-16 pt-10 border-t border-dark-200 dark:border-dark-800 flex flex-col sm:flex-row gap-4 justify-between items-center">
                                <p className="text-sm text-dark-500 text-center sm:text-left">
                                    {t('legal.questions', 'Have questions about these terms?')} <br />
                                    <a href="mailto:legal@cloudbox.lat" className="text-primary-600 hover:underline">{t('legal.contactTeam', 'Contact our legal team')}</a>
                                </p>
                                <div className="flex gap-4">
                                    <Button
                                        variant="secondary"
                                        onClick={() => window.print()}
                                        className="gap-2"
                                    >
                                        {t('legal.print', 'Print')}
                                    </Button>
                                    <Button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
                                        {t('legal.accessAccount', 'Access Account')}
                                    </Button>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </main>
            </div>

            {/* Scroll to top button */}
            <AnimatePresence>
                {showScrollTop && (
                    <motion.button
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        onClick={scrollToTop}
                        className="fixed bottom-8 right-8 w-12 h-12 bg-primary-600 hover:bg-primary-700 text-white rounded-full shadow-lg shadow-primary-600/30 flex items-center justify-center transition-all z-40 hover:-translate-y-1"
                        aria-label={t('common.scrollToTop', 'Scroll to top')}
                    >
                        <ArrowUp className="w-6 h-6" />
                    </motion.button>
                )}
            </AnimatePresence>
        </div>
    );
}
