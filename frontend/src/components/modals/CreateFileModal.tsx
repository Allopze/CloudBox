import { useState } from 'react';
import type { FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { FilePlus } from 'lucide-react';
import { api } from '../../lib/api';
import { toast } from '../ui/Toast';

interface CreateFileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  folderId?: string | null;
}

export default function CreateFileModal({
  isOpen,
  onClose,
  onSuccess,
  folderId: propFolderId,
}: CreateFileModalProps) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchParams] = useSearchParams();

  const getCurrentFolderId = () => {
    if (propFolderId !== undefined) return propFolderId || undefined;
    const currentFolder = searchParams.get('folder');
    return currentFolder || undefined;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('El nombre del archivo es obligatorio');
      return;
    }

    setLoading(true);
    try {
      await api.post('/files/create-empty', {
        name: name.trim(),
        folderId: getCurrentFolderId(),
      });
      toast('Archivo creado correctamente', 'success');
      setName('');
      onSuccess?.();
      onClose();
    } catch (err: any) {
      const message = err.response?.data?.error || 'No se pudo crear el archivo';
      setError(message);
      toast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Crear archivo" size="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Nombre del archivo"
          placeholder="nuevo-archivo.txt"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={error}
          icon={<FilePlus className="w-5 h-5" />}
          autoFocus
        />
        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button type="submit" loading={loading}>
            Crear
          </Button>
        </div>
      </form>
    </Modal>
  );
}
