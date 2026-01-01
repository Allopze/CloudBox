import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/utils';

export interface ContextMenuItem {
    id: string;
    label: string;
    icon?: React.ComponentType<{ className?: string }>;
    onClick: () => void;
    disabled?: boolean;
    danger?: boolean;
}

export interface ContextMenuDivider {
    id: string;
    divider: true;
}

export type ContextMenuItemOrDivider = ContextMenuItem | ContextMenuDivider;

export interface ContextMenuProps {
    items: ContextMenuItemOrDivider[];
    position: { x: number; y: number } | null;
    onClose: () => void;
}

function isDivider(item: ContextMenuItemOrDivider): item is ContextMenuDivider {
    return 'divider' in item && item.divider === true;
}

export default function ContextMenu({ items, position, onClose }: ContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);
    const [focusedIndex, setFocusedIndex] = useState(-1);
    const [adjustedPosition, setAdjustedPosition] = useState(position);

    // Get non-divider items for keyboard navigation
    const navigableItems = items.filter((item): item is ContextMenuItem => !isDivider(item) && !item.disabled);

    // Create a Map for O(1) lookup of navigable indices instead of O(n) findIndex in render
    const navigableIndexMap = useMemo(() => {
        const map = new Map<string, number>();
        navigableItems.forEach((item, index) => {
            map.set(item.id, index);
        });
        return map;
    }, [navigableItems]);

    // Adjust position to keep menu within viewport
    useEffect(() => {
        if (!position || !menuRef.current) {
            setAdjustedPosition(position);
            return;
        }

        const menu = menuRef.current;
        const rect = menu.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        let x = position.x;
        let y = position.y;

        // Adjust horizontal position
        if (x + rect.width > viewportWidth - 8) {
            x = viewportWidth - rect.width - 8;
        }
        if (x < 8) x = 8;

        // Adjust vertical position
        if (y + rect.height > viewportHeight - 8) {
            y = viewportHeight - rect.height - 8;
        }
        if (y < 8) y = 8;

        setAdjustedPosition({ x, y });
    }, [position]);

    // Close on click outside
    useEffect(() => {
        if (!position) return;

        const handleClickOutside = (e: MouseEvent | TouchEvent) => {
            // Ignore if the event originates from within the menu
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };

        const handleScroll = () => onClose();
        const handleContextMenu = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };

        // Delay adding listeners to avoid immediate close from long-press release
        // 300ms is needed to let all touch-end related events complete
        const timeoutId = setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutside, true);
            document.addEventListener('touchstart', handleClickOutside, true);
            document.addEventListener('scroll', handleScroll, true);
            document.addEventListener('contextmenu', handleContextMenu, true);
        }, 300);

        return () => {
            clearTimeout(timeoutId);
            document.removeEventListener('mousedown', handleClickOutside, true);
            document.removeEventListener('touchstart', handleClickOutside, true);
            document.removeEventListener('scroll', handleScroll, true);
            document.removeEventListener('contextmenu', handleContextMenu, true);
        };
    }, [position, onClose]);

    // Keyboard navigation
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (!position) return;

        switch (e.key) {
            case 'Escape':
                e.preventDefault();
                onClose();
                break;
            case 'ArrowDown':
                e.preventDefault();
                setFocusedIndex((prev) => {
                    const next = prev + 1;
                    return next >= navigableItems.length ? 0 : next;
                });
                break;
            case 'ArrowUp':
                e.preventDefault();
                setFocusedIndex((prev) => {
                    const next = prev - 1;
                    return next < 0 ? navigableItems.length - 1 : next;
                });
                break;
            case 'Enter':
            case ' ':
                e.preventDefault();
                if (focusedIndex >= 0 && focusedIndex < navigableItems.length) {
                    navigableItems[focusedIndex].onClick();
                    onClose();
                }
                break;
            case 'Tab':
                e.preventDefault();
                onClose();
                break;
        }
    }, [position, focusedIndex, navigableItems, onClose]);

    useEffect(() => {
        if (position) {
            document.addEventListener('keydown', handleKeyDown);
            setFocusedIndex(-1); // Reset focus when menu opens
        }
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [position, handleKeyDown]);

    if (!position) return null;

    return createPortal(
        <AnimatePresence>
            <motion.div
                ref={menuRef}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.1 }}
                className="fixed z-[9999] min-w-[180px] bg-white dark:bg-dark-800 rounded-xl shadow-lg border border-dark-200 dark:border-dark-700 py-1 overflow-hidden"
                style={{
                    top: adjustedPosition?.y ?? position.y,
                    left: adjustedPosition?.x ?? position.x
                }}
                role="menu"
                aria-orientation="vertical"
            >
                {items.map((item) => {
                    if (isDivider(item)) {
                        return (
                            <div
                                key={item.id}
                                className="h-px bg-dark-200 dark:bg-dark-700 my-1"
                                role="separator"
                            />
                        );
                    }

                    const Icon = item.icon;
                    const navigableIndex = navigableIndexMap.get(item.id) ?? -1;
                    const isFocused = navigableIndex === focusedIndex;

                    return (
                        <button
                            key={item.id}
                            onClick={() => {
                                if (!item.disabled) {
                                    item.onClick();
                                    onClose();
                                }
                            }}
                            disabled={item.disabled}
                            role="menuitem"
                            tabIndex={isFocused ? 0 : -1}
                            className={cn(
                                'w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors',
                                'focus:outline-none focus-visible:bg-dark-50 dark:focus-visible:bg-dark-700',
                                item.danger
                                    ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20'
                                    : 'text-dark-700 dark:text-dark-200 hover:bg-dark-50 dark:hover:bg-dark-700',
                                item.disabled && 'opacity-50 cursor-not-allowed',
                                isFocused && (item.danger ? 'bg-red-50 dark:bg-red-900/20' : 'bg-dark-50 dark:bg-dark-700')
                            )}
                        >
                            {Icon && <Icon className="w-4 h-4 flex-shrink-0" />}
                            <span>{item.label}</span>
                        </button>
                    );
                })}
            </motion.div>
        </AnimatePresence>,
        document.body
    );
}

// Helper components for common menu patterns
export function ContextMenuDividerItem(): ContextMenuDivider {
    return { id: `divider-${Math.random().toString(36).slice(2)}`, divider: true };
}
