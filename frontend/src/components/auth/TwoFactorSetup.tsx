import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Shield, Copy, Download, QrCode, Loader2, Check, AlertTriangle, ArrowRight, ArrowLeft } from 'lucide-react';
import { api } from '../../lib/api';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { toast } from '../ui/Toast';

interface TwoFactorSetupProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

interface SetupData {
    qrCodeUrl: string;
    secret: string;
    recoveryCodes: string[];
}

export default function TwoFactorSetup({ isOpen, onClose, onSuccess }: TwoFactorSetupProps) {
    const { t } = useTranslation();

    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [loading, setLoading] = useState(false);
    const [enabling, setEnabling] = useState(false);
    const [setupData, setSetupData] = useState<SetupData | null>(null);
    const [code, setCode] = useState(['', '', '', '', '', '']);
    const [error, setError] = useState<string | null>(null);

    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

    // Reset state when modal opens
    useEffect(() => {
        if (isOpen) {
            setStep(1);
            setSetupData(null);
            setCode(['', '', '', '', '', '']);
            setError(null);
            fetchSetupData();
        }
    }, [isOpen]);

    const fetchSetupData = async () => {
        setLoading(true);
        try {
            const response = await api.post('/2fa/setup');
            const data = response.data;
            setSetupData({
                qrCodeUrl: data.qrCodeUrl || data.qrCode,
                secret: data.secret,
                recoveryCodes: data.recoveryCodes,
            });
        } catch (err: any) {
            toast(err.response?.data?.error || 'Failed to initialize 2FA setup', 'error');
            onClose();
        } finally {
            setLoading(false);
        }
    };

    // Handle individual digit input
    const handleDigitChange = (index: number, value: string) => {
        const digit = value.replace(/\D/g, '').slice(-1);

        const newCode = [...code];
        newCode[index] = digit;
        setCode(newCode);
        setError(null);

        if (digit && index < 5) {
            inputRefs.current[index + 1]?.focus();
        }
    };

    const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Backspace' && !code[index] && index > 0) {
            inputRefs.current[index - 1]?.focus();
        }
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
        e.preventDefault();
        const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);

        if (pastedData.length === 6) {
            const newCode = pastedData.split('');
            setCode(newCode);
            inputRefs.current[5]?.focus();
        }
    };

    const handleEnable = async () => {
        const fullCode = code.join('');

        if (fullCode.length !== 6) {
            setError(t('auth.twoFactor.enterSixDigits'));
            return;
        }

        setEnabling(true);
        setError(null);

        try {
            const response = await api.post('/2fa/enable', { code: fullCode });

            // Update setupData with recovery codes from enable response
            setSetupData(prev => prev ? { ...prev, recoveryCodes: response.data.recoveryCodes } : null);

            toast(t('auth.twoFactor.setup.enabled'), 'success');
            setStep(3);
        } catch (err: any) {
            const message = err.response?.data?.error || t('auth.twoFactor.setup.enableFailed');
            setError(message);
            setCode(['', '', '', '', '', '']);
            inputRefs.current[0]?.focus();
        } finally {
            setEnabling(false);
        }
    };

    const copyToClipboard = (text: string, message: string) => {
        navigator.clipboard.writeText(text);
        toast(message, 'success');
    };

    const downloadRecoveryCodes = () => {
        if (!setupData?.recoveryCodes) return;

        const content = [
            'CloudBox Recovery Codes',
            '=======================',
            '',
            'Keep these codes safe. Each code can only be used once.',
            '',
            ...setupData.recoveryCodes.map((code, i) => `${i + 1}. ${code}`),
            '',
            `Generated: ${new Date().toISOString()}`,
        ].join('\n');

        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'cloudbox-recovery-codes.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        toast(t('auth.twoFactor.setup.recoveryCodesCopied'), 'success');
    };

    const handleFinish = () => {
        onSuccess();
        onClose();
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={step === 3 ? handleFinish : onClose}
            title={t('auth.twoFactor.setup.title')}
            size="md"
        >
            {loading ? (
                <div className="flex flex-col items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-primary-600 mb-4" />
                    <p className="text-dark-500">{t('common.loading')}</p>
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Progress Steps */}
                    <div className="flex items-center justify-center gap-2">
                        {[1, 2, 3].map((s) => (
                            <div key={s} className="flex items-center">
                                <div
                                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${s === step
                                            ? 'bg-primary-600 text-white'
                                            : s < step
                                                ? 'bg-green-500 text-white'
                                                : 'bg-dark-100 dark:bg-dark-700 text-dark-500'
                                        }`}
                                >
                                    {s < step ? <Check className="w-4 h-4" /> : s}
                                </div>
                                {s < 3 && (
                                    <div className={`w-12 h-1 mx-1 rounded ${s < step ? 'bg-green-500' : 'bg-dark-100 dark:bg-dark-700'}`} />
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Step 1: Scan QR Code */}
                    {step === 1 && setupData && (
                        <div className="space-y-4">
                            <div className="text-center">
                                <QrCode className="w-12 h-12 mx-auto mb-3 text-primary-600" />
                                <h3 className="font-semibold text-dark-900 dark:text-white mb-1">
                                    {t('auth.twoFactor.setup.step1')}
                                </h3>
                                <p className="text-sm text-dark-500 dark:text-dark-400">
                                    {t('auth.twoFactor.setup.step1Description')}
                                </p>
                            </div>

                            {/* QR Code */}
                            <div className="flex justify-center">
                                <div className="bg-white p-4 rounded-xl">
                                    <img
                                        src={setupData.qrCodeUrl}
                                        alt={t('auth.twoFactor.setup.qrAlt')}
                                        className="w-48 h-48"
                                    />
                                </div>
                            </div>

                            {/* Manual entry */}
                            <div className="bg-dark-50 dark:bg-dark-900 rounded-lg p-4">
                                <p className="text-sm text-dark-500 dark:text-dark-400 mb-2">
                                    {t('auth.twoFactor.setup.manualEntry')}
                                </p>
                                <div className="flex items-center gap-2">
                                    <code className="flex-1 text-sm font-mono bg-white dark:bg-dark-800 px-3 py-2 rounded-lg text-dark-900 dark:text-white break-all">
                                        {setupData.secret}
                                    </code>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => copyToClipboard(setupData.secret, t('auth.twoFactor.setup.secretCopied'))}
                                        icon={<Copy className="w-4 h-4" />}
                                    >
                                        {t('auth.twoFactor.setup.copySecret')}
                                    </Button>
                                </div>
                            </div>

                            <div className="flex justify-end">
                                <Button onClick={() => setStep(2)} icon={<ArrowRight className="w-4 h-4" />}>
                                    {t('common.next')}
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Step 2: Enter Code */}
                    {step === 2 && (
                        <div className="space-y-4">
                            <div className="text-center">
                                <Shield className="w-12 h-12 mx-auto mb-3 text-primary-600" />
                                <h3 className="font-semibold text-dark-900 dark:text-white mb-1">
                                    {t('auth.twoFactor.setup.step2')}
                                </h3>
                                <p className="text-sm text-dark-500 dark:text-dark-400">
                                    {t('auth.twoFactor.setup.step2Description')}
                                </p>
                            </div>

                            {/* Error display */}
                            {error && (
                                <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-center">
                                    <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                                </div>
                            )}

                            {/* Code input */}
                            <div className="flex justify-center gap-2">
                                {code.map((digit, index) => (
                                    <input
                                        key={index}
                                        ref={(el) => { inputRefs.current[index] = el; }}
                                        type="text"
                                        inputMode="numeric"
                                        maxLength={1}
                                        value={digit}
                                        onChange={(e) => handleDigitChange(index, e.target.value)}
                                        onKeyDown={(e) => handleKeyDown(index, e)}
                                        onPaste={handlePaste}
                                        disabled={enabling}
                                        className="w-12 h-14 text-center text-2xl font-mono font-bold rounded-xl border-2 border-dark-200 dark:border-dark-600 bg-white dark:bg-dark-800 text-dark-900 dark:text-white focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all disabled:opacity-50"
                                    />
                                ))}
                            </div>

                            <div className="flex justify-between">
                                <Button variant="ghost" onClick={() => setStep(1)} icon={<ArrowLeft className="w-4 h-4" />}>
                                    {t('common.back')}
                                </Button>
                                <Button
                                    onClick={handleEnable}
                                    loading={enabling}
                                    disabled={code.some(d => !d)}
                                    icon={<Shield className="w-4 h-4" />}
                                >
                                    {enabling ? t('auth.twoFactor.setup.enabling') : t('auth.twoFactor.setup.enable')}
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Step 3: Save Recovery Codes */}
                    {step === 3 && setupData?.recoveryCodes && (
                        <div className="space-y-4">
                            <div className="text-center">
                                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                                    <Check className="w-6 h-6 text-green-600" />
                                </div>
                                <h3 className="font-semibold text-dark-900 dark:text-white mb-1">
                                    {t('auth.twoFactor.setup.step3')}
                                </h3>
                                <p className="text-sm text-dark-500 dark:text-dark-400">
                                    {t('auth.twoFactor.setup.step3Description')}
                                </p>
                            </div>

                            {/* Warning */}
                            <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg flex items-start gap-2">
                                <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                                <p className="text-sm text-yellow-700 dark:text-yellow-500">
                                    {t('auth.twoFactor.setup.recoveryCodesWarning')}
                                </p>
                            </div>

                            {/* Recovery codes grid */}
                            <div className="bg-dark-50 dark:bg-dark-900 rounded-lg p-4">
                                <div className="grid grid-cols-2 gap-2">
                                    {setupData.recoveryCodes.map((code, i) => (
                                        <div
                                            key={i}
                                            className="font-mono text-sm bg-white dark:bg-dark-800 px-3 py-2 rounded text-dark-900 dark:text-white text-center"
                                        >
                                            {code}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Action buttons */}
                            <div className="flex gap-2">
                                <Button
                                    variant="secondary"
                                    className="flex-1"
                                    onClick={() => copyToClipboard(setupData.recoveryCodes.join('\n'), t('auth.twoFactor.setup.recoveryCodesCopied'))}
                                    icon={<Copy className="w-4 h-4" />}
                                >
                                    {t('auth.twoFactor.setup.copyRecoveryCodes')}
                                </Button>
                                <Button
                                    variant="secondary"
                                    className="flex-1"
                                    onClick={downloadRecoveryCodes}
                                    icon={<Download className="w-4 h-4" />}
                                >
                                    {t('auth.twoFactor.setup.downloadRecoveryCodes')}
                                </Button>
                            </div>

                            <Button className="w-full" onClick={handleFinish}>
                                {t('auth.twoFactor.setup.finish')}
                            </Button>
                        </div>
                    )}
                </div>
            )}
        </Modal>
    );
}
