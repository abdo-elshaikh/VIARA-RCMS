import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ShieldCheck, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const EditSafetyDialog = ({ isOpen, patientName, initialSafety, isSaving, onClose, onConfirm }) => {
    const { t } = useTranslation('clinicalQueues');
    const [pregnancy, setPregnancy] = useState(initialSafety?.pregnancy || 'Unknown');
    const [implant, setImplant] = useState(initialSafety?.implant || 'Unknown');
    const [renal, setRenal] = useState(initialSafety?.renal || 'Unknown');

    useEffect(() => {
        if (isOpen) {
            setPregnancy(initialSafety?.pregnancy || 'Unknown');
            setImplant(initialSafety?.implant || 'Unknown');
            setRenal(initialSafety?.renal || 'Unknown');
        }
    }, [isOpen, initialSafety]);

    if (!isOpen) return null;

    const safetyOptions = ['Unknown', 'Cleared', 'At Risk', 'Not Applicable'];

    const getSelectClass = (val) => {
        const base = "h-11 w-full rounded-2xl border-2 px-4 text-sm font-bold outline-none transition-all focus:ring-4";
        const tones = {
            Cleared: "border-emerald-200 text-emerald-800 focus:border-emerald-500 focus:ring-emerald-500/10 bg-emerald-50/10",
            'At Risk': "border-rose-200 text-rose-800 focus:border-rose-500 focus:ring-rose-500/10 bg-rose-50/10",
            Unknown: "border-amber-200 text-amber-800 focus:border-amber-500 focus:ring-amber-500/10 bg-amber-50/10",
            'Not Applicable': "border-slate-200 text-slate-500 focus:border-slate-400 focus:ring-slate-400/10 bg-slate-50/10"
        };
        return `${base} ${tones[val] || tones.Unknown}`;
    };

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-md overflow-hidden rounded-[2rem] bg-white shadow-2xl animate-in zoom-in-95 duration-200">
                <div className="border-b border-slate-100 px-8 py-6 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-100 text-teal-600 shadow-inner">
                            <ShieldCheck size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-800">Edit Safety Checklist</h2>
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
                
                <div className="p-8 space-y-5">
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
                            Pregnancy Safety Status
                        </label>
                        <select
                            value={pregnancy}
                            onChange={(e) => setPregnancy(e.target.value)}
                            className={getSelectClass(pregnancy)}
                        >
                            {safetyOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
                            Implant Safety Status (e.g. Pacemakers/Metallic)
                        </label>
                        <select
                            value={implant}
                            onChange={(e) => setImplant(e.target.value)}
                            className={getSelectClass(implant)}
                        >
                            {safetyOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
                            Renal Clearance Status
                        </label>
                        <select
                            value={renal}
                            onChange={(e) => setRenal(e.target.value)}
                            className={getSelectClass(renal)}
                        >
                            {safetyOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                    </div>
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
                        onClick={() => onConfirm({ pregnancy, implant, renal })}
                        disabled={isSaving}
                        className="rounded-xl bg-gradient-to-r from-teal-600 to-emerald-500 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-teal-500/30 transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                    >
                        {isSaving ? t('common.saving') : 'Save Checklist'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default EditSafetyDialog;
