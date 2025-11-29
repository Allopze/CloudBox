import Modal from './Modal';
import { keyboardShortcuts } from '../../hooks/useKeyboardShortcuts';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function KeyboardShortcutsModal({
  isOpen,
  onClose,
}: KeyboardShortcutsModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Atajos de teclado" size="md">
      <div className="space-y-1">
        {keyboardShortcuts.map((shortcut, index) => (
          <div
            key={index}
            className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-dark-50 dark:hover:bg-dark-700"
          >
            <span className="text-dark-700 dark:text-dark-300">
              {shortcut.description}
            </span>
            <div className="flex items-center gap-1">
              {shortcut.keys.map((key, keyIndex) => (
                <span key={keyIndex}>
                  <kbd className="px-2 py-1 text-xs font-semibold text-dark-800 bg-dark-100 dark:text-dark-200 dark:bg-dark-700 border border-dark-300 dark:border-dark-600 rounded shadow-sm">
                    {key}
                  </kbd>
                  {keyIndex < shortcut.keys.length - 1 && (
                    <span className="text-dark-400 mx-0.5">+</span>
                  )}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 pt-4 border-t border-dark-200 dark:border-dark-700">
        <p className="text-xs text-dark-500 dark:text-dark-400">
          Nota: En Mac, usa <kbd className="px-1.5 py-0.5 text-xs font-semibold text-dark-800 bg-dark-100 dark:text-dark-200 dark:bg-dark-700 border border-dark-300 dark:border-dark-600 rounded">⌘</kbd> en lugar de <kbd className="px-1.5 py-0.5 text-xs font-semibold text-dark-800 bg-dark-100 dark:text-dark-200 dark:bg-dark-700 border border-dark-300 dark:border-dark-600 rounded">Ctrl</kbd>
        </p>
      </div>
    </Modal>
  );
}
