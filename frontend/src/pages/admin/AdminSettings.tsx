import { useEffect, useState } from 'react';
import { api, API_URL } from '../../lib/api';
import { Save, Upload, Check, Globe, Users, HardDrive, FileType, Mail, Palette } from 'lucide-react';
import { toast } from '../../components/ui/Toast';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
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

export default function AdminSettings() {
  const { setBranding } = useBrandingStore();

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

  const [loading, setLoading] = useState(true);
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
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const [systemRes, smtpRes, brandingRes] = await Promise.all([
        api.get('/admin/settings/system').catch(() => ({ data: {} })),
        api.get('/admin/settings/smtp').catch(() => ({ data: {} })),
        api.get('/admin/settings/branding').catch(() => ({ data: {} })),
      ]);

      if (systemRes.data) setSystemSettings((prev) => ({ ...prev, ...systemRes.data }));
      if (smtpRes.data) setSmtpSettings((prev) => ({ ...prev, ...smtpRes.data }));
      if (brandingRes.data) {
        setBrandingSettings((prev) => ({
          ...prev,
          ...brandingRes.data,
          logoLightUrl: brandingRes.data.logoLightUrl || brandingRes.data.logoUrl || '',
          logoDarkUrl: brandingRes.data.logoDarkUrl || brandingRes.data.logoUrl || '',
        }));
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#FF3B3B]"></div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
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
          />
          <Input
            label="Contraseña"
            type="password"
            value={smtpSettings.password}
            onChange={(e) => setSmtpSettings({ ...smtpSettings, password: e.target.value })}
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
              className="flex flex-col items-center justify-center h-24 rounded-xl cursor-pointer transition-colors"
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
    </div>
  );
}
