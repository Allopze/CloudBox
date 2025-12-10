import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { Modifier } from '@dnd-kit/core';
import {
    DndContext,
    DragOverlay,
    PointerSensor,
    useSensor,
    useSensors,
    DragStartEvent,
    DragEndEvent,
    pointerWithin,
} from '@dnd-kit/core';

// Modifier to keep the overlay anchored near the cursor instead of the element's origin.
// This removes the drift that grows with the grab position (clicking on the right edge, etc.)
// by normalizing the pointer to a constant gap from the overlay's top/left.
const snapToCursorModifier: Modifier = ({ activatorEvent, draggingNodeRect, transform }) => {
    if (!draggingNodeRect || !(activatorEvent instanceof PointerEvent)) return transform;

    const cursorGap = 12; // keep pointer visible

    const offsetX = activatorEvent.clientX - draggingNodeRect.left;
    const offsetY = activatorEvent.clientY - draggingNodeRect.top;

    return {
        ...transform,
        x: transform.x + offsetX - cursorGap,
        y: transform.y + offsetY - cursorGap,
    };
};
import { useDragDropStore, DragItem } from '../../stores/dragDropStore';
import { useFileStore } from '../../stores/fileStore';
import { api } from '../../lib/api';
import { toast } from '../ui/Toast';
import { File, Folder as FolderIcon, Image, Video, Music, FileText, Archive } from 'lucide-react';
import { FileItem, Folder } from '../../types';

const fileIcons: Record<string, typeof File> = {
    image: Image,
    video: Video,
    audio: Music,
    document: FileText,
    archive: Archive,
    default: File,
};

function getFileIcon(mimeType: string) {
    const mimeCategory = mimeType.split('/')[0];
    return fileIcons[mimeCategory] || fileIcons.default;
}

interface DndContextProviderProps {
    children: React.ReactNode;
    onRefresh?: () => void;
}

