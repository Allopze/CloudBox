import { useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ArrowLeft,
    Download,
    Share2,
    MoreHorizontal,
} from 'lucide-react';
import { FileItem } from '../../../types';
import { cn } from '../../../lib/utils';

interface MenuAction {
    type?: 'divider';
    icon?: React.ComponentType<{ className?: string }>;
    label?: string;
    action?: () => void;
    danger?: boolean;
}

interface TopBarProps {
    file: FileItem;
    breadcrumb?: string;
    visible: boolean;
    onBack: () => void;
    onShare?: () => void;
    onDownload?: () => void;
    showMenu: boolean;
    onMenuToggle: () => void;
    menuActions: MenuAction[];
}

export default function TopBar({
    file,
    breadcrumb = '',
    visible,
    onBack,
    onShare,
    onDownload,
    showMenu,
    onMenuToggle,
    menuActions,
}: TopBarProps) {
    const { t } = useTranslation();
    const menuRef = useRef<HTMLDivElement>(null);

    // Close menu on outside click
    useEffect(() => {
        if (!showMenu) return;

        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onMenuToggle();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showMenu, onMenuToggle]);

    return (
        <header
            className={cn(
                'h-14 px-4 flex items-center justify-between',
                'bg-white/95 dark:bg-dark-800/95 backdrop-blur-sm',
                'border-b border-dark-100 dark:border-dark-700',
                'transition-all duration-200',
                visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-full pointer-events-none'
            )}
        >
            {/* Left: Back + Breadcrumb */}
            <div className="flex items-center gap-3 min-w-0 flex-1">
                <button
                    onClick={onBack}
                    className={cn(
                        'p-2 -ml-2 rounded-lg',
                        'text-dark-600 dark:text-dark-300',
                        'hover:bg-dark-100 dark:hover:bg-dark-700',
                        'transition-colors duration-150'
                    )}
                    aria-label={t('mediaViewer.back')}
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>

                {breadcrumb && (
                    <span className="text-sm text-dark-400 truncate max-w-[200px]">
                        {breadcrumb}
                    </span>
                )}
            </div>

            {/* Center: Filename */}
            <div className="flex-1 flex justify-center min-w-0 px-4">
                <h1 className="font-medium text-dark-900 dark:text-white truncate max-w-md">
                    {file.name}
                </h1>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-1 flex-1 justify-end">
                {onShare && (
                    <button
                        onClick={onShare}
                        className={cn(
                            'p-2.5 rounded-lg',
                            'text-dark-600 dark:text-dark-300',
                            'hover:bg-dark-100 dark:hover:bg-dark-700',
                            'transition-colors duration-150'
                        )}
                        aria-label={t('gallery.share')}
                    >
                        <Share2 className="w-5 h-5" />
                    </button>
                )}

                {onDownload && (
                    <button
                        onClick={onDownload}
                        className={cn(
                            'p-2.5 rounded-lg',
                            'text-dark-600 dark:text-dark-300',
                            'hover:bg-dark-100 dark:hover:bg-dark-700',
                            'transition-colors duration-150'
                        )}
                        aria-label={t('gallery.download')}
                    >
                        <Download className="w-5 h-5" />
                    </button>
                )}

                {/* More Menu */}
                <div className="relative" ref={menuRef}>
                    <button
                        onClick={onMenuToggle}
                        className={cn(
                            'p-2.5 rounded-lg',
                            'text-dark-600 dark:text-dark-300',
                            'hover:bg-dark-100 dark:hover:bg-dark-700',
                            'transition-colors duration-150',
                            showMenu && 'bg-dark-100 dark:bg-dark-700'
                        )}
                        aria-label={t('mediaViewer.more')}
                        aria-expanded={showMenu}
                    >
                        <MoreHorizontal className="w-5 h-5" />
                    </button>

                    {showMenu && (
                        <div
                            className={cn(
                                'absolute top-full right-0 mt-1 py-1 min-w-[180px]',
                                'bg-white dark:bg-dark-800',
                                'border border-dark-100 dark:border-dark-700',
                                'rounded-xl shadow-lg',
                                'animate-dropdown-in z-50'
                            )}
                        >
                            {menuActions.map((item, idx) => {
                                if (item.type === 'divider') {
                                    return <div key={idx} className="h-px my-1 bg-dark-100 dark:bg-dark-700" />;
                                }

                                const Icon = item.icon;
                                return (
                                    <button
                                        key={idx}
                                        onClick={() => {
                                            item.action?.();
                                            onMenuToggle();
                                        }}
                                        className={cn(
                                            'w-full flex items-center gap-3 px-3 py-2 text-sm',
                                            'transition-colors duration-150',
                                            item.danger
                                                ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
                                                : 'text-dark-700 dark:text-dark-200 hover:bg-dark-50 dark:hover:bg-dark-700'
                                        )}
                                    >
                                        {Icon && <Icon className="w-4 h-4" />}
                                        <span>{item.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
}
