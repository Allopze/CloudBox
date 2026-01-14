import { useEffect, useRef, useCallback, ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence, useReducedMotion, useDragControls, PanInfo } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';
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
 * - Drag handle for swipe-to-close gesture
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
    const { t } = useTranslation();
    const drawerRef = useRef<HTMLDivElement>(null);
    const previousActiveElement = useRef<HTMLElement | null>(null);
    const onCloseRef = useRef(onClose);
    const reducedMotion = useReducedMotion();
    const dragControls = useDragControls();
    const [dragX, setDragX] = useState(0);

    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

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
                onCloseRef.current();
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
        [getFocusableElements]
    );

    // Focus management and event listeners
    useEffect(() => {
        if (!isOpen) return;

        // Store current focus
        previousActiveElement.current = document.activeElement as HTMLElement;

        // Add listeners
        document.addEventListener('keydown', handleKeyDown);
        document.body.style.overflow = 'hidden';

        // Focus first element in drawer
        requestAnimationFrame(() => {
            if (drawerRef.current?.contains(document.activeElement)) {
                return;
            }
            const focusable = getFocusableElements();
            if (focusable.length > 0) {
                focusable[0].focus();
            } else {
                drawerRef.current?.focus();
            }
        });

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = '';

            // Restore focus
            if (previousActiveElement.current) {
                previousActiveElement.current.focus();
            }
        };
    }, [isOpen, handleKeyDown, getFocusableElements]);

    // Handle drag end
    const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
        // Close if dragged more than 80px to the left or with enough velocity
        if (info.offset.x < -80 || info.velocity.x < -500) {
            onClose();
        }
        setDragX(0);
    };

    const handleDrag = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
        // Only track leftward drags (negative x)
        setDragX(Math.min(0, info.offset.x));
    };

    // Animation variants
    const slideFrom = side === 'left' ? '-100%' : '100%';

    const drawerVariants = reducedMotion
        ? {
            initial: { opacity: 0 },
            animate: { opacity: 1, x: dragX },
            exit: { opacity: 0 },
        }
        : {
            initial: { x: slideFrom, opacity: 0 },
            animate: { x: dragX, opacity: 1 },
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

                    {/* Drawer with drag handle */}
                    <motion.div
                        ref={drawerRef}
                        role="dialog"
                        aria-modal="true"
                        aria-label={title || t('common.navigationDrawer')}
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
                        drag="x"
                        dragControls={dragControls}
                        dragConstraints={{ left: -300, right: 0 }}
                        dragElastic={0.1}
                        onDrag={handleDrag}
                        onDragEnd={handleDragEnd}
                        transition={{
                            type: 'tween',
                            ease: 'easeOut',
                            duration: reducedMotion ? 0.1 : 0.25,
                        }}
                    >
                        {/* Drag handle - pill on right edge */}
                        <button
                            onClick={onClose}
                            onPointerDown={(e) => dragControls.start(e)}
                            className="absolute top-1/2 -right-6 -translate-y-1/2 flex items-center justify-center w-6 h-24 bg-dark-100 dark:bg-dark-800 rounded-r-2xl cursor-grab active:cursor-grabbing touch-none z-10 border-y border-r border-dark-200 dark:border-dark-700"
                            aria-label={t('common.close')}
                        >
                            <ChevronLeft className="w-5 h-5 text-dark-400 dark:text-dark-500" />
                        </button>

                        {/* Header */}
                        {title && (
                            <div className="flex items-center justify-between px-4 py-3 border-b border-dark-200 dark:border-dark-700">
                                <h2 className="text-lg font-semibold text-dark-900 dark:text-white">
                                    {title}
                                </h2>
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
