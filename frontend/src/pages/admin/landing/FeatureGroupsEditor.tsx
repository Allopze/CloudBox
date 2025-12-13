import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import IconSelect from './IconSelect';
import { createId, moveItem } from './utils';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import type { LandingFeatureGroup } from '../../public/landing/types';

export default function FeatureGroupsEditor({
  groups,
  onChange,
}: {
  groups: LandingFeatureGroup[];
  onChange: (groups: LandingFeatureGroup[]) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-dark-700 dark:text-dark-300">Grupos</div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          icon={<Plus className="w-4 h-4" />}
          onClick={() =>
            onChange([
              ...groups,
              {
                id: createId('group'),
                title: 'Nuevo grupo',
                description: '',
                items: [{ id: createId('feature'), icon: 'FileText', title: 'Nueva feature', description: 'Descripción' }],
              },
            ])
          }
        >
          Añadir grupo
        </Button>
      </div>

      <div className="space-y-4">
        {groups.map((group, groupIdx) => (
          <div key={group.id} className="rounded-2xl border border-dark-200 dark:border-dark-700 bg-white dark:bg-dark-800 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="text-sm font-semibold text-dark-900 dark:text-white">
                Grupo #{groupIdx + 1}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onChange(moveItem(groups, groupIdx, groupIdx - 1))}
                  disabled={groupIdx === 0}
                  aria-label="Mover arriba"
                  icon={<ArrowUp className="w-4 h-4" />}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onChange(moveItem(groups, groupIdx, groupIdx + 1))}
                  disabled={groupIdx === groups.length - 1}
                  aria-label="Mover abajo"
                  icon={<ArrowDown className="w-4 h-4" />}
                />
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={() => onChange(groups.filter((g) => g.id !== group.id))}
                  aria-label="Eliminar"
                  icon={<Trash2 className="w-4 h-4" />}
                />
              </div>
            </div>

            <div className="mt-4 grid md:grid-cols-2 gap-4">
              <Input
                label="Título del grupo"
                value={group.title}
                onChange={(e) =>
                  onChange(groups.map((g) => (g.id === group.id ? { ...g, title: e.target.value } : g)))
                }
              />
              <Input
                label="Descripción (opcional)"
                value={group.description || ''}
                onChange={(e) =>
                  onChange(groups.map((g) => (g.id === group.id ? { ...g, description: e.target.value } : g)))
                }
              />
            </div>

            <div className="mt-6 flex items-center justify-between gap-3">
              <div className="text-sm font-medium text-dark-700 dark:text-dark-300">Features</div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                icon={<Plus className="w-4 h-4" />}
                onClick={() => {
                  const next = groups.map((g) => {
                    if (g.id !== group.id) return g;
                    return {
                      ...g,
                      items: [
                        ...g.items,
                        { id: createId('feature'), icon: 'FileText', title: 'Nueva feature', description: 'Descripción' },
                      ],
                    };
                  });
                  onChange(next);
                }}
              >
                Añadir feature
              </Button>
            </div>

            <div className="mt-3 space-y-3">
              {group.items.map((item, itemIdx) => (
                <div key={item.id} className="rounded-xl border border-dark-200 dark:border-dark-700 p-4 bg-dark-50 dark:bg-dark-900/40">
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-sm font-semibold text-dark-900 dark:text-white">
                      #{itemIdx + 1}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const next = groups.map((g) =>
                            g.id === group.id ? { ...g, items: moveItem(g.items, itemIdx, itemIdx - 1) } : g
                          );
                          onChange(next);
                        }}
                        disabled={itemIdx === 0}
                        aria-label="Mover arriba"
                        icon={<ArrowUp className="w-4 h-4" />}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const next = groups.map((g) =>
                            g.id === group.id ? { ...g, items: moveItem(g.items, itemIdx, itemIdx + 1) } : g
                          );
                          onChange(next);
                        }}
                        disabled={itemIdx === group.items.length - 1}
                        aria-label="Mover abajo"
                        icon={<ArrowDown className="w-4 h-4" />}
                      />
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        onClick={() => {
                          const next = groups.map((g) =>
                            g.id === group.id ? { ...g, items: g.items.filter((it) => it.id !== item.id) } : g
                          );
                          onChange(next);
                        }}
                        aria-label="Eliminar"
                        icon={<Trash2 className="w-4 h-4" />}
                      />
                    </div>
                  </div>

                  <div className="mt-4 grid md:grid-cols-3 gap-4">
                    <IconSelect
                      label="Icono"
                      value={item.icon}
                      onChange={(value) => {
                        const next = groups.map((g) =>
                          g.id === group.id
                            ? { ...g, items: g.items.map((it) => (it.id === item.id ? { ...it, icon: value } : it)) }
                            : g
                        );
                        onChange(next);
                      }}
                    />
                    <div className="md:col-span-2">
                      <Input
                        label="Título"
                        value={item.title}
                        onChange={(e) => {
                          const next = groups.map((g) =>
                            g.id === group.id
                              ? { ...g, items: g.items.map((it) => (it.id === item.id ? { ...it, title: e.target.value } : it)) }
                              : g
                          );
                          onChange(next);
                        }}
                      />
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">Descripción</label>
                    <textarea
                      className="input w-full h-24 resize-none"
                      value={item.description}
                      onChange={(e) => {
                        const next = groups.map((g) =>
                          g.id === group.id
                            ? { ...g, items: g.items.map((it) => (it.id === item.id ? { ...it, description: e.target.value } : it)) }
                            : g
                        );
                        onChange(next);
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

