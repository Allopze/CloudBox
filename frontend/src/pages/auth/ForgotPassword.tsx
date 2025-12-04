import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Mail, ArrowLeft, AlertCircle } from 'lucide-react';
import { api } from '../../lib/api';
import { toast } from '../../components/ui/Toast';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';

export default function ForgotPassword() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const getErrorMessage = (error: any): string => {
    const status = error.response?.status;
    const message = error.response?.data?.message;
    
    if (message) return message;
    
    switch (status) {
      case 404:
        return t('forgotPassword.errors.notFound');
      case 429:
        return t('forgotPassword.errors.tooManyAttempts');
      case 500:
        return t('forgotPassword.errors.serverError');
      default:
        if (!navigator.onLine) {
          return t('forgotPassword.errors.noConnection');
        }
        return t('forgotPassword.errors.sendError');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email) {
      setError(t('forgotPassword.errors.emailRequired'));
      return;
    }

    // Validación básica de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError(t('forgotPassword.errors.invalidEmail'));
      return;
    }

    setLoading(true);

    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
      toast(t('forgotPassword.recoverySent'), 'success');
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="text-center">
        <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
          <Mail className="w-8 h-8 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold text-dark-900 dark:text-white mb-2">
          {t('forgotPassword.checkEmail')}
        </h2>
        <p className="text-dark-600 dark:text-dark-400 mb-6">
          {t('forgotPassword.emailSent')} <strong>{email}</strong>
        </p>
        <Link
          to="/login"
          className="text-primary-600 hover:text-primary-700 font-medium flex items-center justify-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('forgotPassword.backToLogin')}
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-dark-900 dark:text-white mb-2">
        {t('forgotPassword.title')}
      </h2>
      <p className="text-dark-600 dark:text-dark-400 mb-6">
        {t('forgotPassword.subtitle')}
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label={t('forgotPassword.emailLabel')}
          type="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setError(''); }}
          placeholder={t('forgotPassword.emailPlaceholder')}
          icon={<Mail className="w-5 h-5" />}
          autoFocus
          className="rounded-2xl"
        />

        <Button type="submit" className="w-full rounded-full" loading={loading}>
          {t('forgotPassword.sendLink')}
        </Button>
      </form>

      <Link
        to="/login"
        className="mt-6 text-dark-600 dark:text-dark-400 hover:text-primary-600 font-medium flex items-center justify-center gap-2"
      >
        <ArrowLeft className="w-4 h-4" />
        {t('forgotPassword.backToLogin')}
      </Link>
    </div>
  );
}
