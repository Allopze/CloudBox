import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, AlertCircle } from 'lucide-react';
import { api } from '../../lib/api';
import { toast } from '../../components/ui/Toast';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';

function getErrorMessage(error: any): string {
  const status = error.response?.status;
  const message = error.response?.data?.message;
  
  if (message) return message;
  
  switch (status) {
    case 404:
      return 'No existe una cuenta con este correo electrónico';
    case 429:
      return 'Demasiados intentos. Por favor espera unos minutos';
    case 500:
      return 'Error del servidor. Por favor intenta más tarde';
    default:
      if (!navigator.onLine) {
        return 'Sin conexión a internet. Verifica tu conexión';
      }
      return 'Error al enviar el correo. Por favor intenta de nuevo';
  }
}

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email) {
      setError('Por favor ingresa tu correo electrónico');
      return;
    }

    // Validación básica de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Por favor ingresa un correo electrónico válido');
      return;
    }

    setLoading(true);

    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
      toast('Correo de recuperación enviado', 'success');
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
          Revisa tu correo
        </h2>
        <p className="text-dark-600 dark:text-dark-400 mb-6">
          Hemos enviado un enlace de recuperación a <strong>{email}</strong>
        </p>
        <Link
          to="/login"
          className="text-primary-600 hover:text-primary-700 font-medium flex items-center justify-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver al inicio de sesión
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-dark-900 dark:text-white mb-2">
        ¿Olvidaste tu contraseña?
      </h2>
      <p className="text-dark-600 dark:text-dark-400 mb-6">
        No te preocupes, te enviaremos las instrucciones.
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Correo electrónico"
          type="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setError(''); }}
          placeholder="Ingresa tu correo"
          icon={<Mail className="w-5 h-5" />}
          autoFocus
          className="rounded-2xl"
        />

        <Button type="submit" className="w-full rounded-full" loading={loading}>
          Enviar enlace de recuperación
        </Button>
      </form>

      <Link
        to="/login"
        className="mt-6 text-dark-600 dark:text-dark-400 hover:text-primary-600 font-medium flex items-center justify-center gap-2"
      >
        <ArrowLeft className="w-4 h-4" />
        Volver al inicio de sesión
      </Link>
    </div>
  );
}