export default function DndContextProvider({ children, onRefresh }: DndContextProviderProps) {
    const { t } = useTranslation();
    const { startDrag, endDrag, draggedItems, isDragging } = useDragDropStore();
    const { selectedItems, selectSingle, clearSelection } = useFileStore();

    // Configure pointer sensor with distance constraint to allow clicks
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 10, // 10px movement before drag starts
            },
        })
    );

    const handleDragStart = useCallback((event: DragStartEvent) => {
        const { active } = event;
        const activeData = active.data.current as { type: 'file' | 'folder'; item: FileItem | Folder } | undefined;

        if (!activeData) return;

        let itemsToDrag: DragItem[] = [];

        // If this item is selected and there are multiple selections, drag all
        if (selectedItems.has(active.id as string) && selectedItems.size > 1) {
            // Get all selected items from DOM data attributes
            selectedItems.forEach(id => {
                const folderEl = document.querySelector(`[data-folder-item="${id}"]`);
                const fileEl = document.querySelector(`[data-file-item="${id}"]`);

                if (folderEl) {
                    const folderData = folderEl.getAttribute('data-folder-data');
                    if (folderData) {
                        itemsToDrag.push({ type: 'folder', item: JSON.parse(folderData) });
                    }
                } else if (fileEl) {
                    const fileData = fileEl.getAttribute('data-file-data');
                    if (fileData) {
                        itemsToDrag.push({ type: 'file', item: JSON.parse(fileData) });
                    }
                }
            });
        }

        // If no items collected, just drag this item
        if (itemsToDrag.length === 0) {
            itemsToDrag = [activeData];
            selectSingle(active.id as string);
        }

        startDrag(itemsToDrag, active.id as string);
    }, [selectedItems, selectSingle, startDrag]);

    const handleDragEnd = useCallback(async (event: DragEndEvent) => {
        const { active, over } = event;

        if (!over || !isDragging) {
            endDrag();
            return;
        }

        const overData = over.data.current as { type: 'file' | 'folder' | 'breadcrumb' | 'trash'; item?: FileItem | Folder; folderId?: string | null; name?: string } | undefined;

        if (!overData) {
            endDrag();
            return;
        }

        const items = draggedItems;
        let targetFolderId: string | null = null;
        let targetName = '';
        let action: 'move' | 'trash' | null = null;

        // Handle drop on folder
        if (overData.type === 'folder' && overData.item) {
            const targetFolder = overData.item as Folder;
            targetFolderId = targetFolder.id;
            targetName = targetFolder.name;
            action = 'move';

            // Don't allow dropping on self
            if (active.id === over.id) {
                endDrag();
                return;
            }
        }
        // Handle drop on breadcrumb
        else if (overData.type === 'breadcrumb') {
            targetFolderId = overData.folderId ?? null;
            targetName = overData.name || t('breadcrumbs.home');
            action = 'move';
        }
        // Handle drop on trash
        else if (overData.type === 'trash') {
            action = 'trash';
            targetName = t('sidebar.trash');
        }
        // Not a valid drop target
        else {
            endDrag();
            return;
        }

        try {
            let movedCount = 0;

            for (const dragItem of items) {
                if (action === 'move') {
                    // Skip if trying to move a folder into itself
                    if (dragItem.type === 'folder' && targetFolderId && dragItem.item.id === targetFolderId) continue;
                    // Skip if item is already in this folder
                    if (dragItem.type === 'file' && (dragItem.item as FileItem).folderId === targetFolderId) continue;
                    if (dragItem.type === 'folder' && (dragItem.item as Folder).parentId === targetFolderId) continue;

                    if (dragItem.type === 'file') {
                        await api.patch(`/files/${dragItem.item.id}/move`, { folderId: targetFolderId });
                        movedCount++;
                    } else {
                        await api.patch(`/folders/${dragItem.item.id}/move`, { parentId: targetFolderId });
                        movedCount++;
                    }
                } else if (action === 'trash') {
                    // Skip if already in trash
                    if ((dragItem.item as FileItem | Folder).isTrash) continue;

                    if (dragItem.type === 'file') {
                        await api.delete(`/files/${dragItem.item.id}`);
                    } else {
                        await api.delete(`/folders/${dragItem.item.id}`);
                    }
                    movedCount++;
                }
            }

            if (movedCount > 0) {
                if (action === 'trash') {
                    toast(t('fileCard.itemsMovedToTrash', { count: movedCount }), 'success');
                } else {
                    toast(t('folderCard.itemsMovedTo', { count: movedCount, name: targetName }), 'success');
                }
                clearSelection();
                window.dispatchEvent(new CustomEvent('workzone-refresh'));
                onRefresh?.();
            }
        } catch (error: any) {
            const fallbackMessage = action === 'trash' ? t('fileCard.deleteError') : t('folderCard.moveError');
            toast(error.response?.data?.error || fallbackMessage, 'error');
        } finally {
            endDrag();
        }
    }, [isDragging, draggedItems, endDrag, clearSelection, onRefresh, t]);

    const handleDragCancel = useCallback(() => {
        endDrag();
    }, [endDrag]);

    // Render drag overlay content
    const renderDragOverlay = () => {
        if (!isDragging || draggedItems.length === 0) return null;

        const firstItem = draggedItems[0];
        const isFile = firstItem.type === 'file';
        const Icon = isFile ? getFileIcon((firstItem.item as FileItem).mimeType) : FolderIcon;
        const name = firstItem.item.name;
        const count = draggedItems.length;

        return (
            <div className="z-[9999] relative flex items-center gap-3 px-4 py-3 rounded-xl bg-white dark:bg-dark-800 shadow-2xl border border-dark-200 dark:border-dark-700 min-w-40 max-w-64 pointer-events-none">
                {/* Count badge */}
                {count > 1 && (
                    <div className="absolute -top-2 -right-2 flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-br from-primary-500 to-primary-600 text-white text-xs font-bold shadow-lg ring-2 ring-white dark:ring-dark-800">
                        {count > 99 ? '99+' : count}
                    </div>
                )}

                <div className="flex-shrink-0">
                    {isFile ? (
                        <Icon className="w-5 h-5 text-dark-400" />
                    ) : (
                        <FolderIcon className="w-5 h-5 text-primary-500" />
                    )}
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-dark-900 dark:text-white truncate">
                        {count > 1 ? t('dragPreview.itemsCount', { count }) : name}
                    </p>
                    {count > 1 && (
                        <p className="text-xs text-dark-500 truncate">
                            {t('dragPreview.andMore', { name, count: count - 1 })}
                        </p>
                    )}
                </div>
            </div>
        );
    };

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={pointerWithin}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
        >
            {children}
            <DragOverlay dropAnimation={null} zIndex={9999} modifiers={[snapToCursorModifier]}>
                {renderDragOverlay()}
            </DragOverlay>
        </DndContext>
    );
}
