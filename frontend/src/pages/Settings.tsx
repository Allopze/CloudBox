import { useState } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';
import { api } from '../lib/api';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { Lock, Upload, Save, Moon, Sun, Calendar, Shield as ShieldIcon, User, HardDrive } from 'lucide-react';
import { toast } from '../components/ui/Toast';
import { formatBytes } from '../lib/utils';

export default function Settings() {
  const { user, updateUser } = useAuthStore();
  const { isDark, toggleTheme } = useThemeStore();

  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const handleUpdateProfile = async () => {
    setSaving(true);
    try {
      const response = await api.patch('/users/me', { name, email });
      updateUser(response.data);
      toast('Perfil actualizado', 'success');
    } catch (error: any) {
      toast(error.response?.data?.message || 'Error al actualizar perfil', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast('Las contraseñas no coinciden', 'error');
      return;
    }
    if (newPassword.length < 8) {
      toast('La contraseña debe tener al menos 8 caracteres', 'error');
      return;
    }

    setSavingPassword(true);
    try {
      await api.patch('/users/me/password', {
        currentPassword,
        newPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast('Contraseña actualizada', 'success');
    } catch (error: any) {
      toast(error.response?.data?.message || 'Error al cambiar contraseña', 'error');
    } finally {
      setSavingPassword(false);
    }
  };

  const storageUsedPercent = user
    ? Math.round((parseInt(user.storageUsed) / parseInt(user.storageQuota)) * 100)
    : 0;

  return (
    <div className="h-full overflow-auto">
      {/* Mi Perfil Section */}
      <section className="bg-white dark:bg-dark-800 rounded-2xl border border-dark-100 dark:border-dark-700 p-6 mb-6">
        <div className="flex items-center gap-2 mb-1">
          <User className="w-4 h-4 text-[#FF3B3B]" />
          <h2 className="text-lg font-semibold text-dark-900 dark:text-white">Mi Perfil</h2>
        </div>
        <p className="text-sm text-dark-500 dark:text-dark-400 mb-6">Actualiza tu información personal</p>

        {/* Foto de Perfil */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-2">Foto de Perfil</label>
          <div className="flex items-center gap-4">
            {user?.avatar ? (
              <img src={user.avatar} alt={user.name} className="w-12 h-12 rounded-full object-cover" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-[#FF3B3B] flex items-center justify-center">
                <span className="text-lg font-bold text-white">?</span>
              </div>
            )}
            <Button variant="secondary" size="sm" icon={<Upload className="w-4 h-4" />}>
              Subir foto
            </Button>
            <span className="text-xs text-dark-400">JPG, PNG o GIF. Máximo 5MB.</span>
          </div>
        </div>

        {/* Form Fields */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <Input
            label="Nombre Completo"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tu nombre completo"
            required
          />
          <div>
            <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">Nombre de Usuario</label>
            <input
              type="text"
              value={user?.email?.split('@')[0] || ''}
              disabled
              className="input w-full bg-dark-50 dark:bg-dark-900 cursor-not-allowed"
            />
            <p className="text-xs text-dark-400 mt-1 flex items-center gap-1">
              <span className="w-3 h-3 rounded-full border border-dark-300 flex items-center justify-center text-[8px]">i</span>
              El nombre de usuario no se puede cambiar
            </p>
          </div>
        </div>

        <div className="mb-6">
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@email.com"
            required
          />
        </div>

        {/* Información de la cuenta */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-2">Información de la cuenta</label>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-3 p-3 bg-dark-50 dark:bg-dark-900 rounded-xl">
              <div className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-primary-600" />
              </div>
              <div>
                <p className="text-xs text-dark-500">Miembro desde</p>
                <p className="font-medium text-dark-900 dark:text-white">
                  {user?.createdAt ? new Date(user.createdAt).toLocaleDateString('es-ES') : '-'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-dark-50 dark:bg-dark-900 rounded-xl">
              <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                <ShieldIcon className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="text-xs text-dark-500">Rol</p>
                <p className="font-medium text-dark-900 dark:text-white">{user?.role || '-'}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t border-dark-100 dark:border-dark-700">
          <p className="text-xs text-dark-400">Los campos marcados con <span className="text-[#FF3B3B]">*</span> son obligatorios</p>
          <Button onClick={handleUpdateProfile} loading={saving} icon={<Save className="w-4 h-4" />}>
            Guardar Cambios
          </Button>
        </div>
      </section>

      {/* Seguridad Section */}
      <section className="bg-white dark:bg-dark-800 rounded-2xl border border-dark-100 dark:border-dark-700 p-6 mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Lock className="w-4 h-4 text-[#FF3B3B]" />
          <h2 className="text-lg font-semibold text-dark-900 dark:text-white">Seguridad</h2>
        </div>
        <p className="text-sm text-dark-500 dark:text-dark-400 mb-6">Protege tu cuenta y mantén tus datos seguros</p>

        <div className="grid grid-cols-3 gap-4 mb-4">
          <Input
            label="Contraseña actual"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
          <Input
            label="Nueva contraseña"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <Input
            label="Confirmar contraseña"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>
        <Button onClick={handleChangePassword} loading={savingPassword} variant="secondary" icon={<Lock className="w-4 h-4" />}>
          Cambiar Contraseña
        </Button>
      </section>

      {/* Apariencia Section */}
      <section className="bg-white dark:bg-dark-800 rounded-2xl border border-dark-100 dark:border-dark-700 p-6 mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Sun className="w-4 h-4 text-[#FF3B3B]" />
          <h2 className="text-lg font-semibold text-dark-900 dark:text-white">Apariencia</h2>
        </div>
        <p className="text-sm text-dark-500 dark:text-dark-400 mb-4">Personaliza la interfaz</p>

        <div className="flex items-center gap-3">
          <button
            onClick={() => isDark && toggleTheme()}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl border-2 transition-all ${
              !isDark ? 'border-[#FF3B3B] bg-[#FF3B3B]/5' : 'border-dark-200 dark:border-dark-700'
            }`}
          >
            <Sun className="w-4 h-4" />
            <span className="text-sm font-medium">Claro</span>
          </button>
          <button
            onClick={() => !isDark && toggleTheme()}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl border-2 transition-all ${
              isDark ? 'border-[#FF3B3B] bg-[#FF3B3B]/5' : 'border-dark-200 dark:border-dark-700'
            }`}
          >
            <Moon className="w-4 h-4" />
            <span className="text-sm font-medium">Oscuro</span>
          </button>
        </div>
      </section>

      {/* Almacenamiento Section */}
      <section className="bg-white dark:bg-dark-800 rounded-2xl border border-dark-100 dark:border-dark-700 p-6">
        <div className="flex items-center gap-2 mb-1">
          <HardDrive className="w-4 h-4 text-[#FF3B3B]" />
          <h2 className="text-lg font-semibold text-dark-900 dark:text-white">Almacenamiento</h2>
        </div>
        <p className="text-sm text-dark-500 dark:text-dark-400 mb-4">Espacio usado en tu cuenta</p>

        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-xl font-bold text-dark-900 dark:text-white">{formatBytes(user?.storageUsed || 0)}</span>
              <span className="text-dark-400">/ {formatBytes(user?.storageQuota || 0)} ({storageUsedPercent}%)</span>
            </div>
            <div className="w-full h-2 bg-dark-100 dark:bg-dark-700 rounded-full overflow-hidden">
              <div className="h-full bg-[#FF3B3B] rounded-full" style={{ width: `${storageUsedPercent}%` }} />
            </div>
          </div>
          <Button variant="secondary" size="sm">Ampliar</Button>
        </div>
      </section>
    </div>
  );
}
