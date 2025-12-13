import { FileText, Folder, Image as ImageIcon, UploadCloud, Users } from 'lucide-react';
import { cn } from '../../lib/utils';

export default function CloudBoxMockup() {
  return (
    <div className="relative">
      <div className="absolute -inset-4 rounded-3xl bg-[#F44336]/10 blur-2xl" />
      <div className="relative rounded-2xl border border-white/10 bg-dark-900 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-white/20" />
            <div className="h-2.5 w-2.5 rounded-full bg-white/20" />
            <div className="h-2.5 w-2.5 rounded-full bg-white/20" />
          </div>
          <div className="text-xs text-white/60">CloudBox</div>
          <div className="h-6 w-24 rounded-md bg-white/5" />
        </div>

        <div className="grid grid-cols-12">
          <div className="col-span-4 border-r border-white/10 p-4">
            <div className="text-xs font-medium text-white/50 mb-3">Navegación</div>
            <div className="space-y-2">
              {[
                { icon: Folder, label: 'Mis archivos', active: true },
                { icon: ImageIcon, label: 'Fotos' },
                { icon: FileText, label: 'Documentos' },
                { icon: Users, label: 'Compartidos' },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.label}
                    className={cn(
                      'flex items-center gap-2 rounded-lg px-3 py-2 text-xs',
                      item.active
                        ? 'bg-[#F44336]/15 text-white border border-[#F44336]/30'
                        : 'text-white/70 hover:bg-white/5 border border-transparent'
                    )}
                  >
                    <Icon className={cn('h-4 w-4', item.active ? 'text-[#F44336]' : 'text-white/50')} />
                    <span className="truncate">{item.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="col-span-8 p-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-sm font-semibold text-white">Archivos</div>
                <div className="text-xs text-white/60">Explorador moderno · rápido · claro</div>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-white/5 border border-white/10" />
                <div className="h-8 w-8 rounded-lg bg-white/5 border border-white/10" />
                <div className="h-8 w-8 rounded-lg bg-[#F44336] text-white flex items-center justify-center shadow-sm">
                  <UploadCloud className="h-4 w-4" />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              {[
                { icon: Folder, name: 'Proyectos', meta: 'Carpeta' },
                { icon: Folder, name: 'Fotos', meta: 'Carpeta' },
                { icon: FileText, name: 'Contrato.pdf', meta: 'Documento' },
                { icon: ImageIcon, name: 'portada.jpg', meta: 'Imagen' },
              ].map((row) => {
                const Icon = row.icon;
                return (
                  <div
                    key={row.name}
                    className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
                        <Icon className="h-4 w-4 text-white/70" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm text-white truncate">{row.name}</div>
                        <div className="text-xs text-white/50">{row.meta}</div>
                      </div>
                    </div>
                    <div className="h-2 w-14 rounded-full bg-white/10" />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

