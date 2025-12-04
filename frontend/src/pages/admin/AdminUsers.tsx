import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/authStore';
import { User } from '../../types';
import { formatBytes, formatDate, cn } from '../../lib/utils';
import {
  Users,
  Search,
  MoreVertical,
  Shield,
  ShieldOff,
  Trash2,
  Edit,
  UserPlus,
  Loader2,
  HardDrive,
  Clock,
  CheckCircle,
  XCircle,
  MessageSquare,
} from 'lucide-react';
import { toast } from '../../components/ui/Toast';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import ConfirmModal from '../../components/ui/ConfirmModal';
import Dropdown, { DropdownItem, DropdownDivider } from '../../components/ui/Dropdown';

interface StorageRequest {
  id: string;
  userId: string;
  requestedQuota: string;
  currentQuota: string;
  reason: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  adminResponse: string | null;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    avatar: string | null;
    storageUsed: string;
    storageQuota: string;
  };
}

export default function AdminUsers() {
  const { t } = useTranslation();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const { user: currentUser, refreshUser } = useAuthStore();

  // Storage requests state
  const [storageRequests, setStorageRequests] = useState<StorageRequest[]>([]);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  const [showRequestsPanel, setShowRequestsPanel] = useState(false);
  const [showResponseModal, setShowResponseModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<StorageRequest | null>(null);
  const [adminResponse, setAdminResponse] = useState('');
  const [processingRequest, setProcessingRequest] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState<'USER' | 'ADMIN'>('USER');
  const [formStorageQuota, setFormStorageQuota] = useState('10737418240'); // 10GB default
  const [customQuotaValue, setCustomQuotaValue] = useState('');
  const [customQuotaUnit, setCustomQuotaUnit] = useState<'GB' | 'TB'>('GB');
  const [saving, setSaving] = useState(false);

  // Predefined quota options in bytes
  const quotaOptions = [
    { value: '1073741824', label: '1 GB' },
    { value: '5368709120', label: '5 GB' },
    { value: '10737418240', label: '10 GB' },
    { value: '21474836480', label: '20 GB' },
    { value: '32212254720', label: '30 GB' },
    { value: '53687091200', label: '50 GB' },
    { value: '107374182400', label: '100 GB' },
    { value: '214748364800', label: '200 GB' },
    { value: '536870912000', label: '500 GB' },
    { value: '1099511627776', label: '1 TB' },
    { value: 'custom', label: t('admin.users.custom') },
  ];

  const handleQuotaChange = (value: string) => {
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

  const loadUsers = useCallback(async () => {
    try {
      const response = await api.get('/admin/users', {
        params: searchQuery ? { search: searchQuery } : undefined,
      });
      setUsers(response.data.users || response.data || []);
    } catch (error) {
      console.error('Failed to load users:', error);
      toast(t('admin.loadError'), 'error');
    } finally {
      setLoading(false);
    }
  }, [searchQuery, t]);

  const loadStorageRequests = useCallback(async () => {
    try {
      const response = await api.get('/admin/storage-requests');
      setStorageRequests(response.data || []);
    } catch (error) {
      console.error('Failed to load storage requests:', error);
    }
  }, []);

  const loadPendingRequestsCount = useCallback(async () => {
    try {
      const response = await api.get('/admin/storage-requests/count');
      setPendingRequestsCount(response.data.count || 0);
    } catch (error) {
      console.error('Failed to load pending requests count:', error);
    }
  }, []);

  useEffect(() => {
    loadUsers();
    loadPendingRequestsCount();
  }, [loadUsers, loadPendingRequestsCount]);

  useEffect(() => {
    if (showRequestsPanel) {
      loadStorageRequests();
    }
  }, [showRequestsPanel, loadStorageRequests]);

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
      // Custom value - convert to GB or TB
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
      toast(t('admin.saveError'), 'error');
      return;
    }
    setSaving(true);
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
      toast(error.response?.data?.message || t('admin.saveError'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const updateUser = async () => {
    if (!selectedUser) return;
    setSaving(true);
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
      // If updating the current user, refresh their data in the auth store
      if (selectedUser.id === currentUser?.id) {
        await refreshUser();
      }
    } catch (error: any) {
      toast(error.response?.data?.message || t('admin.saveError'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const openDeleteConfirm = (user: User) => {
    setUserToDelete(user);
    setShowDeleteConfirm(true);
  };

  const deleteUser = async () => {
    if (!userToDelete) return;
    setIsDeleting(true);
    try {
      await api.delete(`/admin/users/${userToDelete.id}`);
      toast(t('admin.users.userDeleted'), 'success');
      loadUsers();
    } catch (error) {
      toast(t('admin.saveError'), 'error');
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
      setUserToDelete(null);
    }
  };

  const toggleAdmin = async (user: User) => {
    try {
      await api.patch(`/admin/users/${user.id}`, {
        role: user.role === 'ADMIN' ? 'USER' : 'ADMIN',
      });
      toast(t('admin.users.userUpdated'), 'success');
      loadUsers();
    } catch (error) {
      toast(t('admin.saveError'), 'error');
    }
  };

  const handleApproveRequest = async () => {
    if (!selectedRequest) return;
    setProcessingRequest(true);
    try {
      await api.post(`/admin/storage-requests/${selectedRequest.id}/approve`, {
        adminResponse: adminResponse || undefined,
      });
      toast(t('admin.users.approved'), 'success');
      setShowResponseModal(false);
      setSelectedRequest(null);
      loadStorageRequests();
      loadPendingRequestsCount();
      loadUsers();
    } catch (error: any) {
      toast(error.response?.data?.error || t('admin.saveError'), 'error');
    } finally {
      setProcessingRequest(false);
    }
  };

  const handleRejectRequest = async () => {
    if (!selectedRequest) return;
    setProcessingRequest(true);
    try {
      await api.post(`/admin/storage-requests/${selectedRequest.id}/reject`, {
        adminResponse: adminResponse || undefined,
      });
      toast(t('admin.users.rejected'), 'success');
      setShowResponseModal(false);
      setSelectedRequest(null);
      loadStorageRequests();
      loadPendingRequestsCount();
    } catch (error: any) {
      toast(error.response?.data?.error || t('admin.saveError'), 'error');
    } finally {
      setProcessingRequest(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
            <Clock className="w-3 h-3" />
            {t('admin.users.pending')}
          </span>
        );
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
            <CheckCircle className="w-3 h-3" />
            {t('admin.users.approved')}
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
            <XCircle className="w-3 h-3" />
            {t('admin.users.rejected')}
          </span>
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-dark-900 dark:text-white flex items-center gap-2">
            <Users className="w-6 h-6" />
            {t('admin.users.title')}
          </h1>
          <p className="text-dark-500 dark:text-dark-400 mt-1">
            {t('admin.users.usersCount', { count: users.length })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Storage Requests Button */}
          <Button
            variant={showRequestsPanel ? 'primary' : 'secondary'}
            onClick={() => setShowRequestsPanel(!showRequestsPanel)}
            icon={<HardDrive className="w-4 h-4" />}
          >
            {t('admin.users.requests')}
            {pendingRequestsCount > 0 && (
              <span className="ml-2 px-2 py-0.5 text-xs font-bold bg-red-500 text-white rounded-full">
                {pendingRequestsCount}
              </span>
            )}
          </Button>
          <Button onClick={openCreateModal} icon={<UserPlus className="w-4 h-4" />}>
            {t('admin.users.newUser')}
          </Button>
        </div>
      </div>

      {/* Storage Requests Panel */}
      {showRequestsPanel && (
        <div className="bg-white dark:bg-dark-800 rounded-xl border border-dark-200 dark:border-dark-700 p-6 mb-6">
          <h2 className="text-lg font-semibold text-dark-900 dark:text-white mb-4 flex items-center gap-2">
            <HardDrive className="w-5 h-5" />
            {t('admin.users.storageRequests')}
          </h2>

          {storageRequests.length === 0 ? (
            <p className="text-dark-500 text-center py-8">{t('admin.users.noRequests')}</p>
          ) : (
            <div className="space-y-4">
              {storageRequests.map((request) => (
                <div
                  key={request.id}
                  className={cn(
                    'p-4 rounded-lg border',
                    request.status === 'PENDING'
                      ? 'bg-yellow-50 dark:bg-yellow-900/10 border-yellow-200 dark:border-yellow-800'
                      : 'bg-dark-50 dark:bg-dark-900 border-dark-200 dark:border-dark-700'
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      {request.user.avatar ? (
                        <img
                          src={request.user.avatar}
                          alt={request.user.name}
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                          <span className="text-primary-600 font-medium">
                            {request.user.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-dark-900 dark:text-white">
                          {request.user.name}
                        </p>
                        <p className="text-sm text-dark-500">{request.user.email}</p>
                      </div>
                    </div>
                    {getStatusBadge(request.status)}
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-dark-500">{t('admin.users.currentQuota')}</p>
                      <p className="font-medium text-dark-900 dark:text-white">
                        {formatBytes(request.currentQuota)}
                      </p>
                    </div>
                    <div>
                      <p className="text-dark-500">{t('admin.users.requestedQuota')}</p>
                      <p className="font-medium text-dark-900 dark:text-white">
                        {formatBytes(request.requestedQuota)}
                      </p>
                    </div>
                    <div>
                      <p className="text-dark-500">{t('admin.users.date')}</p>
                      <p className="font-medium text-dark-900 dark:text-white">
                        {formatDate(request.createdAt)}
                      </p>
                    </div>
                  </div>

                  {request.reason && (
                    <div className="mt-3 p-3 bg-white dark:bg-dark-800 rounded-lg">
                      <p className="text-xs text-dark-500 mb-1 flex items-center gap-1">
                        <MessageSquare className="w-3 h-3" />
                        {t('admin.users.reason')}
                      </p>
                      <p className="text-sm text-dark-700 dark:text-dark-300">{request.reason}</p>
                    </div>
                  )}

                  {request.adminResponse && (
                    <div className="mt-2 p-3 bg-primary-50 dark:bg-primary-900/20 rounded-lg">
                      <p className="text-xs text-primary-600 mb-1">{t('admin.users.adminResponse')}</p>
                      <p className="text-sm text-primary-700 dark:text-primary-400">{request.adminResponse}</p>
                    </div>
                  )}

                  {request.status === 'PENDING' && (
                    <div className="mt-4 flex items-center gap-3">
                      <Button
                        size="sm"
                        onClick={() => {
                          setSelectedRequest(request);
                          setAdminResponse('');
                          setShowResponseModal(true);
                        }}
                        icon={<CheckCircle className="w-4 h-4" />}
                      >
                        {t('admin.users.approve')}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setSelectedRequest(request);
                          setAdminResponse('');
                          setShowResponseModal(true);
                        }}
                        icon={<XCircle className="w-4 h-4" />}
                      >
                        {t('admin.users.reject')}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Search */}
      <div className="mb-6">
        <Input
          placeholder={t('admin.users.search')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          icon={<Search className="w-5 h-5" />}
        />
      </div>

      {/* Users table */}
      <div className="bg-white dark:bg-dark-800 rounded-xl border overflow-hidden">
        <table className="w-full">
          <thead className="bg-dark-50 dark:bg-dark-700">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-dark-500 uppercase tracking-wider">
                {t('admin.users.user')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-dark-500 uppercase tracking-wider">
                {t('admin.users.role')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-dark-500 uppercase tracking-wider">
                {t('admin.users.storage')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-dark-500 uppercase tracking-wider">
                {t('admin.users.joined')}
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-dark-500 uppercase tracking-wider">
                {t('admin.users.actions')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-dark-200 dark:divide-dark-700">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-dark-50 dark:hover:bg-dark-700/50">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    {user.avatar ? (
                      <img
                        src={user.avatar}
                        alt={user.name}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                        <span className="text-primary-600 font-medium">
                          {user.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-dark-900 dark:text-white">
                        {user.name}
                      </p>
                      <p className="text-sm text-dark-500">{user.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span
                    className={cn(
                      'px-2 py-1 rounded-full text-xs font-medium',
                      user.role === 'ADMIN'
                        ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                        : 'bg-dark-100 text-dark-700 dark:bg-dark-700 dark:text-dark-300'
                    )}
                  >
                    {t(`admin.users.${user.role}`)}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div>
                    <p className="text-dark-900 dark:text-white">
                      {formatBytes(user.storageUsed)}
                    </p>
                    <p className="text-sm text-dark-500">
                      of {formatBytes(user.storageQuota)}
                    </p>
                  </div>
                </td>
                <td className="px-6 py-4 text-dark-500">
                  {formatDate(user.createdAt)}
                </td>
                <td className="px-6 py-4 text-right">
                  <Dropdown
                    trigger={
                      <button className="p-2 text-dark-500 hover:text-dark-900 dark:hover:text-white rounded-lg hover:bg-dark-100 dark:hover:bg-dark-600">
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
                    <DropdownItem danger onClick={() => openDeleteConfirm(user)}>
                      <Trash2 className="w-4 h-4" /> {t('admin.users.delete')}
                    </DropdownItem>
                  </Dropdown>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create user modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title={t('admin.users.createUser')}
      >
        <form onSubmit={(e) => { e.preventDefault(); createUser(); }} className="space-y-4">
          <Input
            label={t('admin.users.name')}
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
          />
          <Input
            label={t('admin.users.email')}
            type="email"
            value={formEmail}
            onChange={(e) => setFormEmail(e.target.value)}
            autoComplete="off"
          />
          <Input
            label={t('admin.users.password')}
            type="password"
            value={formPassword}
            onChange={(e) => setFormPassword(e.target.value)}
            autoComplete="new-password"
          />
          <div>
            <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">
              {t('admin.users.role')}
            </label>
            <select
              value={formRole}
              onChange={(e) => setFormRole(e.target.value as 'USER' | 'ADMIN')}
              className="input"
            >
              <option value="USER">{t('admin.users.USER')}</option>
              <option value="ADMIN">{t('admin.users.ADMIN')}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">
              {t('admin.users.storageQuota')}
            </label>
            <select
              value={formStorageQuota}
              onChange={(e) => handleQuotaChange(e.target.value)}
              className="input"
            >
              {quotaOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {formStorageQuota === 'custom' && (
              <div className="flex gap-2 mt-2">
                <input
                  type="number"
                  value={customQuotaValue}
                  onChange={(e) => setCustomQuotaValue(e.target.value)}
                  placeholder={t('admin.users.amount')}
                  min="1"
                  className="input flex-1"
                />
                <select
                  value={customQuotaUnit}
                  onChange={(e) => setCustomQuotaUnit(e.target.value as 'GB' | 'TB')}
                  className="input w-20"
                >
                  <option value="GB">GB</option>
                  <option value="TB">TB</option>
                </select>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="ghost" type="button" onClick={() => setShowCreateModal(false)}>
              {t('admin.users.cancel')}
            </Button>
            <Button type="submit" loading={saving}>
              {t('admin.users.create')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit user modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title={t('admin.users.editUser')}
      >
        <form onSubmit={(e) => { e.preventDefault(); updateUser(); }} className="space-y-4">
          <Input
            label={t('admin.users.name')}
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
          />
          <Input
            label={t('admin.users.email')}
            type="email"
            value={formEmail}
            onChange={(e) => setFormEmail(e.target.value)}
            autoComplete="off"
          />
          <Input
            label={t('admin.users.passwordHint')}
            type="password"
            value={formPassword}
            onChange={(e) => setFormPassword(e.target.value)}
            autoComplete="new-password"
          />
          <div>
            <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">
              {t('admin.users.role')}
            </label>
            <select
              value={formRole}
              onChange={(e) => setFormRole(e.target.value as 'USER' | 'ADMIN')}
              className="input"
            >
              <option value="USER">{t('admin.users.USER')}</option>
              <option value="ADMIN">{t('admin.users.ADMIN')}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">
              {t('admin.users.storageQuota')}
            </label>
            <select
              value={formStorageQuota}
              onChange={(e) => handleQuotaChange(e.target.value)}
              className="input"
            >
              {quotaOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {formStorageQuota === 'custom' && (
              <div className="flex gap-2 mt-2">
                <input
                  type="number"
                  value={customQuotaValue}
                  onChange={(e) => setCustomQuotaValue(e.target.value)}
                  placeholder={t('admin.users.amount')}
                  min="1"
                  className="input flex-1"
                />
                <select
                  value={customQuotaUnit}
                  onChange={(e) => setCustomQuotaUnit(e.target.value as 'GB' | 'TB')}
                  className="input w-20"
                >
                  <option value="GB">GB</option>
                  <option value="TB">TB</option>
                </select>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="ghost" type="button" onClick={() => setShowEditModal(false)}>
              {t('admin.users.cancel')}
            </Button>
            <Button type="submit" loading={saving}>
              {t('admin.users.saveChanges')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Storage Request Response Modal */}
      <Modal
        isOpen={showResponseModal}
        onClose={() => {
          setShowResponseModal(false);
          setSelectedRequest(null);
        }}
        title={t('admin.users.respondRequest')}
      >
        {selectedRequest && (
          <div className="space-y-4">
            <div className="p-4 bg-dark-50 dark:bg-dark-900 rounded-lg">
              <p className="text-sm text-dark-500 mb-2">{t('admin.users.user')}</p>
              <p className="font-medium text-dark-900 dark:text-white">
                {selectedRequest.user.name} ({selectedRequest.user.email})
              </p>
              <div className="mt-3 flex items-center gap-4 text-sm">
                <span className="text-dark-500">
                  {t('admin.users.currentQuota')}: <strong className="text-dark-900 dark:text-white">{formatBytes(selectedRequest.currentQuota)}</strong>
                </span>
                <span className="text-dark-400">→</span>
                <span className="text-dark-500">
                  {t('admin.users.requestedQuota')}: <strong className="text-primary-600">{formatBytes(selectedRequest.requestedQuota)}</strong>
                </span>
              </div>
              {selectedRequest.reason && (
                <div className="mt-3 p-2 bg-white dark:bg-dark-800 rounded">
                  <p className="text-xs text-dark-500 mb-1">{t('admin.users.reason')}:</p>
                  <p className="text-sm text-dark-700 dark:text-dark-300">{selectedRequest.reason}</p>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">
                {t('admin.users.response')}
              </label>
              <textarea
                value={adminResponse}
                onChange={(e) => setAdminResponse(e.target.value)}
                className="input w-full h-24 resize-none"
                placeholder={t('admin.users.responseOptional')}
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setShowResponseModal(false);
                  setSelectedRequest(null);
                }}
              >
                {t('admin.users.cancel')}
              </Button>
              <Button
                variant="secondary"
                onClick={handleRejectRequest}
                loading={processingRequest}
                icon={<XCircle className="w-4 h-4" />}
              >
                {t('admin.users.reject')}
              </Button>
              <Button
                onClick={handleApproveRequest}
                loading={processingRequest}
                icon={<CheckCircle className="w-4 h-4" />}
              >
                {t('admin.users.approve')}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete User Confirmation */}
      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => {
          setShowDeleteConfirm(false);
          setUserToDelete(null);
        }}
        onConfirm={deleteUser}
        title={t('admin.users.delete')}
        message={
          userToDelete ? (
            <>
              {t('admin.users.deleteConfirm')} <strong>{userToDelete.name}</strong>?
              <br />
              <span className="text-sm">{t('admin.users.deleteWarning')}</span>
            </>
          ) : ''
        }
        confirmText={t('admin.users.delete')}
        cancelText={t('admin.users.cancel')}
        variant="danger"
        loading={isDeleting}
      />
    </div>
  );
}
