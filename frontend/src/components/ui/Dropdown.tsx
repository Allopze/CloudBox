import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';


interface DropdownProps {
  trigger: ReactNode;
  children: ReactNode;
  align?: 'left' | 'right';
}

type DropdownContextValue = {
  close: () => void;
  focusedIndex: number;
  setFocusedIndex: (index: number) => void;
  registerItem: (id: string, index: number) => void;
  unregisterItem: (id: string) => void;
};

const DropdownContext = createContext<DropdownContextValue | null>(null);

export default function Dropdown({ trigger, children, align = 'left' }: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [openUpward, setOpenUpward] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [typeahead, setTypeahead] = useState('');
  const typeaheadTimeoutRef = useRef<number | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef<Map<string, { index: number; element: HTMLButtonElement | null }>>(new Map());
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const reducedMotion = useReducedMotion();

  const close = useCallback(() => {
    setIsOpen(false);
    setFocusedIndex(-1);
    setTypeahead('');
    // Restore focus to trigger
    if (previousActiveElement.current) {
      previousActiveElement.current.focus();
    }
  }, []);

  const registerItem = useCallback((id: string, index: number) => {
    itemsRef.current.set(id, { index, element: null });
  }, []);

  const unregisterItem = useCallback((id: string) => {
    itemsRef.current.delete(id);
  }, []);

  // Get all menu items
  const getMenuItems = useCallback((): HTMLButtonElement[] => {
    if (!menuRef.current) return [];
    return Array.from(
      menuRef.current.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])')
    );
  }, []);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;

    const rect = triggerRef.current.getBoundingClientRect();
    const menuRect = menuRef.current?.getBoundingClientRect();
    const menuWidth = menuRect?.width ?? 200;
    const menuHeight = menuRect?.height ?? 200;
    const gap = 8;
    const padding = 8;

    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const shouldOpenUpward = spaceBelow < menuHeight + gap && spaceAbove > spaceBelow;

    setOpenUpward((prev) => (prev === shouldOpenUpward ? prev : shouldOpenUpward));

    let top = shouldOpenUpward ? rect.top - menuHeight - gap : rect.bottom + gap;
    let left = align === 'right' ? rect.right - menuWidth : rect.left;

    left = Math.max(padding, Math.min(left, window.innerWidth - menuWidth - padding));
    top = Math.max(padding, Math.min(top, window.innerHeight - menuHeight - padding));

    setPosition((prev) => (prev.top === top && prev.left === left ? prev : { top, left }));
  }, [align]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isOpen) return;

    const items = getMenuItems();
    const itemCount = items.length;
    if (itemCount === 0) return;

    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        close();
        break;

      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex((prev) => {
          const next = prev < itemCount - 1 ? prev + 1 : 0;
          items[next]?.focus();
          return next;
        });
        break;

      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex((prev) => {
          const next = prev > 0 ? prev - 1 : itemCount - 1;
          items[next]?.focus();
          return next;
        });
        break;

      case 'Home':
        e.preventDefault();
        setFocusedIndex(0);
        items[0]?.focus();
        break;

      case 'End':
        e.preventDefault();
        setFocusedIndex(itemCount - 1);
        items[itemCount - 1]?.focus();
        break;

      case 'Enter':
      case ' ':
        // Let the focused item handle its own click
        if (focusedIndex >= 0 && items[focusedIndex]) {
          e.preventDefault();
          items[focusedIndex].click();
        }
        break;

      case 'Tab':
        // Close dropdown on tab
        close();
        break;

      default:
        // Typeahead search - single character matching
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();

          // Append to typeahead buffer
          const newTypeahead = typeahead + e.key.toLowerCase();
          setTypeahead(newTypeahead);

          // Clear typeahead after delay
          if (typeaheadTimeoutRef.current) {
            window.clearTimeout(typeaheadTimeoutRef.current);
          }
          typeaheadTimeoutRef.current = window.setTimeout(() => {
            setTypeahead('');
          }, 500);

          // Find matching item
          const startIndex = focusedIndex >= 0 ? focusedIndex + 1 : 0;

          // Search from current position to end, then from start
          for (let i = 0; i < itemCount; i++) {
            const index = (startIndex + i) % itemCount;
            const item = items[index];
            const text = item.textContent?.toLowerCase() || '';

            if (text.startsWith(newTypeahead)) {
              setFocusedIndex(index);
              item.focus();
              break;
            }
          }
        }
        break;
    }
  }, [isOpen, close, getMenuItems, focusedIndex, typeahead]);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node) &&
        menuRef.current &&
        !menuRef.current.contains(e.target as Node)
      ) {
        close();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, close, handleKeyDown]);

  // Focus first item when opening
  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current = document.activeElement as HTMLElement;
      // Delay focus to allow menu to render
      requestAnimationFrame(() => {
        const items = getMenuItems();
        if (items.length > 0) {
          setFocusedIndex(0);
          items[0]?.focus();
        }
      });
    }
  }, [isOpen, getMenuItems]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    updatePosition();
  }, [isOpen, updatePosition, children]);

  useEffect(() => {
    if (!isOpen) return;

    let rafId: number | null = null;
    const scheduleUpdate = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        updatePosition();
      });
    };

    window.addEventListener('resize', scheduleUpdate);
    window.addEventListener('scroll', scheduleUpdate, true);

    return () => {
      window.removeEventListener('resize', scheduleUpdate);
      window.removeEventListener('scroll', scheduleUpdate, true);
      if (rafId !== null) window.cancelAnimationFrame(rafId);
    };
  }, [isOpen, updatePosition]);

  // Cleanup typeahead timeout
  useEffect(() => {
    return () => {
      if (typeaheadTimeoutRef.current) {
        window.clearTimeout(typeaheadTimeoutRef.current);
      }
    };
  }, []);

  const handleTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setIsOpen(true);
    }
  };

  // Animation variants respecting reduced motion
  const motionVariants = reducedMotion
    ? {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: { duration: 0.1 },
    }
    : {
      initial: { opacity: 0, y: openUpward ? 10 : -10, scale: 0.95 },
      animate: { opacity: 1, y: 0, scale: 1 },
      exit: { opacity: 0, y: openUpward ? 10 : -10, scale: 0.95 },
      transition: { duration: 0.15, ease: 'easeOut' },
    };

  return (
    <div className="relative" ref={triggerRef}>
      <div
        onClick={() => setIsOpen((prev) => !prev)}
        onKeyDown={handleTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        tabIndex={0}
        role="button"
      >
        {trigger}
      </div>
      {createPortal(
        <AnimatePresence>
          {isOpen && (
            <DropdownContext.Provider value={{ close, focusedIndex, setFocusedIndex, registerItem, unregisterItem }}>
              <motion.div
                ref={menuRef}
                role="listbox"
                aria-orientation="vertical"
                aria-activedescendant={focusedIndex >= 0 ? `dropdown-item-${focusedIndex}` : undefined}
                {...motionVariants}
                style={{ top: position.top, left: position.left }}
                className="fixed py-2 bg-white dark:bg-dark-800 rounded-xl shadow-xl border border-dark-200 dark:border-dark-700 min-w-[200px] z-[9999]"
              >
                {children}
              </motion.div>
            </DropdownContext.Provider>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}

interface DropdownItemProps {
  children: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  closeOnClick?: boolean;
  id?: string;
}

export function DropdownItem({ children, onClick, danger, disabled, closeOnClick = true, id }: DropdownItemProps) {
  const dropdown = useContext(DropdownContext);
  const itemRef = useRef<HTMLButtonElement>(null);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    onClick?.();
    if (closeOnClick) dropdown?.close();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled) {
        onClick?.();
        if (closeOnClick) dropdown?.close();
      }
    }
  };

  return (
    <button
      ref={itemRef}
      id={id}
      role="menuitem"
      tabIndex={-1}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-2 text-sm text-left transition-colors',
        'focus:outline-none focus:bg-dark-100 dark:focus:bg-dark-700',
        danger
          ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 focus:bg-red-50 dark:focus:bg-red-900/20'
          : 'text-dark-700 dark:text-dark-300 hover:bg-dark-100 dark:hover:bg-dark-700',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      {children}
    </button>
  );
}

export function DropdownDivider() {
  return <div role="separator" className="my-2 border-t" />;
}
