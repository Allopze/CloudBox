import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import { moveItem } from './utils';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';

export default function StringListEditor({
  label,
  items,
  onChange,
  placeholder,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-dark-700 dark:text-dark-300">{label}</div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          icon={<Plus className="w-4 h-4" />}
          onClick={() => onChange([...(items || []), ''])}
        >
          Añadir
        </Button>
      </div>

      <div className="space-y-3">
        {items.map((value, idx) => (
          <div key={`${idx}-${value}`} className="rounded-xl border border-dark-200 dark:border-dark-700 p-4">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <Input
                  label={`#${idx + 1}`}
                  value={value}
                  onChange={(e) => {
                    const next = items.slice();
                    next[idx] = e.target.value;
                    onChange(next);
                  }}
                  placeholder={placeholder}
                />
              </div>
              <div className="flex flex-col gap-2 pt-6">
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
                  onClick={() => onChange(items.filter((_, i) => i !== idx))}
                  aria-label="Eliminar"
                  icon={<Trash2 className="w-4 h-4" />}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

