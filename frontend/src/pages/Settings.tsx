import { useState, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';
import { api } from '../lib/api';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import { Lock, Upload, Save, Moon, Sun, Calendar, Shield as ShieldIcon, User, HardDrive, Clock, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { toast } from '../components/ui/Toast';
import { formatBytes } from '../lib/utils';

interface StorageRequest {
  id: string;
  requestedQuota: string;
  currentQuota: string;
  reason: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  adminResponse: string | null;
  createdAt: string;
}

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
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  
  // Storage request state
  const [showStorageModal, setShowStorageModal] = useState(false);
  const [requestedQuota, setRequestedQuota] = useState('10737418240');
  const [requestReason, setRequestReason] = useState('');
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [storageRequests, setStorageRequests] = useState<StorageRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [showRequestsHistory, setShowRequestsHistory] = useState(false);
  
  // Admin storage quota state
  const [adminQuota, setAdminQuota] = useState(user?.storageQuota || '10737418240');
  const [savingQuota, setSavingQuota] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

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
      await api.post('/users/change-password', {
        currentPassword,
        newPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast('Contraseña actualizada', 'success');
    } catch (error: any) {
      toast(error.response?.data?.error || 'Error al cambiar contraseña', 'error');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!['image/jpeg', 'image/png', 'image/gif'].includes(file.type)) {
      toast('Solo se permiten archivos JPG, PNG o GIF', 'error');
      return;
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast('El archivo no puede superar los 5MB', 'error');
      return;
    }

    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('avatar', file);

      const response = await api.post('/users/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      updateUser({ avatar: response.data.avatar + '?t=' + Date.now() });
      toast('Foto de perfil actualizada', 'success');
    } catch (error: any) {
      toast(error.response?.data?.error || 'Error al subir la foto', 'error');
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const loadStorageRequests = async () => {
    setLoadingRequests(true);
    try {
      const response = await api.get('/users/storage-requests');
      setStorageRequests(response.data);
    } catch (error) {
      console.error('Failed to load storage requests:', error);
    } finally {
      setLoadingRequests(false);
    }
  };

  const handleOpenStorageModal = () => {
    if (user?.role === 'ADMIN') {
      setAdminQuota(user.storageQuota);
    }
    setShowStorageModal(true);
    loadStorageRequests();
  };

  const handleSubmitStorageRequest = async () => {
    if (!requestReason.trim()) {
      toast('Por favor, indica el motivo de tu solicitud', 'error');
      return;
    }

    setSubmittingRequest(true);
    try {
      await api.post('/users/storage-request', {
        requestedQuota,
        reason: requestReason,
      });
      toast('Solicitud enviada correctamente', 'success');
      setShowStorageModal(false);
      setRequestReason('');
      loadStorageRequests();
    } catch (error: any) {
      toast(error.response?.data?.error || 'Error al enviar la solicitud', 'error');
    } finally {
      setSubmittingRequest(false);
    }
  };

  const handleSaveAdminQuota = async () => {
    setSavingQuota(true);
    try {
      const response = await api.patch('/users/me/storage-quota', {
        storageQuota: adminQuota,
      });
      updateUser({ 
        storageQuota: response.data.storageQuota,
        storageUsed: response.data.storageUsed,
      });
      toast('Cuota actualizada', 'success');
      setShowStorageModal(false);
    } catch (error: any) {
      toast(error.response?.data?.error || 'Error al actualizar la cuota', 'error');
    } finally {
      setSavingQuota(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
            <Clock className="w-3 h-3" />
            Pendiente
          </span>
        );
      case 'APPROVED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
            <CheckCircle className="w-3 h-3" />
            Aprobada
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
            <XCircle className="w-3 h-3" />
            Rechazada
          </span>
        );
      default:
        return null;
    }
  };

  const hasPendingRequest = storageRequests.some(r => r.status === 'PENDING');

  const storageUsedPercent = user && parseInt(user.storageQuota) > 0
    ? Math.round((parseInt(user.storageUsed) / parseInt(user.storageQuota)) * 100)
    : 0;

  return (
    <div className="h-full overflow-auto">
      {/* Hidden file input for avatar */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif"
        className="hidden"
        onChange={handleAvatarChange}
      />

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
            <Button 
              variant="secondary" 
              size="sm" 
              icon={uploadingAvatar ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              onClick={handleAvatarClick}
              disabled={uploadingAvatar}
            >
              {uploadingAvatar ? 'Subiendo...' : 'Subir foto'}
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
          <Button variant="secondary" size="sm" onClick={handleOpenStorageModal}>
            {user?.role === 'ADMIN' ? 'Ajustar cuota' : 'Ampliar'}
          </Button>
        </div>

        {/* Historial de solicitudes para usuarios normales */}
        {user?.role !== 'ADMIN' && storageRequests.length > 0 && (
          <div className="mt-4 pt-4 border-t border-dark-100 dark:border-dark-700">
            <button
              onClick={() => setShowRequestsHistory(!showRequestsHistory)}
              className="text-sm text-primary-600 hover:text-primary-700"
            >
              {showRequestsHistory ? 'Ocultar historial' : 'Ver historial de solicitudes'}
            </button>
            
            {showRequestsHistory && (
              <div className="mt-3 space-y-2">
                {loadingRequests ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-5 h-5 animate-spin text-primary-600" />
                  </div>
                ) : storageRequests.length === 0 ? (
                  <p className="text-sm text-dark-500 text-center py-4">No hay solicitudes previas</p>
                ) : (
                  storageRequests.map((request) => (
                    <div
                      key={request.id}
                      className="p-3 bg-dark-50 dark:bg-dark-900 rounded-lg"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-dark-900 dark:text-white">
                          Solicitud: {formatBytes(request.requestedQuota)}
                        </span>
                        {getStatusBadge(request.status)}
                      </div>
                      <p className="text-xs text-dark-500">
                        {new Date(request.createdAt).toLocaleDateString('es-ES')}
                      </p>
                      {request.adminResponse && (
                        <p className="text-xs text-dark-600 dark:text-dark-400 mt-1 italic">
                          Respuesta: {request.adminResponse}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Storage Modal */}
      <Modal
        isOpen={showStorageModal}
        onClose={() => setShowStorageModal(false)}
        title={user?.role === 'ADMIN' ? 'Ajustar cuota de almacenamiento' : 'Solicitar más almacenamiento'}
      >
        {user?.role === 'ADMIN' ? (
          /* Admin: Ajustar cuota directamente */
          <div className="space-y-4">
            <p className="text-sm text-dark-500 dark:text-dark-400">
              Como administrador, puedes ajustar tu cuota de almacenamiento directamente.
            </p>
            
            <div>
              <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">
                Nueva cuota de almacenamiento
              </label>
              <select
                value={adminQuota}
                onChange={(e) => setAdminQuota(e.target.value)}
                className="input w-full"
              >
                <option value="1073741824">1 GB</option>
                <option value="5368709120">5 GB</option>
                <option value="10737418240">10 GB</option>
                <option value="53687091200">50 GB</option>
                <option value="107374182400">100 GB</option>
                <option value="268435456000">250 GB</option>
                <option value="536870912000">500 GB</option>
                <option value="1099511627776">1 TB</option>
              </select>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <Button variant="ghost" onClick={() => setShowStorageModal(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSaveAdminQuota} loading={savingQuota}>
                Guardar
              </Button>
            </div>
          </div>
        ) : (
          /* Usuario normal: Enviar solicitud */
          <div className="space-y-4">
            {hasPendingRequest ? (
              <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                <div className="flex items-center gap-2 text-yellow-800 dark:text-yellow-400">
                  <Clock className="w-5 h-5" />
                  <span className="font-medium">Solicitud pendiente</span>
                </div>
                <p className="text-sm text-yellow-700 dark:text-yellow-500 mt-1">
                  Ya tienes una solicitud de almacenamiento pendiente. Espera a que un administrador la revise.
                </p>
              </div>
            ) : (
              <>
                <p className="text-sm text-dark-500 dark:text-dark-400">
                  Envía una solicitud al administrador para aumentar tu cuota de almacenamiento.
                </p>

                <div>
                  <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">
                    Cuota actual
                  </label>
                  <div className="input w-full bg-dark-50 dark:bg-dark-900">
                    {formatBytes(user?.storageQuota || 0)}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">
                    Cuota solicitada
                  </label>
                  <select
                    value={requestedQuota}
                    onChange={(e) => setRequestedQuota(e.target.value)}
                    className="input w-full"
                  >
                    <option value="5368709120">5 GB</option>
                    <option value="10737418240">10 GB</option>
                    <option value="53687091200">50 GB</option>
                    <option value="107374182400">100 GB</option>
                    <option value="268435456000">250 GB</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">
                    Motivo de la solicitud <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={requestReason}
                    onChange={(e) => setRequestReason(e.target.value)}
                    className="input w-full h-24 resize-none"
                    placeholder="Explica por qué necesitas más almacenamiento..."
                  />
                </div>

                <div className="flex justify-end gap-3 mt-6">
                  <Button variant="ghost" onClick={() => setShowStorageModal(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleSubmitStorageRequest} loading={submittingRequest}>
                    Enviar solicitud
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
