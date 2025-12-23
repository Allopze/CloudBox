import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { toast } from '../ui/Toast';
import { Tag, Plus, X, Edit2, Check, Loader2 } from 'lucide-react';
import Button from '../ui/Button';
import { cn } from '../../lib/utils';

interface TagItem {
    id: string;
    name: string;
    color: string | null;
    createdAt: string;
}

interface TagManagerProps {
    fileId?: string; // If provided, show tags for this file
    onTagSelect?: (tagId: string) => void; // Callback when a tag is selected for filtering
    selectedTagId?: string; // Currently selected tag for filtering
    compact?: boolean; // Compact mode for sidebar
}

const TAG_COLORS = [
    '#EF4444', // red
    '#F97316', // orange
    '#EAB308', // yellow
    '#22C55E', // green
    '#06B6D4', // cyan
    '#3B82F6', // blue
    '#8B5CF6', // violet
    '#EC4899', // pink
];

export default function TagManager({ fileId, onTagSelect, selectedTagId, compact = false }: TagManagerProps) {
    const { t } = useTranslation();
    const [tags, setTags] = useState<TagItem[]>([]);
    const [fileTags, setFileTags] = useState<TagItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [newTagName, setNewTagName] = useState('');
    const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);
    const [creating, setCreating] = useState(false);
    const [editingTagId, setEditingTagId] = useState<string | null>(null);
    const [editTagName, setEditTagName] = useState('');

    // Load all user tags
    const loadTags = useCallback(async () => {
        try {
            const response = await api.get('/tags');
            setTags(response.data || []);
        } catch (error) {
            console.error('Failed to load tags:', error);
        }
    }, []);

    // Load tags for a specific file
    const loadFileTags = useCallback(async () => {
        if (!fileId) return;
        try {
            const response = await api.get(`/tags/files/${fileId}`);
            setFileTags(response.data || []);
        } catch (error) {
            console.error('Failed to load file tags:', error);
        }
    }, [fileId]);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            await loadTags();
            if (fileId) {
                await loadFileTags();
            }
            setLoading(false);
        };
        load();
    }, [loadTags, loadFileTags, fileId]);

    const handleCreateTag = async () => {
        if (!newTagName.trim()) return;

        setCreating(true);
        try {
            const response = await api.post('/tags', {
                name: newTagName.trim(),
                color: newTagColor,
            });
            setTags([...tags, response.data]);
            setNewTagName('');
            setShowCreate(false);
            toast(t('tags.tagCreated'), 'success');
        } catch (error: any) {
            if (error.response?.status === 409) {
                toast(t('tags.duplicateName'), 'error');
            } else {
                toast(t('tags.createError'), 'error');
            }
        } finally {
            setCreating(false);
        }
    };

    const handleDeleteTag = async (tagId: string) => {
        try {
            await api.delete(`/tags/${tagId}`);
            setTags(tags.filter(t => t.id !== tagId));
            setFileTags(fileTags.filter(t => t.id !== tagId));
            toast(t('tags.tagDeleted'), 'success');
        } catch (error) {
            toast(t('tags.deleteError'), 'error');
        }
    };

    const handleUpdateTag = async (tagId: string) => {
        if (!editTagName.trim()) return;

        try {
            const response = await api.patch(`/tags/${tagId}`, {
                name: editTagName.trim(),
            });
            setTags(tags.map(t => t.id === tagId ? response.data : t));
            setFileTags(fileTags.map(t => t.id === tagId ? response.data : t));
            setEditingTagId(null);
            toast(t('tags.tagUpdated'), 'success');
        } catch (error) {
            toast(t('tags.updateError'), 'error');
        }
    };

    const handleAddTagToFile = async (tagId: string) => {
        if (!fileId) return;

        try {
            await api.post(`/tags/files/${fileId}/tags/${tagId}`);
            const tag = tags.find(t => t.id === tagId);
            if (tag) {
                setFileTags([...fileTags, tag]);
            }
            toast(t('tags.tagAdded'), 'success');
        } catch (error) {
            toast(t('tags.addError'), 'error');
        }
    };

    const handleRemoveTagFromFile = async (tagId: string) => {
        if (!fileId) return;

        try {
            await api.delete(`/tags/files/${fileId}/tags/${tagId}`);
            setFileTags(fileTags.filter(t => t.id !== tagId));
            toast(t('tags.tagRemoved'), 'success');
        } catch (error) {
            toast(t('tags.removeError'), 'error');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-primary-600" />
            </div>
        );
    }

    // Compact mode for sidebar - just list of tags for filtering
    if (compact && !fileId) {
        return (
            <div className="space-y-1">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-dark-500 uppercase tracking-wider">
                        {t('tags.title')}
                    </span>
                    <button
                        onClick={() => setShowCreate(!showCreate)}
                        className="p-1 text-dark-400 hover:text-primary-600 transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                    </button>
                </div>

                {showCreate && (
                    <div className="p-2 bg-dark-50 dark:bg-dark-800 rounded-lg mb-2">
                        <input
                            type="text"
                            value={newTagName}
                            onChange={(e) => setNewTagName(e.target.value)}
                            placeholder={t('tags.tagName')}
                            className="w-full px-2 py-1 text-sm bg-white dark:bg-dark-900 border border-dark-200 dark:border-dark-700 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                            onKeyDown={(e) => e.key === 'Enter' && handleCreateTag()}
                        />
                        <div className="flex gap-1 mt-2">
                            {TAG_COLORS.map(color => (
                                <button
                                    key={color}
                                    onClick={() => setNewTagColor(color)}
                                    className={cn(
                                        'w-5 h-5 rounded-full transition-transform',
                                        newTagColor === color && 'ring-2 ring-offset-2 ring-primary-500 scale-110'
                                    )}
                                    style={{ backgroundColor: color }}
                                />
                            ))}
                        </div>
                        <Button size="sm" onClick={handleCreateTag} loading={creating} className="w-full mt-2">
                            {t('tags.addTag')}
                        </Button>
                    </div>
                )}

                {tags.length === 0 ? (
                    <p className="text-sm text-dark-400 py-2">{t('tags.noTags')}</p>
                ) : (
                    tags.map(tag => (
                        <button
                            key={tag.id}
                            onClick={() => onTagSelect?.(tag.id)}
                            className={cn(
                                'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors',
                                selectedTagId === tag.id
                                    ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                                    : 'hover:bg-dark-100 dark:hover:bg-dark-800 text-dark-700 dark:text-dark-300'
                            )}
                        >
                            <Tag className="w-4 h-4" style={{ color: tag.color || undefined }} />
                            <span className="truncate">{tag.name}</span>
                        </button>
                    ))
                )}
            </div>
        );
    }

    // Full mode for file details panel
    const fileTagIds = new Set(fileTags.map(t => t.id));
    const availableTags = tags.filter(t => !fileTagIds.has(t.id));

    return (
        <div className="space-y-3">
            {/* File's current tags */}
            {fileId && (
                <div>
                    <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-2">
                        {t('tags.title')}
                    </label>
                    <div className="flex flex-wrap gap-2">
                        {fileTags.map(tag => (
                            <span
                                key={tag.id}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium text-white"
                                style={{ backgroundColor: tag.color || '#6B7280' }}
                            >
                                {tag.name}
                                <button
                                    onClick={() => handleRemoveTagFromFile(tag.id)}
                                    className="ml-1 hover:bg-white/20 rounded-full p-0.5"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            </span>
                        ))}
                        {fileTags.length === 0 && (
                            <span className="text-sm text-dark-400">{t('tags.noTags')}</span>
                        )}
                    </div>
                </div>
            )}

            {/* Add tag to file */}
            {fileId && availableTags.length > 0 && (
                <div>
                    <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-2">
                        {t('tags.addToFile')}
                    </label>
                    <div className="flex flex-wrap gap-2">
                        {availableTags.map(tag => (
                            <button
                                key={tag.id}
                                onClick={() => handleAddTagToFile(tag.id)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border border-dark-200 dark:border-dark-700 hover:bg-dark-100 dark:hover:bg-dark-800 transition-colors"
                            >
                                <span
                                    className="w-2 h-2 rounded-full"
                                    style={{ backgroundColor: tag.color || '#6B7280' }}
                                />
                                {tag.name}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Manage all tags */}
            <div>
                <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-dark-700 dark:text-dark-300">
                        {fileId ? t('tags.editTag') : t('tags.title')}
                    </label>
                    <button
                        onClick={() => setShowCreate(!showCreate)}
                        className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
                    >
                        <Plus className="w-4 h-4" />
                        {t('tags.newTag')}
                    </button>
                </div>

                {showCreate && (
                    <div className="p-3 bg-dark-50 dark:bg-dark-800 rounded-lg mb-3">
                        <input
                            type="text"
                            value={newTagName}
                            onChange={(e) => setNewTagName(e.target.value)}
                            placeholder={t('tags.tagName')}
                            className="w-full px-3 py-2 bg-white dark:bg-dark-900 border border-dark-200 dark:border-dark-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                            onKeyDown={(e) => e.key === 'Enter' && handleCreateTag()}
                        />
                        <div className="flex items-center gap-2 mt-3">
                            <span className="text-sm text-dark-500">{t('tags.tagColor')}:</span>
                            <div className="flex gap-1">
                                {TAG_COLORS.map(color => (
                                    <button
                                        key={color}
                                        onClick={() => setNewTagColor(color)}
                                        className={cn(
                                            'w-6 h-6 rounded-full transition-transform',
                                            newTagColor === color && 'ring-2 ring-offset-2 ring-primary-500 scale-110'
                                        )}
                                        style={{ backgroundColor: color }}
                                    />
                                ))}
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 mt-3">
                            <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)}>
                                {t('common.cancel')}
                            </Button>
                            <Button size="sm" onClick={handleCreateTag} loading={creating}>
                                {t('tags.addTag')}
                            </Button>
                        </div>
                    </div>
                )}

                {/* Tag list with edit/delete */}
                <div className="space-y-1">
                    {tags.map(tag => (
                        <div
                            key={tag.id}
                            className="flex items-center gap-2 p-2 rounded-lg hover:bg-dark-50 dark:hover:bg-dark-800 group"
                        >
                            <span
                                className="w-3 h-3 rounded-full flex-shrink-0"
                                style={{ backgroundColor: tag.color || '#6B7280' }}
                            />
                            {editingTagId === tag.id ? (
                                <input
                                    type="text"
                                    value={editTagName}
                                    onChange={(e) => setEditTagName(e.target.value)}
                                    className="flex-1 px-2 py-1 text-sm bg-white dark:bg-dark-900 border border-dark-200 dark:border-dark-700 rounded focus:outline-none focus:ring-1 focus:ring-primary-500"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleUpdateTag(tag.id);
                                        if (e.key === 'Escape') setEditingTagId(null);
                                    }}
                                    autoFocus
                                />
                            ) : (
                                <span className="flex-1 text-sm text-dark-700 dark:text-dark-300 truncate">
                                    {tag.name}
                                </span>
                            )}
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                {editingTagId === tag.id ? (
                                    <button
                                        onClick={() => handleUpdateTag(tag.id)}
                                        className="p-1 text-green-600 hover:bg-green-100 dark:hover:bg-green-900/30 rounded"
                                    >
                                        <Check className="w-4 h-4" />
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => {
                                            setEditingTagId(tag.id);
                                            setEditTagName(tag.name);
                                        }}
                                        className="p-1 text-dark-400 hover:text-dark-600 dark:hover:text-dark-200 rounded"
                                    >
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                )}
                                <button
                                    onClick={() => handleDeleteTag(tag.id)}
                                    className="p-1 text-red-400 hover:text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 rounded"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
