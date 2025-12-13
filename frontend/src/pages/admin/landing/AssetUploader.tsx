import { useRef } from 'react';
import Button from '../../../components/ui/Button';
import { Upload, Trash2 } from 'lucide-react';

export default function AssetUploader({
  title,
  description,
  value,
  onUpload,
  onRemove,
  accept = 'image/*',
}: {
  title: string;
  description?: string;
  value?: string;
  onUpload: (file: File) => Promise<void>;
  onRemove?: () => Promise<void>;
  accept?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="rounded-2xl border border-dark-200 dark:border-dark-700 bg-white dark:bg-dark-800 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-dark-900 dark:text-white">{title}</div>
          {description && <div className="mt-1 text-sm text-dark-600 dark:text-dark-300">{description}</div>}
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              await onUpload(file);
              if (inputRef.current) inputRef.current.value = '';
            }}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            icon={<Upload className="w-4 h-4" />}
            onClick={() => inputRef.current?.click()}
          >
            Subir
          </Button>
          {value && onRemove && (
            <Button
              type="button"
              variant="danger"
              size="sm"
              icon={<Trash2 className="w-4 h-4" />}
              onClick={onRemove}
            >
              Quitar
            </Button>
          )}
        </div>
      </div>

      {value && (
        <div className="mt-4 overflow-hidden rounded-xl border border-dark-200 dark:border-dark-700 bg-dark-50 dark:bg-dark-900/40">
          <img src={value} alt={title} className="w-full h-auto" />
        </div>
      )}
    </div>
  );
}

