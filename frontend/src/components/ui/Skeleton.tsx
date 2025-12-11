import { cn } from '../../lib/utils';

interface SkeletonProps {
    className?: string;
}

/**
 * Basic Skeleton component with shimmer animation
 */
export function Skeleton({ className }: SkeletonProps) {
    return (
        <div
            className={cn(
                'bg-gradient-to-r from-dark-200 via-dark-100 to-dark-200 dark:from-dark-700 dark:via-dark-600 dark:to-dark-700 rounded',
                'bg-[length:200%_100%] animate-shimmer',
                className
            )}
        />
    );
}

/**
 * Skeleton card matching FileCard/FolderCard dimensions
 */
export function SkeletonCard({ view = 'grid' }: { view?: 'grid' | 'list' }) {
    if (view === 'list') {
        return (
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl">
                <Skeleton className="w-10 h-10 rounded-lg flex-shrink-0" />
                <div className="flex-1 min-w-0 space-y-1.5">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                </div>
            </div>
        );
    }

    // Minimalist vertical card skeleton
    return (
        <div className="rounded-xl overflow-hidden">
            {/* Thumbnail area */}
            <Skeleton className="w-full aspect-square rounded-xl" />
            {/* Content area */}
            <div className="p-3 pt-2.5 space-y-1.5">
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-3 w-2/5" />
                <Skeleton className="h-3 w-1/3" />
            </div>
        </div>
    );
}

/**
 * Grid of skeleton cards for loading states
 */
export function SkeletonGrid({ count = 8, view = 'grid' }: { count?: number; view?: 'grid' | 'list' }) {
    return (
        <div className={cn(
            view === 'grid'
                ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2'
                : 'flex flex-col gap-1'
        )}>
            {Array.from({ length: count }).map((_, i) => (
                <SkeletonCard key={i} view={view} />
            ))}
        </div>
    );
}

export default Skeleton;
