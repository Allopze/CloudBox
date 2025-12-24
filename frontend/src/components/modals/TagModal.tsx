import Modal from '../ui/Modal';
import TagManager from '../tags/TagManager';
import { useTranslation } from 'react-i18next';

interface TagModalProps {
    isOpen: boolean;
    onClose: () => void;
    fileId: string;
}

export default function TagModal({ isOpen, onClose, fileId }: TagModalProps) {
    const { t } = useTranslation();

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t('tags.title')}>
            <div className="min-h-[200px]">
                <TagManager fileId={fileId} />
            </div>
        </Modal>
    );
}
