import { useCallback, useRef } from 'react';
import { useGesture } from '@use-gesture/react';

export interface UseTouchGesturesOptions {
    /** Callback when zoom level changes via pinch */
    onZoomChange?: (zoom: number) => void;
    /** Callback when position changes via pan */
    onPositionChange?: (position: { x: number; y: number }) => void;
    /** Callback when swiping left (navigate next) */
    onSwipeLeft?: () => void;
    /** Callback when swiping right (navigate prev) */
    onSwipeRight?: () => void;
    /** Current zoom level (used to determine if swipe should nav or pan) */
    currentZoom?: number;
    /** Current position */
    currentPosition?: { x: number; y: number };
    /** Minimum zoom level */
    minZoom?: number;
    /** Maximum zoom level */
    maxZoom?: number;
    /** Minimum swipe velocity to trigger navigation */
    swipeVelocityThreshold?: number;
    /** Minimum swipe distance to trigger navigation */
    swipeDistanceThreshold?: number;
    /** Enable/disable gestures */
    enabled?: boolean;
}

export interface UseTouchGesturesReturn {
    /** Bind these props to your container element */
    bind: ReturnType<typeof useGesture>;
}

/**
 * Custom hook for touch gestures (pinch-to-zoom, swipe navigation, pan)
 * 
 * Usage:
 * ```tsx
 * const { bind } = useTouchGestures({
 *   onZoomChange: setZoom,
 *   onSwipeLeft: navigateNext,
 *   onSwipeRight: navigatePrev,
 *   currentZoom: zoom,
 * });
 * 
 * return <div {...bind()} className="touch-none">...</div>
 * ```
 */
export function useTouchGestures({
    onZoomChange,
    onPositionChange,
    onSwipeLeft,
    onSwipeRight,
    currentZoom = 1,
    currentPosition = { x: 0, y: 0 },
    minZoom = 0.25,
    maxZoom = 5,
    swipeVelocityThreshold = 0.3,
    swipeDistanceThreshold = 50,
    enabled = true,
}: UseTouchGesturesOptions = {}): UseTouchGesturesReturn {
    // Track initial values at gesture start
    const initialZoomRef = useRef(currentZoom);
    const initialPositionRef = useRef(currentPosition);
    const isPinchingRef = useRef(false);

    const clampZoom = useCallback(
        (zoom: number) => Math.max(minZoom, Math.min(maxZoom, zoom)),
        [minZoom, maxZoom]
    );

    const bind = useGesture(
        {
            // Pinch gesture for zooming
            onPinchStart: () => {
                initialZoomRef.current = currentZoom;
                isPinchingRef.current = true;
            },
            onPinch: ({ offset: [scale], memo }) => {
                if (!enabled) return memo;
                const newZoom = clampZoom(initialZoomRef.current * scale);
                onZoomChange?.(newZoom);
                return memo;
            },
            onPinchEnd: () => {
                isPinchingRef.current = false;
            },

            // Drag gesture for panning (when zoomed) or swiping (when not zoomed)
            onDragStart: () => {
                initialPositionRef.current = currentPosition;
            },
            onDrag: ({ movement: [mx, my], velocity: [vx], direction: [dx], last, touches }) => {
                if (!enabled) return;

                // Only handle single-finger drags (not during pinch)
                if (touches > 1 || isPinchingRef.current) {
                    return;
                }

                // If zoomed in, allow panning
                if (currentZoom > 1) {
                    onPositionChange?.({
                        x: initialPositionRef.current.x + mx,
                        y: initialPositionRef.current.y + my,
                    });
                    return;
                }

                // If not zoomed, detect swipe on gesture end
                if (last) {
                    const absMovement = Math.abs(mx);
                    const isSwipe = absMovement > swipeDistanceThreshold && vx > swipeVelocityThreshold;

                    if (isSwipe) {
                        if (dx > 0) {
                            // Swiped right = previous
                            onSwipeRight?.();
                        } else {
                            // Swiped left = next
                            onSwipeLeft?.();
                        }
                    }
                }
            },

            // Wheel gesture for zooming (mouse/trackpad)
            onWheel: ({ delta: [, dy], event, ctrlKey }) => {
                if (!enabled) return;
                // Let browser handle if ctrl is pressed (browser zoom)
                if (ctrlKey) return;

                event.preventDefault();
                const zoomDelta = dy > 0 ? -0.1 : 0.1;
                const newZoom = clampZoom(currentZoom + zoomDelta);
                onZoomChange?.(newZoom);
            },
        },
        {
            // Configuration
            drag: {
                filterTaps: true,
                threshold: 10,
            },
            pinch: {
                scaleBounds: { min: minZoom, max: maxZoom },
                rubberband: true,
            },
            wheel: {
                eventOptions: { passive: false },
            },
            enabled,
        }
    );

    return { bind };
}

export default useTouchGestures;
