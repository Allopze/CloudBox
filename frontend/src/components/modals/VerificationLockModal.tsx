import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Mail, LogOut, CheckCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';

export default function VerificationLockModal() {
    const { t } = useTranslation();
    const { user, logout, resendVerification } = useAuthStore();
    const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');

    if (!user) return null;

    // Check if grace period has passed (7 days = 7 * 24 * 60 * 60 * 1000 ms)
    const gracePeriod = 7 * 24 * 60 * 60 * 1000;
    const createdAt = new Date(user.createdAt).getTime();
    const now = Date.now();
    const isGracePeriodOver = now - createdAt > gracePeriod;

    // If email is verified or grace period is not over, don't show modal
    if (user.emailVerified || !isGracePeriodOver) {
        return null;
    }

    const handleResend = async () => {
        setStatus('sending');
        try {
            await resendVerification();
            setStatus('success');
        } catch (error) {
            console.error('Failed to resend verification:', error);
            setStatus('error');
            // Reset error state after 5 seconds
            setTimeout(() => setStatus('idle'), 5000);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div className="w-full max-w-md bg-white dark:bg-dark-800 rounded-2xl shadow-xl overflow-hidden border border-dark-200 dark:border-dark-700 animate-in fade-in zoom-in-95 duration-300">
                <div className="p-6 text-center">
                    <div className="w-16 h-16 bg-yellow-100 dark:bg-yellow-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                        <AlertTriangle className="w-8 h-8 text-yellow-600 dark:text-yellow-500" />
                    </div>

                    <h2 className="text-2xl font-bold text-dark-900 dark:text-white mb-2">
                        {t('verificationLock.title')}
                    </h2>

                    <p className="text-dark-600 dark:text-dark-400 mb-6">
                        {t('verificationLock.description')}
                    </p>

                    <div className="space-y-3">
                        {status === 'success' ? (
                            <div className="rounded-xl bg-green-50 dark:bg-green-900/20 p-4 border border-green-100 dark:border-green-900/30">
                                <div className="flex items-center justify-center text-green-700 dark:text-green-400 font-medium mb-1">
                                    <CheckCircle className="w-5 h-5 mr-2" />
                                    {t('verificationLock.sentSuccess')}
                                </div>
                                <p className="text-sm text-green-600 dark:text-green-500/80">
                                    {t('verificationLock.checkInbox')}
                                </p>
                            </div>
                        ) : (
                            <button
                                onClick={handleResend}
                                disabled={status === 'sending'}
                                className="w-full flex items-center justify-center px-4 py-3 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {status === 'sending' ? (
                                    <>
                                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                        {t('common.sending')}
                                    </>
                                ) : (
                                    <>
                                        <Mail className="w-5 h-5 mr-2" />
                                        {t('verificationLock.resendEmail')}
                                    </>
                                )}
                            </button>
                        )}

                        {status === 'error' && (
                            <p className="text-sm text-red-600 dark:text-red-400 animate-pulse">
                                {t('common.error')}
                            </p>
                        )}

                        <button
                            onClick={logout}
                            className="w-full flex items-center justify-center px-4 py-3 bg-transparent hover:bg-dark-100 dark:hover:bg-dark-700 text-dark-600 dark:text-dark-400 font-medium rounded-xl transition-colors"
                        >
                            <LogOut className="w-5 h-5 mr-2" />
                            {t('common.logout')}
                        </button>
                    </div>
                </div>

                <div className="px-6 py-4 bg-dark-50 dark:bg-dark-800/80 border-t border-dark-100 dark:border-dark-700 text-center">
                    <p className="text-xs text-dark-500 dark:text-dark-500">
                        {t('verificationLock.helpContext')}
                    </p>
                </div>
            </div>
        </div>
    );
}
