import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import PasswordStrength, { validatePassword } from '../../components/ui/PasswordStrength';
import { Mail, Lock, User, Eye, EyeOff } from 'lucide-react';
import { toast } from '../../components/ui/Toast';

export default function Register() {
  const navigate = useNavigate();
  const { register, isRegistering } = useAuthStore();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name || !email || !password || !confirmPassword) {
      setError('Por favor completa todos los campos');
      return;
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }

    const { isValid } = validatePassword(password);
    if (!isValid) {
      setError('La contraseña no cumple con los requisitos de seguridad');
      return;
    }

    try {
      await register(name, email, password);
      toast('¡Cuenta creada! Por favor verifica tu correo.', 'success');
      navigate('/login');
    } catch (err: any) {
      const message = err.response?.data?.error || err.response?.data?.message || 'Error en el registro';
      setError(message);
      toast(message, 'error');
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-dark-900 dark:text-white mb-2">
        Crear cuenta
      </h2>
      <p className="text-dark-500 dark:text-dark-400 mb-6">
        Empieza con tu cuenta gratuita.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Nombre completo"
          type="text"
          placeholder="Ingresa tu nombre"
          value={name}
          onChange={(e) => setName(e.target.value)}
          icon={<User className="w-5 h-5" />}
          className="rounded-2xl"
          autoComplete="name"
        />

        <Input
          label="Correo electrónico"
          type="email"
          placeholder="Ingresa tu correo"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          icon={<Mail className="w-5 h-5" />}
          className="rounded-2xl"
          autoComplete="email"
        />

        <Input
          label="Contraseña"
          type={showPassword ? 'text' : 'password'}
          placeholder="Crea una contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          icon={<Lock className="w-5 h-5" />}
          rightIcon={
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="hover:text-dark-700"
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          }
          className="rounded-2xl"
          autoComplete="new-password"
        />

        <PasswordStrength password={password} />

        <Input
          label="Confirmar contraseña"
          type={showPassword ? 'text' : 'password'}
          placeholder="Confirma tu contraseña"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          icon={<Lock className="w-5 h-5" />}
          className="rounded-2xl"
          autoComplete="new-password"
        />

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        <Button type="submit" loading={isRegistering} className="w-full rounded-full">
          Crear cuenta
        </Button>
      </form>

      <p className="mt-6 text-center text-dark-600 dark:text-dark-400">
        ¿Ya tienes una cuenta?{' '}
        <Link to="/login" className="text-primary-600 hover:text-primary-700 font-medium">
          Iniciar sesión
        </Link>
      </p>
    </div>
  );
}
