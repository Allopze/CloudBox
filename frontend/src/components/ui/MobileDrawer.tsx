import { useEffect, useRef, useCallback, ReactNode } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

interface MobileDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    children: ReactNode;
    title?: string;
    side?: 'left' | 'right';
    className?: string;
}

/**
 * MobileDrawer - A slide-out drawer component for mobile navigation.
 * Features:
 * - Smooth slide animation with framer-motion
 * - Backdrop overlay with blur effect
 * - Focus trap when open
 * - Closes on Escape or backdrop click
 * - Respects prefers-reduced-motion
 */
export default function MobileDrawer({
    isOpen,
    onClose,
    children,
    title,
    side = 'left',
    className,
}: MobileDrawerProps) {
    const drawerRef = useRef<HTMLDivElement>(null);
    const previousActiveElement = useRef<HTMLElement | null>(null);
    const reducedMotion = useReducedMotion();

    // Get all focusable elements within the drawer
    const getFocusableElements = useCallback(() => {
        if (!drawerRef.current) return [];
        return Array.from(
            drawerRef.current.querySelectorAll<HTMLElement>(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            )
        ).filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);
    }, []);

    // Handle keyboard events
    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
                return;
            }

            // Focus trap
            if (e.key === 'Tab') {
                const focusable = getFocusableElements();
                if (focusable.length === 0) return;

                const first = focusable[0];
                const last = focusable[focusable.length - 1];

                if (e.shiftKey) {
                    if (document.activeElement === first) {
                        e.preventDefault();
                        last.focus();
                    }
                } else {
                    if (document.activeElement === last) {
                        e.preventDefault();
                        first.focus();
                    }
                }
            }
        },
        [onClose, getFocusableElements]
    );

    // Focus management and event listeners
    useEffect(() => {
        if (isOpen) {
            // Store current focus
            previousActiveElement.current = document.activeElement as HTMLElement;

            // Add listeners
            document.addEventListener('keydown', handleKeyDown);
            document.body.style.overflow = 'hidden';

            // Focus first element in drawer
            requestAnimationFrame(() => {
                const focusable = getFocusableElements();
                if (focusable.length > 0) {
                    focusable[0].focus();
                } else {
                    drawerRef.current?.focus();
                }
            });
        }

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = '';

            // Restore focus
            if (previousActiveElement.current && !isOpen) {
                previousActiveElement.current.focus();
            }
        };
    }, [isOpen, handleKeyDown, getFocusableElements]);

    // Animation variants
    const slideFrom = side === 'left' ? '-100%' : '100%';

    const drawerVariants = reducedMotion
        ? {
            initial: { opacity: 0 },
            animate: { opacity: 1 },
            exit: { opacity: 0 },
        }
        : {
            initial: { x: slideFrom, opacity: 0 },
            animate: { x: 0, opacity: 1 },
            exit: { x: slideFrom, opacity: 0 },
        };

    const backdropVariants = {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
                        onClick={onClose}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        variants={backdropVariants}
                        transition={{ duration: reducedMotion ? 0.1 : 0.2 }}
                        aria-hidden="true"
                    />

                    {/* Drawer */}
                    <motion.div
                        ref={drawerRef}
                        role="dialog"
                        aria-modal="true"
                        aria-label={title || 'Navigation drawer'}
                        tabIndex={-1}
                        className={cn(
                            'fixed top-0 z-50 h-full w-72 max-w-[80vw]',
                            'bg-white dark:bg-dark-900',
                            'shadow-2xl',
                            'flex flex-col',
                            'focus:outline-none',
                            side === 'left' ? 'left-0' : 'right-0',
                            className
                        )}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        variants={drawerVariants}
                        transition={{
                            type: reducedMotion ? 'tween' : 'spring',
                            damping: 25,
                            stiffness: 300,
                            duration: reducedMotion ? 0.1 : undefined,
                        }}
                    >
                        {/* Header */}
                        {title && (
                            <div className="flex items-center justify-between px-4 py-3 border-b border-dark-200 dark:border-dark-700">
                                <h2 className="text-lg font-semibold text-dark-900 dark:text-white">
                                    {title}
                                </h2>
                                <button
                                    onClick={onClose}
                                    className="p-2 rounded-lg hover:bg-dark-100 dark:hover:bg-dark-800 transition-colors"
                                    aria-label="Close drawer"
                                >
                                    <X className="w-5 h-5 text-dark-500 dark:text-dark-400" />
                                </button>
                            </div>
                        )}

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto">
                            {children}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
