import { useState, useEffect } from 'react';

/**
 * Hook to detect if the current device is a touch-primary device.
 * Returns true if the device doesn't support hover (touch screens).
 */
export function useTouchDevice(): boolean {
    const [isTouchDevice, setIsTouchDevice] = useState(false);

    useEffect(() => {
        // Check if device has no hover capability (touch-primary)
        const mediaQuery = window.matchMedia('(hover: none) and (pointer: coarse)');
        setIsTouchDevice(mediaQuery.matches);

        const handler = (e: MediaQueryListEvent) => setIsTouchDevice(e.matches);
        mediaQuery.addEventListener('change', handler);

        return () => mediaQuery.removeEventListener('change', handler);
    }, []);

    return isTouchDevice;
}

export default useTouchDevice;
