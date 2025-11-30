import { useEffect, useState, useCallback } from 'react';
import { api, API_URL } from '../../lib/api';
import { formatBytes, formatDate, cn } from '../../lib/utils';
import { User } from '../../types';
import {
  Users,
  FileText,
  HardDrive,
  TrendingUp,
  BarChart3,
  Save,
  Upload,
  Check,
  Globe,
  FileType,
  Mail,
  Palette,
  Search,
  MoreVertical,
  Shield,
  ShieldOff,
  Trash2,
  Edit,
  UserPlus,
} from 'lucide-react';
import { toast } from '../../components/ui/Toast';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import Dropdown, { DropdownItem, DropdownDivider } from '../../components/ui/Dropdown';
import { useBrandingStore } from '../../stores/brandingStore';

// Helper functions for byte conversion
const bytesToUnit = (bytes: string): { value: string; unit: string } => {
  const b = parseInt(bytes) || 0;
  if (b >= 1099511627776) return { value: (b / 1099511627776).toString(), unit: 'TB' };
  if (b >= 1073741824) return { value: (b / 1073741824).toString(), unit: 'GB' };
  return { value: (b / 1048576).toString(), unit: 'MB' };
};

const unitToBytes = (value: string, unit: string): string => {
  const v = parseFloat(value) || 0;
  switch (unit) {
    case 'TB': return Math.round(v * 1099511627776).toString();
    case 'GB': return Math.round(v * 1073741824).toString();
    case 'MB': default: return Math.round(v * 1048576).toString();
  }
};

interface AdminStats {
  totalUsers: number;
  totalFiles: number;
  totalStorage: number;
  activeUsers: number;
}

interface SystemSettings {
  siteName: string;
  siteDescription: string;
  allowRegistration: boolean;
  defaultStorageQuota: string;
  maxFileSize: string;
  allowedFileTypes: string;
}

interface SmtpSettings {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  fromName: string;
  fromEmail: string;
}

interface BrandingSettings {
  primaryColor: string;
  logoUrl: string;
  logoLightUrl: string;
  logoDarkUrl: string;
  faviconUrl: string;
}

