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
import { motion, AnimatePresence } from 'framer-motion';

interface DropdownProps {
  trigger: ReactNode;
  children: ReactNode;
  align?: 'left' | 'right';
}

type DropdownContextValue = {
  close: () => void;
};

const DropdownContext = createContext<DropdownContextValue | null>(null);

export default function Dropdown({ trigger, children, align = 'left' }: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [openUpward, setOpenUpward] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setIsOpen(false), []);

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
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, close]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, close]);

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

  return (
    <div className="relative" ref={triggerRef}>
      <div onClick={() => setIsOpen((prev) => !prev)}>{trigger}</div>
      {createPortal(
        <AnimatePresence>
          {isOpen && (
            <DropdownContext.Provider value={{ close }}>
              <motion.div
                ref={menuRef}
                initial={{ opacity: 0, y: openUpward ? 10 : -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: openUpward ? 10 : -10, scale: 0.95 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
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
}

export function DropdownItem({ children, onClick, danger, disabled, closeOnClick = true }: DropdownItemProps) {
  const dropdown = useContext(DropdownContext);

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        if (disabled) return;
        onClick?.();
        if (closeOnClick) dropdown?.close();
      }}
      disabled={disabled}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-2 text-sm text-left transition-colors',
        danger
          ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20'
          : 'text-dark-700 dark:text-dark-300 hover:bg-dark-100 dark:hover:bg-dark-700',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      {children}
    </button>
  );
}

export function DropdownDivider() {
  return <div className="my-2 border-t" />;
}
