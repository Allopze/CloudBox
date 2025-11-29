import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { api } from '../../lib/api';

export default function VerifyEmail() {
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
      setMessage('¡Tu correo ha sido verificado exitosamente!');
    } catch (error: any) {
      setStatus('error');
      setMessage(error.response?.data?.message || 'Error al verificar el correo. El enlace puede haber expirado.');
    }
  };

  if (status === 'loading') {
    return (
      <div className="text-center">
        <div className="w-16 h-16 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
          <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
        </div>
        <h2 className="text-2xl font-bold text-dark-900 dark:text-white mb-2">
          Verificando tu correo...
        </h2>
        <p className="text-dark-600 dark:text-dark-400">
          Por favor espera mientras verificamos tu correo.
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
          ¡Correo verificado!
        </h2>
        <p className="text-dark-600 dark:text-dark-400 mb-6">
          {message}
        </p>
        <Link
          to="/login"
          className="inline-flex items-center justify-center px-6 py-3 bg-primary-600 text-white font-medium rounded-full hover:bg-primary-700 transition-colors"
        >
          Continuar al inicio de sesión
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
        Verificación fallida
      </h2>
      <p className="text-dark-600 dark:text-dark-400 mb-6">
        {message}
      </p>
      <Link
        to="/login"
        className="inline-flex items-center justify-center px-6 py-3 bg-primary-600 text-white font-medium rounded-full hover:bg-primary-700 transition-colors"
      >
        Ir al inicio de sesión
      </Link>
    </div>
  );
}
