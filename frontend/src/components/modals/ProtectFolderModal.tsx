import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { api } from '../../lib/api';
import { toast } from '../ui/Toast';
import { Folder } from '../../types';
import { Lock, Unlock, Eye, EyeOff } from 'lucide-react';

interface ProtectFolderModalProps {
    isOpen: boolean;
    onClose: () => void;
    folder: Folder | null;
    onSuccess?: () => void;
}

export default function ProtectFolderModal({ isOpen, onClose, folder, onSuccess }: ProtectFolderModalProps) {
    const { t } = useTranslation();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [currentPassword, setCurrentPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);

    const isProtected = folder?.isProtected ?? false;

    const handleSubmit = async () => {
        if (!folder) return;

        if (isProtected) {
            // Remove protection
            if (!currentPassword) {
                toast(t('protectedFolder.currentPasswordRequired'), 'error');
                return;
            }

            setLoading(true);
            try {
                await api.delete(`/folders/${folder.id}/protect`, { data: { password: currentPassword } });
                toast(t('protectedFolder.protectionRemoved'), 'success');
                onSuccess?.();
                handleClose();
            } catch (error: any) {
                toast(error.response?.data?.error || t('protectedFolder.invalidPassword'), 'error');
            } finally {
                setLoading(false);
            }
        } else {
            // Add protection
            if (password.length < 4) {
                toast(t('protectedFolder.passwordTooShort'), 'error');
                return;
            }

            if (password !== confirmPassword) {
                toast(t('protectedFolder.passwordMismatch'), 'error');
                return;
            }

            setLoading(true);
            try {
                await api.post(`/folders/${folder.id}/protect`, { password });
                toast(t('protectedFolder.protectionSet'), 'success');
                onSuccess?.();
                handleClose();
            } catch (error: any) {
                toast(error.response?.data?.error || t('protectedFolder.protectError'), 'error');
            } finally {
                setLoading(false);
            }
        }
    };

    const handleClose = () => {
        setPassword('');
        setConfirmPassword('');
        setCurrentPassword('');
        setShowPassword(false);
        onClose();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSubmit();
        }
    };

    const renderPasswordToggle = () => (
        <button
            type="button"
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            onClick={() => setShowPassword((prev) => !prev)}
        >
            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
        </button>
    );

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title={isProtected ? t('protectedFolder.removeProtection') : t('protectedFolder.setProtection')}
            size="sm"
        >
            <div className="space-y-4">
                {isProtected ? (
                    <>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            {t('protectedFolder.enterCurrentPassword')}
                        </p>
                        <Input
                            label={t('protectedFolder.currentPassword')}
                            type={showPassword ? 'text' : 'password'}
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            onKeyDown={handleKeyDown}
                            autoFocus
                            icon={<Lock className="w-5 h-5" />}
                            rightIcon={renderPasswordToggle()}
                        />
                    </>
                ) : (
                    <>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            {t('protectedFolder.setPasswordDescription')}
                        </p>
                        <Input
                            label={t('protectedFolder.password')}
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            onKeyDown={handleKeyDown}
                            autoFocus
                            icon={<Lock className="w-5 h-5" />}
                            rightIcon={renderPasswordToggle()}
                        />
                        <Input
                            label={t('protectedFolder.confirmPassword')}
                            type={showPassword ? 'text' : 'password'}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            onKeyDown={handleKeyDown}
                            icon={<Lock className="w-5 h-5" />}
                            rightIcon={renderPasswordToggle()}
                        />
                    </>
                )}

                <div className="flex justify-end gap-3">
                    <Button variant="ghost" onClick={handleClose}>
                        {t('common.cancel')}
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        loading={loading}
                        disabled={isProtected ? !currentPassword : (!password || !confirmPassword)}
                        variant={isProtected ? 'danger' : 'primary'}
                    >
                        {isProtected ? (
                            <>
                                <Unlock className="w-4 h-4 mr-2" />
                                {t('protectedFolder.remove')}
                            </>
                        ) : (
                            <>
                                <Lock className="w-4 h-4 mr-2" />
                                {t('protectedFolder.protect')}
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