export default function AdminDashboard() {
  const { setBranding } = useBrandingStore();
  
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Users state
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [userSearch, setUserSearch] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [deletingUser, setDeletingUser] = useState(false);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState<'USER' | 'ADMIN'>('USER');
  const [formStorageQuota, setFormStorageQuota] = useState('10737418240');
  const [customQuotaValue, setCustomQuotaValue] = useState('');
  const [customQuotaUnit, setCustomQuotaUnit] = useState<'GB' | 'TB'>('GB');
  const [savingUser, setSavingUser] = useState(false);

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
    { value: 'custom', label: 'Personalizado' },
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

  const [systemSettings, setSystemSettings] = useState<SystemSettings>({
    siteName: 'CloudBox',
    siteDescription: 'Your files, everywhere',
    allowRegistration: true,
    defaultStorageQuota: '10737418240',
    maxFileSize: '1073741824',
    allowedFileTypes: '*',
  });

  const [smtpSettings, setSmtpSettings] = useState<SmtpSettings>({
    host: '',
    port: 587,
    secure: false,
    user: '',
    password: '',
    fromName: 'CloudBox',
    fromEmail: '',
  });

  const [brandingSettings, setBrandingSettings] = useState<BrandingSettings>({
    primaryColor: '#FF3B3B',
    logoUrl: '',
    logoLightUrl: '',
    logoDarkUrl: '',
    faviconUrl: '',
  });

  const [savingSystem, setSavingSystem] = useState(false);
  const [savingSmtp, setSavingSmtp] = useState(false);
  const [savingBranding, setSavingBranding] = useState(false);
  const [uploading, setUploading] = useState<Record<string, boolean>>({});

  // Derived state for quota inputs
  const quotaParsed = bytesToUnit(systemSettings.defaultStorageQuota);
  const [quotaValue, setQuotaValue] = useState(quotaParsed.value);
  const [quotaUnit, setQuotaUnit] = useState(quotaParsed.unit);

  const maxFileSizeParsed = bytesToUnit(systemSettings.maxFileSize);
  const [maxFileSizeValue, setMaxFileSizeValue] = useState(maxFileSizeParsed.value);
  const [maxFileSizeUnit, setMaxFileSizeUnit] = useState(maxFileSizeParsed.unit);

  // Update local state when settings are loaded
  useEffect(() => {
    const q = bytesToUnit(systemSettings.defaultStorageQuota);
    setQuotaValue(q.value);
    setQuotaUnit(q.unit);
    const m = bytesToUnit(systemSettings.maxFileSize);
    setMaxFileSizeValue(m.value);
    setMaxFileSizeUnit(m.unit);
  }, [systemSettings.defaultStorageQuota, systemSettings.maxFileSize]);

  const handleQuotaChange = (value: string, unit: string) => {
    setQuotaValue(value);
    setQuotaUnit(unit);
    setSystemSettings(prev => ({
      ...prev,
      defaultStorageQuota: unitToBytes(value, unit)
    }));
  };

  const handleMaxFileSizeChange = (value: string, unit: string) => {
    setMaxFileSizeValue(value);
    setMaxFileSizeUnit(unit);
    setSystemSettings(prev => ({
      ...prev,
      maxFileSize: unitToBytes(value, unit)
    }));
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [statsRes, systemRes, smtpRes, brandingRes] = await Promise.all([
        api.get('/admin/server-info').catch(() => ({ data: {} })),
        api.get('/admin/settings/system').catch(() => ({ data: {} })),
        api.get('/admin/settings/smtp').catch(() => ({ data: {} })),
        api.get('/admin/settings/branding').catch(() => ({ data: {} })),
      ]);

      if (statsRes.data) {
        setStats({
          totalUsers: statsRes.data.stats?.users || 0,
          totalFiles: statsRes.data.stats?.files || 0,
          totalStorage: parseInt(statsRes.data.stats?.totalStorage || '0'),
          activeUsers: statsRes.data.stats?.users || 0,
        });
      }
      if (systemRes.data) setSystemSettings((prev) => ({ ...prev, ...systemRes.data }));
      if (smtpRes.data) setSmtpSettings((prev) => ({ ...prev, ...smtpRes.data }));
      if (brandingRes.data) {
        // Convert relative URLs to absolute URLs
        const getFullUrl = (url: string | undefined): string => {
          if (!url) return '';
          if (url.startsWith('http')) return url;
          if (url.startsWith('/api')) return `${API_URL.replace('/api', '')}${url}`;
          return url;
        };
        
        setBrandingSettings((prev) => ({
          ...prev,
          ...brandingRes.data,
          logoLightUrl: getFullUrl(brandingRes.data.logoLightUrl || brandingRes.data.logoUrl),
          logoDarkUrl: getFullUrl(brandingRes.data.logoDarkUrl || brandingRes.data.logoUrl),
          faviconUrl: getFullUrl(brandingRes.data.faviconUrl),
        }));
      }
    } catch (error) {
      console.error('Failed to load admin data:', error);
      toast('Error al cargar datos', 'error');
    } finally {
      setLoading(false);
    }
  };

  const saveSystemSettings = async () => {
    setSavingSystem(true);
    try {
      await api.put('/admin/settings/system', systemSettings);
      toast('Configuración guardada', 'success');
    } catch (error) {
      toast('Error al guardar', 'error');
    } finally {
      setSavingSystem(false);
    }
  };

  const saveSmtpSettings = async () => {
    setSavingSmtp(true);
    try {
      await api.put('/admin/settings/smtp', smtpSettings);
      toast('SMTP guardado', 'success');
    } catch (error) {
      toast('Error al guardar SMTP', 'error');
    } finally {
      setSavingSmtp(false);
    }
  };

  const saveBrandingSettings = async () => {
    setSavingBranding(true);
    try {
      await api.put('/admin/settings/branding', {
        ...brandingSettings,
        logoUrl: brandingSettings.logoLightUrl || brandingSettings.logoDarkUrl || brandingSettings.logoUrl,
      });
      setBranding(brandingSettings);
      toast('Branding guardado', 'success');
    } catch (error) {
      toast('Error al guardar branding', 'error');
    } finally {
      setSavingBranding(false);
    }
  };

  const uploadBrandingAsset = async (type: 'logo-light' | 'logo-dark' | 'favicon', file: File | null) => {
    if (!file) return;
    setUploading((prev) => ({ ...prev, [type]: true }));
    try {
      const formData = new FormData();
      formData.append('file', file);
      await api.post(`/admin/branding/${type}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const url = `${API_URL}/admin/branding/${type}?t=${Date.now()}`;
      const updated = {
        ...brandingSettings,
        ...(type === 'logo-light' && { logoLightUrl: url }),
        ...(type === 'logo-dark' && { logoDarkUrl: url }),
        ...(type === 'favicon' && { faviconUrl: url }),
      };
      setBrandingSettings(updated);
      setBranding(updated);
      toast('Archivo subido', 'success');
    } catch (error) {
      toast('Error al subir', 'error');
    } finally {
      setUploading((prev) => ({ ...prev, [type]: false }));
    }
  };

  const testSmtp = async () => {
    try {
      await api.post('/admin/settings/smtp/test');
      toast('Email de prueba enviado', 'success');
    } catch (error) {
      toast('Error al enviar email', 'error');
    }
  };

  // Users functions
  const loadUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const response = await api.get('/admin/users', {
        params: userSearch ? { search: userSearch } : undefined,
      });
      // Ensure we always have an array
      const usersData = response.data;
      setUsers(Array.isArray(usersData) ? usersData : usersData?.users || []);
    } catch (error) {
      console.error('Failed to load users:', error);
      toast('Error al cargar usuarios', 'error');
    } finally {
      setUsersLoading(false);
    }
  }, [userSearch]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

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
      toast('Por favor completa todos los campos', 'error');
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
      toast('Usuario creado', 'success');
      setShowCreateModal(false);
      loadUsers();
    } catch (error: any) {
      toast(error.response?.data?.message || 'Error al crear usuario', 'error');
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
      toast('Usuario actualizado', 'success');
      setShowEditModal(false);
      loadUsers();
    } catch (error: any) {
      toast(error.response?.data?.message || 'Error al actualizar usuario', 'error');
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
      toast('Usuario eliminado', 'success');
      setShowDeleteModal(false);
      setUserToDelete(null);
      loadUsers();
    } catch (error) {
      toast('Error al eliminar usuario', 'error');
    } finally {
      setDeletingUser(false);
    }
  };

  const toggleAdmin = async (user: User) => {
    try {
      await api.patch(`/admin/users/${user.id}`, {
        role: user.role === 'ADMIN' ? 'USER' : 'ADMIN',
      });
      toast(`Usuario ${user.role === 'ADMIN' ? 'degradado a usuario' : 'promovido a admin'}`, 'success');
      loadUsers();
    } catch (error) {
      toast('Error al cambiar rol', 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#FF3B3B]"></div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      {/* Estadísticas Section */}
      <section className="bg-white dark:bg-dark-800 rounded-2xl border border-dark-100 dark:border-dark-700 p-6 mb-6">
        <div className="flex items-center gap-2 mb-1">
          <BarChart3 className="w-4 h-4 text-[#FF3B3B]" />
          <h2 className="text-lg font-semibold text-dark-900 dark:text-white">Estadísticas Generales</h2>
        </div>
        <p className="text-sm text-dark-500 dark:text-dark-400 mb-6">Resumen del estado del sistema</p>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="flex items-center gap-3 p-4 bg-dark-50 dark:bg-dark-900 rounded-xl">
            <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-dark-500 dark:text-dark-400">Usuarios Totales</p>
              <p className="text-xl font-bold text-dark-900 dark:text-white">
                {stats?.totalUsers || 0}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-4 bg-dark-50 dark:bg-dark-900 rounded-xl">
            <div className="w-12 h-12 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <FileText className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-dark-500 dark:text-dark-400">Archivos Totales</p>
              <p className="text-xl font-bold text-dark-900 dark:text-white">
                {stats?.totalFiles || 0}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-4 bg-dark-50 dark:bg-dark-900 rounded-xl">
            <div className="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <HardDrive className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <p className="text-xs text-dark-500 dark:text-dark-400">Almacenamiento</p>
              <p className="text-xl font-bold text-dark-900 dark:text-white">
                {formatBytes(stats?.totalStorage || 0)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-4 bg-dark-50 dark:bg-dark-900 rounded-xl">
            <div className="w-12 h-12 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <p className="text-xs text-dark-500 dark:text-dark-400">Usuarios Activos</p>
              <p className="text-xl font-bold text-dark-900 dark:text-white">
                {stats?.activeUsers || 0}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* General Section */}
      <section className="bg-white dark:bg-dark-800 rounded-2xl border border-dark-100 dark:border-dark-700 p-6 mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Globe className="w-4 h-4 text-[#FF3B3B]" />
          <h2 className="text-lg font-semibold text-dark-900 dark:text-white">General</h2>
        </div>
        <p className="text-sm text-dark-500 dark:text-dark-400 mb-6">Información básica del sitio</p>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <Input
            label="Nombre del Sitio"
            value={systemSettings.siteName}
            onChange={(e) => setSystemSettings({ ...systemSettings, siteName: e.target.value })}
          />
          <Input
            label="Descripción"
            value={systemSettings.siteDescription}
            onChange={(e) => setSystemSettings({ ...systemSettings, siteDescription: e.target.value })}
          />
        </div>

        {/* Registration Toggle */}
        <div className="flex items-center justify-between p-4 bg-dark-50 dark:bg-dark-900 rounded-xl mb-4">
          <div className="flex items-center gap-3">
            <Users className="w-5 h-5 text-dark-500" />
            <div>
              <p className="font-medium text-dark-900 dark:text-white">Permitir Registro</p>
              <p className="text-sm text-dark-500">Nuevos usuarios pueden registrarse</p>
            </div>
          </div>
          <button
            onClick={() => setSystemSettings({ ...systemSettings, allowRegistration: !systemSettings.allowRegistration })}
            className={`relative w-12 h-7 rounded-full transition-all ${systemSettings.allowRegistration ? 'bg-[#FF3B3B]' : 'bg-dark-200 dark:bg-dark-700'}`}
          >
            <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ${systemSettings.allowRegistration ? 'left-6' : 'left-1'}`}>
              {systemSettings.allowRegistration && <Check className="w-3 h-3 text-[#FF3B3B] m-1" />}
            </span>
          </button>
        </div>

        {/* Storage Limits */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">
              <HardDrive className="w-4 h-4 inline mr-1" /> Cuota por defecto
            </label>
            <div className="flex rounded-xl border border-dark-300 dark:border-dark-600 focus-within:ring-2 focus-within:ring-[#FF3B3B] focus-within:border-[#FF3B3B] overflow-hidden">
              <input
                type="number"
                value={quotaValue}
                onChange={(e) => handleQuotaChange(e.target.value, quotaUnit)}
                className="w-full px-3 py-2 bg-white dark:bg-dark-800 text-dark-900 dark:text-white focus:outline-none"
                min="1"
              />
              <select
                value={quotaUnit}
                onChange={(e) => handleQuotaChange(quotaValue, e.target.value)}
                className="px-2 py-2 bg-dark-100 dark:bg-dark-700 text-dark-900 dark:text-white border-l border-dark-300 dark:border-dark-600 focus:outline-none cursor-pointer"
              >
                <option value="MB">MB</option>
                <option value="GB">GB</option>
                <option value="TB">TB</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">
              <FileType className="w-4 h-4 inline mr-1" /> Tamaño máx. archivo
            </label>
            <div className="flex rounded-xl border border-dark-300 dark:border-dark-600 focus-within:ring-2 focus-within:ring-[#FF3B3B] focus-within:border-[#FF3B3B] overflow-hidden">
              <input
                type="number"
                value={maxFileSizeValue}
                onChange={(e) => handleMaxFileSizeChange(e.target.value, maxFileSizeUnit)}
                className="w-full px-3 py-2 bg-white dark:bg-dark-800 text-dark-900 dark:text-white focus:outline-none"
                min="1"
              />
              <select
                value={maxFileSizeUnit}
                onChange={(e) => handleMaxFileSizeChange(maxFileSizeValue, e.target.value)}
                className="px-2 py-2 bg-dark-100 dark:bg-dark-700 text-dark-900 dark:text-white border-l border-dark-300 dark:border-dark-600 focus:outline-none cursor-pointer"
              >
                <option value="MB">MB</option>
                <option value="GB">GB</option>
                <option value="TB">TB</option>
              </select>
            </div>
          </div>
          <Input
            label="Tipos permitidos"
            value={systemSettings.allowedFileTypes}
            onChange={(e) => setSystemSettings({ ...systemSettings, allowedFileTypes: e.target.value })}
            placeholder="* para todos"
          />
        </div>

        <div className="flex justify-end pt-4 border-t border-dark-100 dark:border-dark-700">
          <Button onClick={saveSystemSettings} loading={savingSystem} icon={<Save className="w-4 h-4" />}>
            Guardar General
          </Button>
        </div>
      </section>

      {/* Email Section */}
      <section className="bg-white dark:bg-dark-800 rounded-2xl border border-dark-100 dark:border-dark-700 p-6 mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Mail className="w-4 h-4 text-[#FF3B3B]" />
          <h2 className="text-lg font-semibold text-dark-900 dark:text-white">Email (SMTP)</h2>
        </div>
        <p className="text-sm text-dark-500 dark:text-dark-400 mb-6">Configuración del servidor de correo</p>

        <div className="grid grid-cols-4 gap-4 mb-4">
          <Input
            label="Host SMTP"
            value={smtpSettings.host}
            onChange={(e) => setSmtpSettings({ ...smtpSettings, host: e.target.value })}
            placeholder="smtp.example.com"
          />
          <Input
            label="Puerto"
            type="number"
            value={smtpSettings.port.toString()}
            onChange={(e) => setSmtpSettings({ ...smtpSettings, port: parseInt(e.target.value) || 587 })}
          />
          <Input
            label="Usuario"
            value={smtpSettings.user}
            onChange={(e) => setSmtpSettings({ ...smtpSettings, user: e.target.value })}
            autoComplete="off"
          />
          <Input
            label="Contraseña"
            type="password"
            value={smtpSettings.password}
            onChange={(e) => setSmtpSettings({ ...smtpSettings, password: e.target.value })}
            autoComplete="off"
          />
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <Input
            label="Nombre remitente"
            value={smtpSettings.fromName}
            onChange={(e) => setSmtpSettings({ ...smtpSettings, fromName: e.target.value })}
          />
          <Input
            label="Email remitente"
            type="email"
            value={smtpSettings.fromEmail}
            onChange={(e) => setSmtpSettings({ ...smtpSettings, fromEmail: e.target.value })}
          />
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-dark-100 dark:border-dark-700">
          <Button variant="secondary" onClick={testSmtp}>Enviar prueba</Button>
          <Button onClick={saveSmtpSettings} loading={savingSmtp} icon={<Save className="w-4 h-4" />}>
            Guardar Email
          </Button>
        </div>
      </section>

      {/* Branding Section */}
      <section className="bg-white dark:bg-dark-800 rounded-2xl border border-dark-100 dark:border-dark-700 p-6">
        <div className="flex items-center gap-2 mb-1">
          <Palette className="w-4 h-4 text-[#FF3B3B]" />
          <h2 className="text-lg font-semibold text-dark-900 dark:text-white">Branding</h2>
        </div>
        <p className="text-sm text-dark-500 dark:text-dark-400 mb-6">Personaliza la apariencia</p>

        {/* Color */}
        <div className="flex items-center gap-4 mb-6">
          <label className="text-sm font-medium text-dark-700 dark:text-dark-300">Color principal</label>
          <input
            type="color"
            value={brandingSettings.primaryColor}
            onChange={(e) => setBrandingSettings({ ...brandingSettings, primaryColor: e.target.value })}
            className="w-10 h-10 rounded-lg cursor-pointer border-0"
          />
          <Input
            value={brandingSettings.primaryColor}
            onChange={(e) => setBrandingSettings({ ...brandingSettings, primaryColor: e.target.value })}
            className="w-32"
          />
        </div>

        {/* Logo Uploads */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {/* Logo Light */}
          <div>
            <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-2">Logo (claro)</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => uploadBrandingAsset('logo-light', e.target.files?.[0] || null)}
              className="hidden"
              id="logo-light-upload"
              disabled={uploading['logo-light']}
            />
            <label
              htmlFor="logo-light-upload"
              className="flex flex-col items-center justify-center h-24 border-2 border-dashed border-dark-200 dark:border-dark-700 rounded-xl cursor-pointer hover:border-[#FF3B3B] transition-colors"
            >
              {brandingSettings.logoLightUrl ? (
                <img src={brandingSettings.logoLightUrl} alt="Logo" className="h-16 object-contain" />
              ) : (
                <Upload className="w-6 h-6 text-dark-400" />
              )}
            </label>
          </div>

          {/* Logo Dark */}
          <div>
            <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-2">Logo (oscuro)</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => uploadBrandingAsset('logo-dark', e.target.files?.[0] || null)}
              className="hidden"
              id="logo-dark-upload"
              disabled={uploading['logo-dark']}
            />
            <label
              htmlFor="logo-dark-upload"
              className="flex flex-col items-center justify-center h-24 border-2 border-dashed border-dark-200 dark:border-dark-700 rounded-xl cursor-pointer hover:border-[#FF3B3B] transition-colors bg-dark-800"
            >
              {brandingSettings.logoDarkUrl ? (
                <img src={brandingSettings.logoDarkUrl} alt="Logo" className="h-16 object-contain" />
              ) : (
                <Upload className="w-6 h-6 text-dark-500" />
              )}
            </label>
          </div>

          {/* Favicon */}
          <div>
            <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-2">Favicon</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => uploadBrandingAsset('favicon', e.target.files?.[0] || null)}
              className="hidden"
              id="favicon-upload"
              disabled={uploading['favicon']}
            />
            <label
              htmlFor="favicon-upload"
              className="flex flex-col items-center justify-center h-24 border-2 border-dashed border-dark-200 dark:border-dark-700 rounded-xl cursor-pointer hover:border-[#FF3B3B] transition-colors"
            >
              {brandingSettings.faviconUrl ? (
                <img src={brandingSettings.faviconUrl} alt="Favicon" className="h-12 w-12 object-contain" />
              ) : (
                <Upload className="w-6 h-6 text-dark-400" />
              )}
            </label>
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t border-dark-100 dark:border-dark-700">
          <Button onClick={saveBrandingSettings} loading={savingBranding} icon={<Save className="w-4 h-4" />}>
            Guardar Branding
          </Button>
        </div>
      </section>

      {/* Users Section */}
      <section className="bg-white dark:bg-dark-800 rounded-2xl border border-dark-100 dark:border-dark-700 p-6 mt-6">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[#FF3B3B]" />
            <h2 className="text-lg font-semibold text-dark-900 dark:text-white">Gestión de Usuarios</h2>
          </div>
          <Button onClick={openCreateModal} size="sm" icon={<UserPlus className="w-4 h-4" />}>
            Nuevo Usuario
          </Button>
        </div>
        <p className="text-sm text-dark-500 dark:text-dark-400 mb-6">Administrar cuentas de usuario ({users.length} usuarios)</p>

        {/* Search */}
        <div className="mb-4">
          <Input
            placeholder="Buscar usuarios..."
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            icon={<Search className="w-5 h-5" />}
          />
        </div>

        {/* Users table */}
        {usersLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#FF3B3B]"></div>
          </div>
        ) : (
          <div className="rounded-xl border border-dark-200 dark:border-dark-700 overflow-x-auto">
            <table className="w-full">
              <thead className="bg-dark-50 dark:bg-dark-900">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-dark-500 uppercase tracking-wider">
                    Usuario
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-dark-500 uppercase tracking-wider">
                    Rol
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-dark-500 uppercase tracking-wider">
                    Almacenamiento
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-dark-500 uppercase tracking-wider">
                    Registro
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-dark-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-200 dark:divide-dark-700 bg-white dark:bg-dark-800">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-dark-50 dark:hover:bg-dark-700/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {user.avatar ? (
                          <img
                            src={user.avatar}
                            alt={user.name}
                            className="w-9 h-9 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-[#FF3B3B]/10 flex items-center justify-center">
                            <span className="text-[#FF3B3B] font-medium text-sm">
                              {user.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-dark-900 dark:text-white text-sm">
                            {user.name}
                          </p>
                          <p className="text-xs text-dark-500">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'px-2 py-1 rounded-full text-xs font-medium',
                          user.role === 'ADMIN'
                            ? 'bg-[#FF3B3B]/10 text-[#FF3B3B]'
                            : 'bg-dark-100 text-dark-700 dark:bg-dark-700 dark:text-dark-300'
                        )}
                      >
                        {user.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-sm text-dark-900 dark:text-white">
                          {formatBytes(user.storageUsed)}
                        </p>
                        <p className="text-xs text-dark-500">
                          de {formatBytes(user.storageQuota)}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-dark-500">
                      {formatDate(user.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Dropdown
                        trigger={
                          <button className="p-2 text-dark-500 hover:text-dark-900 dark:hover:text-white rounded-lg hover:bg-dark-100 dark:hover:bg-dark-600">
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        }
                        align="right"
                      >
                        <DropdownItem onClick={() => openEditModal(user)}>
                          <Edit className="w-4 h-4" /> Editar
                        </DropdownItem>
                        <DropdownItem onClick={() => toggleAdmin(user)}>
                          {user.role === 'ADMIN' ? (
                            <>
                              <ShieldOff className="w-4 h-4" /> Degradar a Usuario
                            </>
                          ) : (
                            <>
                              <Shield className="w-4 h-4" /> Promover a Admin
                            </>
                          )}
                        </DropdownItem>
                        <DropdownDivider />
                        <DropdownItem danger onClick={() => openDeleteModal(user)}>
                          <Trash2 className="w-4 h-4" /> Eliminar
                        </DropdownItem>
                      </Dropdown>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Create user modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Crear Usuario"
      >
        <form onSubmit={(e) => { e.preventDefault(); createUser(); }} className="space-y-4">
          <Input
            label="Nombre"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
          />
          <Input
            label="Email"
            type="email"
            value={formEmail}
            onChange={(e) => setFormEmail(e.target.value)}
            autoComplete="off"
          />
          <Input
            label="Contraseña"
            type="password"
            value={formPassword}
            onChange={(e) => setFormPassword(e.target.value)}
            autoComplete="new-password"
          />
          <div>
            <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">
              Rol
            </label>
            <select
              value={formRole}
              onChange={(e) => setFormRole(e.target.value as 'USER' | 'ADMIN')}
              className="input"
            >
              <option value="USER">Usuario</option>
              <option value="ADMIN">Administrador</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">
              Cuota de Almacenamiento
            </label>
            <select
              value={formStorageQuota}
              onChange={(e) => handleUserQuotaChange(e.target.value)}
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
                  placeholder="Cantidad"
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
              Cancelar
            </Button>
            <Button type="submit" loading={savingUser}>
              Crear
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit user modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Editar Usuario"
      >
        <form onSubmit={(e) => { e.preventDefault(); updateUser(); }} className="space-y-4">
          <Input
            label="Nombre"
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
            label="Contraseña (dejar vacío para mantener)"
            type="password"
            value={formPassword}
            onChange={(e) => setFormPassword(e.target.value)}
            autoComplete="new-password"
          />
          <div>
            <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">
              Rol
            </label>
            <select
              value={formRole}
              onChange={(e) => setFormRole(e.target.value as 'USER' | 'ADMIN')}
              className="input"
            >
              <option value="USER">Usuario</option>
              <option value="ADMIN">Administrador</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">
              Cuota de Almacenamiento
            </label>
            <select
              value={formStorageQuota}
              onChange={(e) => handleUserQuotaChange(e.target.value)}
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
                  placeholder="Cantidad"
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
              Cancelar
            </Button>
            <Button type="submit" loading={savingUser}>
              Guardar Cambios
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setUserToDelete(null);
        }}
        title="Eliminar Usuario"
        size="sm"
      >
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
            <Trash2 className="w-8 h-8 text-red-600" />
          </div>
          <p className="text-dark-900 dark:text-white mb-2">
            ¿Estás seguro de eliminar a <strong>{userToDelete?.name}</strong>?
          </p>
          <p className="text-sm text-dark-500 dark:text-dark-400 mb-6">
            Esta acción no se puede deshacer. Todos los archivos del usuario serán eliminados permanentemente.
          </p>
          <div className="flex justify-center gap-3">
            <Button
              variant="ghost"
              onClick={() => {
                setShowDeleteModal(false);
                setUserToDelete(null);
              }}
              disabled={deletingUser}
            >
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={deleteUser}
              loading={deletingUser}
              icon={<Trash2 className="w-4 h-4" />}
            >
              Eliminar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
