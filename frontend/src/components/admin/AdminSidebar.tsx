import { useState } from 'react';
import { createPortal } from 'react-dom';
import {
    LayoutDashboard,
    Users,
    Settings,
    Mail,
    Palette,
    FileType,
    FileText,
    Activity,
    ArrowLeft,
    Layers
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { useNavigate } from 'react-router-dom';
import { useSidebarStore, AdminNavItem } from '../../stores/sidebarStore';

export type AdminSection =
    | 'overview'
    | 'users'
    | 'settings'
    | 'queues'
    | 'email'
    | 'branding'
    | 'file-icons'
    | 'legal'
    | 'activity';

// Icon mapping
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
    LayoutDashboard,
    Users,
    Settings,
    Mail,
    Palette,
    FileType,
    FileText,
    Activity,
    ArrowLeft,
    Layers,
};

interface AdminSidebarProps {
    activeSection: AdminSection;
    onSelectSection: (section: AdminSection) => void;
}

export default function AdminSidebar({ activeSection, onSelectSection }: AdminSidebarProps) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { adminNavItems, setAdminNavItems } = useSidebarStore();

    // Drag state
    const [draggedItem, setDraggedItem] = useState<AdminNavItem | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
    const [dropPosition, setDropPosition] = useState<'before' | 'after'>('before');
    const [dragPosition, setDragPosition] = useState({ x: 0, y: 0 });

    const handleDragStart = (e: React.DragEvent, item: AdminNavItem) => {
        setDraggedItem(item);
        // Set initial position from the start event
        setDragPosition({ x: e.clientX, y: e.clientY });
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', item.id);
        // Hide default drag image
        const emptyImg = document.createElement('img');
        emptyImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        e.dataTransfer.setDragImage(emptyImg, 0, 0);
    };

    const handleDrag = (e: React.DragEvent) => {
        if (e.clientX !== 0 || e.clientY !== 0) {
            setDragPosition({ x: e.clientX, y: e.clientY });
        }
    };

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();
        const midPoint = rect.top + rect.height / 2;
        const position = e.clientY < midPoint ? 'before' : 'after';

        setDragOverIndex(index);
        setDropPosition(position);
    };

    const handleDragEnd = () => {
        setDraggedItem(null);
        setDragOverIndex(null);
        setDropPosition('before');
    };

    const handleDrop = (e: React.DragEvent, targetIndex: number) => {
        e.preventDefault();
        if (!draggedItem) return;

        const items = [...adminNavItems];
        const sourceIndex = items.findIndex(item => item.id === draggedItem.id);

        // Calculate actual insert index based on drop position
        let insertIndex = dropPosition === 'after' ? targetIndex + 1 : targetIndex;

        // Reorder
        items.splice(sourceIndex, 1);
        // Adjust index if we removed an item before the insert position
        if (sourceIndex < insertIndex) {
            insertIndex--;
        }
        items.splice(insertIndex, 0, draggedItem);

        setAdminNavItems(items);
        handleDragEnd();
    };

    // Drag preview card rendered via portal
    const renderDragPreview = () => {
        if (!draggedItem) return null;
        const IconComponent = iconMap[draggedItem.icon];

        return createPortal(
            <div
                className="fixed pointer-events-none z-[9999] transition-none"
                style={{
                    left: dragPosition.x - 80,
                    top: dragPosition.y - 20,
                }}
            >
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400 shadow-lg backdrop-blur-sm">
                    {IconComponent && <IconComponent className="w-5 h-5" />}
                    <span>{t(draggedItem.labelKey)}</span>
                </div>
            </div>,
            document.body
        );
    };

    return (
        <>
            {renderDragPreview()}
            <aside className="w-64 bg-white dark:bg-dark-800 border-r border-dark-100 dark:border-dark-700 flex flex-col h-full shrink-0">
                <div className="p-6 border-b border-dark-100 dark:border-dark-700">
                    <button
                        onClick={() => navigate('/files')}
                        className="flex items-center gap-2 text-dark-500 hover:text-primary-600 transition-colors group mb-6"
                    >
                        <div className="p-2 rounded-full bg-dark-100 dark:bg-dark-700 group-hover:bg-primary-50 dark:group-hover:bg-primary-900/20 transition-colors">
                            <ArrowLeft className="w-4 h-4" />
                        </div>
                        <span className="font-semibold text-sm">{t('admin.backToFiles', 'Volver a Archivos')}</span>
                    </button>

                    <h1 className="text-xl font-bold text-dark-900 dark:text-white px-2">
                        {t('admin.title', 'Administración')}
                    </h1>
                    <p className="text-xs text-dark-500 px-2 mt-1">
                        {t('admin.subtitle', 'Panel de Control')}
                    </p>
                </div>

                <nav className="flex-1 overflow-y-auto p-4 space-y-1">
                    {adminNavItems.map((item, index) => {
                        const Icon = iconMap[item.icon];
                        const isActive = activeSection === item.id;
                        const isDragging = draggedItem?.id === item.id;
                        const isDropTarget = dragOverIndex === index;
                        const showDropBefore = isDropTarget && dropPosition === 'before';
                        const showDropAfter = isDropTarget && dropPosition === 'after';

                        return (
                            <div
                                key={item.id}
                                draggable
                                onDragStart={(e) => handleDragStart(e, item)}
                                onDrag={handleDrag}
                                onDragOver={(e) => handleDragOver(e, index)}
                                onDragEnd={handleDragEnd}
                                onDrop={(e) => handleDrop(e, index)}
                                className={cn(
                                    'relative',
                                    isDragging && 'opacity-30'
                                )}
                            >
                                {showDropBefore && (
                                    <div className="absolute inset-x-2 -top-0.5 h-0.5 bg-primary-500 rounded-full z-10" />
                                )}
                                {showDropAfter && (
                                    <div className="absolute inset-x-2 -bottom-0.5 h-0.5 bg-primary-500 rounded-full z-10" />
                                )}
                                <button
                                    onClick={() => !draggedItem && onSelectSection(item.id as AdminSection)}
                                    className={cn(
                                        "w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200",
                                        isActive
                                            ? "bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400 shadow-sm"
                                            : "text-dark-600 dark:text-dark-400 hover:bg-dark-50 dark:hover:bg-dark-700 hover:text-dark-900 dark:hover:text-white"
                                    )}
                                >
                                    {Icon && <Icon className={cn("w-5 h-5", isActive ? "text-primary-600 dark:text-primary-400" : "text-dark-400 dark:text-dark-500")} />}
                                    {t(item.labelKey)}
                                </button>
                            </div>
                        );
                    })}
                </nav>

                <div className="p-4 border-t border-dark-100 dark:border-dark-700">
                    <div className="bg-dark-50 dark:bg-dark-700/50 rounded-xl p-4">
                        <p className="text-xs font-medium text-dark-900 dark:text-white mb-1">CloudBox Admin</p>
                        <p className="text-[10px] text-dark-400">v1.0.0 • Build 2024</p>
                    </div>
                </div>
            </aside>
        </>
    );
}

