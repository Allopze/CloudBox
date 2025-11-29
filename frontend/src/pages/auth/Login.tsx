import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { Mail, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { toast } from '../../components/ui/Toast';

export default function Login() {
  const navigate = useNavigate();
  const { login, isLoading } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setErrorCode(null);
    setRemainingAttempts(null);

    if (!email || !password) {
      setError('Por favor completa todos los campos');
      return;
    }

    try {
      await login(email, password);
      toast('¡Bienvenido de nuevo!', 'success');
      navigate('/');
    } catch (err: any) {
      const errorData = err.response?.data;
      const message = errorData?.error || 'Error al iniciar sesión';
      const code = errorData?.code || null;
      const attempts = errorData?.remainingAttempts ?? null;
      
      setError(message);
      setErrorCode(code);
      setRemainingAttempts(attempts);
      
      // Mostrar toast con mensaje apropiado
      if (code === 'INVALID_CREDENTIALS') {
        toast('Email o contraseña incorrectos', 'error');
      } else if (code === 'OAUTH_ACCOUNT') {
        toast('Usa Google para iniciar sesión', 'error');
      } else {
        toast(message, 'error');
      }
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-dark-900 dark:text-white mb-2">
        Iniciar sesión
      </h2>
      <p className="text-dark-500 dark:text-dark-400 mb-6">
        ¡Bienvenido de nuevo! Por favor ingresa tus datos.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Correo electrónico"
          type="email"
          placeholder="Ingresa tu correo"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          icon={<Mail className="w-5 h-5" />}
          error={error && !email ? 'El correo es requerido' : undefined}
          className="rounded-2xl"
          autoComplete="email"
        />

        <Input
          label="Contraseña"
          type={showPassword ? 'text' : 'password'}
          placeholder="Ingresa tu contraseña"
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
          error={error && !password ? 'La contraseña es requerida' : undefined}
          className="rounded-2xl"
          autoComplete="current-password"
        />

        {/* Error messages container - fixed height to prevent layout shift */}
        <div className="min-h-[60px]">
          {error && email && password && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                  
                  {/* Show remaining attempts warning */}
                  {remainingAttempts !== null && remainingAttempts > 0 && remainingAttempts <= 3 && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                      Intentos restantes: {remainingAttempts}
                    </p>
                  )}
                  
                  {/* Show forgot password link for wrong credentials */}
                  {errorCode === 'INVALID_CREDENTIALS' && (
                    <Link
                      to="/forgot-password"
                      className="inline-block mt-2 text-sm text-primary-600 hover:text-primary-700 font-medium"
                    >
                      ¿Olvidaste tu contraseña?
                    </Link>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2">
            <input type="checkbox" className="rounded border-dark-300" />
            <span className="text-sm text-dark-600 dark:text-dark-400">
              Recordarme
            </span>
          </label>
          <Link
            to="/forgot-password"
            className="text-sm text-primary-600 hover:text-primary-700"
          >
            ¿Olvidaste tu contraseña?
          </Link>
        </div>

        <Button type="submit" loading={isLoading} className="w-full rounded-full">
          Iniciar sesión
        </Button>
      </form>

      <p className="mt-6 text-center text-dark-600 dark:text-dark-400">
        ¿No tienes una cuenta?{' '}
        <Link to="/register" className="text-primary-600 hover:text-primary-700 font-medium">
          Regístrate
        </Link>
      </p>
    </div>
  );
}
