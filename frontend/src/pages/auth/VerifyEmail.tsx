import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { api } from '../../lib/api';

export default function VerifyEmail() {
  const { t } = useTranslation();
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    verifyEmail();
  }, [token]);

  const verifyEmail = async () => {
    try {
      await api.post('/auth/verify-email', { token });
      setStatus('success');
      setMessage(t('verifyEmail.successMessage'));
    } catch (error: any) {
      setStatus('error');
      setMessage(error.response?.data?.message || t('verifyEmail.errorMessage'));
    }
  };

  if (status === 'loading') {
    return (
      <div className="text-center">
        <div className="w-16 h-16 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
          <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
        </div>
        <h2 className="text-2xl font-bold text-dark-900 dark:text-white mb-2">
          {t('verifyEmail.verifying')}
        </h2>
        <p className="text-dark-600 dark:text-dark-400">
          {t('verifyEmail.pleaseWait')}
        </p>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="text-center">
        <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-8 h-8 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold text-dark-900 dark:text-white mb-2">
          {t('verifyEmail.success')}
        </h2>
        <p className="text-dark-600 dark:text-dark-400 mb-6">
          {message}
        </p>
        <Link
          to="/login"
          className="inline-flex items-center justify-center px-6 py-3 bg-primary-600 text-white font-medium rounded-full hover:bg-primary-700 transition-colors"
        >
          {t('verifyEmail.continueToLogin')}
        </Link>
      </div>
    );
  }

  return (
    <div className="text-center">
      <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
        <XCircle className="w-8 h-8 text-red-600" />
      </div>
      <h2 className="text-2xl font-bold text-dark-900 dark:text-white mb-2">
        {t('verifyEmail.failed')}
      </h2>
      <p className="text-dark-600 dark:text-dark-400 mb-6">
        {message}
      </p>
      <Link
        to="/login"
        className="inline-flex items-center justify-center px-6 py-3 bg-primary-600 text-white font-medium rounded-full hover:bg-primary-700 transition-colors"
      >
        {t('verifyEmail.goToLogin')}
      </Link>
    </div>
  );
}
