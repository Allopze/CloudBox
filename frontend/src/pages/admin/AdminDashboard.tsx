import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
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
  Eye,
  Code,
  Send,
  RotateCcw,
  Plus,
} from 'lucide-react';
import { toast } from '../../components/ui/Toast';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import Dropdown, { DropdownItem, DropdownDivider } from '../../components/ui/Dropdown';
import { useBrandingStore } from '../../stores/brandingStore';
import { useAuthStore } from '../../stores/authStore';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';

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

interface EmailTemplate {
  id?: string;
  name: string;
  subject: string;
  body: string;
  isDefault?: boolean;
}

interface TemplateVariable {
  id?: string;
  name: string;
  defaultValue: string;
  description?: string;
  isSystem: boolean;
}

interface TemplateVariables {
  system: TemplateVariable[];
  custom: TemplateVariable[];
}

// Default email templates
const DEFAULT_TEMPLATES: Record<string, { subject: string; body: string; variables: string[] }> = {
  welcome: {
    subject: '¡Bienvenido a CloudBox, {{name}}!',
    body: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; padding: 20px 0; }
    .content { background: #f9fafb; border-radius: 12px; padding: 30px; margin: 20px 0; }
    .button { display: inline-block; padding: 14px 28px; background: #dc2626; color: white !important; text-decoration: none; border-radius: 8px; font-weight: 600; }
    .footer { text-align: center; color: #6b7280; font-size: 14px; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="header">
    <h1 style="color: #dc2626; margin: 0;">CloudBox</h1>
  </div>
  <div class="content">
    <h2>¡Hola {{name}}! 👋</h2>
    <p>Gracias por registrarte en CloudBox. Para completar tu registro, por favor verifica tu email:</p>
    <p style="text-align: center; margin: 30px 0;">
      <a href="{{verifyUrl}}" class="button">Verificar Email</a>
    </p>
    <p style="color: #6b7280; font-size: 14px;">Si no creaste esta cuenta, puedes ignorar este mensaje.</p>
  </div>
  <div class="footer">
    <p>© CloudBox - Tu nube personal</p>
  </div>
</body>
</html>`,
    variables: ['{{name}}', '{{verifyUrl}}'],
  },
  reset_password: {
    subject: 'Restablecer contraseña - CloudBox',
    body: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; padding: 20px 0; }
    .content { background: #f9fafb; border-radius: 12px; padding: 30px; margin: 20px 0; }
    .button { display: inline-block; padding: 14px 28px; background: #dc2626; color: white !important; text-decoration: none; border-radius: 8px; font-weight: 600; }
    .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; border-radius: 0 8px 8px 0; margin: 20px 0; }
    .footer { text-align: center; color: #6b7280; font-size: 14px; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="header">
    <h1 style="color: #dc2626; margin: 0;">CloudBox</h1>
  </div>
  <div class="content">
    <h2>Hola {{name}},</h2>
    <p>Hemos recibido una solicitud para restablecer tu contraseña:</p>
    <p style="text-align: center; margin: 30px 0;">
      <a href="{{resetUrl}}" class="button">Restablecer Contraseña</a>
    </p>
    <div class="warning">
      <strong>⚠️ Este enlace expirará en 1 hora.</strong>
    </div>
    <p style="color: #6b7280; font-size: 14px;">Si no solicitaste este cambio, puedes ignorar este mensaje.</p>
  </div>
  <div class="footer">
    <p>© CloudBox - Tu nube personal</p>
  </div>
</body>
</html>`,
    variables: ['{{name}}', '{{resetUrl}}'],
  },
};

export default function AdminDashboard() {
  const { t } = useTranslation();
  const { setBranding } = useBrandingStore();
  const { user: currentUser, refreshUser } = useAuthStore();

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

  // Email templates state
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [sendingTestEmail, setSendingTestEmail] = useState(false);
  const [testEmailAddress, setTestEmailAddress] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [showNewTemplateModal, setShowNewTemplateModal] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');

  // Template variables state
  const [templateVariables, setTemplateVariables] = useState<TemplateVariables>({ system: [], custom: [] });
  const [showVariablesPanel, setShowVariablesPanel] = useState(false);
  const [showAddVariableModal, setShowAddVariableModal] = useState(false);
  const [newVariableName, setNewVariableName] = useState('');
  const [newVariableValue, setNewVariableValue] = useState('');
  const [newVariableDescription, setNewVariableDescription] = useState('');
  const [editingVariable, setEditingVariable] = useState<TemplateVariable | null>(null);
  const [savingVariable, setSavingVariable] = useState(false);

  // Legal pages state
  interface LegalPage {
    slug: string;
    title: string;
    content: string;
    isActive: boolean;
    isDefault?: boolean;
    updatedAt?: string;
  }
  const [legalPages, setLegalPages] = useState<LegalPage[]>([]);
  const [selectedLegalPage, setSelectedLegalPage] = useState<string | null>(null);
  const [editingLegalPage, setEditingLegalPage] = useState<LegalPage | null>(null);
  const [savingLegalPage, setSavingLegalPage] = useState(false);

  // Upload limits state
  interface UploadLimits {
    maxFileSize: string;
    chunkSize: string;
    concurrentChunks: string;
  }
  const [uploadLimits, setUploadLimits] = useState<UploadLimits>({
    maxFileSize: String(1024 * 1024 * 1024), // 1GB default
    chunkSize: String(20 * 1024 * 1024), // 20MB
    concurrentChunks: '4',
  });
  const [savingUploadLimits, setSavingUploadLimits] = useState(false);
  const uploadLimitsMaxFileParsed = bytesToUnit(uploadLimits.maxFileSize);
  const [uploadMaxValue, setUploadMaxValue] = useState(uploadLimitsMaxFileParsed.value);
  const [uploadMaxUnit, setUploadMaxUnit] = useState(uploadLimitsMaxFileParsed.unit);
  const uploadChunkParsed = bytesToUnit(uploadLimits.chunkSize);
  const [uploadChunkValue, setUploadChunkValue] = useState(uploadChunkParsed.value);
  const [uploadChunkUnit, setUploadChunkUnit] = useState(uploadChunkParsed.unit);

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
      const [statsRes, systemRes, smtpRes, brandingRes, templatesRes, legalRes, limitsRes] = await Promise.all([
        api.get('/admin/server-info').catch(() => ({ data: {} })),
        api.get('/admin/settings/system').catch(() => ({ data: {} })),
        api.get('/admin/settings/smtp').catch(() => ({ data: {} })),
        api.get('/admin/settings/branding').catch(() => ({ data: {} })),
        api.get('/admin/email-templates').catch(() => ({ data: [] })),
        api.get('/admin/legal').catch(() => ({ data: [] })),
        api.get('/admin/settings/limits').catch(() => ({ data: {} })),
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
      if (templatesRes.data) {
        setTemplates(templatesRes.data);
      }
      if (legalRes.data) {
        setLegalPages(legalRes.data);
      }
      if (limitsRes.data && limitsRes.data.maxFileSize) {
        setUploadLimits(limitsRes.data);
        const maxParsed = bytesToUnit(limitsRes.data.maxFileSize);
        setUploadMaxValue(maxParsed.value);
        setUploadMaxUnit(maxParsed.unit);
        const chunkParsed = bytesToUnit(limitsRes.data.chunkSize);
        setUploadChunkValue(chunkParsed.value);
        setUploadChunkUnit(chunkParsed.unit);
      }
    } catch (error) {
      console.error('Failed to load admin data:', error);
      toast(t('admin.loadError'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const saveSystemSettings = async () => {
    setSavingSystem(true);
    try {
      await api.put('/admin/settings/system', systemSettings);
      toast(t('admin.configSaved'), 'success');
    } catch (error) {
      toast(t('admin.saveError'), 'error');
    } finally {
      setSavingSystem(false);
    }
  };

  const saveSmtpSettings = async () => {
    setSavingSmtp(true);
    try {
      await api.put('/admin/settings/smtp', smtpSettings);
      toast(t('admin.smtpSaved'), 'success');
    } catch (error) {
      toast(t('admin.smtpSaveError'), 'error');
    } finally {
      setSavingSmtp(false);
    }
  };

  // Upload limits handlers
  const handleUploadMaxChange = (value: string, unit: string) => {
    setUploadMaxValue(value);
    setUploadMaxUnit(unit);
    setUploadLimits(prev => ({
      ...prev,
      maxFileSize: unitToBytes(value, unit)
    }));
  };

  const handleChunkSizeChange = (value: string, unit: string) => {
    setUploadChunkValue(value);
    setUploadChunkUnit(unit);
    setUploadLimits(prev => ({
      ...prev,
      chunkSize: unitToBytes(value, unit)
    }));
  };

  const saveUploadLimits = async () => {
    setSavingUploadLimits(true);
    try {
      await api.put('/admin/settings/limits', uploadLimits);
      toast(t('admin.limitsSaved'), 'success');
    } catch (error: any) {
      toast(error.response?.data?.error || t('admin.limitsSaveError'), 'error');
    } finally {
      setSavingUploadLimits(false);
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
      toast(t('admin.brandingSaved'), 'success');
    } catch (error) {
      toast(t('admin.brandingSaveError'), 'error');
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
      toast(t('admin.fileUploaded'), 'success');
    } catch (error) {
      toast(t('admin.uploadError'), 'error');
    } finally {
      setUploading((prev) => ({ ...prev, [type]: false }));
    }
  };

  const testSmtp = async () => {
    try {
      await api.post('/admin/settings/smtp/test');
      toast(t('admin.testEmailSent'), 'success');
    } catch (error) {
      toast(t('admin.testEmailError'), 'error');
    }
  };

  // Email template functions
  const loadTemplate = async (name: string) => {
    try {
      const [templateRes, variablesRes] = await Promise.all([
        api.get(`/admin/email-templates/${name}`),
        api.get(`/admin/email-templates/${name}/variables`),
      ]);
      setEditingTemplate(templateRes.data);
      setTemplateVariables(variablesRes.data);
      setSelectedTemplate(name);
      setShowPreview(false);
    } catch {
      const defaultTemplate = DEFAULT_TEMPLATES[name];
      if (defaultTemplate) {
        setEditingTemplate({
          name,
          subject: defaultTemplate.subject,
          body: defaultTemplate.body,
          isDefault: true,
        });
        // Load variables for default template
        try {
          const variablesRes = await api.get(`/admin/email-templates/${name}/variables`);
          setTemplateVariables(variablesRes.data);
        } catch {
          setTemplateVariables({ system: [], custom: [] });
        }
        setSelectedTemplate(name);
        setShowPreview(false);
      }
    }
  };

  const saveTemplate = async () => {
    if (!editingTemplate) return;
    setSavingTemplate(true);
    try {
      const response = await api.put(`/admin/email-templates/${editingTemplate.name}`, {
        subject: editingTemplate.subject,
        body: editingTemplate.body,
      });
      setTemplates(prev => {
        const exists = prev.find(t => t.name === editingTemplate.name);
        if (exists) {
          return prev.map(t => t.name === editingTemplate.name ? response.data : t);
        }
        return [...prev, response.data];
      });
      setEditingTemplate({ ...editingTemplate, isDefault: false });
      toast(t('admin.templateSaved'), 'success');
    } catch {
      toast(t('admin.templateSaveError'), 'error');
    } finally {
      setSavingTemplate(false);
    }
  };

  const resetTemplate = async () => {
    if (!editingTemplate) return;
    try {
      await api.delete(`/admin/email-templates/${editingTemplate.name}`);
      setTemplates(prev => prev.filter(t => t.name !== editingTemplate.name));
      const defaultTemplate = DEFAULT_TEMPLATES[editingTemplate.name];
      if (defaultTemplate) {
        setEditingTemplate({
          name: editingTemplate.name,
          subject: defaultTemplate.subject,
          body: defaultTemplate.body,
          isDefault: true,
        });
      }
      toast(t('admin.templateReset'), 'success');
    } catch {
      toast(t('admin.templateResetError'), 'error');
    }
  };

  const sendTestTemplateEmail = async () => {
    if (!editingTemplate || !testEmailAddress) {
      toast(t('admin.enterTestEmail'), 'error');
      return;
    }
    setSendingTestEmail(true);
    try {
      await api.post(`/admin/email-templates/${editingTemplate.name}/test`, {
        email: testEmailAddress,
      });
      toast(t('admin.templateTestSent'), 'success');
    } catch {
      toast(t('admin.templateTestError'), 'error');
    } finally {
      setSendingTestEmail(false);
    }
  };

  const createNewTemplate = async () => {
    if (!newTemplateName.trim()) {
      toast(t('admin.enterTemplateName'), 'error');
      return;
    }
    const templateKey = newTemplateName.toLowerCase().replace(/\s+/g, '_');
    if (templates.find(tpl => tpl.name === templateKey) || DEFAULT_TEMPLATES[templateKey]) {
      toast(t('admin.templateNameExists'), 'error');
      return;
    }
    setEditingTemplate({
      name: templateKey,
      subject: `Asunto de ${newTemplateName}`,
      body: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; padding: 20px 0; }
    .content { background: #f9fafb; border-radius: 12px; padding: 30px; margin: 20px 0; }
    .button { display: inline-block; padding: 14px 28px; background: #dc2626; color: white !important; text-decoration: none; border-radius: 8px; font-weight: 600; }
    .footer { text-align: center; color: #6b7280; font-size: 14px; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="header">
    <h1 style="color: #dc2626; margin: 0;">CloudBox</h1>
  </div>
  <div class="content">
    <h2>Hola {{name}},</h2>
    <p>Contenido de tu email aquí...</p>
  </div>
  <div class="footer">
    <p>© CloudBox - Tu nube personal</p>
  </div>
</body>
</html>`,
      isDefault: true,
    });
    setSelectedTemplate(templateKey);
    setShowNewTemplateModal(false);
    setNewTemplateName('');
  };

  const deleteTemplate = async (name: string) => {
    if (DEFAULT_TEMPLATES[name]) {
      toast(t('admin.cannotDeleteSystem'), 'error');
      return;
    }
    try {
      await api.delete(`/admin/email-templates/${name}`);
      setTemplates(prev => prev.filter(t => t.name !== name));
      if (selectedTemplate === name) {
        setSelectedTemplate(null);
        setEditingTemplate(null);
      }
      toast(t('admin.templateDeleted'), 'success');
    } catch {
      toast(t('admin.templateDeleteError'), 'error');
    }
  };

  const getPreviewHtml = () => {
    if (!editingTemplate) return '';
    let html = editingTemplate.body;

    // Replace system variables with test values
    const systemTestValues: Record<string, string> = {
      name: 'Usuario de Prueba',
      email: 'test@ejemplo.com',
      verifyUrl: '#',
      resetUrl: '#',
      appName: 'CloudBox',
      appUrl: window.location.origin,
      date: new Date().toLocaleDateString('es-ES'),
    };

    // Replace custom variables with their default values
    for (const variable of templateVariables.custom) {
      const regex = new RegExp(`\\{\\{${variable.name}\\}\\}`, 'g');
      html = html.replace(regex, variable.defaultValue);
    }

    // Replace system variables
    for (const [key, value] of Object.entries(systemTestValues)) {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      html = html.replace(regex, value);
    }

    return html;
  };

  // Variable management functions
  const addVariable = async () => {
    if (!editingTemplate || !newVariableName.trim() || !newVariableValue.trim()) {
      toast(t('admin.variableRequired'), 'error');
      return;
    }

    setSavingVariable(true);
    try {
      const response = await api.post(`/admin/email-templates/${editingTemplate.name}/variables`, {
        name: newVariableName.trim(),
        defaultValue: newVariableValue.trim(),
        description: newVariableDescription.trim(),
      });

      setTemplateVariables(prev => ({
        ...prev,
        custom: [...prev.custom, response.data],
      }));

      setShowAddVariableModal(false);
      setNewVariableName('');
      setNewVariableValue('');
      setNewVariableDescription('');
      toast(t('admin.variableAdded'), 'success');
    } catch (error: any) {
      toast(error.response?.data?.error || t('admin.variableAddError'), 'error');
    } finally {
      setSavingVariable(false);
    }
  };

  const updateVariable = async () => {
    if (!editingTemplate || !editingVariable) return;

    setSavingVariable(true);
    try {
      const response = await api.put(
        `/admin/email-templates/${editingTemplate.name}/variables/${editingVariable.id}`,
        {
          defaultValue: editingVariable.defaultValue,
          description: editingVariable.description,
        }
      );

      setTemplateVariables(prev => ({
        ...prev,
        custom: prev.custom.map(v => v.id === editingVariable.id ? response.data : v),
      }));

      setEditingVariable(null);
      toast(t('admin.variableUpdated'), 'success');
    } catch (error: any) {
      toast(error.response?.data?.error || t('admin.variableUpdateError'), 'error');
    } finally {
      setSavingVariable(false);
    }
  };

  const deleteVariable = async (variableId: string) => {
    if (!editingTemplate) return;

    try {
      await api.delete(`/admin/email-templates/${editingTemplate.name}/variables/${variableId}`);

      setTemplateVariables(prev => ({
        ...prev,
        custom: prev.custom.filter(v => v.id !== variableId),
      }));

      toast(t('admin.variableDeleted'), 'success');
    } catch (error: any) {
      toast(error.response?.data?.error || t('admin.variableDeleteError'), 'error');
    }
  };

  const insertVariable = (varName: string) => {
    if (!editingTemplate) return;
    const variable = `{{${varName}}}`;
    setEditingTemplate({
      ...editingTemplate,
      body: editingTemplate.body + variable,
    });
  };

  const getTemplateDisplayName = (name: string): string => {
    const templateNames: Record<string, string> = {
      welcome: t('admin.templates.welcome'),
      reset_password: t('admin.templates.resetPassword'),
    };
    return templateNames[name] || name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  // Legal pages functions
  const loadLegalPage = (slug: string) => {
    const page = legalPages.find(p => p.slug === slug);
    if (page) {
      setEditingLegalPage({ ...page });
      setSelectedLegalPage(slug);
    }
  };

  const saveLegalPage = async () => {
    if (!editingLegalPage) return;
    setSavingLegalPage(true);
    try {
      const response = await api.put(`/admin/legal/${editingLegalPage.slug}`, {
        title: editingLegalPage.title,
        content: editingLegalPage.content,
        isActive: editingLegalPage.isActive,
      });
      setLegalPages(prev => prev.map(p => p.slug === editingLegalPage.slug ? response.data : p));
      setEditingLegalPage(response.data);
      toast(t('admin.pageSaved'), 'success');
    } catch {
      toast(t('admin.pageSaveError'), 'error');
    } finally {
      setSavingLegalPage(false);
    }
  };

  const resetLegalPage = async () => {
    if (!editingLegalPage) return;
    try {
      const response = await api.delete(`/admin/legal/${editingLegalPage.slug}`);
      setLegalPages(prev => prev.map(p => p.slug === editingLegalPage.slug ? response.data : p));
      setEditingLegalPage(response.data);
      toast(t('admin.pageReset'), 'success');
    } catch {
      toast(t('admin.pageResetError'), 'error');
    }
  };

  const getLegalPageDisplayName = (slug: string): string => {
    const pageNames: Record<string, string> = {
      privacy: t('admin.legal.privacy'),
      terms: t('admin.legal.terms'),
    };
    return pageNames[slug] || slug;
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
      toast(t('admin.usersLoadError'), 'error');
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
      // If updating the current user, refresh their data in the auth store
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
          <h2 className="text-lg font-semibold text-dark-900 dark:text-white">{t('admin.stats.title')}</h2>
        </div>
        <p className="text-sm text-dark-500 dark:text-dark-400 mb-6">{t('admin.stats.description')}</p>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="flex items-center gap-3 p-4 bg-dark-50 dark:bg-dark-900 rounded-xl">
            <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-dark-500 dark:text-dark-400">{t('admin.stats.totalUsers')}</p>
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
              <p className="text-xs text-dark-500 dark:text-dark-400">{t('admin.stats.totalFiles')}</p>
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
              <p className="text-xs text-dark-500 dark:text-dark-400">{t('admin.stats.storage')}</p>
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
              <p className="text-xs text-dark-500 dark:text-dark-400">{t('admin.stats.activeUsers')}</p>
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
          <h2 className="text-lg font-semibold text-dark-900 dark:text-white">{t('admin.general.title')}</h2>
        </div>
        <p className="text-sm text-dark-500 dark:text-dark-400 mb-6">{t('admin.general.description')}</p>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <Input
            label={t('admin.general.siteName')}
            value={systemSettings.siteName}
            onChange={(e) => setSystemSettings({ ...systemSettings, siteName: e.target.value })}
          />
          <Input
            label={t('admin.general.siteDescription')}
            value={systemSettings.siteDescription}
            onChange={(e) => setSystemSettings({ ...systemSettings, siteDescription: e.target.value })}
          />
        </div>

        {/* Registration Toggle */}
        <div className="flex items-center justify-between p-4 bg-dark-50 dark:bg-dark-900 rounded-xl mb-4">
          <div className="flex items-center gap-3">
            <Users className="w-5 h-5 text-dark-500" />
            <div>
              <p className="font-medium text-dark-900 dark:text-white">{t('admin.general.allowRegistration')}</p>
              <p className="text-sm text-dark-500">{t('admin.general.allowRegistrationDesc')}</p>
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
              <HardDrive className="w-4 h-4 inline mr-1" /> {t('admin.general.defaultQuota')}
            </label>
            <div className="flex rounded-xl border border-dark-300 dark:border-dark-600 focus-within:ring-2 focus-within:ring-[#FF3B3B] focus-within:border-[#FF3B3B] overflow-hidden">
              <input
                type="number"
                value={quotaValue}
                onChange={(e) => handleQuotaChange(e.target.value, quotaUnit)}
                className="w-full px-3 py-2 bg-white dark:bg-dark-800 text-dark-900 dark:text-white focus:outline-none"
                min="1"
                aria-label={t('admin.general.defaultQuota')}
              />
              <select
                value={quotaUnit}
                onChange={(e) => handleQuotaChange(quotaValue, e.target.value)}
                className="px-2 py-2 bg-dark-100 dark:bg-dark-700 text-dark-900 dark:text-white border-l border-dark-300 dark:border-dark-600 focus:outline-none cursor-pointer"
                aria-label={t('admin.general.quotaUnit')}
              >
                <option value="MB">MB</option>
                <option value="GB">GB</option>
                <option value="TB">TB</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">
              <FileType className="w-4 h-4 inline mr-1" /> {t('admin.general.maxFileSize')}
            </label>
            <div className="flex rounded-xl border border-dark-300 dark:border-dark-600 focus-within:ring-2 focus-within:ring-[#FF3B3B] focus-within:border-[#FF3B3B] overflow-hidden">
              <input
                type="number"
                value={maxFileSizeValue}
                onChange={(e) => handleMaxFileSizeChange(e.target.value, maxFileSizeUnit)}
                className="w-full px-3 py-2 bg-white dark:bg-dark-800 text-dark-900 dark:text-white focus:outline-none"
                min="1"
                aria-label={t('admin.general.maxFileSize')}
              />
              <select
                value={maxFileSizeUnit}
                onChange={(e) => handleMaxFileSizeChange(maxFileSizeValue, e.target.value)}
                className="px-2 py-2 bg-dark-100 dark:bg-dark-700 text-dark-900 dark:text-white border-l border-dark-300 dark:border-dark-600 focus:outline-none cursor-pointer"
                aria-label={t('admin.general.fileSizeUnit')}
              >
                <option value="MB">MB</option>
                <option value="GB">GB</option>
                <option value="TB">TB</option>
              </select>
            </div>
          </div>
          <Input
            label={t('admin.general.allowedTypes')}
            value={systemSettings.allowedFileTypes}
            onChange={(e) => setSystemSettings({ ...systemSettings, allowedFileTypes: e.target.value })}
            placeholder="* para todos"
          />
        </div>

        <div className="flex justify-end pt-4 border-t border-dark-100 dark:border-dark-700">
          <Button onClick={saveSystemSettings} loading={savingSystem} icon={<Save className="w-4 h-4" />}>
            {t('admin.general.save')}
          </Button>
        </div>
      </section>

      {/* Upload Limits Section */}
      <section className="bg-white dark:bg-dark-800 rounded-2xl border border-dark-100 dark:border-dark-700 p-6 mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Upload className="w-4 h-4 text-[#FF3B3B]" />
          <h2 className="text-lg font-semibold text-dark-900 dark:text-white">{t('admin.limits.title')}</h2>
        </div>
        <p className="text-sm text-dark-500 dark:text-dark-400 mb-6">{t('admin.limits.description')}</p>

        <div className="grid grid-cols-3 gap-4 mb-4">
          {/* Max File Size */}
          <div>
            <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">
              <FileType className="w-4 h-4 inline mr-1" /> {t('admin.limits.maxFileSize')}
            </label>
            <div className="flex rounded-xl border border-dark-300 dark:border-dark-600 focus-within:ring-2 focus-within:ring-[#FF3B3B] focus-within:border-[#FF3B3B] overflow-hidden">
              <input
                type="number"
                value={uploadMaxValue}
                onChange={(e) => handleUploadMaxChange(e.target.value, uploadMaxUnit)}
                className="w-full px-3 py-2 bg-white dark:bg-dark-800 text-dark-900 dark:text-white focus:outline-none"
                min="1"
                title={t('admin.limits.maxFileSize')}
              />
              <select
                value={uploadMaxUnit}
                onChange={(e) => handleUploadMaxChange(uploadMaxValue, e.target.value)}
                className="px-2 py-2 bg-dark-100 dark:bg-dark-700 text-dark-900 dark:text-white border-l border-dark-300 dark:border-dark-600 focus:outline-none cursor-pointer"
                title={t('admin.limits.unit')}
              >
                <option value="MB">MB</option>
                <option value="GB">GB</option>
                <option value="TB">TB</option>
              </select>
            </div>
            <p className="text-xs text-dark-400 mt-1">{t('admin.limits.maxFileSizeHint')}</p>
          </div>

          {/* Chunk Size */}
          <div>
            <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">
              <HardDrive className="w-4 h-4 inline mr-1" /> {t('admin.limits.chunkSize')}
            </label>
            <div className="flex rounded-xl border border-dark-300 dark:border-dark-600 focus-within:ring-2 focus-within:ring-[#FF3B3B] focus-within:border-[#FF3B3B] overflow-hidden">
              <input
                type="number"
                value={uploadChunkValue}
                onChange={(e) => handleChunkSizeChange(e.target.value, uploadChunkUnit)}
                className="w-full px-3 py-2 bg-white dark:bg-dark-800 text-dark-900 dark:text-white focus:outline-none"
                min="1"
                title={t('admin.limits.chunkSize')}
              />
              <select
                value={uploadChunkUnit}
                onChange={(e) => handleChunkSizeChange(uploadChunkValue, e.target.value)}
                className="px-2 py-2 bg-dark-100 dark:bg-dark-700 text-dark-900 dark:text-white border-l border-dark-300 dark:border-dark-600 focus:outline-none cursor-pointer"
                title={t('admin.limits.unit')}
              >
                <option value="MB">MB</option>
                <option value="GB">GB</option>
              </select>
            </div>
            <p className="text-xs text-dark-400 mt-1">{t('admin.limits.chunkSizeHint')}</p>
          </div>

          {/* Concurrent Chunks */}
          <div>
            <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">
              <TrendingUp className="w-4 h-4 inline mr-1" /> {t('admin.limits.concurrentChunks')}
            </label>
            <input
              type="number"
              value={uploadLimits.concurrentChunks}
              onChange={(e) => setUploadLimits({ ...uploadLimits, concurrentChunks: e.target.value })}
              className="w-full px-3 py-2 rounded-xl border border-dark-300 dark:border-dark-600 bg-white dark:bg-dark-800 text-dark-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#FF3B3B] focus:border-[#FF3B3B]"
              min="1"
              max="10"
              title={t('admin.limits.concurrentChunks')}
            />
            <p className="text-xs text-dark-400 mt-1">{t('admin.limits.concurrentChunksHint')}</p>
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t border-dark-100 dark:border-dark-700">
          <Button onClick={saveUploadLimits} loading={savingUploadLimits} icon={<Save className="w-4 h-4" />}>
            {t('admin.limits.save')}
          </Button>
        </div>
      </section>

      {/* Email Section */}
      <section className="bg-white dark:bg-dark-800 rounded-2xl border border-dark-100 dark:border-dark-700 p-6 mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Mail className="w-4 h-4 text-[#FF3B3B]" />
          <h2 className="text-lg font-semibold text-dark-900 dark:text-white">{t('admin.email.title')}</h2>
        </div>
        <p className="text-sm text-dark-500 dark:text-dark-400 mb-6">{t('admin.email.description')}</p>

        <div className="grid grid-cols-4 gap-4 mb-4">
          <Input
            label={t('admin.email.host')}
            value={smtpSettings.host}
            onChange={(e) => setSmtpSettings({ ...smtpSettings, host: e.target.value })}
            placeholder="smtp.example.com"
          />
          <Input
            label={t('admin.email.port')}
            type="number"
            value={smtpSettings.port.toString()}
            onChange={(e) => setSmtpSettings({ ...smtpSettings, port: parseInt(e.target.value) || 587 })}
          />
          <Input
            label={t('admin.email.user')}
            value={smtpSettings.user}
            onChange={(e) => setSmtpSettings({ ...smtpSettings, user: e.target.value })}
            autoComplete="off"
          />
          <Input
            label={t('admin.email.password')}
            type="password"
            value={smtpSettings.password}
            onChange={(e) => setSmtpSettings({ ...smtpSettings, password: e.target.value })}
            autoComplete="off"
          />
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <Input
            label={t('admin.email.senderName')}
            value={smtpSettings.fromName}
            onChange={(e) => setSmtpSettings({ ...smtpSettings, fromName: e.target.value })}
          />
          <Input
            label={t('admin.email.senderEmail')}
            type="email"
            value={smtpSettings.fromEmail}
            onChange={(e) => setSmtpSettings({ ...smtpSettings, fromEmail: e.target.value })}
          />
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-dark-100 dark:border-dark-700">
          <Button variant="secondary" onClick={testSmtp}>{t('admin.email.sendTest')}</Button>
          <Button onClick={saveSmtpSettings} loading={savingSmtp} icon={<Save className="w-4 h-4" />}>
            {t('admin.email.save')}
          </Button>
        </div>
      </section>

      {/* Email Templates Section */}
      <section className="bg-white dark:bg-dark-800 rounded-2xl border border-dark-100 dark:border-dark-700 p-6 mb-6">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#FF3B3B]" />
            <h2 className="text-lg font-semibold text-dark-900 dark:text-white">{t('admin.templates.title')}</h2>
          </div>
          <Button
            variant="secondary"
            size="sm"
            icon={<Plus className="w-4 h-4" />}
            onClick={() => setShowNewTemplateModal(true)}
          >
            {t('admin.templates.new')}
          </Button>
        </div>
        <p className="text-sm text-dark-500 dark:text-dark-400 mb-6">{t('admin.templates.description')}</p>

        <div className="grid grid-cols-12 gap-6">
          {/* Templates List */}
          <div className="col-span-4 space-y-2">
            <p className="text-xs font-medium text-dark-500 uppercase mb-3">{t('admin.templates.system')}</p>
            {Object.keys(DEFAULT_TEMPLATES).map((name) => {
              const customized = templates.find(t => t.name === name);
              return (
                <button
                  key={name}
                  onClick={() => loadTemplate(name)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-left transition-all ${selectedTemplate === name
                    ? 'bg-[#FF3B3B] text-white'
                    : 'bg-dark-50 dark:bg-dark-900 text-dark-700 dark:text-dark-300 hover:bg-dark-100 dark:hover:bg-dark-700'
                    }`}
                >
                  <span className="font-medium">{getTemplateDisplayName(name)}</span>
                  {customized && (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${selectedTemplate === name ? 'bg-white/20' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      }`}>
                      {t('admin.templates.customized')}
                    </span>
                  )}
                </button>
              );
            })}

            {/* Custom templates */}
            {templates.filter(t => !DEFAULT_TEMPLATES[t.name]).length > 0 && (
              <>
                <p className="text-xs font-medium text-dark-500 uppercase mt-6 mb-3">{t('admin.templates.custom')}</p>
                {templates.filter(t => !DEFAULT_TEMPLATES[t.name]).map((template) => (
                  <div
                    key={template.name}
                    className={`flex items-center justify-between px-4 py-3 rounded-xl transition-all ${selectedTemplate === template.name
                      ? 'bg-[#FF3B3B] text-white'
                      : 'bg-dark-50 dark:bg-dark-900 text-dark-700 dark:text-dark-300 hover:bg-dark-100 dark:hover:bg-dark-700'
                      }`}
                  >
                    <button
                      onClick={() => loadTemplate(template.name)}
                      className="flex-1 text-left font-medium"
                    >
                      {getTemplateDisplayName(template.name)}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteTemplate(template.name);
                      }}
                      className={`p-1 rounded-lg transition-colors ${selectedTemplate === template.name
                        ? 'hover:bg-white/20'
                        : 'hover:bg-dark-200 dark:hover:bg-dark-600'
                        }`}
                      aria-label={t('admin.templates.delete')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Template Editor */}
          <div className="col-span-8">
            {editingTemplate ? (
              <div className="space-y-4">
                {/* Header with toggle */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-dark-900 dark:text-white">
                      {getTemplateDisplayName(editingTemplate.name)}
                    </h3>
                    {editingTemplate.isDefault && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                        {t('admin.templates.notCustomized')}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center bg-dark-100 dark:bg-dark-900 rounded-lg p-1">
                    <button
                      onClick={() => setShowPreview(false)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${!showPreview
                        ? 'bg-white dark:bg-dark-700 text-dark-900 dark:text-white shadow-sm'
                        : 'text-dark-500 hover:text-dark-700 dark:hover:text-dark-300'
                        }`}
                    >
                      <Code className="w-4 h-4" />
                      {t('admin.templates.editor')}
                    </button>
                    <button
                      onClick={() => setShowPreview(true)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${showPreview
                        ? 'bg-white dark:bg-dark-700 text-dark-900 dark:text-white shadow-sm'
                        : 'text-dark-500 hover:text-dark-700 dark:hover:text-dark-300'
                        }`}
                    >
                      <Eye className="w-4 h-4" />
                      {t('admin.templates.preview')}
                    </button>
                  </div>
                </div>

                {/* Variables Section */}
                <div className="border border-dark-200 dark:border-dark-700 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setShowVariablesPanel(!showVariablesPanel)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-dark-50 dark:bg-dark-900 hover:bg-dark-100 dark:hover:bg-dark-800 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Code className="w-4 h-4 text-[#FF3B3B]" />
                      <span className="text-sm font-medium text-dark-700 dark:text-dark-300">
                        {t('admin.templates.variables.title')}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-dark-200 dark:bg-dark-700 text-dark-600 dark:text-dark-400">
                        {templateVariables.system.length + templateVariables.custom.length}
                      </span>
                    </div>
                    <svg
                      className={`w-4 h-4 text-dark-500 transition-transform ${showVariablesPanel ? 'rotate-180' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {showVariablesPanel && (
                    <div className="p-4 space-y-4">
                      {/* System Variables */}
                      <div>
                        <p className="text-xs font-medium text-dark-500 uppercase mb-2">{t('admin.templates.variables.system')}</p>
                        <div className="flex flex-wrap gap-2">
                          {templateVariables.system.map(v => (
                            <button
                              key={v.name}
                              onClick={() => insertVariable(v.name)}
                              className="group flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-lg transition-colors"
                              title={v.description || `Insertar {{${v.name}}}`}
                            >
                              <code className="text-xs text-blue-700 dark:text-blue-300">{`{{${v.name}}}`}</code>
                              <Plus className="w-3 h-3 text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Custom Variables */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-medium text-dark-500 uppercase">{t('admin.templates.variables.custom')}</p>
                          <button
                            onClick={() => setShowAddVariableModal(true)}
                            className="flex items-center gap-1 text-xs text-[#FF3B3B] hover:text-red-700 dark:hover:text-red-400 font-medium"
                          >
                            <Plus className="w-3 h-3" />
                            {t('admin.templates.variables.add')}
                          </button>
                        </div>

                        {templateVariables.custom.length > 0 ? (
                          <div className="space-y-2">
                            {templateVariables.custom.map(v => (
                              <div
                                key={v.id}
                                className="flex items-center justify-between px-3 py-2 bg-green-50 dark:bg-green-900/20 rounded-lg"
                              >
                                <div className="flex items-center gap-3">
                                  <button
                                    onClick={() => insertVariable(v.name)}
                                    className="flex items-center gap-1.5 hover:opacity-75 transition-opacity"
                                    title={`Insertar {{${v.name}}}`}
                                  >
                                    <code className="text-xs text-green-700 dark:text-green-300">{`{{${v.name}}}`}</code>
                                  </button>
                                  <span className="text-xs text-dark-500">= {v.defaultValue}</span>
                                  {v.description && (
                                    <span className="text-xs text-dark-400 italic">({v.description})</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => setEditingVariable(v)}
                                    className="p-1 hover:bg-green-200 dark:hover:bg-green-900/40 rounded transition-colors"
                                    aria-label={t('admin.templates.variables.edit')}
                                  >
                                    <Edit className="w-3 h-3 text-green-700 dark:text-green-400" />
                                  </button>
                                  <button
                                    onClick={() => deleteVariable(v.id!)}
                                    className="p-1 hover:bg-red-200 dark:hover:bg-red-900/40 rounded transition-colors"
                                    aria-label={t('admin.templates.variables.delete')}
                                  >
                                    <Trash2 className="w-3 h-3 text-red-600 dark:text-red-400" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-dark-400 italic py-2">
                            {t('admin.templates.variables.noCustom')}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {!showPreview ? (
                  <>
                    <Input
                      label={t('admin.templates.subject')}
                      value={editingTemplate.subject}
                      onChange={(e) => setEditingTemplate({ ...editingTemplate, subject: e.target.value })}
                    />
                    <div>
                      <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">
                        {t('admin.templates.htmlContent')}
                      </label>
                      <textarea
                        value={editingTemplate.body}
                        onChange={(e) => setEditingTemplate({ ...editingTemplate, body: e.target.value })}
                        rows={12}
                        className="w-full px-4 py-3 bg-dark-50 dark:bg-dark-900 border border-dark-200 dark:border-dark-700 rounded-xl text-sm font-mono text-dark-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#FF3B3B] focus:border-transparent resize-none"
                        spellCheck={false}
                        aria-label={t('admin.templates.htmlContent')}
                      />
                    </div>
                  </>
                ) : (
                  <div className="border border-dark-200 dark:border-dark-700 rounded-xl overflow-hidden">
                    <div className="bg-dark-100 dark:bg-dark-900 px-4 py-2 border-b border-dark-200 dark:border-dark-700">
                      <p className="text-sm">
                        <span className="text-dark-500">Asunto:</span>{' '}
                        <span className="text-dark-900 dark:text-white font-medium">
                          {editingTemplate.subject.replace(/\{\{name\}\}/g, 'Usuario de Prueba')}
                        </span>
                      </p>
                    </div>
                    <iframe
                      srcDoc={getPreviewHtml()}
                      className="w-full h-[300px] bg-white"
                      title="Email Preview"
                      sandbox="allow-same-origin"
                    />
                  </div>
                )}

                {/* Test Email */}
                <div className="flex items-center gap-3 p-4 bg-dark-50 dark:bg-dark-900 rounded-xl">
                  <Input
                    placeholder={t('admin.templates.testEmail')}
                    value={testEmailAddress}
                    onChange={(e) => setTestEmailAddress(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    variant="secondary"
                    onClick={sendTestTemplateEmail}
                    loading={sendingTestEmail}
                    icon={<Send className="w-4 h-4" />}
                  >
                    {t('admin.templates.test')}
                  </Button>
                </div>

                {/* Actions */}
                <div className="flex justify-between pt-4 border-t border-dark-100 dark:border-dark-700">
                  <Button
                    variant="secondary"
                    onClick={resetTemplate}
                    icon={<RotateCcw className="w-4 h-4" />}
                    disabled={editingTemplate.isDefault}
                  >
                    {t('admin.templates.reset')}
                  </Button>
                  <Button
                    onClick={saveTemplate}
                    loading={savingTemplate}
                    icon={<Save className="w-4 h-4" />}
                  >
                    {t('admin.templates.save')}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-dark-400">
                <FileText className="w-12 h-12 mb-4 opacity-50" />
                <p>{t('admin.templates.selectToEdit')}</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* New Template Modal */}
      {showNewTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowNewTemplateModal(false)}>
          <div
            className="bg-white dark:bg-dark-800 rounded-xl shadow-2xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-dark-900 dark:text-white mb-4">{t('admin.templates.newTemplate')}</h3>
            <Input
              label={t('admin.templates.templateName')}
              value={newTemplateName}
              onChange={(e) => setNewTemplateName(e.target.value)}
              placeholder={t('admin.templates.templateNamePlaceholder')}
            />
            <p className="text-xs text-dark-500 mt-2 mb-4">
              {t('admin.templates.templateNameHint')}
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setShowNewTemplateModal(false)}>
                {t('common.cancel')}
              </Button>
              <Button onClick={createNewTemplate}>
                {t('common.create')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add Variable Modal */}
      {showAddVariableModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowAddVariableModal(false)}>
          <div
            className="bg-white dark:bg-dark-800 rounded-xl shadow-2xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-dark-900 dark:text-white mb-4">{t('admin.templates.newVariable')}</h3>
            <div className="space-y-4">
              <Input
                label={t('admin.templates.variables.name')}
                value={newVariableName}
                onChange={(e) => setNewVariableName(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                placeholder={t('admin.templates.variableNamePlaceholder')}
              />
              <p className="text-xs text-dark-500 -mt-2">
                {t('admin.templates.variableNameHint', { example: `{{${newVariableName || 'myVariable'}}}` })}
              </p>
              <Input
                label={t('admin.templates.variables.value')}
                value={newVariableValue}
                onChange={(e) => setNewVariableValue(e.target.value)}
                placeholder={t('admin.templates.variableValuePlaceholder')}
              />
              <Input
                label={t('admin.templates.variables.description')}
                value={newVariableDescription}
                onChange={(e) => setNewVariableDescription(e.target.value)}
                placeholder={t('admin.templates.variableDescPlaceholder')}
              />
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <Button variant="secondary" onClick={() => {
                setShowAddVariableModal(false);
                setNewVariableName('');
                setNewVariableValue('');
                setNewVariableDescription('');
              }}>
                {t('common.cancel')}
              </Button>
              <Button onClick={addVariable} loading={savingVariable}>
                {t('admin.templates.variables.add')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Variable Modal */}
      {editingVariable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setEditingVariable(null)}>
          <div
            className="bg-white dark:bg-dark-800 rounded-xl shadow-2xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-dark-900 dark:text-white mb-4">
              {t('admin.templates.editVariable')}: <code className="text-[#FF3B3B]">{`{{${editingVariable.name}}}`}</code>
            </h3>
            <div className="space-y-4">
              <Input
                label={t('admin.templates.variables.value')}
                value={editingVariable.defaultValue}
                onChange={(e) => setEditingVariable({ ...editingVariable, defaultValue: e.target.value })}
              />
              <Input
                label={t('admin.templates.variables.description')}
                value={editingVariable.description || ''}
                onChange={(e) => setEditingVariable({ ...editingVariable, description: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <Button variant="secondary" onClick={() => setEditingVariable(null)}>
                {t('common.cancel')}
              </Button>
              <Button onClick={updateVariable} loading={savingVariable}>
                {t('common.save')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Branding Section */}
      <section className="bg-white dark:bg-dark-800 rounded-2xl border border-dark-100 dark:border-dark-700 p-6">
        <div className="flex items-center gap-2 mb-1">
          <Palette className="w-4 h-4 text-[#FF3B3B]" />
          <h2 className="text-lg font-semibold text-dark-900 dark:text-white">{t('admin.branding.title')}</h2>
        </div>
        <p className="text-sm text-dark-500 dark:text-dark-400 mb-6">{t('admin.branding.description')}</p>

        {/* Color */}
        <div className="flex items-center gap-4 mb-6">
          <label className="text-sm font-medium text-dark-700 dark:text-dark-300">{t('admin.branding.primaryColor')}</label>
          <input
            type="color"
            value={brandingSettings.primaryColor}
            onChange={(e) => setBrandingSettings({ ...brandingSettings, primaryColor: e.target.value })}
            className="w-10 h-10 rounded-lg cursor-pointer border-0"
            aria-label={t('admin.branding.primaryColor')}
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
            <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-2">{t('admin.branding.logoLight')}</label>
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
            <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-2">{t('admin.branding.logoDark')}</label>
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
            <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-2">{t('admin.branding.favicon')}</label>
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
            {t('admin.branding.save')}
          </Button>
        </div>
      </section>

      {/* Legal Pages Section */}
      <section className="bg-white dark:bg-dark-800 rounded-2xl border border-dark-100 dark:border-dark-700 p-6 mt-6">
        <div className="flex items-center gap-2 mb-1">
          <FileText className="w-4 h-4 text-[#FF3B3B]" />
          <h2 className="text-lg font-semibold text-dark-900 dark:text-white">{t('admin.legal.title')}</h2>
        </div>
        <p className="text-sm text-dark-500 dark:text-dark-400 mb-6">
          {t('admin.legal.description')}
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Pages list */}
          <div className="lg:col-span-1">
            <div className="space-y-2">
              {legalPages.map((page) => (
                <button
                  key={page.slug}
                  onClick={() => loadLegalPage(page.slug)}
                  className={cn(
                    'w-full text-left px-4 py-3 rounded-xl transition-all',
                    selectedLegalPage === page.slug
                      ? 'bg-[#FF3B3B]/10 border-2 border-[#FF3B3B] text-[#FF3B3B]'
                      : 'bg-dark-50 dark:bg-dark-700/50 border-2 border-transparent hover:border-dark-200 dark:hover:border-dark-600'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{getLegalPageDisplayName(page.slug)}</span>
                    {page.isDefault && (
                      <span className="text-xs bg-dark-200 dark:bg-dark-600 text-dark-600 dark:text-dark-300 px-2 py-0.5 rounded">
                        {t('admin.legal.default')}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Page editor */}
          <div className="lg:col-span-3">
            {editingLegalPage ? (
              <div className="space-y-4">
                {/* Title */}
                <div>
                  <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-2">
                    {t('admin.legal.pageTitle')}
                  </label>
                  <Input
                    value={editingLegalPage.title}
                    onChange={(e) => setEditingLegalPage({ ...editingLegalPage, title: e.target.value })}
                    placeholder="Título..."
                  />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[600px]">
                  {/* Editor Column */}
                  <div className="flex flex-col h-full bg-dark-50 dark:bg-dark-900/50 rounded-xl border border-dark-200 dark:border-dark-700 overflow-hidden">
                    <div className="px-4 py-3 border-b border-dark-200 dark:border-dark-700 flex items-center justify-between bg-white dark:bg-dark-800">
                      <div className="flex items-center gap-2">
                        <Edit className="w-4 h-4 text-primary-500" />
                        <h3 className="font-medium text-sm text-dark-900 dark:text-white">{t('admin.legal.editor', 'HTML Editor')}</h3>
                      </div>
                      <div className="text-xs text-dark-400">
                        Supports Markdown and HTML
                      </div>
                    </div>
                    <textarea
                      value={editingLegalPage.content}
                      onChange={(e) => setEditingLegalPage({ ...editingLegalPage, content: e.target.value })}
                      className="flex-1 w-full bg-transparent p-4 font-mono text-sm resize-none focus:outline-none dark:text-dark-200"
                      placeholder="<h2>Section Title</h2>&#10;<p>Your content here...</p>"
                    />
                  </div>

                  {/* Preview Column */}
                  <div className="flex flex-col h-full bg-white dark:bg-dark-800 rounded-xl border border-dark-200 dark:border-dark-700 overflow-hidden shadow-sm">
                    <div className="px-4 py-3 border-b border-dark-200 dark:border-dark-700 flex items-center justify-between bg-dark-50 dark:bg-dark-900/30">
                      <div className="flex items-center gap-2">
                        <Eye className="w-4 h-4 text-green-500" />
                        <h3 className="font-medium text-sm text-dark-900 dark:text-white">{t('admin.legal.livePreview', 'Live Preview')}</h3>
                      </div>
                      <span className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2 py-0.5 rounded-full">
                        {t('admin.legal.previewMode', 'Preview')}
                      </span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-6">
                      <div
                        className="prose prose-sm dark:prose-invert max-w-none
                               prose-headings:text-dark-900 dark:prose-headings:text-white
                               prose-p:text-dark-600 dark:prose-p:text-dark-300
                               prose-a:text-primary-600 dark:prose-a:text-primary-400
                               prose-ul:text-dark-600 dark:prose-ul:text-dark-300
                               prose-img:rounded-xl"
                        dangerouslySetInnerHTML={undefined}
                      >
                        <ReactMarkdown
                          rehypePlugins={[rehypeRaw]}
                          remarkPlugins={[remarkGfm]}
                        >
                          {editingLegalPage.content}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between pt-4 border-t border-dark-100 dark:border-dark-700">
                  <div className="flex items-center gap-2">
                    <a
                      href={`/${editingLegalPage.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
                    >
                      <Eye className="w-4 h-4" />
                      {t('admin.legal.viewPublic')}
                    </a>
                  </div>
                  <div className="flex items-center gap-2">
                    {!editingLegalPage.isDefault && (
                      <Button
                        variant="ghost"
                        onClick={resetLegalPage}
                        icon={<RotateCcw className="w-4 h-4" />}
                      >
                        {t('admin.legal.reset')}
                      </Button>
                    )}
                    <Button
                      onClick={saveLegalPage}
                      loading={savingLegalPage}
                      icon={<Save className="w-4 h-4" />}
                    >
                      {t('admin.legal.save')}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-dark-500 dark:text-dark-400">
                <FileText className="w-12 h-12 mb-4 opacity-50" />
                <p>{t('admin.legal.selectToEdit')}</p>
              </div>
            )}
          </div>
        </div>
      </section >

      {/* Users Section */}
      < section className="bg-white dark:bg-dark-800 rounded-2xl border border-dark-100 dark:border-dark-700 p-6 mt-6" >
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[#FF3B3B]" />
            <h2 className="text-lg font-semibold text-dark-900 dark:text-white">{t('admin.users.title')}</h2>
          </div>
          <Button onClick={openCreateModal} size="sm" icon={<UserPlus className="w-4 h-4" />}>
            {t('admin.users.newUser')}
          </Button>
        </div>
        <p className="text-sm text-dark-500 dark:text-dark-400 mb-6">{t('admin.users.description')} ({t('admin.users.usersCount', { count: users.length })})</p>

        {/* Search */}
        <div className="mb-4">
          <Input
            placeholder={t('admin.users.search')}
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            icon={<Search className="w-5 h-5" />}
          />
        </div>

        {/* Users table */}
        {
          usersLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#FF3B3B]"></div>
            </div>
          ) : (
            <div className="rounded-xl border border-dark-200 dark:border-dark-700 overflow-x-auto">
              <table className="w-full">
                <thead className="bg-dark-50 dark:bg-dark-900">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-dark-500 uppercase tracking-wider">
                      {t('admin.users.user')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-dark-500 uppercase tracking-wider">
                      {t('admin.users.role')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-dark-500 uppercase tracking-wider">
                      {t('admin.users.storage')}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-dark-500 uppercase tracking-wider">
                      {t('admin.users.joined')}
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-dark-500 uppercase tracking-wider">
                      {t('admin.users.actions')}
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
                            / {formatBytes(user.storageQuota)}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-dark-500">
                        {formatDate(user.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Dropdown
                          trigger={
                            <button
                              className="p-2 text-dark-500 hover:text-dark-900 dark:hover:text-white rounded-lg hover:bg-dark-100 dark:hover:bg-dark-600"
                              aria-label={t('admin.users.actions')}
                            >
                              <MoreVertical className="w-4 h-4" />
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
          )
        }
      </section >

      {/* Create user modal */}
      < Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)
        }
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
              aria-label={t('admin.users.role')}
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
              onChange={(e) => handleUserQuotaChange(e.target.value)}
              className="input"
              aria-label={t('admin.users.storageQuota')}
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
                  aria-label={t('admin.users.quotaUnit')}
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
            <Button type="submit" loading={savingUser}>
              {t('admin.users.create')}
            </Button>
          </div>
        </form>
      </Modal >

      {/* Edit user modal */}
      < Modal
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
              aria-label={t('admin.users.role')}
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
              onChange={(e) => handleUserQuotaChange(e.target.value)}
              className="input"
              aria-label={t('admin.users.storageQuota')}
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
                  aria-label={t('admin.users.quotaUnit')}
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
            <Button type="submit" loading={savingUser}>
              {t('admin.users.saveChanges')}
            </Button>
          </div>
        </form>
      </Modal >

      {/* Delete confirmation modal */}
      < Modal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setUserToDelete(null);
        }}
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
            <Button
              variant="ghost"
              onClick={() => {
                setShowDeleteModal(false);
                setUserToDelete(null);
              }}
              disabled={deletingUser}
            >
              {t('admin.users.cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={deleteUser}
              loading={deletingUser}
              icon={<Trash2 className="w-4 h-4" />}
            >
              {t('admin.users.delete')}
            </Button>
          </div>
        </div>
      </Modal >
    </div >
  );
}
