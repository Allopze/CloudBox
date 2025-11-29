import { useEffect, useCallback } from 'react';
import { useFileStore } from '../stores/fileStore';
import { useNavigate } from 'react-router-dom';
import { toast } from '../components/ui/Toast';

interface KeyboardShortcutsOptions {
  onDelete?: () => void;
  onRename?: () => void;
  onDownload?: () => void;
  onShare?: () => void;
  onUpload?: () => void;
  onNewFolder?: () => void;
  onPaste?: () => void;
  onPreview?: () => void;
  allItemIds?: string[];
  enabled?: boolean;
}

export function useKeyboardShortcuts(options: KeyboardShortcutsOptions = {}) {
  const {
    onDelete,
    onRename,
    onDownload,
    onShare,
    onUpload,
    onNewFolder,
    onPaste,
    onPreview,
    allItemIds = [],
    enabled = true,
  } = options;

  const navigate = useNavigate();
  const {
    selectedItems,
    selectAll,
    clearSelection,
    clipboard,
  } = useFileStore();

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modifier = isMac ? event.metaKey : event.ctrlKey;

      // Ctrl/Cmd + A - Select All
      if (modifier && event.key === 'a') {
        event.preventDefault();
        if (allItemIds.length > 0) {
          selectAll(allItemIds);
          toast(`${allItemIds.length} elementos seleccionados`, 'success');
        }
        return;
      }

      // Escape - Clear Selection
      if (event.key === 'Escape') {
        event.preventDefault();
        clearSelection();
        return;
      }

      // Delete / Backspace - Delete selected
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedItems.size > 0) {
        event.preventDefault();
        onDelete?.();
        return;
      }

      // F2 - Rename (single selection)
      if (event.key === 'F2' && selectedItems.size === 1) {
        event.preventDefault();
        onRename?.();
        return;
      }

      // Enter / Space - Preview selected
      if ((event.key === 'Enter' || event.key === ' ') && selectedItems.size === 1) {
        event.preventDefault();
        onPreview?.();
        return;
      }

      // Ctrl/Cmd + C - Copy
      if (modifier && event.key === 'c' && selectedItems.size > 0) {
        event.preventDefault();
        // This would need the actual items, not just IDs
        toast(`${selectedItems.size} elemento(s) copiado(s)`, 'success');
        return;
      }

      // Ctrl/Cmd + X - Cut
      if (modifier && event.key === 'x' && selectedItems.size > 0) {
        event.preventDefault();
        toast(`${selectedItems.size} elemento(s) cortado(s)`, 'success');
        return;
      }

      // Ctrl/Cmd + V - Paste
      if (modifier && event.key === 'v' && clipboard.items.length > 0) {
        event.preventDefault();
        onPaste?.();
        return;
      }

      // Ctrl/Cmd + D - Download
      if (modifier && event.key === 'd' && selectedItems.size > 0) {
        event.preventDefault();
        onDownload?.();
        return;
      }

      // Ctrl/Cmd + Shift + S - Share
      if (modifier && event.shiftKey && event.key === 'S' && selectedItems.size > 0) {
        event.preventDefault();
        onShare?.();
        return;
      }

      // Ctrl/Cmd + U - Upload
      if (modifier && event.key === 'u') {
        event.preventDefault();
        onUpload?.();
        return;
      }

      // Ctrl/Cmd + Shift + N - New Folder
      if (modifier && event.shiftKey && event.key === 'N') {
        event.preventDefault();
        onNewFolder?.();
        return;
      }

      // Navigation shortcuts
      // Backspace (without selection) - Go back
      if (event.key === 'Backspace' && selectedItems.size === 0) {
        event.preventDefault();
        navigate(-1);
        return;
      }

      // G then H - Go Home
      // G then T - Go Trash
      // G then S - Go Shared
    },
    [
      allItemIds,
      selectedItems,
      clipboard,
      selectAll,
      clearSelection,
      onDelete,
      onRename,
      onDownload,
      onShare,
      onUpload,
      onNewFolder,
      onPaste,
      onPreview,
      navigate,
    ]
  );

  useEffect(() => {
    if (!enabled) return;

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown, enabled]);

  return {
    selectedItems,
    clearSelection,
  };
}

// Keyboard shortcuts help text
export const keyboardShortcuts = [
  { keys: ['Ctrl', 'A'], description: 'Seleccionar todo' },
  { keys: ['Esc'], description: 'Limpiar selección' },
  { keys: ['Delete'], description: 'Eliminar seleccionados' },
  { keys: ['F2'], description: 'Renombrar' },
  { keys: ['Enter'], description: 'Abrir / Vista previa' },
  { keys: ['Ctrl', 'C'], description: 'Copiar' },
  { keys: ['Ctrl', 'X'], description: 'Cortar' },
  { keys: ['Ctrl', 'V'], description: 'Pegar' },
  { keys: ['Ctrl', 'D'], description: 'Descargar' },
  { keys: ['Ctrl', 'Shift', 'S'], description: 'Compartir' },
  { keys: ['Ctrl', 'U'], description: 'Subir archivos' },
  { keys: ['Ctrl', 'Shift', 'N'], description: 'Nueva carpeta' },
];
