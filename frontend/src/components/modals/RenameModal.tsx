import { useState, useEffect } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { api } from '../../lib/api';
import { toast } from '../ui/Toast';
import { FileItem, Folder } from '../../types';
import { Edit2 } from 'lucide-react';

interface RenameModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: FileItem | Folder | null;
  type: 'file' | 'folder';
  onSuccess?: () => void;
}

export default function RenameModal({ isOpen, onClose, item, type, onSuccess }: RenameModalProps) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (item) {
      setName(item.name);
    }
  }, [item]);

  const handleRename = async () => {
    if (!item || !name.trim()) return;

    // No change
    if (name.trim() === item.name) {
      onClose();
      return;
    }

    setLoading(true);
    try {
      const endpoint = type === 'file' ? `/files/${item.id}/rename` : `/folders/${item.id}`;
      
      if (type === 'file') {
        await api.patch(endpoint, { name: name.trim() });
      } else {
        await api.patch(endpoint, { name: name.trim() });
      }

      toast(`${type === 'file' ? 'Archivo' : 'Carpeta'} renombrado`, 'success');
      onSuccess?.();
      onClose();
    } catch (error: any) {
      toast(error.response?.data?.error || 'Error al renombrar', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRename();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Renombrar ${type === 'file' ? 'archivo' : 'carpeta'}`}
      size="sm"
    >
      <div className="space-y-4">
        <Input
          label="Nuevo nombre"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Nombre del ${type === 'file' ? 'archivo' : 'carpeta'}`}
          autoFocus
          icon={<Edit2 className="w-5 h-5" />}
        />

        <div className="flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={handleRename}
            loading={loading}
            disabled={!name.trim() || name.trim() === item?.name}
          >
            Renombrar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
