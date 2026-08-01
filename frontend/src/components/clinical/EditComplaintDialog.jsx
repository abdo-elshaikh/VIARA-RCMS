import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FileText, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const EditComplaintDialog = ({ isOpen, patientName, initialComplaint, isSaving, onClose, onConfirm }) => {
    const { t } = useTranslation('clinicalQueues');
    const [complaint, setComplaint] = useState(initialComplaint || '');

    useEffect(() => {
        if (isOpen) {
            setComplaint(initialComplaint || '');
        }
    }, [isOpen, initialComplaint]);

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-lg overflow-hidden rounded-[2rem] bg-white shadow-2xl animate-in zoom-in-95 duration-200">
                <div className="border-b border-slate-100 px-8 py-6 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100 text-blue-600 shadow-inner">
                            <FileText size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-800">Edit Patient Complaint</h2>
                            <p className="mt-0.5 text-sm font-semibold text-slate-500">{patientName}</p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        className="rounded-full p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors"
                    >
                        <X size={20} strokeWidth={3} />
                    </button>
                </div>
                
                <div className="p-8">
                    <label className="block text-sm font-bold text-slate-700 mb-3">
                        Clinical Indication / Case Complaint
                    </label>
                    <textarea
                        autoFocus
                        rows={5}
                        className="w-full rounded-2xl border-2 border-slate-200 p-4 text-[15px] font-medium text-slate-800 outline-none transition-all focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 placeholder:text-slate-400 placeholder:font-normal"
                        placeholder="Enter the patient's chief complaint or clinical indication..."
                        value={complaint}
                        onChange={(e) => setComplaint(e.target.value)}
                    />
                </div>
                
                <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50/80 px-8 py-5">
                    <button
                        onClick={onClose}
                        disabled={isSaving}
                        className="rounded-xl px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-200 transition-colors"
                    >
                        {t('common.cancel')}
                    </button>
                    <button
                        onClick={() => onConfirm(complaint)}
                        disabled={isSaving}
                        className="rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-500/30 transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                    >
                        {isSaving ? t('common.saving') : 'Save Complaint'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default EditComplaintDialog;
