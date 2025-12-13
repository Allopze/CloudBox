import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

export default function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-dark-200 dark:border-dark-700 bg-white dark:bg-dark-800 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left"
        aria-expanded={open}
      >
        <div className="font-medium text-dark-900 dark:text-dark-100">{question}</div>
        <ChevronDown className={cn('h-5 w-5 text-dark-500 transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="px-5 pb-5 text-sm leading-relaxed text-dark-600 dark:text-dark-300">{answer}</div>}
    </div>
  );
}

