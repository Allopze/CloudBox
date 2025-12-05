import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../stores/authStore';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { Mail, Lock, Eye, EyeOff, AlertCircle, Clock, Info } from 'lucide-react';
import { toast } from '../../components/ui/Toast';

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Login() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { login, isLoggingIn } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [, setErrorCode] = useState<string | null>(null);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);
  const [rememberMe, setRememberMe] = useState(() => {
    return localStorage.getItem('rememberEmail') !== null;
  });
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [lockoutTime, setLockoutTime] = useState<number | null>(null);
  const [countdown, setCountdown] = useState<number>(0);
  const [showRememberTooltip, setShowRememberTooltip] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  
  const emailInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);

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
      setEmailError(t('auth.errors.invalidEmail'));
    } else {
      setEmailError('');
    }
  };

  // Validate password on blur (only if form has been submitted once)
  const handlePasswordBlur = () => {
    if (hasSubmitted && !password) {
      setPasswordError(t('auth.errors.passwordRequired'));
    } else {
      setPasswordError('');
    }
  };

  const validateForm = (): boolean => {
    let isValid = true;
    
    if (!email) {
      setEmailError(t('auth.errors.emailRequired'));
      isValid = false;
    } else if (!EMAIL_REGEX.test(email)) {
      setEmailError(t('auth.errors.invalidEmail'));
      isValid = false;
    } else {
      setEmailError('');
    }
    
    if (!password) {
      setPasswordError(t('auth.errors.passwordRequired'));
      isValid = false;
    } else {
      setPasswordError('');
    }
    
    return isValid;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setHasSubmitted(true);
    setError('');
    setErrorCode(null);
    setRemainingAttempts(null);

    // Client-side validation
    if (!validateForm()) {
      // Focus first invalid field
      if (!email || !EMAIL_REGEX.test(email)) {
        emailInputRef.current?.focus();
      } else if (!password) {
        passwordInputRef.current?.focus();
      }
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
      
      toast(t('auth.welcomeBack'), 'success');
      navigate('/');
    } catch (err: any) {
      const errorData = err.response?.data;
      const code = errorData?.code || null;
      const attempts = errorData?.remainingAttempts ?? null;
      const retryAfter = errorData?.retryAfter ?? null;
      
      // Set specific error messages based on error code
      let errorMessage = '';
      switch (code) {
        case 'INVALID_CREDENTIALS':
          errorMessage = t('auth.errors.INVALID_CREDENTIALS');
          break;
        case 'OAUTH_ACCOUNT':
          errorMessage = t('auth.errors.OAUTH_ACCOUNT');
          break;
        case 'TOO_MANY_ATTEMPTS':
          errorMessage = t('auth.errors.TOO_MANY_ATTEMPTS');
          break;
        case 'ACCOUNT_LOCKED':
          errorMessage = t('auth.errors.ACCOUNT_LOCKED');
          break;
        case 'EMAIL_NOT_VERIFIED':
          errorMessage = t('auth.errors.EMAIL_NOT_VERIFIED');
          break;
        case 'ACCOUNT_DISABLED':
          errorMessage = t('auth.errors.ACCOUNT_DISABLED');
          break;
        default:
          errorMessage = errorData?.error || errorData?.message || t('auth.loginFailed');
      }
      
      setError(errorMessage);
      setErrorCode(code);
      setRemainingAttempts(attempts);
      
      // Handle rate limiting / lockout
      if (code === 'TOO_MANY_ATTEMPTS' && retryAfter) {
        setLockoutTime(retryAfter);
        setCountdown(Math.ceil(retryAfter / 1000));
      }
      
      // Only show toast for network errors or unexpected errors
      if (!err.response) {
        toast(t('auth.connectionError'), 'error');
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
        {t('auth.loginTitle')}
      </h2>
      <p className="text-dark-500 dark:text-dark-400 mb-6">
        {t('auth.loginWelcome')}
      </p>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {/* Email field */}
        <Input
          ref={emailInputRef}
          label={t('auth.email')}
          type="email"
          placeholder={t('auth.emailPlaceholder')}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (emailError) setEmailError('');
          }}
          onBlur={handleEmailBlur}
          icon={<Mail className="w-5 h-5" />}
          error={emailError}
          className="rounded-2xl"
          autoComplete="email"
          disabled={isLoggingIn || isLocked}
          required
          showRequiredIndicator
          aria-required="true"
        />

        {/* Password field with forgot password link below */}
        <div className="space-y-1">
          <Input
            ref={passwordInputRef}
            label={t('auth.password')}
            type={showPassword ? 'text' : 'password'}
            placeholder={t('auth.passwordPlaceholder')}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (passwordError) setPasswordError('');
            }}
            onBlur={handlePasswordBlur}
            icon={<Lock className="w-5 h-5" />}
            rightIcon={
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="hover:text-dark-700 dark:hover:text-dark-300 transition-colors p-1 -m-1"
                aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                aria-pressed={showPassword}
              >
                {showPassword ? (
                  <EyeOff className="w-5 h-5" aria-hidden="true" />
                ) : (
                  <Eye className="w-5 h-5" aria-hidden="true" />
                )}
              </button>
            }
            error={passwordError}
            className="rounded-2xl"
            autoComplete="current-password"
            disabled={isLoggingIn || isLocked}
            required
            showRequiredIndicator
            aria-required="true"
          />
          
          {/* Forgot password link - positioned right below password field */}
          <div className="flex justify-end">
            <Link
              to="/forgot-password"
              className="text-sm text-dark-500 dark:text-dark-400 hover:text-primary-600 dark:hover:text-primary-500 transition-colors"
            >
              {t('auth.forgotPassword')}
            </Link>
          </div>
        </div>

        {/* Error messages container */}
        <div aria-live="polite">
          {/* Lockout timer */}
          {isLocked && (
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800" role="alert">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0" aria-hidden="true" />
                <div className="flex-1">
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    {t('auth.tooManyAttempts')}
                  </p>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    {t('auth.tryAgainIn', { time: formatTime(countdown) })}
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {/* Regular error messages */}
          {!isLocked && error && (
            <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800" role="alert">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 dark:bg-red-800/30 flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" aria-hidden="true" />
                </div>
                <div className="flex-1 pt-1">
                  <p className="text-sm font-medium text-red-800 dark:text-red-200">
                    {t('auth.loginFailed')}
                  </p>
                  <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                    {error}
                  </p>
                  
                  {/* Show remaining attempts warning */}
                  {remainingAttempts !== null && remainingAttempts > 0 && remainingAttempts <= 3 && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-2 font-medium">
                      ⚠️ {t('auth.remainingAttempts', { count: remainingAttempts })}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Remember me checkbox with enlarged clickable area */}
        <div className="relative">
          <label 
            className="flex items-center gap-3 cursor-pointer select-none py-2 px-1 -mx-1 rounded-lg hover:bg-dark-50 dark:hover:bg-dark-800/50 transition-colors"
          >
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="w-4 h-4 rounded border-dark-300 text-primary-600 focus:ring-primary-500 focus:ring-offset-0 cursor-pointer"
              disabled={isLoggingIn || isLocked}
              id="remember-me"
            />
            <span className="text-sm text-dark-600 dark:text-dark-400 flex items-center gap-1">
              {t('auth.rememberMe')}
              <button
                type="button"
                className="text-dark-400 hover:text-dark-600 dark:hover:text-dark-300 transition-colors p-0.5"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowRememberTooltip(!showRememberTooltip);
                }}
                onBlur={() => setShowRememberTooltip(false)}
                aria-label={t('auth.rememberMeTooltip')}
                aria-expanded={showRememberTooltip}
              >
                <Info className="w-4 h-4" aria-hidden="true" />
              </button>
            </span>
          </label>
          
          {/* Tooltip */}
          {showRememberTooltip && (
            <div 
              className="absolute left-0 top-full mt-1 p-2 bg-dark-800 dark:bg-dark-700 text-white text-xs rounded-lg shadow-lg z-10 max-w-xs"
              role="tooltip"
            >
              {t('auth.rememberMeTooltip')}
            </div>
          )}
        </div>

        {/* Primary action button */}
        <Button
          type="submit"
          loading={isLoggingIn}
          disabled={isLocked}
          className="w-full rounded-full bg-red-500 hover:bg-red-600 focus:ring-red-500"
        >
          {isLocked ? t('auth.wait', { time: formatTime(countdown) }) : t('auth.loginButton')}
        </Button>
      </form>

      {/* Secondary links section */}
      <div className="mt-6 space-y-4">
        <p className="text-center text-dark-600 dark:text-dark-400">
          {t('auth.noAccount')}{' '}
          <Link 
            to="/register" 
            className="text-dark-700 dark:text-dark-300 hover:text-primary-600 dark:hover:text-primary-500 font-medium transition-colors underline underline-offset-2"
          >
            {t('auth.register')}
          </Link>
        </p>
        
        {/* Privacy and terms links */}
        <p className="text-center text-xs text-dark-400 dark:text-dark-500">
          {t('auth.acceptTerms')}{' '}
          <Link 
            to="/privacy" 
            className="hover:text-dark-600 dark:hover:text-dark-400 underline underline-offset-2 transition-colors"
          >
            {t('auth.privacyPolicy')}
          </Link>
          {' '}{t('auth.and')}{' '}
          <Link 
            to="/terms" 
            className="hover:text-dark-600 dark:hover:text-dark-400 underline underline-offset-2 transition-colors"
          >
            {t('auth.termsOfService')}
          </Link>
        </p>
      </div>
    </div>
  );
}
