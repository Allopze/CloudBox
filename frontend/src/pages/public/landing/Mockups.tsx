
import {
    Play, Pause, SkipForward, SkipBack, Heart, Shuffle, Repeat,
    Image as ImageIcon, Maximize2, Share2,
    Folder, Download, HardDrive, CheckCircle2,
    Lock, Calendar, Copy, ChevronRight, Plus, Music, Star, Disc
} from 'lucide-react';
import { cn } from '../../../lib/utils';

// --- Shared Components ---

const MockupWindow = ({ children, className }: { children: React.ReactNode, className?: string }) => (
    <div className={cn("relative w-full h-full min-h-[300px] bg-white dark:bg-dark-900 rounded-3xl overflow-hidden border border-dark-200 dark:border-dark-700 shadow-2xl shadow-dark-200/50 dark:shadow-black/50 select-none", className)}>
        {/* Window Header */}
        <div className="h-10 bg-white dark:bg-dark-900 border-b border-dark-100 dark:border-dark-700 flex items-center px-4 gap-2">
            <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-400/80" />
                <div className="w-2.5 h-2.5 rounded-full bg-amber-400/80" />
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400/80" />
            </div>
        </div>
        {children}
    </div>
);

// --- Music Player Mockup ---

export const MusicPlayerMockup = () => (
    <MockupWindow className="flex flex-col relative bg-dark-50 dark:bg-dark-900">
        {/* App Content */}
        <div className="flex-1 flex flex-col p-6 min-h-0">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <h3 className="text-xl font-bold text-dark-900 dark:text-white">Music</h3>
                    <div className="flex items-center gap-1">
                        <button className="h-7 px-3 rounded-full text-xs font-semibold flex items-center gap-1.5 border border-transparent bg-[#F44336]/10 text-[#F44336] shadow-sm">
                            <Music className="w-3.5 h-3.5" />
                            All
                        </button>
                        <button className="h-7 px-3 rounded-full text-xs font-semibold flex items-center gap-1.5 border border-transparent text-dark-500 hover:text-dark-900 dark:text-dark-400 dark:hover:text-white transition-colors">
                            <Star className="w-3.5 h-3.5" />
                            Favorites
                        </button>
                        <button className="h-7 px-3 rounded-full text-xs font-semibold flex items-center gap-1.5 border border-transparent text-dark-500 hover:text-dark-900 dark:text-dark-400 dark:hover:text-white transition-colors">
                            <Disc className="w-3.5 h-3.5" />
                            Albums
                        </button>
                    </div>
                </div>
                <button className="flex items-center gap-2 px-3 py-1.5 bg-[#F44336] text-white rounded-full text-xs font-medium hover:bg-[#d32f2f] transition-colors shadow-lg shadow-red-500/20">
                    <Plus className="w-3.5 h-3.5" />
                    <span>New album</span>
                </button>
            </div>

            {/* Grid Content */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-1">
                {[
                    { title: 'Midnight City', artist: 'M83', color: 'from-violet-500 to-purple-400', active: true },
                    { title: 'Starboy', artist: 'The Weeknd', color: 'from-rose-500 to-orange-400' },
                    { title: 'Instant Crush', artist: 'Daft Punk', color: 'from-blue-500 to-cyan-400' },
                    { title: 'Fluorescent', artist: 'Arctic Monkeys', color: 'from-emerald-500 to-teal-400' },
                    { title: 'Nightcall', artist: 'Kavinsky', color: 'from-amber-500 to-yellow-400' },
                    { title: 'Neon', artist: 'John Mayer', color: 'from-indigo-500 to-blue-400' }
                ].map((track, i) => (
                    <div key={i} className={cn(
                        "group relative rounded-xl overflow-hidden aspect-square border border-dark-200 dark:border-dark-700 bg-white dark:bg-dark-800 hover:shadow-xl transition-all hover:-translate-y-1",
                        track.active && "ring-2 ring-[#F44336] ring-offset-2 ring-offset-transparent dark:ring-offset-dark-900"
                    )}>
                        {/* Thumbnail area */}
                        <div className={cn("h-4/5 w-full bg-gradient-to-br relative flex items-center justify-center", track.color)}>
                            {track.active ? (
                                <div className="w-16 h-16 rounded-full bg-black flex items-center justify-center animate-[spin_4s_linear_infinite]">
                                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-red-500 to-orange-500"></div>
                                </div>
                            ) : (
                                <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm">
                                    <Music className="w-6 h-6 text-white" />
                                </div>
                            )}
                            {/* Overlay Play Button */}
                            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[1px]">
                                <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-lg transform scale-90 group-hover:scale-100 transition-transform">
                                    <Play className="w-4 h-4 text-black fill-current ml-0.5" />
                                </div>
                            </div>
                            {/* Favorite Badge */}
                            <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <div className="w-7 h-7 rounded-full bg-black/20 backdrop-blur-md flex items-center justify-center hover:bg-[#F44336] transition-colors cursor-pointer text-white">
                                    <Heart className="w-3.5 h-3.5" />
                                </div>
                            </div>
                        </div>
                        {/* Meta area */}
                        <div className="p-3">
                            <div className="font-bold text-dark-900 dark:text-white text-sm truncate">{track.title}</div>
                            <div className="text-xs text-dark-500 truncate">{track.artist}</div>
                        </div>
                    </div>
                ))}
            </div>
        </div>

        {/* Floating Player (Mimicking MusicPlayer.tsx) */}
        <div className="absolute bottom-6 right-6 z-20">
            <div className="w-72 bg-white dark:bg-dark-800 rounded-2xl shadow-2xl border border-dark-200 dark:border-dark-700 overflow-hidden flex flex-col animate-in slide-in-from-bottom-10 fade-in duration-700">
                {/* Top Drag Bar */}
                <div className="h-6 w-full flex justify-center items-center cursor-grab active:cursor-grabbing">
                    <div className="w-12 h-1 bg-dark-200 dark:bg-dark-600 rounded-full"></div>
                </div>

                {/* Player Content */}
                <div className="px-5 pb-5 pt-0">
                    <div className="flex gap-4">
                        {/* Spinning Vinyl */}
                        <div className="w-16 h-16 rounded-full bg-dark-900 flex-shrink-0 relative shadow-lg animate-[spin_4s_linear_infinite] border-2 border-dark-900">
                            <div className="absolute inset-0 rounded-full border border-white/10"></div>
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 bg-gradient-to-br from-[#F44336] to-orange-500 rounded-full">
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-white rounded-full"></div>
                            </div>
                        </div>

                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                            <div className="font-bold text-dark-900 dark:text-white truncate">Midnight City</div>
                            <div className="text-xs text-[#F44336] font-medium">Playing now</div>
                        </div>
                    </div>

                    {/* Progress */}
                    <div className="mt-4 mb-2">
                        <div className="h-1 w-full bg-dark-100 dark:bg-dark-700 rounded-full overflow-hidden">
                            <div className="h-full w-1/3 bg-[#F44336] rounded-full"></div>
                        </div>
                        <div className="flex justify-between text-[10px] text-dark-400 mt-1">
                            <span>1:24</span>
                            <span>4:03</span>
                        </div>
                    </div>

                    {/* Controls */}
                    <div className="flex items-center justify-between px-2">
                        <div className="flex items-center gap-4">
                            <SkipBack className="w-5 h-5 text-dark-400 hover:text-dark-900 dark:hover:text-white transition-colors cursor-pointer" />
                            <Pause className="w-6 h-6 text-dark-900 dark:text-white fill-current cursor-pointer" />
                            <SkipForward className="w-5 h-5 text-dark-400 hover:text-dark-900 dark:hover:text-white transition-colors cursor-pointer" />
                        </div>
                        <div className="flex items-center gap-3">
                            <Repeat className="w-4 h-4 text-dark-300" />
                            <Shuffle className="w-4 h-4 text-[#F44336]" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </MockupWindow>
);

// --- Gallery Mockup ---

export const GalleryMockup = () => (
    <MockupWindow>
        <div className="p-6 h-full flex flex-col">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <h3 className="text-xl font-bold text-dark-900 dark:text-white">Galería</h3>
                    <div className="flex bg-dark-100 dark:bg-dark-800 rounded-lg p-1">
                        <div className="px-3 py-1 bg-white dark:bg-dark-700 rounded text-xs font-semibold shadow-sm">Fotos</div>
                        <div className="px-3 py-1 text-dark-500 text-xs font-medium">Álbumes</div>
                    </div>
                </div>
                <button className="bg-[#F44336] text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-[#d32f2f] transition-colors">
                    Subir fotos
                </button>
            </div>

            <div className="flex-1 overflow-hidden grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    'bg-rose-100 dark:bg-rose-900/20', 'bg-teal-100 dark:bg-teal-900/20',
                    'bg-blue-100 dark:bg-blue-900/20', 'bg-amber-100 dark:bg-amber-900/20',
                    'bg-purple-100 dark:bg-purple-900/20', 'bg-emerald-100 dark:bg-emerald-900/20',
                    'bg-cyan-100 dark:bg-cyan-900/20', 'bg-orange-100 dark:bg-orange-900/20'
                ].map((color, i) => (
                    <div key={i} className={cn("rounded-2xl relative group overflow-hidden cursor-pointer", color)}>
                        {/* Simulated Image Content */}
                        <div className="absolute inset-0 flex items-center justify-center opacity-30">
                            <ImageIcon className="w-8 h-8 text-dark-900 dark:text-white" />
                        </div>
                        {/* Hover Overlay */}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center gap-3 backdrop-blur-sm">
                            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center hover:bg-white text-white hover:text-black transition-colors">
                                <Maximize2 className="w-4 h-4" />
                            </div>
                            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center hover:bg-white text-white hover:text-black transition-colors">
                                <Share2 className="w-4 h-4" />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    </MockupWindow>
);

// --- Files / Drag & Drop Mockup ---

export const FilesMockup = () => (
    <MockupWindow>
        <div className="flex h-full">
            {/* Sidebar */}
            <div className="w-16 md:w-56 border-r border-dark-100 dark:border-dark-700 bg-dark-50/50 dark:bg-dark-800/30 flex-shrink-0 flex flex-col">
                <div className="p-4">
                    <div className="px-3 py-2 bg-[#F44336]/10 text-[#F44336] rounded-xl flex items-center gap-3 font-medium text-sm">
                        <HardDrive className="w-4 h-4" />
                        <span className="hidden md:inline">Mis archivos</span>
                    </div>
                </div>
            </div>

            {/* File Area */}
            <div className="flex-1 p-6 flex flex-col">
                {/* Breadcrumb & Actions */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center text-sm text-dark-500">
                        <span className="hover:text-dark-900 dark:hover:text-white cursor-pointer">Home</span>
                        <ChevronRight className="w-4 h-4 mx-1" />
                        <span className="font-semibold text-dark-900 dark:text-white">Proyectos</span>
                    </div>
                </div>

                {/* Drap Drop Zone */}
                <div className="flex-1 border-2 border-dashed border-dark-200 dark:border-dark-700 rounded-3xl bg-dark-50/50 dark:bg-dark-800/30 flex flex-col items-center justify-center relative overflow-hidden group hover:border-[#F44336]/50 hover:bg-[#F44336]/5 transition-all">
                    <div className="absolute top-6 right-6">
                        <div className="flex -space-x-2">
                            {[1, 2, 3].map(i => <div key={i} className="w-8 h-8 rounded-full bg-dark-200 dark:bg-dark-700 border-2 border-white dark:border-dark-900 text-[10px] flex items-center justify-center">JP</div>)}
                        </div>
                    </div>

                    <div className="w-20 h-20 bg-dark-100 dark:bg-dark-700 rounded-3xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-xl">
                        <Download className="w-8 h-8 text-dark-400 group-hover:text-[#F44336] transition-colors" />
                    </div>
                    <p className="text-lg font-bold text-dark-800 dark:text-dark-200">Suelta tus archivos aquí</p>
                    <p className="text-dark-400 text-sm mt-1">Soporta ZIP, PDF, Imágenes y Vídeo</p>
                </div>
            </div>
        </div>
    </MockupWindow>
);

// --- Sharing Modal Mockup ---

export const SharingMockup = () => (
    <MockupWindow className="flex items-center justify-center bg-dark-50 dark:bg-dark-900">
        {/* Just the modal center */}
        <div className="w-full max-w-md bg-white dark:bg-dark-800 rounded-2xl shadow-2xl border border-dark-200 dark:border-dark-700 overflow-hidden transform scale-90 md:scale-100">
            <div className="p-6 border-b border-dark-100 dark:border-dark-700 flex items-start justify-between">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                        <Folder className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-dark-900 dark:text-white">Proyecto Q4</h3>
                        <p className="text-sm text-dark-500">24 elementos • 1.2 GB</p>
                    </div>
                </div>
                <div className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-bold rounded uppercase tracking-wider">
                    Público
                </div>
            </div>

            <div className="p-6 space-y-6">
                <div className="space-y-4">
                    <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 text-dark-700 dark:text-dark-300">
                            <Lock className="w-4 h-4" />
                            <span>Contraseña</span>
                        </div>
                        <div className="h-5 w-9 bg-[#F44336] rounded-full relative cursor-pointer">
                            <div className="absolute right-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow-sm"></div>
                        </div>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 text-dark-700 dark:text-dark-300">
                            <Calendar className="w-4 h-4" />
                            <span>Expiración</span>
                        </div>
                        <span className="text-dark-500">7 días</span>
                    </div>
                </div>

                <div className="bg-dark-50 dark:bg-dark-900 rounded-xl p-3 flex items-center gap-3 border border-dark-200 dark:border-dark-700">
                    <div className="flex-1 truncate font-mono text-sm text-dark-600 dark:text-dark-400">
                        cloudbox.lat/s/k29s-x92j
                    </div>
                    <button className="p-2 hover:bg-white dark:hover:bg-dark-800 rounded-lg transition-colors text-dark-500 hover:text-dark-900 dark:hover:text-white">
                        <Copy className="w-4 h-4" />
                    </button>
                </div>

                <button className="w-full py-3 bg-[#F44336] hover:bg-[#d32f2f] text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-[#F44336]/20">
                    <CheckCircle2 className="w-5 h-5" />
                    Guardar cambios
                </button>
            </div>
        </div>
    </MockupWindow>
);
