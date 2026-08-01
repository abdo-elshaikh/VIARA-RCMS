/* eslint-disable react-refresh/only-export-components -- form defaults and catalog are intentionally co-located */
import React from 'react';
import { Clock3, Contrast, Edit3, Trash2 } from 'lucide-react';
import Modal from '../../ui/Modal';
import { Status, Field, Select, Check, Actions } from './SharedComponents';

export const emptyExam = { modalityId: '', code: '', name: '', price: '', durationMinutes: '30', bodyPart: '', preparationInstructions: '', contrastRequired: false, isActive: true };

export const ExamCatalog = ({ records, t, onEdit, onDelete }) => {
    return (
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {records.map(exam => {
                return (
                    <article
                        key={exam.type_id}
                        className={`flex flex-col gap-4 p-4 transition-colors lg:flex-row lg:items-center lg:justify-between ${
                            exam.is_active === false
                                ? 'bg-slate-50/70 opacity-75 dark:bg-slate-950/30'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-950/40'
                        }`}
                    >
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-lg border border-cyan-200 bg-cyan-50 px-2.5 py-0.5 font-mono text-[11px] font-bold uppercase tracking-wide text-cyan-800 dark:border-cyan-900/60 dark:bg-cyan-950/30 dark:text-cyan-300">
                                    {exam.code || t('settings.clinical.exams.noCode', { defaultValue: 'NO-CODE' })}
                                </span>
                                <Status value={exam.is_active === false ? 'Inactive' : 'Active'} t={t} />
                            </div>

                            <h3 className="mt-2 text-sm font-black text-slate-900 dark:text-white">
                                {exam.name}
                            </h3>
                            <p className="mt-0.5 text-xs font-semibold text-slate-400">
                                {exam.modality_name} - <span className="text-slate-500">{exam.body_part || t('settings.clinical.exams.general', { defaultValue: 'General' })}</span>
                            </p>

                            {exam.preparation_instructions && (
                                <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                                    <span className="font-semibold text-slate-600 dark:text-slate-300">{t('settings.clinical.exams.instructions', { defaultValue: 'Instructions' })}:</span> {exam.preparation_instructions}
                                </p>
                            )}
                        </div>

                        <div className="flex flex-col gap-3 lg:w-[360px] lg:shrink-0">
                            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-slate-500">
                                <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200/50 bg-slate-100 px-2.5 py-1 dark:border-slate-700/60 dark:bg-slate-800">
                                    <Clock3 size={13} className="text-slate-400" />
                                    {exam.duration_minutes} {t('settings.clinical.exams.minutes', { defaultValue: 'min' })}
                                </span>
                                <span className={`inline-flex items-center gap-1 border px-2.5 py-1 rounded-lg ${
                                    exam.contrast_required 
                                        ? 'bg-rose-50 border-rose-100 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300' 
                                        : 'bg-slate-100 border-slate-200/50 text-slate-500 dark:border-slate-700/60 dark:bg-slate-800 dark:text-slate-300'
                                }`}>
                                    <Contrast size={13} />
                                    {exam.contrast_required ? t('settings.clinical.contrastReq', { defaultValue: 'Contrast' }) : t('settings.clinical.noContrast', { defaultValue: 'Non-Contrast' })}
                                </span>
                                <span className="font-mono text-sm font-black text-emerald-600 dark:text-emerald-400">
                                    ${Number(exam.price || 0).toFixed(2)}
                                </span>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => onEdit(exam)}
                                    className="inline-flex min-h-9 flex-1 items-center justify-center gap-2 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 transition-colors hover:border-cyan-200 hover:bg-cyan-50/50 hover:text-cyan-800 dark:border-slate-700 dark:text-slate-300 dark:hover:border-cyan-900 dark:hover:bg-cyan-950/30 dark:hover:text-cyan-300"
                                >
                                    <Edit3 size={13} />
                                    {t('settings.clinical.edit', { defaultValue: 'Edit' })}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onDelete(exam.type_id, exam.name)}
                                    className="inline-flex min-h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-rose-100 bg-rose-50/30 text-rose-600 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                                    title={t('settings.clinical.delete', { defaultValue: 'Delete Procedure' })}
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        </div>
                    </article>
                );
            })}
        </div>
    );
};

export const ExamDialog = ({ open, editing, form, setForm, machines, onClose, onSave, busy, t }) => (
    <Modal
        isOpen={open}
        onClose={onClose}
        title={t(editing ? 'settings.clinical.exams.editTitle' : 'settings.clinical.exams.createTitle', {
            defaultValue: editing ? 'Edit Procedure Specifications' : 'Create New Clinical Procedure'
        })}
        size="wide"
        width="max-w-3xl"
    >
        <form onSubmit={onSave} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <Select
                    label={t('settings.clinical.exams.machine', { defaultValue: 'Primary Modality Machine' })}
                    required
                    value={form.modalityId}
                    onChange={value => setForm({ ...form, modalityId: value })}
                    options={machines.map(machine => machine.modality_id)}
                    render={value => machines.find(machine => machine.modality_id === value)?.name || value}
                />
                <Field
                    label={t('settings.clinical.exams.code', { defaultValue: 'Procedure / CPT Code' })}
                    placeholder="e.g. MRI-BRAIN-C"
                    value={form.code}
                    onChange={value => setForm({ ...form, code: value.toUpperCase() })}
                />
                <Field
                    label={t('settings.clinical.exams.name', { defaultValue: 'Procedure Title' })}
                    required
                    placeholder="e.g. Brain MRI with contrast"
                    value={form.name}
                    onChange={value => setForm({ ...form, name: value })}
                />
                <Field
                    label={t('settings.clinical.exams.price', { defaultValue: 'Fee / Price ($)' })}
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={form.price}
                    onChange={value => setForm({ ...form, price: value })}
                />
                <Field
                    label={t('settings.clinical.exams.duration', { defaultValue: 'Duration (Minutes)' })}
                    required
                    type="number"
                    min="1"
                    max="1440"
                    placeholder="30"
                    value={form.durationMinutes}
                    onChange={value => setForm({ ...form, durationMinutes: value })}
                />
                <Field
                    label={t('settings.clinical.exams.bodyPart', { defaultValue: 'Anatomical Region / Body Part' })}
                    placeholder="e.g. Brain / Head"
                    value={form.bodyPart}
                    onChange={value => setForm({ ...form, bodyPart: value })}
                />
            </div>

            <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                    {t('settings.clinical.exams.preparation', { defaultValue: 'Patient Preparation & Pre-Scan Instructions' })}
                </label>
                <textarea
                    rows="3"
                    placeholder="Detail fasting requirements, oral contrast instructions, metal precautions, or blood work checks..."
                    value={form.preparationInstructions}
                    onChange={event => setForm({ ...form, preparationInstructions: event.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                />
            </div>
            
            <div className="grid gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-950/40 sm:grid-cols-2">
                <Check
                    label={t('settings.clinical.exams.contrast', { defaultValue: 'Contrast Agent Injected / Required' })}
                    checked={form.contrastRequired}
                    onChange={value => setForm({ ...form, contrastRequired: value })}
                />
                <Check
                    label={t('settings.clinical.exams.active', { defaultValue: 'Publish Procedure in Active Catalog' })}
                    checked={form.isActive}
                    onChange={value => setForm({ ...form, isActive: value })}
                />
            </div>
            
            <Actions busy={busy} onClose={onClose} t={t} />
        </form>
    </Modal>
);
