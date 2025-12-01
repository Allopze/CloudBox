import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { Mail, Lock, Eye, EyeOff, AlertCircle, Clock } from 'lucide-react';
import { toast } from '../../components/ui/Toast';

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Login() {
  const navigate = useNavigate();
  const { login, isLoggingIn } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);
  const [rememberMe, setRememberMe] = useState(() => {
    return localStorage.getItem('rememberEmail') !== null;
  });
  const [emailError, setEmailError] = useState('');
  const [lockoutTime, setLockoutTime] = useState<number | null>(null);
  const [countdown, setCountdown] = useState<number>(0);

  // Load remembered email on mount
  useEffect(() => {
    const savedEmail = localStorage.getItem('rememberEmail');
    if (savedEmail) {
      setEmail(savedEmail);
    }
  }, []);

  // Countdown timer for lockout
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (countdown === 0 && lockoutTime !== null) {
      setLockoutTime(null);
      setError('');
      setErrorCode(null);
    }
  }, [countdown, lockoutTime]);

  // Validate email on blur
  const handleEmailBlur = () => {
    if (email && !EMAIL_REGEX.test(email)) {
      setEmailError('El formato del correo no es válido');
    } else {
      setEmailError('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setErrorCode(null);
    setRemainingAttempts(null);

    // Client-side validation
    if (!email || !password) {
      setError('Por favor completa todos los campos');
      return;
    }

    if (!EMAIL_REGEX.test(email)) {
      setEmailError('El formato del correo no es válido');
      return;
    }

    try {
      await login(email, password);
      
      // Handle "Remember me" functionality
      if (rememberMe) {
        localStorage.setItem('rememberEmail', email);
      } else {
        localStorage.removeItem('rememberEmail');
      }
      
      toast('¡Bienvenido de nuevo!', 'success');
      navigate('/');
    } catch (err: any) {
      const errorData = err.response?.data;
      const message = errorData?.error || 'Error al iniciar sesión';
      const code = errorData?.code || null;
      const attempts = errorData?.remainingAttempts ?? null;
      const retryAfter = errorData?.retryAfter ?? null;
      
      setError(message);
      setErrorCode(code);
      setRemainingAttempts(attempts);
      
      // Handle rate limiting / lockout
      if (code === 'TOO_MANY_ATTEMPTS' && retryAfter) {
        setLockoutTime(retryAfter);
        setCountdown(Math.ceil(retryAfter / 1000));
      }
      
      // Show toast with appropriate message
      if (code === 'INVALID_CREDENTIALS') {
        toast('Email o contraseña incorrectos', 'error');
      } else if (code === 'OAUTH_ACCOUNT') {
        toast('Usa Google para iniciar sesión', 'error');
      } else if (code === 'TOO_MANY_ATTEMPTS') {
        toast('Demasiados intentos. Espera un momento.', 'error');
      } else {
        toast(message, 'error');
      }
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`;
  };

  const isLocked = countdown > 0;

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
          onChange={(e) => {
            setEmail(e.target.value);
            if (emailError) setEmailError('');
          }}
          onBlur={handleEmailBlur}
          icon={<Mail className="w-5 h-5" aria-hidden="true" />}
          error={emailError || (error && !email ? 'El correo es requerido' : undefined)}
          className="rounded-2xl"
          autoComplete="email"
          disabled={isLoggingIn || isLocked}
          aria-describedby={emailError ? 'email-error' : undefined}
        />

        <Input
          label="Contraseña"
          type={showPassword ? 'text' : 'password'}
          placeholder="Ingresa tu contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          icon={<Lock className="w-5 h-5" aria-hidden="true" />}
          rightIcon={
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="hover:text-dark-700 dark:hover:text-dark-300 transition-colors"
              aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              tabIndex={-1}
            >
              {showPassword ? (
                <EyeOff className="w-5 h-5" aria-hidden="true" />
              ) : (
                <Eye className="w-5 h-5" aria-hidden="true" />
              )}
            </button>
          }
          error={error && !password ? 'La contraseña es requerida' : undefined}
          className="rounded-2xl"
          autoComplete="current-password"
          disabled={isLoggingIn || isLocked}
        />

        {/* Error messages container - fixed height to prevent layout shift */}
        <div className="min-h-[60px]">
          {/* Lockout timer */}
          {isLocked && (
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    Demasiados intentos fallidos
                  </p>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    Podrás intentar nuevamente en: <strong>{formatTime(countdown)}</strong>
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {/* Regular error messages */}
          {!isLocked && error && email && password && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800" role="alert">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
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
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="rounded border-dark-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
              disabled={isLoggingIn || isLocked}
            />
            <span className="text-sm text-dark-600 dark:text-dark-400">
              Recordar mi correo
            </span>
          </label>
          {/* Only show this link when there's no credential error (to avoid duplicate) */}
          {errorCode !== 'INVALID_CREDENTIALS' && (
            <Link
              to="/forgot-password"
              className="text-sm text-primary-600 hover:text-primary-700 transition-colors"
            >
              ¿Olvidaste tu contraseña?
            </Link>
          )}
        </div>

        <Button
          type="submit"
          loading={isLoggingIn}
          disabled={isLocked}
          className="w-full rounded-full"
        >
          {isLocked ? `Espera ${formatTime(countdown)}` : 'Iniciar sesión'}
        </Button>
      </form>

      <p className="mt-6 text-center text-dark-600 dark:text-dark-400">
        ¿No tienes una cuenta?{' '}
        <Link to="/register" className="text-primary-600 hover:text-primary-700 font-medium transition-colors">
          Regístrate
        </Link>
      </p>
    </div>
  );
}
