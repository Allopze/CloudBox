import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { createId, moveItem } from './utils';
import type { LandingConfigV1 } from '../../public/landing/types';

type Faq = LandingConfigV1['sections']['faq'];

export default function FaqEditor({ faq, onChange }: { faq: Faq; onChange: (next: Faq) => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-dark-700 dark:text-dark-300">Preguntas</div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          icon={<Plus className="w-4 h-4" />}
          onClick={() =>
            onChange({
              ...faq,
              items: [...faq.items, { id: createId('faq'), question: 'Nueva pregunta', answer: 'Nueva respuesta.' }],
            })
          }
        >
          Añadir FAQ
        </Button>
      </div>

      <div className="space-y-3">
        {faq.items.map((item, idx) => (
          <div key={item.id} className="rounded-2xl border border-dark-200 dark:border-dark-700 bg-white dark:bg-dark-800 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="text-sm font-semibold text-dark-900 dark:text-white">#{idx + 1}</div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onChange({ ...faq, items: moveItem(faq.items, idx, idx - 1) })}
                  disabled={idx === 0}
                  aria-label="Mover arriba"
                  icon={<ArrowUp className="w-4 h-4" />}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onChange({ ...faq, items: moveItem(faq.items, idx, idx + 1) })}
                  disabled={idx === faq.items.length - 1}
                  aria-label="Mover abajo"
                  icon={<ArrowDown className="w-4 h-4" />}
                />
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={() => onChange({ ...faq, items: faq.items.filter((q) => q.id !== item.id) })}
                  aria-label="Eliminar"
                  icon={<Trash2 className="w-4 h-4" />}
                />
              </div>
            </div>

            <div className="mt-4 space-y-4">
              <Input
                label="Pregunta"
                value={item.question}
                onChange={(e) =>
                  onChange({
                    ...faq,
                    items: faq.items.map((q) => (q.id === item.id ? { ...q, question: e.target.value } : q)),
                  })
                }
              />
              <div>
                <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">Respuesta</label>
                <textarea
                  className="input w-full h-28 resize-none"
                  value={item.answer}
                  onChange={(e) =>
                    onChange({
                      ...faq,
                      items: faq.items.map((q) => (q.id === item.id ? { ...q, answer: e.target.value } : q)),
                    })
                  }
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

