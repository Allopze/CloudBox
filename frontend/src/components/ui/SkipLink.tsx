import { useTranslation } from 'react-i18next';

/**
 * SkipLink - Accessibility skip link for screen reader users.
 * Visually hidden by default, becomes visible on focus.
 * Allows users to skip navigation and jump to main content.
 */
export default function SkipLink() {
    const { t } = useTranslation();

    return (
        <a
            href="#main-content"
            className="
        sr-only focus:not-sr-only
        fixed top-4 left-4 z-[9999]
        bg-primary-600 text-white
        px-4 py-2 rounded-lg
        font-medium text-sm
        focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2
        transition-all duration-200
      "
        >
            {t('accessibility.skipToMainContent')}
        </a>
    );
}
