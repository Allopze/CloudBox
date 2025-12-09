import { Link, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Moon, Sun, ChevronLeft } from 'lucide-react';
import { useThemeStore } from '../stores/themeStore';
import { useBrandingStore } from '../stores/brandingStore';
import { cn } from '../lib/utils';
import Button from '../components/ui/Button';

export default function LegalLayout() {
    const { t } = useTranslation();
    const location = useLocation();
    const { isDark, toggleTheme } = useThemeStore();
    const { branding } = useBrandingStore();

    const isPrivacy = location.pathname === '/privacy';

    return (
        <div className="min-h-screen bg-dark-50 dark:bg-dark-900 font-sans text-dark-900 dark:text-dark-100 transition-colors duration-300">
            {/* Top Navigation Bar */}
            <header className="fixed top-0 inset-x-0 z-50 h-16 bg-white/80 dark:bg-dark-900/80 backdrop-blur-md border-b border-dark-200 dark:border-dark-800">
                <div className="h-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
                    {/* Left: Logo */}
                    <div className="flex items-center gap-4">
                        <Link to="/" className="flex items-center gap-2">
                            {((isDark ? branding.logoDarkUrl : branding.logoLightUrl) || branding.logoUrl) ? (
                                <img
                                    src={(isDark ? branding.logoDarkUrl : branding.logoLightUrl) || branding.logoUrl}
                                    alt="Logo"
                                    className="h-8 object-contain"
                                />
                            ) : (
                                <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
                                    <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" />
                                    </svg>
                                </div>
                            )}

                        </Link>
                    </div>

                    {/* Center: Navigation Links */}
                    <nav className="hidden md:flex items-center gap-8">
                        <Link
                            to="/privacy"
                            className={cn(
                                "text-sm font-medium transition-colors hover:text-primary-600",
                                isPrivacy ? "text-primary-600 font-semibold" : "text-dark-500 dark:text-dark-400"
                            )}
                        >
                            {t('legal.privacyPolicy', 'Política de Privacidad')}
                        </Link>
                        <Link
                            to="/terms"
                            className={cn(
                                "text-sm font-medium transition-colors hover:text-primary-600",
                                !isPrivacy ? "text-primary-600 font-semibold" : "text-dark-500 dark:text-dark-400"
                            )}
                        >
                            {t('legal.termsOfService', 'Términos y Condiciones')}
                        </Link>
                    </nav>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-4">
                        <button
                            onClick={toggleTheme}
                            className="p-2 rounded-full text-dark-500 hover:bg-dark-100 dark:text-dark-400 dark:hover:bg-dark-800 transition-colors"
                            aria-label="Toggle theme"
                        >
                            {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                        </button>

                        <div className="h-6 w-px bg-dark-200 dark:bg-dark-800 hidden sm:block"></div>

                        <Link to="/">
                            <Button variant="ghost" className="hidden sm:flex items-center gap-2 text-sm font-medium">
                                <span>{t('legal.backToApp', 'Volver a la App')}</span>
                            </Button>
                            {/* Mobile only icon */}
                            <Button variant="ghost" className="sm:hidden px-2">
                                <ChevronLeft className="w-5 h-5" />
                            </Button>
                        </Link>
                    </div>
                </div>
            </header>

            {/* Main Content Area */}
            <main className="pt-24 pb-16 min-h-screen">
                <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
