import { useCallback, useRef } from 'react';

export interface UseLongPressOptions {
    delay?: number;
    onStart?: () => void;
    onCancel?: () => void;
}

/**
 * Hook for handling long-press gestures on touch devices.
 * Used to trigger context menus without requiring right-click.
 * 
 * @param onLongPress - Callback fired when long press is detected
 * @param options - Configuration options
 * @returns Touch event handlers to spread onto the element
 */
export function useLongPress(
    onLongPress: (position: { x: number; y: number }) => void,
    options: UseLongPressOptions = {}
) {
    const { delay = 500, onStart, onCancel } = options;

    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isLongPressRef = useRef(false);
    const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);

    const clear = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        isLongPressRef.current = false;
        touchStartPosRef.current = null;
    }, []);

    const onTouchStart = useCallback((e: React.TouchEvent) => {
        // Stop propagation to prevent parent context menus from triggering
        e.stopPropagation();

        const touch = e.touches[0];
        touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
        isLongPressRef.current = false;

        onStart?.();

        timerRef.current = setTimeout(() => {
            isLongPressRef.current = true;
            if (touchStartPosRef.current) {
                // Set a global flag to indicate we're handling a long-press context menu
                // This prevents the workzone context menu from also opening
                (window as Window & { __longPressActive?: boolean }).__longPressActive = true;

                // Prevent native context menu from appearing
                const preventContextMenu = (ev: Event) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    document.removeEventListener('contextmenu', preventContextMenu, true);
                };
                document.addEventListener('contextmenu', preventContextMenu, true);

                // Also remove after a short delay in case contextmenu doesn't fire
                setTimeout(() => {
                    document.removeEventListener('contextmenu', preventContextMenu, true);
                    // Reset the flag after a short delay
                    (window as Window & { __longPressActive?: boolean }).__longPressActive = false;
                }, 500);

                onLongPress(touchStartPosRef.current);
            }
        }, delay);
    }, [onLongPress, delay, onStart]);

    const onTouchMove = useCallback((e: React.TouchEvent) => {
        if (!touchStartPosRef.current) return;

        const touch = e.touches[0];
        const moveThreshold = 10; // pixels
        const dx = Math.abs(touch.clientX - touchStartPosRef.current.x);
        const dy = Math.abs(touch.clientY - touchStartPosRef.current.y);

        // Cancel if user moves finger too much (they're scrolling, not long pressing)
        if (dx > moveThreshold || dy > moveThreshold) {
            clear();
            onCancel?.();
        }
    }, [clear, onCancel]);

    const onTouchEnd = useCallback(() => {
        const wasLongPress = isLongPressRef.current;
        clear();
        onCancel?.();
        return wasLongPress;
    }, [clear, onCancel]);

    return {
        onTouchStart,
        onTouchMove,
        onTouchEnd,
        onTouchCancel: onTouchEnd,
        isLongPress: () => isLongPressRef.current,
    };
}

export default useLongPress;
