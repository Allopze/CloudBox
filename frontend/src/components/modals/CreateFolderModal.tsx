import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { FolderPlus } from 'lucide-react';
import { api } from '../../lib/api';
import { toast } from '../ui/Toast';

interface CreateFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  parentId?: string | null;
}

export default function CreateFolderModal({
  isOpen,
  onClose,
  onSuccess,
  parentId,
}: CreateFolderModalProps) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchParams] = useSearchParams();

  const getCurrentFolderId = () => {
    if (parentId !== undefined) return parentId || undefined;
    const folderId = searchParams.get('folder');
    return folderId || undefined;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('El nombre de la carpeta es obligatorio');
      return;
    }

    setLoading(true);
    try {
      await api.post('/folders', {
        name: name.trim(),
        parentId: getCurrentFolderId() || null,
      });
      toast('Carpeta creada correctamente', 'success');
      setName('');
      onSuccess?.();
      onClose();
    } catch (err: any) {
      const message = err.response?.data?.error || err.response?.data?.message || 'Error al crear la carpeta';
      setError(message);
      toast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Crear nueva carpeta" size="sm">
      <form onSubmit={handleSubmit}>
        <Input
          label="Nombre de la carpeta"
          placeholder="Mi carpeta"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={error}
          icon={<FolderPlus className="w-5 h-5" />}
          autoFocus
        />
        <div className="flex justify-end gap-3 mt-6">
          <Button type="button" variant="ghost" onClick={onClose}>
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
