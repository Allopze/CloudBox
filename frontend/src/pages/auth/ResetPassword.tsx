import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Lock, ArrowLeft, CheckCircle } from 'lucide-react';
import { api } from '../../lib/api';
import { toast } from '../../components/ui/Toast';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';

export default function ResetPassword() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!password || !confirmPassword) {
      toast('Por favor completa todos los campos', 'error');
      return;
    }

    if (password.length < 8) {
      toast('La contraseña debe tener al menos 8 caracteres', 'error');
      return;
    }

    if (password !== confirmPassword) {
      toast('Las contraseñas no coinciden', 'error');
      return;
    }

    setLoading(true);

    try {
      await api.post('/auth/reset-password', { token, password });
      setSuccess(true);
      toast('Contraseña restablecida exitosamente', 'success');
      setTimeout(() => navigate('/login'), 3000);
    } catch (error: any) {
      toast(error.response?.data?.message || 'Error al restablecer la contraseña', 'error');
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
          ¡Contraseña restablecida!
        </h2>
        <p className="text-dark-600 dark:text-dark-400 mb-6">
          Tu contraseña ha sido restablecida exitosamente. Serás redirigido al inicio de sesión en breve.
        </p>
        <Link
          to="/login"
          className="text-primary-600 hover:text-primary-700 font-medium"
        >
          Ir al inicio de sesión
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-dark-900 dark:text-white mb-2">
        Establecer nueva contraseña
      </h2>
      <p className="text-dark-600 dark:text-dark-400 mb-6">
        Tu nueva contraseña debe ser diferente a las anteriores.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Nueva contraseña"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Ingresa la nueva contraseña"
          icon={<Lock className="w-5 h-5" />}
          autoFocus
          className="rounded-2xl"
        />

        <Input
          label="Confirmar contraseña"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Confirma la nueva contraseña"
          icon={<Lock className="w-5 h-5" />}
          className="rounded-2xl"
        />

        <p className="text-sm text-dark-500">
          La contraseña debe tener al menos 8 caracteres.
        </p>

        <Button type="submit" className="w-full rounded-full" loading={loading}>
          Restablecer contraseña
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
