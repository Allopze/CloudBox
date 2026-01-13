import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../../lib/api';
import { formatBytes } from '../../../lib/utils';
import Button from '../../ui/Button';
import { toast } from '../../ui/Toast';
import { Check, X, Clock, HardDrive, User, MessageSquare } from 'lucide-react';

interface StorageRequest {
    id: string;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    requestedQuota: string;
    currentQuota: string;
    reason: string;
    adminResponse?: string;
    createdAt: string;
    user: {
        id: string;
        email: string;
        name: string;
    };
}

export default function StorageRequestsSection() {
    const { t } = useTranslation();
    const [requests, setRequests] = useState<StorageRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [filter, setFilter] = useState<'all' | 'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
    const [responseText, setResponseText] = useState<Record<string, string>>({});

    useEffect(() => {
        loadRequests();
    }, [filter]);

    const loadRequests = async () => {
        try {
            setLoading(true);
            const params = filter !== 'all' ? `?status=${filter}` : '';
            const response = await api.get(`/admin/storage-requests${params}`);
            setRequests(response.data);
        } catch (error) {
            console.error('Failed to load storage requests:', error);
            toast(t('admin.loadError', 'Error al cargar solicitudes'), 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleApprove = async (id: string) => {
        setProcessingId(id);
        try {
            await api.post(`/admin/storage-requests/${id}/approve`, {
                adminResponse: responseText[id] || 'Solicitud aprobada'
            });
            toast(t('admin.storageRequests.approved', 'Solicitud aprobada'), 'success');
            loadRequests();
        } catch (error) {
            toast(t('admin.storageRequests.approveError', 'Error al aprobar'), 'error');
        } finally {
            setProcessingId(null);
        }
    };

    const handleReject = async (id: string) => {
        setProcessingId(id);
        try {
            await api.post(`/admin/storage-requests/${id}/reject`, {
                adminResponse: responseText[id] || 'Solicitud rechazada'
            });
            toast(t('admin.storageRequests.rejected', 'Solicitud rechazada'), 'success');
            loadRequests();
        } catch (error) {
            toast(t('admin.storageRequests.rejectError', 'Error al rechazar'), 'error');
        } finally {
            setProcessingId(null);
        }
    };

    const getStatusBadge = (status: string) => {
        const base = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium';
        switch (status) {
            case 'PENDING':
                return <span className={`${base} bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400`}><Clock className="w-3 h-3" /> Pendiente</span>;
            case 'APPROVED':
                return <span className={`${base} bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400`}><Check className="w-3 h-3" /> Aprobada</span>;
            case 'REJECTED':
                return <span className={`${base} bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400`}><X className="w-3 h-3" /> Rechazada</span>;
            default:
                return <span className={`${base} bg-dark-100 text-dark-600`}>{status}</span>;
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-40">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
            </div>
        );
    }

    return (
        <section className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-dark-900 dark:text-white">
                        {t('admin.storageRequests.title', 'Solicitudes de Almacenamiento')}
                    </h2>
                    <p className="text-dark-500 dark:text-dark-400 mt-1">
                        {t('admin.storageRequests.description', 'Gestiona las solicitudes de ampliación de cuota.')}
                    </p>
                </div>

                {/* Filter tabs */}
                <div className="flex gap-1 bg-dark-100 dark:bg-dark-800 p-1 rounded-lg">
                    {(['PENDING', 'APPROVED', 'REJECTED', 'all'] as const).map((f) => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${filter === f
                                ? 'bg-white dark:bg-dark-700 text-dark-900 dark:text-white shadow-sm'
                                : 'text-dark-500 hover:text-dark-700 dark:text-dark-400'
                                }`}
                        >
                            {f === 'all' ? 'Todas' : f === 'PENDING' ? 'Pendientes' : f === 'APPROVED' ? 'Aprobadas' : 'Rechazadas'}
                        </button>
                    ))}
                </div>
            </div>

            {requests.length === 0 ? (
                <div className="text-center py-12 bg-dark-50 dark:bg-dark-900/40 rounded-2xl border border-dark-100 dark:border-dark-800">
                    <HardDrive className="w-12 h-12 mx-auto text-dark-300 dark:text-dark-600 mb-3" />
                    <p className="text-dark-500 dark:text-dark-400">
                        {t('admin.storageRequests.noRequests', 'No hay solicitudes')}
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {requests.map((request) => (
                        <div
                            key={request.id}
                            className="p-4 bg-dark-50 dark:bg-dark-900/40 rounded-2xl border border-dark-100 dark:border-dark-800"
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="p-2 bg-white dark:bg-dark-800 rounded-full">
                                            <User className="w-4 h-4 text-dark-500" />
                                        </div>
                                        <div>
                                            <p className="font-medium text-dark-900 dark:text-white">
                                                {request.user.name}
                                            </p>
                                            <p className="text-sm text-dark-500">{request.user.email}</p>
                                        </div>
                                        {getStatusBadge(request.status)}
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                                        <div>
                                            <span className="text-dark-500">Cuota actual:</span>
                                            <span className="ml-2 font-medium text-dark-700 dark:text-dark-300">
                                                {formatBytes(parseInt(request.currentQuota))}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-dark-500">Solicitada:</span>
                                            <span className="ml-2 font-medium text-primary-600">
                                                {formatBytes(parseInt(request.requestedQuota))}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex items-start gap-2 text-sm">
                                        <MessageSquare className="w-4 h-4 text-dark-400 mt-0.5 shrink-0" />
                                        <p className="text-dark-600 dark:text-dark-400">{request.reason}</p>
                                    </div>

                                    {request.adminResponse && (
                                        <div className="mt-2 p-2 bg-dark-100 dark:bg-dark-800 rounded-lg text-sm">
                                            <span className="text-dark-500">Respuesta:</span>
                                            <span className="ml-2 text-dark-700 dark:text-dark-300">{request.adminResponse}</span>
                                        </div>
                                    )}
                                </div>

                                {request.status === 'PENDING' && (
                                    <div className="flex flex-col gap-2">
                                        <input
                                            type="text"
                                            placeholder="Respuesta (opcional)"
                                            value={responseText[request.id] || ''}
                                            onChange={(e) => setResponseText({ ...responseText, [request.id]: e.target.value })}
                                            className="px-3 py-1.5 text-sm rounded-lg border border-dark-200 dark:border-dark-600 bg-white dark:bg-dark-800 focus:outline-none focus:ring-2 focus:ring-primary-500"
                                        />
                                        <div className="flex gap-2">
                                            <Button
                                                size="sm"
                                                variant="primary"
                                                onClick={() => handleApprove(request.id)}
                                                loading={processingId === request.id}
                                                icon={<Check className="w-4 h-4" />}
                                            >
                                                Aprobar
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="danger"
                                                onClick={() => handleReject(request.id)}
                                                loading={processingId === request.id}
                                                icon={<X className="w-4 h-4" />}
                                            >
                                                Rechazar
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <p className="text-xs text-dark-400 mt-3">
                                {new Date(request.createdAt).toLocaleString()}
                            </p>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}
