import React from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const ReceptionLoadingState = ({ message }) => {
    const { t } = useTranslation('reception');

    return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-[#0b1426]">
            <div className="flex flex-col items-center gap-4">
                <Loader2 size={32} className="animate-spin text-teal-600" />
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">{message || t('states.loading')}</p>
            </div>
        </div>
    );
};

export default ReceptionLoadingState;
