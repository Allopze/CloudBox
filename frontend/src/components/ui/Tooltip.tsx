import React, { useState, useRef, useEffect, ReactNode, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/utils';

export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right' | 'auto';

interface TooltipProps {
    children: ReactNode;
    content: ReactNode;
    position?: TooltipPosition;
    delay?: number;
    className?: string;
    disabled?: boolean;
}

interface TooltipCoords {
    x: number;
    y: number;
    position: 'top' | 'bottom' | 'left' | 'right';
}

const TOOLTIP_OFFSET = 8;
const VIEWPORT_PADDING = 12;

export default function Tooltip({
    children,
    content,
    position = 'auto',
    delay = 400,
    className,
    disabled = false,
}: TooltipProps) {
    const [isVisible, setIsVisible] = useState(false);
    const [coords, setCoords] = useState<TooltipCoords | null>(null);
    const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const calculatePosition = useCallback((rect: DOMRect): TooltipCoords | null => {
        const tooltipWidth = tooltipRef.current?.offsetWidth || 80;
        const tooltipHeight = tooltipRef.current?.offsetHeight || 32;

        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // Calculate available space in each direction
        const spaceTop = rect.top - VIEWPORT_PADDING;
        const spaceBottom = viewportHeight - rect.bottom - VIEWPORT_PADDING;
        const spaceLeft = rect.left - VIEWPORT_PADDING;
        const spaceRight = viewportWidth - rect.right - VIEWPORT_PADDING;

        // Determine best position if auto
        let finalPosition: 'top' | 'bottom' | 'left' | 'right' = position === 'auto' ? 'top' : position;

        if (position === 'auto') {
            if (spaceTop >= tooltipHeight + TOOLTIP_OFFSET) {
                finalPosition = 'top';
            } else if (spaceBottom >= tooltipHeight + TOOLTIP_OFFSET) {
                finalPosition = 'bottom';
            } else if (spaceRight >= tooltipWidth + TOOLTIP_OFFSET) {
                finalPosition = 'right';
            } else if (spaceLeft >= tooltipWidth + TOOLTIP_OFFSET) {
                finalPosition = 'left';
            } else {
                finalPosition = 'top';
            }
        }

        let x = 0;
        let y = 0;

        switch (finalPosition) {
            case 'top':
                x = rect.left + rect.width / 2;
                y = rect.top - TOOLTIP_OFFSET;
                break;
            case 'bottom':
                x = rect.left + rect.width / 2;
                y = rect.bottom + TOOLTIP_OFFSET;
                break;
            case 'left':
                x = rect.left - TOOLTIP_OFFSET;
                y = rect.top + rect.height / 2;
                break;
            case 'right':
                x = rect.right + TOOLTIP_OFFSET;
                y = rect.top + rect.height / 2;
                break;
        }

        // Clamp to viewport
        if (finalPosition === 'top' || finalPosition === 'bottom') {
            const halfWidth = tooltipWidth / 2;
            if (x - halfWidth < VIEWPORT_PADDING) {
                x = VIEWPORT_PADDING + halfWidth;
            } else if (x + halfWidth > viewportWidth - VIEWPORT_PADDING) {
                x = viewportWidth - VIEWPORT_PADDING - halfWidth;
            }
        }

        return { x, y, position: finalPosition };
    }, [position]);

    const showTooltip = useCallback((e: React.MouseEvent) => {
        if (disabled || !content) return;

        // Get the actual target element's bounding rect
        const target = e.currentTarget as HTMLElement;
        const rect = target.getBoundingClientRect();
        setTargetRect(rect);

        timeoutRef.current = setTimeout(() => {
            const newCoords = calculatePosition(rect);
            if (newCoords) {
                setCoords(newCoords);
                setIsVisible(true);
            }
        }, delay);
    }, [calculatePosition, delay, disabled, content]);

    const hideTooltip = useCallback(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
        setIsVisible(false);
        setTargetRect(null);
    }, []);

    useEffect(() => {
        if (!isVisible || !targetRect) return;

        const handleScroll = () => hideTooltip();

        window.addEventListener('scroll', handleScroll, true);

        return () => {
            window.removeEventListener('scroll', handleScroll, true);
        };
    }, [isVisible, targetRect, hideTooltip]);

    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    const getTransformOrigin = () => {
        if (!coords) return 'center';
        switch (coords.position) {
            case 'top': return 'bottom center';
            case 'bottom': return 'top center';
            case 'left': return 'right center';
            case 'right': return 'left center';
        }
    };

    const getTransform = () => {
        if (!coords) return {};
        switch (coords.position) {
            case 'top':
                return { transform: 'translate(-50%, -100%)' };
            case 'bottom':
                return { transform: 'translate(-50%, 0%)' };
            case 'left':
                return { transform: 'translate(-100%, -50%)' };
            case 'right':
                return { transform: 'translate(0%, -50%)' };
        }
    };

    if (!content) {
        return <>{children}</>;
    }

    // Clone children to add event handlers directly
    const childElement = children as React.ReactElement;
    const enhancedChildren = React.cloneElement(childElement, {
        onMouseEnter: (e: React.MouseEvent) => {
            showTooltip(e);
            // Call original handler if exists
            if (childElement.props.onMouseEnter) {
                childElement.props.onMouseEnter(e);
            }
        },
        onMouseLeave: (e: React.MouseEvent) => {
            hideTooltip();
            // Call original handler if exists
            if (childElement.props.onMouseLeave) {
                childElement.props.onMouseLeave(e);
            }
        },
    });

    return (
        <>
            {enhancedChildren}

            {createPortal(
                <AnimatePresence>
                    {isVisible && coords && (
                        <motion.div
                            ref={tooltipRef}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            transition={{ duration: 0.15, ease: 'easeOut' }}
                            className={cn(
                                'fixed z-[9999] px-2.5 py-1.5 text-xs font-medium',
                                'bg-dark-800 dark:bg-dark-700 text-white dark:text-dark-100',
                                'rounded-lg shadow-lg',
                                'pointer-events-none select-none',
                                'max-w-xs whitespace-nowrap',
                                className
                            )}
                            style={{
                                left: coords.x,
                                top: coords.y,
                                transformOrigin: getTransformOrigin(),
                                ...getTransform(),
                            }}
                        >
                            {content}
                            {/* Arrow */}
                            <div
                                className={cn(
                                    'absolute w-2 h-2 bg-dark-800 dark:bg-dark-700 rotate-45',
                                    coords.position === 'top' && 'bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2',
                                    coords.position === 'bottom' && 'top-0 left-1/2 -translate-x-1/2 -translate-y-1/2',
                                    coords.position === 'left' && 'right-0 top-1/2 translate-x-1/2 -translate-y-1/2',
                                    coords.position === 'right' && 'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2'
                                )}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}
        </>
    );
}
