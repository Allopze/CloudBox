import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import { createId, moveItem } from './utils';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import type { LandingStep } from '../../public/landing/types';

export default function StepListEditor({
  title,
  steps,
  onChange,
}: {
  title: string;
  steps: LandingStep[];
  onChange: (steps: LandingStep[]) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-dark-700 dark:text-dark-300">{title}</div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          icon={<Plus className="w-4 h-4" />}
          onClick={() =>
            onChange([...steps, { id: createId('step'), title: 'Nuevo paso', description: 'Describe este paso.' }])
          }
        >
          Añadir paso
        </Button>
      </div>

      <div className="space-y-3">
        {steps.map((step, idx) => (
          <div key={step.id} className="rounded-2xl border border-dark-200 dark:border-dark-700 bg-white dark:bg-dark-800 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="text-sm font-semibold text-dark-900 dark:text-white">
                {idx + 1}.
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onChange(moveItem(steps, idx, idx - 1))}
                  disabled={idx === 0}
                  aria-label="Mover arriba"
                  icon={<ArrowUp className="w-4 h-4" />}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onChange(moveItem(steps, idx, idx + 1))}
                  disabled={idx === steps.length - 1}
                  aria-label="Mover abajo"
                  icon={<ArrowDown className="w-4 h-4" />}
                />
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={() => onChange(steps.filter((s) => s.id !== step.id))}
                  aria-label="Eliminar"
                  icon={<Trash2 className="w-4 h-4" />}
                />
              </div>
            </div>

            <div className="mt-4 space-y-4">
              <Input
                label="Título"
                value={step.title}
                onChange={(e) => onChange(steps.map((s) => (s.id === step.id ? { ...s, title: e.target.value } : s)))}
              />
              <div>
                <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">Descripción</label>
                <textarea
                  className="input w-full h-24 resize-none"
                  value={step.description}
                  onChange={(e) =>
                    onChange(steps.map((s) => (s.id === step.id ? { ...s, description: e.target.value } : s)))
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

