import { useState, useRef, useEffect, KeyboardEvent, ClipboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Shield, ArrowLeft, Key, Loader2 } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import Button from '../ui/Button';
import { toast } from '../ui/Toast';

interface TwoFactorInputProps {
    onSuccess?: () => void;
}

export default function TwoFactorInput({ onSuccess }: TwoFactorInputProps) {
    const { t } = useTranslation();
    const { verify2FA, verify2FARecovery, cancel2FA } = useAuthStore();

    const [code, setCode] = useState(['', '', '', '', '', '']);
    const [isVerifying, setIsVerifying] = useState(false);
    const [useRecoveryCode, setUseRecoveryCode] = useState(false);
    const [recoveryCode, setRecoveryCode] = useState('');
    const [error, setError] = useState<string | null>(null);

    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

    // Focus first input on mount
    useEffect(() => {
        if (!useRecoveryCode) {
            inputRefs.current[0]?.focus();
        }
    }, [useRecoveryCode]);

    // Handle individual digit input
    const handleDigitChange = (index: number, value: string) => {
        // Only allow single digit
        const digit = value.replace(/\D/g, '').slice(-1);

        const newCode = [...code];
        newCode[index] = digit;
        setCode(newCode);
        setError(null);

        // Auto-focus next input
        if (digit && index < 5) {
            inputRefs.current[index + 1]?.focus();
        }

        // Auto-submit when all digits entered
        if (digit && index === 5 && newCode.every(d => d !== '')) {
            handleVerify(newCode.join(''));
        }
    };

    // Handle backspace
    const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Backspace' && !code[index] && index > 0) {
            inputRefs.current[index - 1]?.focus();
        }
    };

    // Handle paste
    const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
        e.preventDefault();
        const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);

        if (pastedData.length === 6) {
            const newCode = pastedData.split('');
            setCode(newCode);
            inputRefs.current[5]?.focus();
            handleVerify(pastedData);
        }
    };

    const handleVerify = async (codeString?: string) => {
        const fullCode = codeString || code.join('');

        if (useRecoveryCode) {
            if (!recoveryCode.trim()) {
                setError(t('auth.twoFactor.enterRecoveryCode'));
                return;
            }
        } else {
            if (fullCode.length !== 6) {
                setError(t('auth.twoFactor.enterSixDigits'));
                return;
            }
        }

        setIsVerifying(true);
        setError(null);

        try {
            if (useRecoveryCode) {
                await verify2FARecovery(recoveryCode.trim());
            } else {
                await verify2FA(fullCode);
            }
            toast(t('auth.twoFactor.verificationSuccess'), 'success');
            onSuccess?.();
        } catch (err: any) {
            const message = err.response?.data?.error || t('auth.twoFactor.verificationFailed');
            setError(message);
            // Clear code on error
            if (!useRecoveryCode) {
                setCode(['', '', '', '', '', '']);
                inputRefs.current[0]?.focus();
            }
        } finally {
            setIsVerifying(false);
        }
    };

    const handleCancel = () => {
        cancel2FA();
    };

    return (
        <div className="w-full max-w-md mx-auto">
            {/* Header */}
            <div className="text-center mb-8">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                    <Shield className="w-8 h-8 text-primary-600 dark:text-primary-400" />
                </div>
                <h2 className="text-2xl font-bold text-dark-900 dark:text-white mb-2">
                    {t('auth.twoFactor.title')}
                </h2>
                <p className="text-dark-600 dark:text-dark-400">
                    {useRecoveryCode
                        ? t('auth.twoFactor.enterRecoveryCodeDescription')
                        : t('auth.twoFactor.enterCodeDescription')
                    }
                </p>
            </div>

            {/* Error display */}
            {error && (
                <div className="mb-6 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-center">
                    <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
            )}

            {!useRecoveryCode ? (
                /* TOTP Code Input */
                <div className="space-y-6">
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
                                disabled={isVerifying}
                                className="w-12 h-14 text-center text-2xl font-mono font-bold rounded-xl border-2 border-dark-200 dark:border-dark-600 bg-white dark:bg-dark-800 text-dark-900 dark:text-white focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all disabled:opacity-50"
                                autoComplete="one-time-code"
                            />
                        ))}
                    </div>

                    <Button
                        onClick={() => handleVerify()}
                        disabled={isVerifying || code.some(d => !d)}
                        className="w-full"
                    >
                        {isVerifying ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                {t('auth.twoFactor.verifying')}
                            </>
                        ) : (
                            t('auth.twoFactor.verify')
                        )}
                    </Button>

                    {/* Use recovery code link */}
                    <button
                        type="button"
                        onClick={() => setUseRecoveryCode(true)}
                        className="w-full flex items-center justify-center gap-2 text-sm text-dark-600 dark:text-dark-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                    >
                        <Key className="w-4 h-4" />
                        {t('auth.twoFactor.useRecoveryCode')}
                    </button>
                </div>
            ) : (
                /* Recovery Code Input */
                <div className="space-y-6">
                    <input
                        type="text"
                        value={recoveryCode}
                        onChange={(e) => {
                            setRecoveryCode(e.target.value);
                            setError(null);
                        }}
                        placeholder={t('auth.twoFactor.recoveryCodePlaceholder')}
                        disabled={isVerifying}
                        className="w-full px-4 py-3 text-center font-mono rounded-xl border-2 border-dark-200 dark:border-dark-600 bg-white dark:bg-dark-800 text-dark-900 dark:text-white focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 outline-none transition-all disabled:opacity-50"
                        autoFocus
                    />

                    <Button
                        onClick={() => handleVerify()}
                        disabled={isVerifying || !recoveryCode.trim()}
                        className="w-full"
                    >
                        {isVerifying ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                {t('auth.twoFactor.verifying')}
                            </>
                        ) : (
                            t('auth.twoFactor.verify')
                        )}
                    </Button>

                    {/* Back to TOTP */}
                    <button
                        type="button"
                        onClick={() => {
                            setUseRecoveryCode(false);
                            setRecoveryCode('');
                            setError(null);
                        }}
                        className="w-full flex items-center justify-center gap-2 text-sm text-dark-600 dark:text-dark-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        {t('auth.twoFactor.backToAuthenticator')}
                    </button>
                </div>
            )}

            {/* Cancel button */}
            <button
                type="button"
                onClick={handleCancel}
                disabled={isVerifying}
                className="w-full mt-4 py-2 text-sm text-dark-500 dark:text-dark-400 hover:text-dark-700 dark:hover:text-dark-300 transition-colors disabled:opacity-50"
            >
                {t('auth.twoFactor.cancel')}
            </button>
        </div>
    );
}
