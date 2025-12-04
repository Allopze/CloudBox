import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Lock, ArrowLeft, CheckCircle, AlertCircle } from 'lucide-react';
import { api } from '../../lib/api';
import { toast } from '../../components/ui/Toast';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';

export default function ResetPassword() {
  const { t } = useTranslation();
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const getErrorMessage = (error: any): string => {
    const status = error.response?.status;
    const message = error.response?.data?.message;
    
    if (message) return message;
    
    switch (status) {
      case 400:
        return t('resetPassword.errors.invalidToken');
      case 404:
        return t('resetPassword.errors.tokenNotFound');
      case 429:
        return t('resetPassword.errors.tooManyAttempts');
      case 500:
        return t('resetPassword.errors.serverError');
      default:
        if (!navigator.onLine) {
          return t('resetPassword.errors.noConnection');
        }
        return t('resetPassword.errors.resetError');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!password || !confirmPassword) {
      setError(t('resetPassword.errors.fieldsRequired'));
      return;
    }

    if (password.length < 8) {
      setError(t('resetPassword.errors.passwordTooShort'));
      return;
    }

    if (password !== confirmPassword) {
      setError(t('resetPassword.errors.passwordMismatch'));
      return;
    }

    setLoading(true);

    try {
      await api.post('/auth/reset-password', { token, password });
      setSuccess(true);
      toast(t('resetPassword.resetSuccess'), 'success');
      setTimeout(() => navigate('/login'), 3000);
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="text-center">
        <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-8 h-8 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold text-dark-900 dark:text-white mb-2">
          {t('resetPassword.success')}
        </h2>
        <p className="text-dark-600 dark:text-dark-400 mb-6">
          {t('resetPassword.successMessage')}
        </p>
        <Link
          to="/login"
          className="text-primary-600 hover:text-primary-700 font-medium"
        >
          {t('resetPassword.goToLogin')}
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-dark-900 dark:text-white mb-2">
        {t('resetPassword.title')}
      </h2>
      <p className="text-dark-600 dark:text-dark-400 mb-6">
        {t('resetPassword.subtitle')}
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label={t('resetPassword.newPassword')}
          type="password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError(''); }}
          placeholder={t('resetPassword.newPasswordPlaceholder')}
          icon={<Lock className="w-5 h-5" />}
          autoFocus
          className="rounded-2xl"
        />

        <Input
          label={t('resetPassword.confirmPassword')}
          type="password"
          value={confirmPassword}
          onChange={(e) => { setConfirmPassword(e.target.value); setError(''); }}
          placeholder={t('resetPassword.confirmPasswordPlaceholder')}
          icon={<Lock className="w-5 h-5" />}
          className="rounded-2xl"
        />

        <p className="text-sm text-dark-500">
          {t('resetPassword.passwordHint')}
        </p>

        <Button type="submit" className="w-full rounded-full" loading={loading}>
          {t('resetPassword.resetButton')}
        </Button>
      </form>

      <Link
        to="/login"
        className="mt-6 text-dark-600 dark:text-dark-400 hover:text-primary-600 font-medium flex items-center justify-center gap-2"
      >
        <ArrowLeft className="w-4 h-4" />
        {t('resetPassword.backToLogin')}
      </Link>
    </div>
  );
}
