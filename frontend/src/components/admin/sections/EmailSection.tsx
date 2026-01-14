import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../../lib/api';
import Button from '../../ui/Button';
import Input from '../../ui/Input';
import { toast } from '../../ui/Toast';
import { Save, Code, Eye, Plus, Edit, RotateCcw, FileText, Trash2, Send } from 'lucide-react';

interface SmtpConfig {
    host: string;
    port: number;
    secure: boolean;
    auth: { user: string; pass: string };
    from: string;
}

interface EmailTemplate {
    name: string;
    subject: string;
    body: string;
    isDefault: boolean;
}

interface TemplateVariable {
    id?: string;
    name: string;
    description?: string;
    defaultValue: string;
}

export default function EmailSection() {
    const { t } = useTranslation();

    // SMTP State
    const [smtpConfig, setSmtpConfig] = useState<SmtpConfig>({
        host: '',
        port: 587,
        secure: false,
        auth: { user: '', pass: '' },
        from: '',
    });

    // Templates State
    const [templates, setTemplates] = useState<EmailTemplate[]>([]);
    const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
    const [showPreview, setShowPreview] = useState(false);

    // Variables State
    const [templateVariables, setTemplateVariables] = useState<{ system: TemplateVariable[]; custom: TemplateVariable[] }>({ system: [], custom: [] });
    const [editingVariable, setEditingVariable] = useState<TemplateVariable | null>(null);
    const [showAddVariableModal, setShowAddVariableModal] = useState(false);
    const [showVariablesPanel, setShowVariablesPanel] = useState(false);

    // Loading States
    const [loading, setLoading] = useState(true);
    const [savingSmtp, setSavingSmtp] = useState(false);
    const [testingSmtp, setTestingSmtp] = useState(false);
    const [savingTemplate, setSavingTemplate] = useState(false);
    const [sendingTestEmail, setSendingTestEmail] = useState(false);
    const [savingVariable, setSavingVariable] = useState(false);

    // Test Email
    const [testEmailAddress, setTestEmailAddress] = useState('');

    // New Variable Form
    const [newVariableName, setNewVariableName] = useState('');
    const [newVariableValue, setNewVariableValue] = useState('');
    const [newVariableDescription, setNewVariableDescription] = useState('');

    useEffect(() => {
        loadData();
    }, []);

    // Load variables when editing template changes
    useEffect(() => {
        if (editingTemplate) {
            loadVariables(editingTemplate.name);
        } else {
            setTemplateVariables({ system: [], custom: [] });
        }
    }, [editingTemplate?.name]);

    const loadData = async () => {
        try {
            const [smtpRes, templatesRes] = await Promise.all([
                api.get('/admin/smtp'),
                api.get('/admin/email-templates'),
            ]);

            // Merge with defaults to ensure auth object always exists
            setSmtpConfig({
                host: smtpRes.data?.host ?? '',
                port: smtpRes.data?.port ?? 587,
                secure: smtpRes.data?.secure === true || smtpRes.data?.secure === 'true',
                auth: {
                    user: smtpRes.data?.user ?? smtpRes.data?.auth?.user ?? '',
                    pass: smtpRes.data?.auth?.pass ?? '',
                },
                from: smtpRes.data?.from ?? '',
            });
            setTemplates(templatesRes.data);
        } catch (error) {
            console.error('Failed to load email data', error);
            toast(t('admin.loadError'), 'error');
        } finally {
            setLoading(false);
        }
    };

    const loadVariables = async (templateName: string) => {
        try {
            const res = await api.get(`/admin/email-templates/${templateName}/variables`);
            setTemplateVariables(res.data);
        } catch (error) {
            console.error('Failed to load variables', error);
            toast(t('admin.loadError'), 'error');
        }
    };

    // SMTP Handlers
    const saveSmtpConfig = async () => {
        setSavingSmtp(true);
        try {
            const payload: Record<string, unknown> = {
                host: smtpConfig.host,
                port: smtpConfig.port,
                secure: smtpConfig.secure,
                user: smtpConfig.auth.user,
                from: smtpConfig.from,
            };
            if (smtpConfig.auth.pass) {
                payload.pass = smtpConfig.auth.pass;
            }
            await api.post('/admin/smtp', payload);
            toast(t('admin.smtp.saved'), 'success');
        } catch (error) {
            toast(t('admin.smtp.saveError'), 'error');
        } finally {
            setSavingSmtp(false);
        }
    };

    const testSmtpConnection = async () => {
        if (!testEmailAddress) {
            toast(t('admin.enterEmail'), 'error');
            return;
        }
        setTestingSmtp(true);
        try {
            const res = await api.post('/admin/settings/smtp/test', { email: testEmailAddress });
            const details = res.data?.details;
            const messageId = details?.messageId ? ` ${details.messageId}` : '';
            toast(`${t('admin.smtp.testSuccess')}${messageId}`, 'success');
        } catch (error: any) {
            toast(error.response?.data?.error || t('admin.smtp.testError'), 'error');
        } finally {
            setTestingSmtp(false);
        }
    };

    // Template Handlers
    const saveTemplate = async () => {
        if (!editingTemplate) return;
        setSavingTemplate(true);
        try {
            await api.put(`/admin/email-templates/${editingTemplate.name}`, {
                subject: editingTemplate.subject,
                body: editingTemplate.body,
            });
            toast(t('admin.templates.saved'), 'success');
            loadData(); // Refresh to get updated list
        } catch (error) {
            toast(t('admin.templates.saveError'), 'error');
        } finally {
            setSavingTemplate(false);
        }
    };

    const resetTemplate = async () => {
        if (!editingTemplate) return;
        try {
            await api.post(`/admin/email-templates/${editingTemplate.name}/reset`);
            toast(t('admin.templates.resetSuccess'), 'success');
            // Reload the specific template
            const res = await api.get('/admin/email-templates');
            setTemplates(res.data);
            const updated = res.data.find((t: EmailTemplate) => t.name === editingTemplate.name);
            if (updated) setEditingTemplate(updated);
        } catch (error) {
            toast(t('admin.templates.resetError'), 'error');
        }
    };

    const sendTestTemplateEmail = async () => {
        if (!editingTemplate || !testEmailAddress) {
            toast(t('admin.enterEmail'), 'error');
            return;
        }
        setSendingTestEmail(true);
        try {
            // We send the current state of the template, not necessarily the saved one
            await api.post(`/admin/email-templates/${editingTemplate.name}/test`, {
                email: testEmailAddress,
                subject: editingTemplate.subject,
                body: editingTemplate.body
            });
            toast(t('admin.emailSent'), 'success');
        } catch (error) {
            toast(t('admin.emailSendError'), 'error');
        } finally {
            setSendingTestEmail(false);
        }
    };

    const insertVariable = (variableName: string) => {
        if (!editingTemplate) return;

        const token = `{{${variableName}}}`;
        // Simple append for now, ideally insert at cursor but textarea ref handling is complex for this extraction
        setEditingTemplate({
            ...editingTemplate,
            body: editingTemplate.body + token
        });
        toast(t('admin.templates.variableInserted'), 'info');
    };

    // Variables Handlers
    const addVariable = async () => {
        if (!newVariableName || !newVariableValue || !editingTemplate) return;
        setSavingVariable(true);
        try {
            await api.post(`/admin/email-templates/${editingTemplate.name}/variables`, {
                name: newVariableName,
                defaultValue: newVariableValue,
                description: newVariableDescription,
            });
            toast(t('admin.templates.variableAdded'), 'success');
            setShowAddVariableModal(false);
            setNewVariableName('');
            setNewVariableValue('');
            setNewVariableDescription('');

            loadVariables(editingTemplate.name);
        } catch (error) {
            toast(t('admin.saveError'), 'error');
        } finally {
            setSavingVariable(false);
        }
    };

    const updateVariable = async () => {
        if (!editingVariable || !editingVariable.id || !editingTemplate) return;
        setSavingVariable(true);
        try {
            await api.put(`/admin/email-templates/${editingTemplate.name}/variables/${editingVariable.id}`, {
                defaultValue: editingVariable.defaultValue,
                description: editingVariable.description,
            });
            toast(t('admin.saved'), 'success');
            setEditingVariable(null);

            loadVariables(editingTemplate.name);
        } catch (error) {
            toast(t('admin.saveError'), 'error');
        } finally {
            setSavingVariable(false);
        }
    };

    const deleteVariable = async (id: string) => {
        if (!confirm(t('admin.confirmDelete')) || !editingTemplate) return;
        try {
            await api.delete(`/admin/email-templates/${editingTemplate.name}/variables/${id}`);
            toast(t('admin.deleted'), 'success');

            loadVariables(editingTemplate.name);
        } catch (error) {
            toast(t('admin.deleteError'), 'error');
        }
    };

    const initializeTemplates = async () => {
        try {
            await api.post('/admin/email-templates/initialize');
            toast(t('admin.templates.initialized'), 'success');
            loadData();
        } catch (error) {
            toast(t('admin.templates.initError'), 'error');
        }
    };

    const getTemplateDisplayName = (name: string) => {
        switch (name) {
            case 'welcome': return t('admin.templates.welcome');
            case 'reset-password': return t('admin.templates.resetPassword');
            case 'verify-email': return t('admin.templates.verifyEmail');
            case 'storage-warning': return t('admin.templates.storageWarning');
            default: return name;
        }
    };

    const previewName = t('admin.templates.previewName');
    const previewEmail = t('admin.templates.previewEmail');

    // Helper to get preview HTML
    const getPreviewHtml = () => {
        if (!editingTemplate) return '';
        // Basic replacement for preview
        let html = editingTemplate.body;
        // Replace system variables with mock data
        html = html.replace(/\{\{name\}\}/g, previewName)
            .replace(/\{\{email\}\}/g, previewEmail)
            .replace(/\{\{action_url\}\}/g, '#')
            .replace(/\{\{site_ul\}\}/g, window.location.origin);
        // Replace custom variables
        templateVariables.custom.forEach(v => {
            const regex = new RegExp(`\\{\\{${v.name}\\}\\}`, 'g');
            html = html.replace(regex, v.defaultValue);
        });
        return html;
    };


    if (loading) {
        return <div className="flex justify-center p-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" /></div>;
    }

    return (
        <div className="space-y-8">
            {/* Main Title */}
            <div>
                <h2 className="text-2xl font-bold text-dark-900 dark:text-white">{t('admin.email.title')}</h2>
                <p className="text-dark-500 dark:text-dark-400 mt-1">{t('admin.email.description')}</p>
            </div>

            {/* SMTP Configuration */}
            <section>
                <h3 className="text-lg font-semibold text-dark-900 dark:text-white mb-4">{t('admin.smtp.title')}</h3>
                <div className="py-2">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <Input label={t('admin.smtp.host')} value={smtpConfig.host} onChange={(e) => setSmtpConfig({ ...smtpConfig, host: e.target.value })} />
                        <Input label={t('admin.smtp.port')} type="number" value={String(smtpConfig.port)} onChange={(e) => setSmtpConfig({ ...smtpConfig, port: parseInt(e.target.value) })} />
                        <Input label={t('admin.smtp.user')} value={smtpConfig.auth.user} onChange={(e) => setSmtpConfig({ ...smtpConfig, auth: { ...smtpConfig.auth, user: e.target.value } })} />
                        <Input label={t('admin.smtp.pass')} type="password" value={smtpConfig.auth.pass} onChange={(e) => setSmtpConfig({ ...smtpConfig, auth: { ...smtpConfig.auth, pass: e.target.value } })} />
                        <Input label={t('admin.smtp.from')} value={smtpConfig.from} onChange={(e) => setSmtpConfig({ ...smtpConfig, from: e.target.value })} className="md:col-span-2" />
                    </div>

                    <div className="flex items-center gap-2 mb-6">
                        <input
                            type="checkbox"
                            id="secure"
                            checked={smtpConfig.secure}
                            onChange={(e) => setSmtpConfig({ ...smtpConfig, secure: e.target.checked })}
                            className="w-4 h-4 rounded border-dark-300 text-primary-600 focus:ring-primary-500"
                        />
                        <label htmlFor="secure" className="text-sm font-medium text-dark-700 dark:text-dark-300">{t('admin.smtp.secure')}</label>
                    </div>

                    <div className="flex flex-col sm:flex-row justify-between gap-4 pt-4 border-t border-dark-100 dark:border-dark-700">
                        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                            <div className="flex-1 min-w-[200px]">
                                <Input
                                    placeholder={t('admin.enterEmail')}
                                    value={testEmailAddress}
                                    onChange={(e) => setTestEmailAddress(e.target.value)}
                                />
                            </div>
                            <Button
                                variant="secondary"
                                onClick={testSmtpConnection}
                                loading={testingSmtp}
                                className="whitespace-nowrap shrink-0"
                            >
                                {t('admin.smtp.test')}
                            </Button>
                        </div>
                        <Button onClick={saveSmtpConfig} loading={savingSmtp} icon={<Save className="w-4 h-4" />}>
                            {t('admin.smtp.save')}
                        </Button>
                    </div>
                </div>
            </section>

            {/* Email Templates */}
            <section>
                <h3 className="text-lg font-semibold text-dark-900 dark:text-white mb-4">{t('admin.templates.title')}</h3>
                <div className="flex flex-col lg:flex-row h-[700px] border border-dark-100 dark:border-dark-700 rounded-2xl overflow-hidden bg-white/50 dark:bg-dark-900/50">
                    {/* Sidebar List */}
                    <div className="w-full lg:w-64 border-b lg:border-b-0 lg:border-r border-dark-100 dark:border-dark-700 bg-dark-50/50 dark:bg-dark-900/50 p-2 overflow-y-auto">
                        {templates.length > 0 ? (
                            templates.map(tpl => (
                                <button
                                    key={tpl.name}
                                    onClick={() => { setEditingTemplate(tpl); setShowPreview(false); }}
                                    className={`w-full text-left px-4 py-3 rounded-xl transition-colors mb-1 ${editingTemplate?.name === tpl.name
                                        ? 'bg-white dark:bg-dark-800 text-primary-600 dark:text-primary-400 shadow-sm font-medium'
                                        : 'text-dark-600 dark:text-dark-400 hover:bg-white/50 dark:hover:bg-dark-800/50'
                                        }`}
                                >
                                    {getTemplateDisplayName(tpl.name)}
                                </button>
                            ))
                        ) : (
                            <div className="p-4 text-center">
                                <p className="text-sm text-dark-400 italic mb-4">
                                    {t('admin.templates.noTemplates')}
                                </p>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={initializeTemplates}
                                    icon={<RotateCcw className="w-4 h-4" />}
                                >
                                    {t('admin.templates.restoreDefaults')}
                                </Button>
                            </div>
                        )}
                    </div>

                    {/* Editor Area */}
                    <div className="flex-1 p-6 overflow-y-auto">
                        {editingTemplate ? (
                            <div className="space-y-6">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-3">
                                        <h3 className="text-lg font-bold text-dark-900 dark:text-white">{getTemplateDisplayName(editingTemplate.name)}</h3>
                                        {editingTemplate.isDefault && (
                                            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                                                {t('admin.templates.usingDefault')}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex bg-dark-100 dark:bg-dark-900 rounded-lg p-1">
                                        <button
                                            onClick={() => setShowPreview(false)}
                                            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${!showPreview ? 'bg-white dark:bg-dark-700 text-dark-900 dark:text-white shadow-sm' : 'text-dark-500'}`}
                                        >
                                            <Code className="w-4 h-4" /> {t('admin.templates.editor')}
                                        </button>
                                        <button
                                            onClick={() => setShowPreview(true)}
                                            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${showPreview ? 'bg-white dark:bg-dark-700 text-dark-900 dark:text-white shadow-sm' : 'text-dark-500'}`}
                                        >
                                            <Eye className="w-4 h-4" /> {t('admin.templates.preview')}
                                        </button>
                                    </div>
                                </div>

                                {/* Variables Accordion */}
                                <div className="border border-dark-200 dark:border-dark-700 rounded-xl overflow-hidden">
                                    <button
                                        onClick={() => setShowVariablesPanel(!showVariablesPanel)}
                                        className="w-full flex items-center justify-between px-4 py-2 bg-dark-50 dark:bg-dark-900 hover:bg-dark-100 transition-colors"
                                    >
                                        <span className="text-sm font-medium text-dark-700 dark:text-dark-300">
                                            {t('admin.templates.availableVariables', { count: templateVariables.system.length + templateVariables.custom.length })}
                                        </span>
                                    </button>
                                    {showVariablesPanel && (
                                        <div className="p-4 bg-white dark:bg-dark-800 border-t border-dark-200 dark:border-dark-700">
                                            <div className="mb-4">
                                                <p className="text-xs font-bold text-dark-500 uppercase mb-2">{t('admin.templates.systemVariables')}</p>
                                                <div className="flex flex-wrap gap-2">
                                                    {templateVariables.system.map(v => (
                                                        <button key={v.name} onClick={() => insertVariable(v.name)} className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-300 transition-colors">
                                                            {`{{${v.name}}}`}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                            <div>
                                                <div className="flex items-center justify-between mb-2">
                                                    <p className="text-xs font-bold text-dark-500 uppercase">{t('admin.templates.customVariables')}</p>
                                                    <button onClick={() => setShowAddVariableModal(true)} className="text-xs text-primary-600 flex items-center gap-1 font-medium"><Plus className="w-3 h-3" /> {t('admin.templates.newVariable')}</button>
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                    {templateVariables.custom.map(v => (
                                                        <div key={v.name} className="flex items-center bg-green-50 text-green-700 rounded text-xs dark:bg-green-900/20 dark:text-green-300 pr-1 overflow-hidden border border-green-100 dark:border-green-900/40">
                                                            <button onClick={() => insertVariable(v.name)} className="px-2 py-1 hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors">
                                                                {`{{${v.name}}}`}
                                                            </button>
                                                            <div className="flex border-l border-green-200 dark:border-green-800">
                                                                <button onClick={() => setEditingVariable(v)} className="p-1 hover:bg-green-200"><Edit className="w-3 h-3" /></button>
                                                                <button onClick={() => deleteVariable(v.id!)} className="p-1 hover:bg-red-200 text-red-500"><Trash2 className="w-3 h-3" /></button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {!showPreview ? (
                                    <>
                                        <Input label={t('admin.templates.subject')} value={editingTemplate.subject} onChange={(e) => setEditingTemplate({ ...editingTemplate, subject: e.target.value })} />
                                        <div className="flex-1">
                                            <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">{t('admin.templates.htmlContent')}</label>
                                            <textarea
                                                value={editingTemplate.body}
                                                onChange={(e) => setEditingTemplate({ ...editingTemplate, body: e.target.value })}
                                                className="w-full h-[300px] px-4 py-3 bg-dark-50 dark:bg-dark-900 border border-dark-200 dark:border-dark-700 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none leading-relaxed"
                                            />
                                        </div>
                                    </>
                                ) : (
                                    <div className="border border-dark-200 dark:border-dark-700 rounded-xl overflow-hidden">
                                    <div className="bg-dark-50 dark:bg-dark-900 p-3 border-b border-dark-200 dark:border-dark-700 text-sm">
                                            <span className="text-dark-500">{t('admin.templates.subject')}:</span> <span className="font-medium text-dark-900 dark:text-white">{editingTemplate.subject}</span>
                                        </div>
                                        <iframe
                                            srcDoc={getPreviewHtml()}
                                            className="w-full h-[400px] bg-white"
                                            title={t('admin.templates.previewTitle')}
                                        />
                                    </div>
                                )}

                                <div className="flex justify-between pt-4 border-t border-dark-100 dark:border-dark-700">
                                    <div className="flex gap-2">
                                        <Button variant="secondary" onClick={resetTemplate} icon={<RotateCcw className="w-4 h-4" />}>{t('admin.templates.reset')}</Button>
                                        <Button variant="secondary" onClick={sendTestTemplateEmail} loading={sendingTestEmail} icon={<Send className="w-4 h-4" />}>{t('admin.templates.sendTest')}</Button>
                                    </div>
                                    <Button onClick={saveTemplate} loading={savingTemplate} icon={<Save className="w-4 h-4" />}>
                                        {t('admin.templates.save')}
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-dark-400">
                                <FileText className="w-12 h-12 mb-4 opacity-20" />
                                <p>{t('admin.templates.selectTemplate')}</p>
                            </div>
                        )}
                    </div>
                </div>
            </section>

            {/* Add Variable Modal */}
            {showAddVariableModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowAddVariableModal(false)}>
                    <div className="bg-white dark:bg-dark-800 rounded-xl shadow-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold mb-4 text-dark-900 dark:text-white">{t('admin.templates.newVariable')}</h3>
                        <div className="space-y-4">
                            <Input label={t('admin.templates.variableName')} value={newVariableName} onChange={e => setNewVariableName(e.target.value)} placeholder={t('admin.templates.variableNamePlaceholder')} />
                            <Input label={t('admin.templates.defaultValue')} value={newVariableValue} onChange={e => setNewVariableValue(e.target.value)} />
                            <Input label={t('admin.templates.description')} value={newVariableDescription} onChange={e => setNewVariableDescription(e.target.value)} />
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <Button variant="ghost" onClick={() => setShowAddVariableModal(false)}>{t('common.cancel')}</Button>
                            <Button onClick={addVariable} loading={savingVariable}>{t('common.create')}</Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Variable Modal */}
            {editingVariable && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setEditingVariable(null)}>
                    <div className="bg-white dark:bg-dark-800 rounded-xl shadow-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold mb-4 text-dark-900 dark:text-white">{t('admin.templates.editVariable', { name: editingVariable.name })}</h3>
                        <div className="space-y-4">
                            <Input label={t('admin.templates.defaultValue')} value={editingVariable.defaultValue} onChange={e => setEditingVariable({ ...editingVariable, defaultValue: e.target.value })} />
                            <Input label={t('admin.templates.description')} value={editingVariable.description || ''} onChange={e => setEditingVariable({ ...editingVariable, description: e.target.value })} />
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <Button variant="ghost" onClick={() => setEditingVariable(null)}>{t('common.cancel')}</Button>
                            <Button onClick={updateVariable} loading={savingVariable}>{t('common.save')}</Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
