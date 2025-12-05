import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, X } from 'lucide-react';
import { cn } from '../../lib/utils';

interface PasswordStrengthProps {
  password: string;
  showRequirements?: boolean;
}

interface PasswordRequirement {
  key: string;
  met: boolean;
}

export function validatePassword(password: string): {
  isValid: boolean;
  score: number;
  requirements: PasswordRequirement[];
} {
  const requirements: PasswordRequirement[] = [
    { key: 'minLength', met: password.length >= 8 },
    { key: 'uppercase', met: /[A-Z]/.test(password) },
    { key: 'lowercase', met: /[a-z]/.test(password) },
    { key: 'number', met: /[0-9]/.test(password) },
    { key: 'special', met: /[!@#$%^&*(),.?":{}|<>]/.test(password) },
  ];

  const metCount = requirements.filter((r) => r.met).length;
  const score = metCount / requirements.length;
  const isValid = requirements.slice(0, 4).every((r) => r.met); // First 4 are required

  return { isValid, score, requirements };
}

export function getPasswordStrengthKey(score: number): {
  key: string;
  color: string;
} {
  if (score === 0) return { key: '', color: 'bg-dark-200' };
  if (score < 0.4) return { key: 'weak', color: 'bg-red-500' };
  if (score < 0.6) return { key: 'fair', color: 'bg-orange-500' };
  if (score < 0.8) return { key: 'good', color: 'bg-yellow-500' };
  if (score < 1) return { key: 'strong', color: 'bg-green-500' };
  return { key: 'veryStrong', color: 'bg-green-600' };
}

export default function PasswordStrength({ password, showRequirements = true }: PasswordStrengthProps) {
  const { t } = useTranslation();
  const { score, requirements } = useMemo(() => validatePassword(password), [password]);
  const { key: strengthKey, color } = getPasswordStrengthKey(score);

  if (!password) return null;

  return (
    <div className="mt-2 space-y-2">
      {/* Strength bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-dark-500 dark:text-dark-400">{t('passwordStrength.title')}</span>
          <span className={cn(
            'font-medium',
            score < 0.4 ? 'text-red-500' : score < 0.8 ? 'text-yellow-500' : 'text-green-500'
          )}>
            {strengthKey && t(`passwordStrength.${strengthKey}`)}
          </span>
        </div>
        <div className="h-1.5 w-full bg-dark-100 dark:bg-dark-700 rounded-full overflow-hidden">
          <div
            className={cn('h-full transition-all duration-300 rounded-full', color)}
            style={{ width: `${score * 100}%` }}
          />
        </div>
      </div>

      {/* Requirements list */}
      {showRequirements && (
        <div className="grid grid-cols-2 gap-1">
          {requirements.map((req, index) => (
            <div
              key={index}
              className={cn(
                'flex items-center gap-1.5 text-xs transition-colors',
                req.met ? 'text-green-600 dark:text-green-400' : 'text-dark-400'
              )}
            >
              {req.met ? (
                <Check className="w-3 h-3" />
              ) : (
                <X className="w-3 h-3" />
              )}
              <span>{t(`passwordStrength.${req.key}`)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
