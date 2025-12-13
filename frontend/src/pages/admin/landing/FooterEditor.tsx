import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { createId, moveItem } from './utils';
import type { LandingConfigV1 } from '../../public/landing/types';

type Footer = LandingConfigV1['sections']['footer'];

export default function FooterEditor({
  footer,
  onChange,
}: {
  footer: Footer;
  onChange: (next: Footer) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-4">
        <Input
          label="Tagline"
          value={footer.tagline}
          onChange={(e) => onChange({ ...footer, tagline: e.target.value })}
        />
        <Input
          label="Texto inferior (fine print)"
          value={footer.finePrint || ''}
          onChange={(e) => onChange({ ...footer, finePrint: e.target.value })}
        />
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-dark-900 dark:text-white">Grupos</div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            icon={<Plus className="w-4 h-4" />}
            onClick={() =>
              onChange({
                ...footer,
                groups: [
                  ...footer.groups,
                  {
                    id: createId('footer-group'),
                    title: 'Nuevo grupo',
                    links: [{ id: createId('footer-link'), label: 'Nuevo link', href: '/#' }],
                  },
                ],
              })
            }
          >
            Añadir grupo
          </Button>
        </div>

        <div className="mt-4 space-y-4">
          {footer.groups.map((group, groupIdx) => (
            <div key={group.id} className="rounded-2xl border border-dark-200 dark:border-dark-700 bg-white dark:bg-dark-800 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm font-semibold text-dark-900 dark:text-white">Grupo #{groupIdx + 1}</div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onChange({ ...footer, groups: moveItem(footer.groups, groupIdx, groupIdx - 1) })}
                    disabled={groupIdx === 0}
                    aria-label="Mover arriba"
                    icon={<ArrowUp className="w-4 h-4" />}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onChange({ ...footer, groups: moveItem(footer.groups, groupIdx, groupIdx + 1) })}
                    disabled={groupIdx === footer.groups.length - 1}
                    aria-label="Mover abajo"
                    icon={<ArrowDown className="w-4 h-4" />}
                  />
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() => onChange({ ...footer, groups: footer.groups.filter((g) => g.id !== group.id) })}
                    aria-label="Eliminar"
                    icon={<Trash2 className="w-4 h-4" />}
                  />
                </div>
              </div>

              <div className="mt-4">
                <Input
                  label="Título del grupo"
                  value={group.title}
                  onChange={(e) =>
                    onChange({
                      ...footer,
                      groups: footer.groups.map((g) => (g.id === group.id ? { ...g, title: e.target.value } : g)),
                    })
                  }
                />
              </div>

              <div className="mt-6 flex items-center justify-between gap-3">
                <div className="text-sm font-medium text-dark-700 dark:text-dark-300">Links</div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  icon={<Plus className="w-4 h-4" />}
                  onClick={() => {
                    const nextGroups = footer.groups.map((g) => {
                      if (g.id !== group.id) return g;
                      return { ...g, links: [...g.links, { id: createId('footer-link'), label: 'Nuevo link', href: '/#' }] };
                    });
                    onChange({ ...footer, groups: nextGroups });
                  }}
                >
                  Añadir link
                </Button>
              </div>

              <div className="mt-3 space-y-3">
                {group.links.map((l, linkIdx) => (
                  <div key={l.id} className="rounded-xl border border-dark-200 dark:border-dark-700 p-4 bg-dark-50 dark:bg-dark-900/40">
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-sm font-semibold text-dark-900 dark:text-white">#{linkIdx + 1}</div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const nextGroups = footer.groups.map((g) =>
                              g.id === group.id ? { ...g, links: moveItem(g.links, linkIdx, linkIdx - 1) } : g
                            );
                            onChange({ ...footer, groups: nextGroups });
                          }}
                          disabled={linkIdx === 0}
                          aria-label="Mover arriba"
                          icon={<ArrowUp className="w-4 h-4" />}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const nextGroups = footer.groups.map((g) =>
                              g.id === group.id ? { ...g, links: moveItem(g.links, linkIdx, linkIdx + 1) } : g
                            );
                            onChange({ ...footer, groups: nextGroups });
                          }}
                          disabled={linkIdx === group.links.length - 1}
                          aria-label="Mover abajo"
                          icon={<ArrowDown className="w-4 h-4" />}
                        />
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          onClick={() => {
                            const nextGroups = footer.groups.map((g) =>
                              g.id === group.id ? { ...g, links: g.links.filter((x) => x.id !== l.id) } : g
                            );
                            onChange({ ...footer, groups: nextGroups });
                          }}
                          aria-label="Eliminar"
                          icon={<Trash2 className="w-4 h-4" />}
                        />
                      </div>
                    </div>

                    <div className="mt-4 grid md:grid-cols-2 gap-4">
                      <Input
                        label="Etiqueta"
                        value={l.label}
                        onChange={(e) => {
                          const nextGroups = footer.groups.map((g) =>
                            g.id === group.id
                              ? { ...g, links: g.links.map((x) => (x.id === l.id ? { ...x, label: e.target.value } : x)) }
                              : g
                          );
                          onChange({ ...footer, groups: nextGroups });
                        }}
                      />
                      <Input
                        label="URL"
                        value={l.href}
                        onChange={(e) => {
                          const nextGroups = footer.groups.map((g) =>
                            g.id === group.id
                              ? { ...g, links: g.links.map((x) => (x.id === l.id ? { ...x, href: e.target.value } : x)) }
                              : g
                          );
                          onChange({ ...footer, groups: nextGroups });
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
    </div>
  );
}

