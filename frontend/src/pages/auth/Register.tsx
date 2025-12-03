import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import PasswordStrength, { validatePassword } from '../../components/ui/PasswordStrength';
import { Mail, Lock, User, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { toast } from '../../components/ui/Toast';

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
      setError('Por favor completa todos los campos para continuar.');
      return;
    }

    if (!EMAIL_REGEX.test(email)) {
      setError('El formato del correo electrónico no es válido. Ejemplo: usuario@dominio.com');
      return;
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas ingresadas no coinciden. Por favor, verifica e intenta de nuevo.');
      return;
    }

    const { isValid } = validatePassword(password);
    if (!isValid) {
      setError('La contraseña no cumple con los requisitos mínimos de seguridad. Revisa los indicadores arriba.');
      return;
    }

    try {
      await register(name, email, password);
      toast('¡Cuenta creada! Por favor verifica tu correo.', 'success');
      navigate('/login');
    } catch (err: any) {
      const errorData = err.response?.data;
      const code = errorData?.code;
      
      let errorMessage = '';
      switch (code) {
        case 'EMAIL_EXISTS':
        case 'EMAIL_ALREADY_EXISTS':
          errorMessage = 'Ya existe una cuenta con este correo electrónico. ¿Quieres iniciar sesión?';
          break;
        case 'INVALID_EMAIL':
          errorMessage = 'El formato del correo electrónico no es válido.';
          break;
        case 'WEAK_PASSWORD':
          errorMessage = 'La contraseña es demasiado débil. Usa al menos 8 caracteres con mayúsculas, números y símbolos.';
          break;
        case 'REGISTRATION_DISABLED':
          errorMessage = 'El registro de nuevos usuarios está deshabilitado temporalmente.';
          break;
        default:
          errorMessage = errorData?.error || errorData?.message || 'No se pudo crear la cuenta. Por favor, intenta de nuevo.';
      }
      
      setError(errorMessage);
      
      // Only show toast for network errors
      if (!err.response) {
        toast('Error de conexión. Verifica tu internet e inténtalo de nuevo.', 'error');
      }
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
          <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800" role="alert">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 dark:bg-red-800/30 flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" aria-hidden="true" />
              </div>
              <div className="flex-1 pt-1">
                <p className="text-sm font-medium text-red-800 dark:text-red-200">
                  Error al crear cuenta
                </p>
                <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                  {error}
                </p>
              </div>
            </div>
          </div>
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
