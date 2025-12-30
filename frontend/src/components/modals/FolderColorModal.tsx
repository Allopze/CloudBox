import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X, Check, Palette,
    Camera, Image, Music, Video, FileText, Code, Download, Star, Bookmark,
    Shield, Lock, Cloud, Database, Archive, Package, Briefcase, GraduationCap,
    Heart, Gift, ShoppingBag, Home, Plane, Car, Gamepad2, Palette as PaletteIcon,
    Wrench, Settings, User, Users, Mail, Calendar, Clock, Zap,
    Coffee, Book, Lightbulb, Target, Flag, Award, Trophy,
    Headphones, Mic, Film, Monitor, Smartphone, Laptop,
    Wifi, Globe, Map, Compass, Building, Store,
    type LucideIcon
} from 'lucide-react';
import { api } from '../../lib/api';
import { toast } from '../ui/Toast';
import { SolidFolderIcon } from '../icons/SolidIcons';

interface FolderCustomizeModalProps {
    isOpen: boolean;
    onClose: () => void;
    folderId: string;
    folderName: string;
    currentColor?: string | null;
    currentIcon?: string | null;
    onSuccess?: () => void;
}

// Predefined color palette
const PRESET_COLORS = [
    // Row 1 - Vibrant
    { name: 'blue', value: '#3B82F6' },
    { name: 'indigo', value: '#6366F1' },
    { name: 'purple', value: '#8B5CF6' },
    { name: 'pink', value: '#EC4899' },
    { name: 'red', value: '#EF4444' },
    { name: 'orange', value: '#F97316' },
    { name: 'amber', value: '#F59E0B' },
    { name: 'yellow', value: '#EAB308' },
    // Row 2 - Nature
    { name: 'lime', value: '#84CC16' },
    { name: 'green', value: '#22C55E' },
    { name: 'emerald', value: '#10B981' },
    { name: 'teal', value: '#14B8A6' },
    { name: 'cyan', value: '#06B6D4' },
    { name: 'sky', value: '#0EA5E9' },
    { name: 'slate', value: '#64748B' },
    { name: 'gray', value: '#6B7280' },
];

// Available inner icons for folders (generic Lucide icons, not folder variants)
const FOLDER_ICONS: { name: string; icon: LucideIcon; category: string }[] = [
    // Media
    { name: 'Camera', icon: Camera, category: 'media' },
    { name: 'Image', icon: Image, category: 'media' },
    { name: 'Music', icon: Music, category: 'media' },
    { name: 'Video', icon: Video, category: 'media' },
    { name: 'Headphones', icon: Headphones, category: 'media' },
    { name: 'Mic', icon: Mic, category: 'media' },
    { name: 'Film', icon: Film, category: 'media' },
    // Documents
    { name: 'FileText', icon: FileText, category: 'documents' },
    { name: 'Code', icon: Code, category: 'documents' },
    { name: 'Archive', icon: Archive, category: 'documents' },
    { name: 'Book', icon: Book, category: 'documents' },
    // Actions
    { name: 'Download', icon: Download, category: 'actions' },
    { name: 'Star', icon: Star, category: 'actions' },
    { name: 'Bookmark', icon: Bookmark, category: 'actions' },
    { name: 'Heart', icon: Heart, category: 'actions' },
    { name: 'Flag', icon: Flag, category: 'actions' },
    // Security
    { name: 'Shield', icon: Shield, category: 'security' },
    { name: 'Lock', icon: Lock, category: 'security' },
    // Tech
    { name: 'Cloud', icon: Cloud, category: 'tech' },
    { name: 'Database', icon: Database, category: 'tech' },
    { name: 'Package', icon: Package, category: 'tech' },
    { name: 'Settings', icon: Settings, category: 'tech' },
    { name: 'Wrench', icon: Wrench, category: 'tech' },
    { name: 'Zap', icon: Zap, category: 'tech' },
    { name: 'Wifi', icon: Wifi, category: 'tech' },
    { name: 'Globe', icon: Globe, category: 'tech' },
    { name: 'Monitor', icon: Monitor, category: 'tech' },
    { name: 'Smartphone', icon: Smartphone, category: 'tech' },
    { name: 'Laptop', icon: Laptop, category: 'tech' },
    // Work
    { name: 'Briefcase', icon: Briefcase, category: 'work' },
    { name: 'GraduationCap', icon: GraduationCap, category: 'work' },
    { name: 'Calendar', icon: Calendar, category: 'work' },
    { name: 'Clock', icon: Clock, category: 'work' },
    { name: 'Target', icon: Target, category: 'work' },
    { name: 'Lightbulb', icon: Lightbulb, category: 'work' },
    { name: 'Award', icon: Award, category: 'work' },
    { name: 'Trophy', icon: Trophy, category: 'work' },
    // Social
    { name: 'User', icon: User, category: 'social' },
    { name: 'Users', icon: Users, category: 'social' },
    { name: 'Mail', icon: Mail, category: 'social' },
    // Personal
    { name: 'Gift', icon: Gift, category: 'personal' },
    { name: 'ShoppingBag', icon: ShoppingBag, category: 'personal' },
    { name: 'Home', icon: Home, category: 'personal' },
    { name: 'Plane', icon: Plane, category: 'personal' },
    { name: 'Car', icon: Car, category: 'personal' },
    { name: 'Gamepad2', icon: Gamepad2, category: 'personal' },
    { name: 'Palette', icon: PaletteIcon, category: 'personal' },
    { name: 'Coffee', icon: Coffee, category: 'personal' },
    // Places
    { name: 'Building', icon: Building, category: 'places' },
    { name: 'Store', icon: Store, category: 'places' },
    { name: 'Map', icon: Map, category: 'places' },
    { name: 'Compass', icon: Compass, category: 'places' },
];

