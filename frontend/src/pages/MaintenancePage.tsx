import { useEffect } from 'react';
import { useMaintenanceStore } from '../stores/maintenanceStore';
import { useTranslation } from 'react-i18next';
import { LogIn, Wrench } from 'lucide-react';
import { useBrandingStore } from '../stores/brandingStore';
import { useNavigate } from 'react-router-dom';
import Button from '../components/ui/Button';

const MaintenancePage = () => {
    const { checkStatus } = useMaintenanceStore();
    const { t } = useTranslation();
    const { branding } = useBrandingStore();
    const navigate = useNavigate();

    useEffect(() => {
        // Check status every 60 seconds
        const interval = setInterval(() => {
            checkStatus();
        }, 60000);

        return () => clearInterval(interval);
    }, [checkStatus]);

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex flex-col items-center justify-center p-4">
            <div className="text-center max-w-md mx-auto">
                <div className="flex justify-center mb-8">
                    {branding.logoUrl ? (
                        <img
                            src={branding.logoUrl}
                            alt="Logo"
                            className="h-16 w-auto"
                        />
                    ) : (
                        <div className="h-20 w-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                            <Wrench className="h-10 w-10 text-primary" />
                        </div>
                    )}
                </div>

                <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl mb-4">
                    {t('maintenance.title', 'Estamos en mantenimiento')}
                </h1>

                <p className="text-lg text-slate-600 dark:text-slate-400 mb-8">
                    {t('maintenance.subtitle', 'Volveremos pronto. Gracias por tu paciencia.')}
                </p>

                <div className="flex items-center justify-center gap-2 text-sm text-slate-500 animate-pulse">
                    <div className="h-2 w-2 bg-primary rounded-full"></div>
                    {t('maintenance.checking', 'Comprobando estado...')}
                </div>

                <div className="mt-10 flex flex-col items-center gap-3">
                    <Button
                        variant="secondary"
                        icon={<LogIn className="h-4 w-4" />}
                        onClick={() => navigate('/login')}
                    >
                        {t('maintenance.adminLogin', 'Acceso administrador')}
                    </Button>

                    <button
                        onClick={() => checkStatus()}
                        className="text-primary hover:underline text-sm font-medium"
                    >
                        {t('common.refresh', 'Actualizar ahora')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MaintenancePage;
