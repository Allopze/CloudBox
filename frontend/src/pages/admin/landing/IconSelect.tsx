import { useMemo } from 'react';
import { LANDING_ICONS } from '../../public/landing/icons';

export default function IconSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const options = useMemo(() => Object.keys(LANDING_ICONS).sort(), []);

  return (
    <div>
      <label className="block text-sm font-medium text-dark-700 dark:text-dark-300 mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input"
        aria-label={label}
      >
        {options.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </select>
    </div>
  );
}

