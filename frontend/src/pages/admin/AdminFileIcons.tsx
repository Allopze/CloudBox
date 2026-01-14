import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Image } from 'lucide-react';
import { Link } from 'react-router-dom';
import FileIconsAdmin from '../../components/admin/FileIconsAdmin';

const PageLoader = () => (
    <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
    </div>
);

export default function AdminFileIcons() {
    const { t } = useTranslation();

    return (
        <div className="p-6">
            {/* Header */}
            <div className="mb-6">
                <Link
                    to="/admin"
                    className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 mb-4"
                >
                    <ArrowLeft className="w-4 h-4" />
                    {t('admin.backToDashboard')}
                </Link>

                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                        <Image className="w-5 h-5 text-primary-600" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                            {t('admin.fileIcons.pageTitle')}
                        </h1>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            {t('admin.fileIcons.pageDescription')}
                        </p>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="">
                <Suspense fallback={<PageLoader />}>
                    <FileIconsAdmin />
                </Suspense>
            </div>
        </div>
    );
}
