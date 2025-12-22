import { useRef, useCallback, useMemo, ReactNode, CSSProperties, useEffect, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useReducedMotion } from 'framer-motion';
import { cn } from '../../lib/utils';

interface VirtualizedGridProps<T> {
    items: T[];
    renderItem: (item: T, index: number, style: CSSProperties) => ReactNode;
    viewMode: 'grid' | 'list';
    className?: string;
    scrollElementId?: string;
    estimateGridItemHeight?: number;
    estimateListItemHeight?: number;
    gridColumns?: {
        default: number;
        md?: number;
        lg?: number;
        xl?: number;
    };
    gap?: number;
    overscan?: number;
}

/**
 * VirtualizedGrid - A virtualized grid/list component for large datasets.
 * Uses @tanstack/react-virtual for efficient rendering of only visible items.
 */
export default function VirtualizedGrid<T extends { id: string }>({
    items,
    renderItem,
    viewMode,
    className,
    scrollElementId,
    estimateGridItemHeight = 270,
    estimateListItemHeight = 56,
    gridColumns = { default: 2, md: 4, lg: 5, xl: 6 },
    gap = 12,
    overscan = 5,
}: VirtualizedGridProps<T>) {
    const parentRef = useRef<HTMLDivElement>(null);
    const reducedMotion = useReducedMotion();

    // Ensure we re-render once the scroll element exists.
    // In some render paths, @tanstack/react-virtual can start with a null scroll element
    // and produce zero virtual items unless something triggers a subsequent render.
    const [scrollReady, setScrollReady] = useState(false);
    useEffect(() => {
        if (scrollReady) return;

        // If using an external scroll container, wait for it to exist.
        if (scrollElementId) {
            const el = document.getElementById(scrollElementId);
            if (el) setScrollReady(true);
            return;
        }

        if (parentRef.current) {
            setScrollReady(true);
        }
    }, [scrollReady, scrollElementId]);

    const getScrollElement = useCallback(() => {
        if (scrollElementId) {
            return document.getElementById(scrollElementId);
        }
        return parentRef.current;
    }, [scrollElementId]);

    const getColumnCountForWidth = useCallback((width: number) => {
        if (viewMode === 'list') return 1;
        // Tailwind breakpoints: md=768, lg=1024, xl=1280
        if (width >= 1280) return gridColumns.xl || gridColumns.lg || gridColumns.default;
        if (width >= 1024) return gridColumns.lg || gridColumns.default;
        if (width >= 768) return gridColumns.md || gridColumns.default;
        return gridColumns.default;
    }, [viewMode, gridColumns]);

    const [columnCount, setColumnCount] = useState(() => (viewMode === 'list' ? 1 : gridColumns.default));

    // Keep column count in sync with container width.
    // This also prevents mismatches between the number of rows we virtualize vs. the columns we actually render.
    useEffect(() => {
        if (viewMode === 'list') {
            setColumnCount(1);
            return;
        }

        const el = parentRef.current;
        if (!el) return;

        const update = () => {
            const next = getColumnCountForWidth(el.clientWidth);
            setColumnCount((prev) => (prev === next ? prev : next));
        };

        update();
        const ro = new ResizeObserver(() => update());
        ro.observe(el);
        return () => ro.disconnect();
    }, [viewMode, gridColumns, getColumnCountForWidth]);

    const rowCount = useMemo(() => Math.ceil(items.length / columnCount), [items.length, columnCount]);

    const rowVirtualizer = useVirtualizer({
        count: rowCount,
        getScrollElement,
        estimateSize: useCallback(() => {
            return viewMode === 'list' ? estimateListItemHeight : estimateGridItemHeight;
        }, [viewMode, estimateGridItemHeight, estimateListItemHeight]),
        overscan,
        // Recalculate on resize
        observeElementRect: useCallback((instance: any, cb: (rect: DOMRectReadOnly) => void) => {
            const scrollEl = getScrollElement();
            if (!scrollEl) return;
            const resizeObserver = new ResizeObserver((entries) => {
                const entry = entries[0];
                if (entry) {
                    cb(entry.contentRect as DOMRectReadOnly);
                    // Force recalculation when container size changes
                    instance.measure();
                }
            });
            resizeObserver.observe(scrollEl);
            return () => resizeObserver.disconnect();
        }, [getScrollElement]),
    });

    // When columns/items/view changes, the virtualized total size changes.
    useEffect(() => {
        rowVirtualizer.measure();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [columnCount, items.length, viewMode]);

    // Calculate animation delay for stagger effect (respects reduced motion)
    const getAnimationDelay = useCallback((index: number): CSSProperties => {
        if (reducedMotion) return {};
        const delay = Math.min(index * 0.02, 0.3); // Cap at 300ms
        return {
            animationDelay: `${delay}s`,
        };
    }, [reducedMotion]);

    const virtualRows = rowVirtualizer.getVirtualItems();
    const totalHeight = rowVirtualizer.getTotalSize();

    // Get items for a specific row
    const getRowItems = useCallback((rowIndex: number) => {
        const startIndex = rowIndex * columnCount;
        const endIndex = Math.min(startIndex + columnCount, items.length);
        return items.slice(startIndex, endIndex).map((item, colIndex) => ({
            item,
            globalIndex: startIndex + colIndex,
        }));
    }, [items, columnCount]);

    if (items.length === 0) {
        return null;
    }

    // Fallback: if the scroll element isn't ready yet (or the virtualizer hasn't produced rows),
    // render a simple non-virtualized layout to avoid a blank page.
    if (!scrollReady || virtualRows.length === 0) {
        if (viewMode === 'list') {
            return (
                <div className={cn('w-full flex flex-col', className)}>
                    {items.map((item, index) => (
                        <div key={item.id}>{renderItem(item, index, {})}</div>
                    ))}
                </div>
            );
        }

        return (
            <div
                className={cn('w-full grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6', className)}
                style={{ gap: `${gap}px` }}
            >
                {items.map((item, index) => (
                    <div key={item.id}>{renderItem(item, index, {})}</div>
                ))}
            </div>
        );
    }

    return (
        <div
            ref={parentRef}
            className={cn(
                scrollElementId ? 'w-full' : 'w-full overflow-y-auto overflow-x-hidden',
                className
            )}
        >
            <div
                style={{
                    height: `${totalHeight + Math.max(24, gap * 4)}px`,
                    width: '100%',
                    position: 'relative',
                    paddingBottom: `${Math.max(24, gap * 4)}px`,
                }}
            >
                {virtualRows.map((virtualRow) => {
                    const rowItems = getRowItems(virtualRow.index);
                    const cols = columnCount;

                    return (
                        <div
                            key={virtualRow.key}
                            style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                width: '100%',
                                height: `${virtualRow.size}px`,
                                transform: `translateY(${virtualRow.start}px)`,
                                paddingBottom: `${gap}px`,
                            }}
                        >
                            <div
                                className={cn(
                                    viewMode === 'grid'
                                        ? 'grid h-full'
                                        : 'flex flex-col'
                                )}
                                style={viewMode === 'grid' ? {
                                    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                                    gap: `${gap}px`,
                                } : {
                                    gap: `${gap / 3}px`,
                                }}
                            >
                                {rowItems.map(({ item, globalIndex }) => {
                                    const animStyle = getAnimationDelay(globalIndex);
                                    return (
                                        <div key={item.id} className="h-full">
                                            {renderItem(item, globalIndex, animStyle)}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/**
 * Simple virtualized list for use when virtualization is needed but 
 * the parent manages its own scroll container.
 */
export function VirtualizedList<T extends { id: string }>({
    items,
    renderItem,
    estimateItemHeight = 56,
    className,
    overscan = 5,
}: {
    items: T[];
    renderItem: (item: T, index: number) => ReactNode;
    estimateItemHeight?: number;
    className?: string;
    overscan?: number;
}) {
    const parentRef = useRef<HTMLDivElement>(null);

    const rowVirtualizer = useVirtualizer({
        count: items.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => estimateItemHeight,
        overscan,
    });

    const virtualItems = rowVirtualizer.getVirtualItems();
    const totalHeight = rowVirtualizer.getTotalSize();

    if (items.length === 0) {
        return null;
    }

    return (
        <div
            ref={parentRef}
            className={cn('w-full overflow-auto', className)}
            style={{ contain: 'strict' }}
        >
            <div
                style={{
                    height: `${totalHeight}px`,
                    width: '100%',
                    position: 'relative',
                }}
            >
                {virtualItems.map((virtualItem) => (
                    <div
                        key={virtualItem.key}
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            transform: `translateY(${virtualItem.start}px)`,
                        }}
                    >
                        {renderItem(items[virtualItem.index], virtualItem.index)}
                    </div>
                ))}
            </div>
        </div>
    );
}
