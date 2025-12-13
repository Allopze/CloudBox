import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import IconSelect from './IconSelect';
import { createId, moveItem } from './utils';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import type { LandingCard } from '../../public/landing/types';

export default function CardListEditor({
  title,
  items,
  onChange,
}: {
  title: string;
  items: LandingCard[];
  onChange: (items: LandingCard[]) => void;
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
            onChange([
              ...items,
              { id: createId('card'), icon: 'FileText', title: 'Nuevo', description: 'Descripción' },
            ])
          }
        >
          Añadir tarjeta
        </Button>
      </div>

      <div className="space-y-3">
        {items.map((item, idx) => (
          <div key={item.id} className="rounded-2xl border border-dark-200 dark:border-dark-700 bg-white dark:bg-dark-800 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="text-sm font-semibold text-dark-900 dark:text-white">
                #{idx + 1}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onChange(moveItem(items, idx, idx - 1))}
                  disabled={idx === 0}
                  aria-label="Mover arriba"
                  icon={<ArrowUp className="w-4 h-4" />}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onChange(moveItem(items, idx, idx + 1))}
                  disabled={idx === items.length - 1}
                  aria-label="Mover abajo"
                  icon={<ArrowDown className="w-4 h-4" />}
                />
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={() => onChange(items.filter((c) => c.id !== item.id))}
                  aria-label="Eliminar"
                  icon={<Trash2 className="w-4 h-4" />}
                />
              </div>
            </div>

            <div className="mt-4 grid md:grid-cols-3 gap-4">
              <IconSelect
                label="Icono"
                value={item.icon}
                onChange={(value) => onChange(items.map((c) => (c.id === item.id ? { ...c, icon: value } : c)))}
              />
              <div className="md:col-span-2">
                <Input
                  label="Título"
                  value={item.title}
                  onChange={(e) => onChange(items.map((c) => (c.id === item.id ? { ...c, title: e.target.value } : c)))}
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">Descripción</label>
              <textarea
                className="input w-full h-28 resize-none"
                value={item.description}
                onChange={(e) =>
                  onChange(items.map((c) => (c.id === item.id ? { ...c, description: e.target.value } : c)))
                }
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