// Icon component lookup map
export const FOLDER_ICON_MAP: Record<string, LucideIcon> = FOLDER_ICONS.reduce((acc, { name, icon }) => {
    acc[name] = icon;
    return acc;
}, {} as Record<string, LucideIcon>);

export default function FolderColorModal({
    isOpen,
    onClose,
    folderId,
    folderName,
    currentColor,
    currentIcon,
    onSuccess,
}: FolderCustomizeModalProps) {
    const { t } = useTranslation();
    const [selectedColor, setSelectedColor] = useState<string>(currentColor || '');
    const [selectedIcon, setSelectedIcon] = useState<string>(currentIcon || '');
    const [customColor, setCustomColor] = useState<string>(
        currentColor && !PRESET_COLORS.some(c => c.value === currentColor) ? currentColor : ''
    );
    const [isLoading, setIsLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'color' | 'icon'>('icon');

    const handleSave = async () => {
        setIsLoading(true);
        try {
            const colorToSave = customColor || selectedColor || null;
            const iconToSave = selectedIcon || null;
            await api.patch(`/folders/${folderId}`, { color: colorToSave, icon: iconToSave });
            toast(t('folderColor.saved'), 'success');
            onSuccess?.();
            onClose();
        } catch {
            toast(t('folderColor.saveError'), 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleReset = async () => {
        setIsLoading(true);
        try {
            await api.patch(`/folders/${folderId}`, { color: null, icon: null });
            toast(t('folderColor.reset'), 'success');
            onSuccess?.();
            onClose();
        } catch {
            toast(t('folderColor.saveError'), 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handlePresetClick = (color: string) => {
        setSelectedColor(color);
        setCustomColor('');
    };

    const handleCustomColorChange = (value: string) => {
        const cleanValue = value.startsWith('#') ? value : `#${value}`;
        setCustomColor(cleanValue);
        setSelectedColor('');
    };

    const handleIconClick = (iconName: string) => {
        setSelectedIcon(iconName === selectedIcon ? '' : iconName);
    };

    const activeColor = customColor || selectedColor;
    const isValidHex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(activeColor);
    const previewColor = isValidHex && activeColor ? activeColor : '#3B82F6';

    // Get the icon component for preview (null if no icon selected)
    const PreviewIcon = selectedIcon ? FOLDER_ICON_MAP[selectedIcon] : undefined;

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.95, opacity: 0 }}
                        className="bg-white dark:bg-dark-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-5 py-4 border-b border-dark-200 dark:border-dark-700">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-primary-100 dark:bg-primary-900/30">
                                    <Palette className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-semibold text-dark-900 dark:text-white">
                                        {t('folderColor.title')}
                                    </h2>
                                    <p className="text-sm text-dark-500 dark:text-dark-400 truncate max-w-[250px]">
                                        {folderName}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 rounded-lg hover:bg-dark-100 dark:hover:bg-dark-700 transition-colors"
                            >
                                <X className="w-5 h-5 text-dark-500" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-5 space-y-5">
                            {/* Preview */}
                            <div className="flex items-center justify-center py-4">
                                <SolidFolderIcon
                                    size={80}
                                    style={{ color: previewColor }}
                                    IconComponent={PreviewIcon}
                                />
                            </div>

                            {/* Tabs */}
                            <div className="flex border-b border-dark-200 dark:border-dark-700">
                                <button
                                    onClick={() => setActiveTab('icon')}
                                    className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'icon'
                                        ? 'text-primary-600 border-b-2 border-primary-600'
                                        : 'text-dark-500 hover:text-dark-700 dark:hover:text-dark-300'
                                        }`}
                                >
                                    {t('folderColor.icon')}
                                </button>
                                <button
                                    onClick={() => setActiveTab('color')}
                                    className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === 'color'
                                        ? 'text-primary-600 border-b-2 border-primary-600'
                                        : 'text-dark-500 hover:text-dark-700 dark:hover:text-dark-300'
                                        }`}
                                >
                                    {t('folderColor.color')}
                                </button>
                            </div>

                            {/* Tab Content */}
                            {activeTab === 'icon' ? (
                                <div className="space-y-3">
                                    <label className="block text-sm font-medium text-dark-700 dark:text-dark-300">
                                        {t('folderColor.selectIcon')}
                                    </label>
                                    <div className="grid grid-cols-8 gap-2 max-h-60 overflow-y-auto p-1">
                                        {FOLDER_ICONS.map(({ name, icon: Icon }) => (
                                            <button
                                                key={name}
                                                onClick={() => handleIconClick(name)}
                                                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all hover:scale-110 ${selectedIcon === name
                                                    ? 'bg-primary-100 dark:bg-primary-900/30 ring-2 ring-primary-500'
                                                    : 'hover:bg-dark-100 dark:hover:bg-dark-700'
                                                    }`}
                                                title={name}
                                            >
                                                <Icon className={`w-5 h-5 ${selectedIcon === name
                                                    ? 'text-primary-600 dark:text-primary-400'
                                                    : 'text-dark-600 dark:text-dark-300'
                                                    }`} />
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {/* Preset Colors */}
                                    <div>
                                        <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-3">
                                            {t('folderColor.presetColors')}
                                        </label>
                                        <div className="grid grid-cols-8 gap-2">
                                            {PRESET_COLORS.map((color) => (
                                                <button
                                                    key={color.name}
                                                    onClick={() => handlePresetClick(color.value)}
                                                    className={`w-8 h-8 rounded-lg transition-all hover:scale-110 ${selectedColor === color.value
                                                        ? 'ring-2 ring-offset-2 ring-primary-500 dark:ring-offset-dark-800'
                                                        : ''
                                                        }`}
                                                    style={{ backgroundColor: color.value }}
                                                    title={color.name}
                                                >
                                                    {selectedColor === color.value && (
                                                        <Check className="w-4 h-4 text-white mx-auto" />
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Custom Color */}
                                    <div>
                                        <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-2">
                                            {t('folderColor.customColor')}
                                        </label>
                                        <div className="flex gap-3">
                                            <div className="relative flex-1">
                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400 font-mono">
                                                    #
                                                </span>
                                                <input
                                                    type="text"
                                                    value={customColor.replace('#', '')}
                                                    onChange={(e) => handleCustomColorChange(e.target.value)}
                                                    placeholder="FF5733"
                                                    maxLength={6}
                                                    className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-dark-200 dark:border-dark-600 bg-white dark:bg-dark-700 text-dark-900 dark:text-white font-mono focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                                                />
                                            </div>
                                            <input
                                                type="color"
                                                value={isValidHex ? activeColor : '#3B82F6'}
                                                onChange={(e) => handleCustomColorChange(e.target.value)}
                                                className="w-12 h-12 rounded-xl cursor-pointer border-2 border-dark-200 dark:border-dark-600 bg-transparent"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-between px-5 py-4 border-t border-dark-200 dark:border-dark-700 bg-dark-50 dark:bg-dark-900/50">
                            <button
                                onClick={handleReset}
                                disabled={isLoading}
                                className="px-4 py-2 text-sm font-medium text-dark-600 dark:text-dark-400 hover:text-dark-900 dark:hover:text-white transition-colors disabled:opacity-50"
                            >
                                {t('folderColor.resetToDefault')}
                            </button>
                            <div className="flex gap-2">
                                <button
                                    onClick={onClose}
                                    disabled={isLoading}
                                    className="px-4 py-2 text-sm font-medium text-dark-600 dark:text-dark-400 hover:bg-dark-100 dark:hover:bg-dark-700 rounded-lg transition-colors disabled:opacity-50"
                                >
                                    {t('common.cancel')}
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={isLoading}
                                    className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    {isLoading ? (
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <Check className="w-4 h-4" />
                                    )}
                                    {t('common.save')}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
}
