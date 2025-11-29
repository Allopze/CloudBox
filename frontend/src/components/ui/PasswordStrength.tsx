import { useMemo } from 'react';
import { Check, X } from 'lucide-react';
import { cn } from '../../lib/utils';

interface PasswordStrengthProps {
  password: string;
  showRequirements?: boolean;
}

interface PasswordRequirement {
  label: string;
  met: boolean;
}

export function validatePassword(password: string): {
  isValid: boolean;
  score: number;
  requirements: PasswordRequirement[];
} {
  const requirements: PasswordRequirement[] = [
    { label: 'Mínimo 8 caracteres', met: password.length >= 8 },
    { label: 'Al menos una mayúscula', met: /[A-Z]/.test(password) },
    { label: 'Al menos una minúscula', met: /[a-z]/.test(password) },
    { label: 'Al menos un número', met: /[0-9]/.test(password) },
    { label: 'Al menos un carácter especial (!@#$%^&*)', met: /[!@#$%^&*(),.?":{}|<>]/.test(password) },
  ];

  const metCount = requirements.filter((r) => r.met).length;
  const score = metCount / requirements.length;
  const isValid = requirements.slice(0, 4).every((r) => r.met); // First 4 are required

  return { isValid, score, requirements };
}

export function getPasswordStrengthLabel(score: number): {
  label: string;
  color: string;
} {
  if (score === 0) return { label: '', color: 'bg-dark-200' };
  if (score < 0.4) return { label: 'Débil', color: 'bg-red-500' };
  if (score < 0.6) return { label: 'Regular', color: 'bg-orange-500' };
  if (score < 0.8) return { label: 'Buena', color: 'bg-yellow-500' };
  if (score < 1) return { label: 'Fuerte', color: 'bg-green-500' };
  return { label: 'Muy fuerte', color: 'bg-green-600' };
}

export default function PasswordStrength({ password, showRequirements = true }: PasswordStrengthProps) {
  const { score, requirements } = useMemo(() => validatePassword(password), [password]);
  const { label, color } = getPasswordStrengthLabel(score);

  if (!password) return null;

  return (
    <div className="mt-2 space-y-2">
      {/* Strength bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-dark-500 dark:text-dark-400">Seguridad de la contraseña</span>
          <span className={cn(
            'font-medium',
            score < 0.4 ? 'text-red-500' : score < 0.8 ? 'text-yellow-500' : 'text-green-500'
          )}>
            {label}
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
              <span>{req.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
