import React from 'react';
import { AlertTriangle } from 'lucide-react';

const ReceptionErrorState = ({ message = 'Something went wrong.', onRetry }) => (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-[#0b1426]">
        <div className="flex flex-col items-center gap-4 rounded-none border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <AlertTriangle size={32} className="text-amber-500" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{message}</p>
            {onRetry && (
                <button
                    type="button"
                    onClick={onRetry}
                    className="rounded-none bg-teal-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-teal-700"
                >
                    Try Again
                </button>
            )}
        </div>
    </div>
);

export default ReceptionErrorState;