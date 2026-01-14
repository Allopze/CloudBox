import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../../lib/api';
import { User } from '../../../types';
import { UserPlus, Search, Edit, Shield, ShieldOff, Trash2, MoreVertical } from 'lucide-react';
import Button from '../../ui/Button';
import Input from '../../ui/Input';
import Modal from '../../ui/Modal';
import Dropdown, { DropdownItem, DropdownDivider } from '../../ui/Dropdown';
import { formatBytes, formatDate, cn } from '../../../lib/utils';
import { useAuthStore } from '../../../stores/authStore';
import { toast } from '../../ui/Toast';

export default function UsersSection() {
    const { t } = useTranslation();
    const { user: currentUser, refreshUser } = useAuthStore();

    // Users state
    const [users, setUsers] = useState<User[]>([]);
    const [usersLoading, setUsersLoading] = useState(true);
    const [userSearch, setUserSearch] = useState('');

    // Modals state
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);

    // Selection state
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [userToDelete, setUserToDelete] = useState<User | null>(null);

    // Loading states
    const [deletingUser, setDeletingUser] = useState(false);
    const [savingUser, setSavingUser] = useState(false);

    // Form state
    const [formName, setFormName] = useState('');
    const [formEmail, setFormEmail] = useState('');
    const [formPassword, setFormPassword] = useState('');
    const [formRole, setFormRole] = useState<'USER' | 'ADMIN'>('USER');
    const [formStorageQuota, setFormStorageQuota] = useState('10737418240');
    const [customQuotaValue, setCustomQuotaValue] = useState('');
    const [customQuotaUnit, setCustomQuotaUnit] = useState<'GB' | 'TB'>('GB');

    // Predefined quota options in bytes
    const gbLabel = t('common.units.gb');
    const tbLabel = t('common.units.tb');
    const quotaOptions = [
        { value: '1073741824', label: `1 ${gbLabel}` },
        { value: '5368709120', label: `5 ${gbLabel}` },
        { value: '10737418240', label: `10 ${gbLabel}` },
        { value: '21474836480', label: `20 ${gbLabel}` },
        { value: '32212254720', label: `30 ${gbLabel}` },
        { value: '53687091200', label: `50 ${gbLabel}` },
        { value: '107374182400', label: `100 ${gbLabel}` },
        { value: '214748364800', label: `200 ${gbLabel}` },
        { value: '536870912000', label: `500 ${gbLabel}` },
        { value: '1099511627776', label: `1 ${tbLabel}` },
        { value: 'custom', label: t('admin.users.custom') },
    ];

    const handleUserQuotaChange = (value: string) => {
        if (value === 'custom') {
            setFormStorageQuota('custom');
        } else {
            setFormStorageQuota(value);
            setCustomQuotaValue('');
        }
    };

    const getEffectiveQuota = () => {
        if (formStorageQuota === 'custom' && customQuotaValue) {
            const numValue = parseFloat(customQuotaValue);
            if (isNaN(numValue) || numValue <= 0) return '10737418240'; // Default 10GB
            const multiplier = customQuotaUnit === 'TB' ? 1099511627776 : 1073741824;
            return String(Math.floor(numValue * multiplier));
        }
        return formStorageQuota;
    };

    // Load users
    const loadUsers = useCallback(async () => {
        setUsersLoading(true);
        try {
            const response = await api.get('/admin/users', {
                params: userSearch ? { search: userSearch } : undefined,
            });
            const usersData = response.data;
            setUsers(Array.isArray(usersData) ? usersData : usersData?.users || []);
        } catch (error) {
            console.error('Failed to load users:', error);
            toast(t('admin.usersLoadError'), 'error');
        } finally {
            setUsersLoading(false);
        }
    }, [userSearch, t]);

    useEffect(() => {
        loadUsers();
    }, [loadUsers]);

    // Actions
    const openCreateModal = () => {
        setFormName('');
        setFormEmail('');
        setFormPassword('');
        setFormRole('USER');
        setFormStorageQuota('10737418240');
        setCustomQuotaValue('');
        setCustomQuotaUnit('GB');
        setShowCreateModal(true);
    };

    const openEditModal = (user: User) => {
        setSelectedUser(user);
        setFormName(user.name);
        setFormEmail(user.email);
        setFormPassword('');
        setFormRole(user.role);

        // Check if quota matches a predefined option
        const matchingOption = quotaOptions.find(opt => opt.value === user.storageQuota);
        if (matchingOption && matchingOption.value !== 'custom') {
            setFormStorageQuota(user.storageQuota);
            setCustomQuotaValue('');
        } else {
            // Custom value logic
            const quotaBytes = BigInt(user.storageQuota);
            const tbValue = Number(quotaBytes) / 1099511627776;
            const gbValue = Number(quotaBytes) / 1073741824;
            if (tbValue >= 1 && Number.isInteger(tbValue)) {
                setFormStorageQuota('custom');
                setCustomQuotaValue(String(tbValue));
                setCustomQuotaUnit('TB');
            } else {
                setFormStorageQuota('custom');
                setCustomQuotaValue(String(Math.round(gbValue * 100) / 100));
                setCustomQuotaUnit('GB');
            }
        }
        setShowEditModal(true);
    };

    const createUser = async () => {
        if (!formName || !formEmail || !formPassword) {
            toast(t('admin.fillAllFields'), 'error');
            return;
        }
        setSavingUser(true);
        try {
            await api.post('/admin/users', {
                name: formName,
                email: formEmail,
                password: formPassword,
                role: formRole,
                storageQuota: getEffectiveQuota(),
            });
            toast(t('admin.users.userCreated'), 'success');
            setShowCreateModal(false);
            loadUsers();
        } catch (error: any) {
            toast(error.response?.data?.message || t('admin.userCreateError'), 'error');
        } finally {
            setSavingUser(false);
        }
    };

    const updateUser = async () => {
        if (!selectedUser) return;
        setSavingUser(true);
        try {
            await api.patch(`/admin/users/${selectedUser.id}`, {
                name: formName,
                email: formEmail,
                password: formPassword || undefined,
                role: formRole,
                storageQuota: getEffectiveQuota(),
            });
            toast(t('admin.users.userUpdated'), 'success');
            setShowEditModal(false);
            loadUsers();
            if (selectedUser.id === currentUser?.id) {
                await refreshUser();
            }
        } catch (error: any) {
            toast(error.response?.data?.message || t('admin.userUpdateError'), 'error');
        } finally {
            setSavingUser(false);
        }
    };

    const openDeleteModal = (user: User) => {
        setUserToDelete(user);
        setShowDeleteModal(true);
    };

    const deleteUser = async () => {
        if (!userToDelete) return;
        setDeletingUser(true);
        try {
            await api.delete(`/admin/users/${userToDelete.id}`);
            toast(t('admin.users.userDeleted'), 'success');
            setShowDeleteModal(false);
            setUserToDelete(null);
            loadUsers();
        } catch (error) {
            toast(t('admin.deleteUserError'), 'error');
        } finally {
            setDeletingUser(false);
        }
    };

    const toggleAdmin = async (user: User) => {
        try {
            await api.patch(`/admin/users/${user.id}`, {
                role: user.role === 'ADMIN' ? 'USER' : 'ADMIN',
            });
            toast(user.role === 'ADMIN' ? t('admin.demotedToUser') : t('admin.promotedToAdmin'), 'success');
            loadUsers();
        } catch (error) {
            toast(t('admin.roleChangeError'), 'error');
        }
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-dark-900 dark:text-white">
                        {t('admin.users.title')}
                    </h2>
                    <p className="text-dark-500 dark:text-dark-400 mt-1">
                        {t('admin.users.description')}
                    </p>
                </div>
                <Button onClick={openCreateModal} icon={<UserPlus className="w-4 h-4" />}>
                    {t('admin.users.newUser')}
                </Button>
            </div>

            {/* Search */}
            <div className="mb-6">
                <Input
                    placeholder={t('admin.users.search')}
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    icon={<Search className="w-5 h-5" />}
                    className="max-w-md"
                />
            </div>

            {/* Users table */}
            {usersLoading ? (
                <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                </div>
            ) : (
                <div className="border border-dark-100 dark:border-dark-700 rounded-2xl overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-dark-50 dark:bg-dark-900/50">
                                <tr>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider">
                                        {t('admin.users.user')}
                                    </th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider">
                                        {t('admin.users.role')}
                                    </th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider">
                                        {t('admin.users.storage')}
                                    </th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-dark-500 uppercase tracking-wider">
                                        {t('admin.users.joined')}
                                    </th>
                                    <th className="px-6 py-4 text-right text-xs font-semibold text-dark-500 uppercase tracking-wider">
                                        {t('admin.users.actions')}
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-dark-100 dark:divide-dark-700">
                                {users.map((user) => (
                                    <tr key={user.id} className="hover:bg-dark-50 dark:hover:bg-dark-700/30 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-4">
                                                {user.avatar ? (
                                                    <img
                                                        src={user.avatar}
                                                        alt={user.name}
                                                        className="w-10 h-10 rounded-full object-cover shadow-sm"
                                                    />
                                                ) : (
                                                    <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 dark:text-primary-400 font-bold">
                                                        {user.name.charAt(0).toUpperCase()}
                                                    </div>
                                                )}
                                                <div>
                                                    <p className="font-semibold text-dark-900 dark:text-white">
                                                        {user.name}
                                                    </p>
                                                    <p className="text-sm text-dark-500">{user.email}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span
                                                className={cn(
                                                    'px-2.5 py-1 rounded-full text-xs font-semibold',
                                                    user.role === 'ADMIN'
                                                        ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                                        : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                                )}
                                            >
                                                {user.role}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div>
                                                <p className="text-sm font-medium text-dark-900 dark:text-white">
                                                    {formatBytes(user.storageUsed)}
                                                </p>
                                                <p className="text-xs text-dark-500">
                                                    {t('common.of')} {formatBytes(user.storageQuota)}
                                                </p>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-dark-500">
                                            {formatDate(user.createdAt)}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <Dropdown
                                                trigger={
                                                    <button
                                                        className="p-2 text-dark-400 hover:text-dark-900 dark:hover:text-white rounded-lg hover:bg-dark-100 dark:hover:bg-dark-700 transition-colors"
                                                    >
                                                        <MoreVertical className="w-5 h-5" />
                                                    </button>
                                                }
                                                align="right"
                                            >
                                                <DropdownItem onClick={() => openEditModal(user)}>
                                                    <Edit className="w-4 h-4" /> {t('admin.users.edit')}
                                                </DropdownItem>
                                                <DropdownItem onClick={() => toggleAdmin(user)}>
                                                    {user.role === 'ADMIN' ? (
                                                        <>
                                                            <ShieldOff className="w-4 h-4" /> {t('admin.users.demoteUser')}
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Shield className="w-4 h-4" /> {t('admin.users.promoteAdmin')}
                                                        </>
                                                    )}
                                                </DropdownItem>
                                                <DropdownDivider />
                                                <DropdownItem danger onClick={() => openDeleteModal(user)}>
                                                    <Trash2 className="w-4 h-4" /> {t('admin.users.delete')}
                                                </DropdownItem>
                                            </Dropdown>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Create Modal */}
            <Modal
                isOpen={showCreateModal}
                onClose={() => setShowCreateModal(false)}
                title={t('admin.users.createUser')}
            >
                <form onSubmit={(e) => { e.preventDefault(); createUser(); }} className="space-y-4">
                    <Input label={t('admin.users.name')} value={formName} onChange={(e) => setFormName(e.target.value)} />
                    <Input label={t('admin.users.email')} type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} autoComplete="off" />
                    <Input label={t('admin.users.password')} type="password" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} autoComplete="new-password" />
                    <div>
                        <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">{t('admin.users.role')}</label>
                        <select value={formRole} onChange={(e) => setFormRole(e.target.value as any)} className="input">
                            <option value="USER">{t('admin.users.USER')}</option>
                            <option value="ADMIN">{t('admin.users.ADMIN')}</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">{t('admin.users.storageQuota')}</label>
                        <select value={formStorageQuota} onChange={(e) => handleUserQuotaChange(e.target.value)} className="input mb-2">
                            {quotaOptions.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                        {formStorageQuota === 'custom' && (
                            <div className="flex gap-2">
                                <input type="number" value={customQuotaValue} onChange={(e) => setCustomQuotaValue(e.target.value)} className="input flex-1" placeholder={t('admin.users.amount')} />
                                <select value={customQuotaUnit} onChange={(e) => setCustomQuotaUnit(e.target.value as any)} className="input w-24">
                                    <option value="GB">{t('common.units.gb')}</option>
                                    <option value="TB">{t('common.units.tb')}</option>
                                </select>
                            </div>
                        )}
                    </div>
                    <div className="flex justify-end gap-3 mt-6">
                        <Button variant="ghost" onClick={() => setShowCreateModal(false)}>{t('common.cancel')}</Button>
                        <Button type="submit" loading={savingUser}>{t('common.create')}</Button>
                    </div>
                </form>
            </Modal>

            {/* Edit Modal - Similar to Create Modal but for Edit */}
            <Modal
                isOpen={showEditModal}
                onClose={() => setShowEditModal(false)}
                title={t('admin.users.editUser')}
            >
                <form onSubmit={(e) => { e.preventDefault(); updateUser(); }} className="space-y-4">
                    <Input label={t('admin.users.name')} value={formName} onChange={(e) => setFormName(e.target.value)} />
                    <Input label={t('admin.users.email')} type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} />
                    <Input label={t('admin.users.passwordHint')} type="password" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} autoComplete="new-password" />
                    <div>
                        <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">{t('admin.users.role')}</label>
                        <select value={formRole} onChange={(e) => setFormRole(e.target.value as any)} className="input">
                            <option value="USER">{t('admin.users.USER')}</option>
                            <option value="ADMIN">{t('admin.users.ADMIN')}</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">{t('admin.users.storageQuota')}</label>
                        <select value={formStorageQuota} onChange={(e) => handleUserQuotaChange(e.target.value)} className="input mb-2">
                            {quotaOptions.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                        {formStorageQuota === 'custom' && (
                            <div className="flex gap-2">
                                <input type="number" value={customQuotaValue} onChange={(e) => setCustomQuotaValue(e.target.value)} className="input flex-1" />
                                <select value={customQuotaUnit} onChange={(e) => setCustomQuotaUnit(e.target.value as any)} className="input w-24">
                                    <option value="GB">{t('common.units.gb')}</option>
                                    <option value="TB">{t('common.units.tb')}</option>
                                </select>
                            </div>
                        )}
                    </div>
                    <div className="flex justify-end gap-3 mt-6">
                        <Button variant="ghost" onClick={() => setShowEditModal(false)}>{t('common.cancel')}</Button>
                        <Button type="submit" loading={savingUser}>{t('common.save')}</Button>
                    </div>
                </form>
            </Modal>

            {/* Delete Modal */}
            <Modal
                isOpen={showDeleteModal}
                onClose={() => setShowDeleteModal(false)}
                title={t('admin.users.delete')}
                size="sm"
            >
                <div className="text-center">
                    <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
                        <Trash2 className="w-8 h-8 text-red-600" />
                    </div>
                    <p className="text-dark-900 dark:text-white mb-2">
                        {t('admin.users.deleteConfirm')} <strong>{userToDelete?.name}</strong>?
                    </p>
                    <p className="text-sm text-dark-500 dark:text-dark-400 mb-6">
                        {t('admin.users.deleteWarning')}
                    </p>
                    <div className="flex justify-center gap-3">
                        <Button variant="ghost" onClick={() => setShowDeleteModal(false)}>{t('common.cancel')}</Button>
                        <Button variant="danger" onClick={deleteUser} loading={deletingUser}>{t('common.delete')}</Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
