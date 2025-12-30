import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { api } from '../../lib/api';
import { toast } from '../ui/Toast';
import { Folder } from '../../types';
import { Lock, Eye, EyeOff } from 'lucide-react';

interface UnlockFolderModalProps {
    isOpen: boolean;
    onClose: () => void;
    folder: Folder | null;
    onSuccess?: (folderId: string) => void;
}

export default function UnlockFolderModal({ isOpen, onClose, folder, onSuccess }: UnlockFolderModalProps) {
    const { t } = useTranslation();
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleUnlock = async () => {
        if (!folder || !password) return;

        setLoading(true);
        try {
            await api.post(`/folders/${folder.id}/unlock`, { password });
            toast(t('protectedFolder.unlocked'), 'success');
            onSuccess?.(folder.id);
            handleClose();
        } catch (error: any) {
            toast(error.response?.data?.error || t('protectedFolder.invalidPassword'), 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        setPassword('');
        setShowPassword(false);
        onClose();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleUnlock();
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title={t('protectedFolder.unlockFolder')}
            size="sm"
        >
            <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                    <Lock className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                        {t('protectedFolder.folderIsProtected', { name: folder?.name })}
                    </p>
                </div>

                <div className="relative">
                    <Input
                        label={t('protectedFolder.password')}
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={t('protectedFolder.enterPassword')}
                        autoFocus
                        icon={<Lock className="w-5 h-5" />}
                    />
                    <button
                        type="button"
                        className="absolute right-3 top-9 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        onClick={() => setShowPassword(!showPassword)}
                    >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                </div>

                <div className="flex justify-end gap-3">
                    <Button variant="ghost" onClick={handleClose}>
                        {t('common.cancel')}
                    </Button>
                    <Button
                        onClick={handleUnlock}
                        loading={loading}
                        disabled={!password}
                    >
                        {t('protectedFolder.unlock')}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
