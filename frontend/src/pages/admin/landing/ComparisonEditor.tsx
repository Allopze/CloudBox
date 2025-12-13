import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import StringListEditor from './StringListEditor';
import { createId, moveItem } from './utils';
import type { LandingConfigV1 } from '../../public/landing/types';

type Comparison = LandingConfigV1['sections']['comparison'];

export default function ComparisonEditor({
  comparison,
  onChange,
}: {
  comparison: Comparison;
  onChange: (next: Comparison) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <div className="text-sm font-semibold text-dark-900 dark:text-white">Columna: Nube</div>
          <div className="mt-4 space-y-4">
            <Input
              label="Título"
              value={comparison.cloud.title}
              onChange={(e) => onChange({ ...comparison, cloud: { ...comparison.cloud, title: e.target.value } })}
            />
            <div>
              <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">Descripción</label>
              <textarea
                className="input w-full h-24 resize-none"
                value={comparison.cloud.description}
                onChange={(e) => onChange({ ...comparison, cloud: { ...comparison.cloud, description: e.target.value } })}
              />
            </div>
            <StringListEditor
              label="Bullets"
              items={comparison.cloud.bullets}
              onChange={(bullets) => onChange({ ...comparison, cloud: { ...comparison.cloud, bullets } })}
              placeholder="Ej: Empieza en minutos"
            />
          </div>
        </div>

        <div className="card p-5">
          <div className="text-sm font-semibold text-dark-900 dark:text-white">Columna: Autohospedado</div>
          <div className="mt-4 space-y-4">
            <Input
              label="Título"
              value={comparison.selfHosted.title}
              onChange={(e) => onChange({ ...comparison, selfHosted: { ...comparison.selfHosted, title: e.target.value } })}
            />
            <div>
              <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">Descripción</label>
              <textarea
                className="input w-full h-24 resize-none"
                value={comparison.selfHosted.description}
                onChange={(e) =>
                  onChange({ ...comparison, selfHosted: { ...comparison.selfHosted, description: e.target.value } })
                }
              />
            </div>
            <StringListEditor
              label="Bullets"
              items={comparison.selfHosted.bullets}
              onChange={(bullets) => onChange({ ...comparison, selfHosted: { ...comparison.selfHosted, bullets } })}
              placeholder="Ej: Datos en tu servidor"
            />
          </div>
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-dark-900 dark:text-white">Tabla comparativa</div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            icon={<Plus className="w-4 h-4" />}
            onClick={() =>
              onChange({
                ...comparison,
                rows: [
                  ...comparison.rows,
                  { id: createId('row'), label: 'Nueva fila', cloud: '—', selfHosted: '—' },
                ],
              })
            }
          >
            Añadir fila
          </Button>
        </div>

        <div className="mt-4 space-y-3">
          {comparison.rows.map((row, idx) => (
            <div key={row.id} className="rounded-2xl border border-dark-200 dark:border-dark-700 bg-white dark:bg-dark-800 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm font-semibold text-dark-900 dark:text-white">#{idx + 1}</div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onChange({ ...comparison, rows: moveItem(comparison.rows, idx, idx - 1) })}
                    disabled={idx === 0}
                    aria-label="Mover arriba"
                    icon={<ArrowUp className="w-4 h-4" />}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onChange({ ...comparison, rows: moveItem(comparison.rows, idx, idx + 1) })}
                    disabled={idx === comparison.rows.length - 1}
                    aria-label="Mover abajo"
                    icon={<ArrowDown className="w-4 h-4" />}
                  />
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() => onChange({ ...comparison, rows: comparison.rows.filter((r) => r.id !== row.id) })}
                    aria-label="Eliminar"
                    icon={<Trash2 className="w-4 h-4" />}
                  />
                </div>
              </div>

              <div className="mt-4 grid md:grid-cols-3 gap-4">
                <Input
                  label="Característica"
                  value={row.label}
                  onChange={(e) =>
                    onChange({
                      ...comparison,
                      rows: comparison.rows.map((r) => (r.id === row.id ? { ...r, label: e.target.value } : r)),
                    })
                  }
                />
                <Input
                  label="Nube"
                  value={row.cloud}
                  onChange={(e) =>
                    onChange({
                      ...comparison,
                      rows: comparison.rows.map((r) => (r.id === row.id ? { ...r, cloud: e.target.value } : r)),
                    })
                  }
                />
                <Input
                  label="Autohospedado"
                  value={row.selfHosted}
                  onChange={(e) =>
                    onChange({
                      ...comparison,
                      rows: comparison.rows.map((r) => (r.id === row.id ? { ...r, selfHosted: e.target.value } : r)),
                    })
                  }
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

