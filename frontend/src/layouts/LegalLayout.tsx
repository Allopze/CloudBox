import { Link, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Moon, Sun, ChevronLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useThemeStore } from '../stores/themeStore';
import { useBrandingStore } from '../stores/brandingStore';
import { cn } from '../lib/utils';
import Button from '../components/ui/Button';

import LanguageSelector from '../components/LanguageSelector';

// ... other imports

export default function LegalLayout() {
    const { t } = useTranslation();
    const location = useLocation();
    const { isDark, toggleTheme } = useThemeStore();
    const { branding } = useBrandingStore();

    const isPrivacy = location.pathname === '/privacy';

    return (
        <div className="min-h-screen bg-dark-50 dark:bg-dark-900 font-sans text-dark-900 dark:text-dark-100 transition-colors duration-300">
            {/* Top Navigation Bar */}
            <header className="fixed top-0 w-full z-50 h-16 bg-white/80 dark:bg-dark-900/80 backdrop-blur-md border-b border-dark-200 dark:border-dark-800 transition-all duration-300">
                <div className="max-w-7xl mx-auto px-6 h-full flex items-center justify-between">
                    {/* Left: Logo */}
                    <div className="flex items-center gap-4">
                        <Link to="/" className="flex items-center gap-2">
                            {/* ... logo logic ... */}
                            {((isDark ? branding.logoDarkUrl : branding.logoLightUrl) || branding.logoUrl) ? (
                                <img
                                    src={(isDark ? branding.logoDarkUrl : branding.logoLightUrl) || branding.logoUrl}
                                    alt="Logo"
                                    className="h-10 w-auto"
                                />
                            ) : (
                                <>
                                    {/* Light Mode */}
                                    <div className="dark:hidden flex items-center gap-2">
                                        <div className="w-10 h-10 bg-primary-600 rounded-xl flex items-center justify-center shadow-md shadow-primary-600/20">
                                            <span className="text-white text-lg font-bold">C</span>
                                        </div>
                                        <span className="text-dark-900 font-bold tracking-tight text-2xl">CloudBox</span>
                                    </div>

                                    {/* Dark Mode */}
                                    <div className="hidden dark:flex items-center gap-2">
                                        <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-md">
                                            <span className="text-primary-600 text-lg font-bold">C</span>
                                        </div>
                                        <span className="text-white font-bold tracking-tight text-2xl">CloudBox</span>
                                    </div>
                                </>
                            )}
                        </Link>
                    </div>

                    {/* Center: Navigation Links - Absolutely Centered */}
                    <nav className="hidden md:flex items-center gap-8 text-sm font-medium absolute left-1/2 transform -translate-x-1/2">
                        <Link
                            to="/terms"
                            className={cn(
                                "transition-colors hover:text-primary-600",
                                !isPrivacy ? "text-primary-600" : "text-dark-600 dark:text-dark-400"
                            )}
                        >
                            {t('legal.termsOfService', 'Términos y Condiciones')}
                        </Link>
                        <Link
                            to="/privacy"
                            className={cn(
                                "transition-colors hover:text-primary-600",
                                isPrivacy ? "text-primary-600" : "text-dark-600 dark:text-dark-400"
                            )}
                        >
                            {t('legal.privacyPolicy', 'Política de Privacidad')}
                        </Link>
                    </nav>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-4">
                        <Link to="/">
                            {/* Keep the Back button as it's specific to Legal page */}
                            <Button variant="ghost" className="hidden sm:flex items-center gap-2 text-sm font-medium">
                                <span>{t('legal.backToApp', 'Volver a la App')}</span>
                            </Button>
                            {/* Mobile only icon */}
                            <Button variant="ghost" className="sm:hidden px-2">
                                <ChevronLeft className="w-5 h-5" />
                            </Button>
                        </Link>
                        <div className="w-px h-6 bg-dark-200 dark:bg-dark-700 mx-1 hidden sm:block"></div>
                        <LanguageSelector />
                        <button
                            onClick={toggleTheme}
                            className="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer hover:bg-dark-200/50 dark:hover:bg-white/10 transition-colors text-dark-500 dark:text-dark-400"
                            aria-label="Toggle theme"
                        >
                            {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                        </button>
                    </div>
                </div>
            </header>

            {/* Main Content Area */}
            <main className="pt-24 pb-16 min-h-screen">
                <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={location.pathname}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2 }}
                        >
                            <Outlet />
                        </motion.div>
                    </AnimatePresence>
                </div>
            </main>
        </div>
    );
}
