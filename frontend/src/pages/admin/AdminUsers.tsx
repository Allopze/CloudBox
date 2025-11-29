import { useEffect, useState, useCallback } from 'react';
import { api } from '../../lib/api';
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
} from 'lucide-react';
import { toast } from '../../components/ui/Toast';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import Dropdown, { DropdownItem, DropdownDivider } from '../../components/ui/Dropdown';

export default function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState<'USER' | 'ADMIN'>('USER');
  const [formStorageQuota, setFormStorageQuota] = useState('10737418240'); // 10GB default
  const [saving, setSaving] = useState(false);

  const loadUsers = useCallback(async () => {
    try {
      const response = await api.get('/admin/users', {
        params: search ? { search } : undefined,
      });
      setUsers(response.data || []);
    } catch (error) {
      console.error('Failed to load users:', error);
      toast('Failed to load users', 'error');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const openCreateModal = () => {
    setFormName('');
    setFormEmail('');
    setFormPassword('');
    setFormRole('USER');
    setFormStorageQuota('10737418240');
    setShowCreateModal(true);
  };

  const openEditModal = (user: User) => {
    setSelectedUser(user);
    setFormName(user.name);
    setFormEmail(user.email);
    setFormPassword('');
    setFormRole(user.role);
    setFormStorageQuota(user.storageQuota);
    setShowEditModal(true);
  };

  const createUser = async () => {
    if (!formName || !formEmail || !formPassword) {
      toast('Please fill all required fields', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.post('/admin/users', {
        name: formName,
        email: formEmail,
        password: formPassword,
        role: formRole,
        storageQuota: formStorageQuota,
      });
      toast('User created', 'success');
      setShowCreateModal(false);
      loadUsers();
    } catch (error: any) {
      toast(error.response?.data?.message || 'Failed to create user', 'error');
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
        storageQuota: formStorageQuota,
      });
      toast('User updated', 'success');
      setShowEditModal(false);
      loadUsers();
    } catch (error: any) {
      toast(error.response?.data?.message || 'Failed to update user', 'error');
    } finally {
      setSaving(false);
    }
  };

  const deleteUser = async (user: User) => {
    if (!confirm(`Are you sure you want to delete ${user.name}?`)) return;
    try {
      await api.delete(`/admin/users/${user.id}`);
      toast('User deleted', 'success');
      loadUsers();
    } catch (error) {
      toast('Failed to delete user', 'error');
    }
  };

  const toggleAdmin = async (user: User) => {
    try {
      await api.patch(`/admin/users/${user.id}`, {
        role: user.role === 'ADMIN' ? 'USER' : 'ADMIN',
      });
      toast(`User ${user.role === 'ADMIN' ? 'demoted' : 'promoted'} to ${user.role === 'ADMIN' ? 'user' : 'admin'}`, 'success');
      loadUsers();
    } catch (error) {
      toast('Failed to update user role', 'error');
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
            User Management
          </h1>
          <p className="text-dark-500 dark:text-dark-400 mt-1">
            {users.length} users
          </p>
        </div>
        <Button onClick={openCreateModal} icon={<UserPlus className="w-4 h-4" />}>
          Add User
        </Button>
      </div>

      {/* Search */}
      <div className="mb-6">
        <Input
          placeholder="Search users..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          icon={<Search className="w-5 h-5" />}
        />
      </div>

      {/* Users table */}
      <div className="bg-white dark:bg-dark-800 rounded-xl border overflow-hidden">
        <table className="w-full">
          <thead className="bg-dark-50 dark:bg-dark-700">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-dark-500 uppercase tracking-wider">
                User
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-dark-500 uppercase tracking-wider">
                Role
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-dark-500 uppercase tracking-wider">
                Storage
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-dark-500 uppercase tracking-wider">
                Joined
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-dark-500 uppercase tracking-wider">
                Actions
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
                    {user.role}
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
                      <Edit className="w-4 h-4" /> Edit
                    </DropdownItem>
                    <DropdownItem onClick={() => toggleAdmin(user)}>
                      {user.role === 'ADMIN' ? (
                        <>
                          <ShieldOff className="w-4 h-4" /> Demote to User
                        </>
                      ) : (
                        <>
                          <Shield className="w-4 h-4" /> Promote to Admin
                        </>
                      )}
                    </DropdownItem>
                    <DropdownDivider />
                    <DropdownItem danger onClick={() => deleteUser(user)}>
                      <Trash2 className="w-4 h-4" /> Delete
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
        title="Create User"
      >
        <div className="space-y-4">
          <Input
            label="Name"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
          />
          <Input
            label="Email"
            type="email"
            value={formEmail}
            onChange={(e) => setFormEmail(e.target.value)}
          />
          <Input
            label="Password"
            type="password"
            value={formPassword}
            onChange={(e) => setFormPassword(e.target.value)}
          />
          <div>
            <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">
              Role
            </label>
            <select
              value={formRole}
              onChange={(e) => setFormRole(e.target.value as 'USER' | 'ADMIN')}
              className="input"
            >
              <option value="USER">User</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">
              Storage Quota
            </label>
            <select
              value={formStorageQuota}
              onChange={(e) => setFormStorageQuota(e.target.value)}
              className="input"
            >
              <option value="1073741824">1 GB</option>
              <option value="5368709120">5 GB</option>
              <option value="10737418240">10 GB</option>
              <option value="53687091200">50 GB</option>
              <option value="107374182400">100 GB</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="ghost" onClick={() => setShowCreateModal(false)}>
            Cancel
          </Button>
          <Button onClick={createUser} loading={saving}>
            Create
          </Button>
        </div>
      </Modal>

      {/* Edit user modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Edit User"
      >
        <div className="space-y-4">
          <Input
            label="Name"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
          />
          <Input
            label="Email"
            type="email"
            value={formEmail}
            onChange={(e) => setFormEmail(e.target.value)}
          />
          <Input
            label="Password (leave blank to keep current)"
            type="password"
            value={formPassword}
            onChange={(e) => setFormPassword(e.target.value)}
          />
          <div>
            <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">
              Role
            </label>
            <select
              value={formRole}
              onChange={(e) => setFormRole(e.target.value as 'USER' | 'ADMIN')}
              className="input"
            >
              <option value="USER">User</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">
              Storage Quota
            </label>
            <select
              value={formStorageQuota}
              onChange={(e) => setFormStorageQuota(e.target.value)}
              className="input"
            >
              <option value="1073741824">1 GB</option>
              <option value="5368709120">5 GB</option>
              <option value="10737418240">10 GB</option>
              <option value="53687091200">50 GB</option>
              <option value="107374182400">100 GB</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <Button variant="ghost" onClick={() => setShowEditModal(false)}>
            Cancel
          </Button>
          <Button onClick={updateUser} loading={saving}>
            Save Changes
          </Button>
        </div>
      </Modal>
    </div>
  );
}
