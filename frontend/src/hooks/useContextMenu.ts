import { useState, useCallback, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

interface ContextMenuState {
    position: { x: number; y: number } | null;
}

export function useContextMenu() {
    const [state, setState] = useState<ContextMenuState>({ position: null });
    const location = useLocation();

    // Close menu when route changes
    useEffect(() => {
        setState({ position: null });
    }, [location.pathname, location.search]);

    const handleContextMenu = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setState({ position: { x: e.clientX, y: e.clientY } });
    }, []);

    const close = useCallback(() => {
        setState({ position: null });
    }, []);

    const open = useCallback((x: number, y: number) => {
        setState({ position: { x, y } });
    }, []);

    return {
        position: state.position,
        isOpen: state.position !== null,
        handleContextMenu,
        close,
        open,
    };
}

export default useContextMenu;
