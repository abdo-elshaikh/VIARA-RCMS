/* eslint-disable react-refresh/only-export-components -- form defaults and catalog are intentionally co-located */
import React from 'react';
import { Edit3, Server, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Modal from '../../ui/Modal';
import { Status, Field, Select, Actions } from './SharedComponents';

export const machineTypes = ['MRI', 'CT', 'X-Ray', 'Ultrasound', 'Mammography', 'Cath Lab', 'Panoramic X-Ray', 'PET-CT', 'Fluoroscopy', 'DEXA'];
export const emptyMachine = { name: '', type: 'MRI', roomNumber: '', serialNumber: '', manufacturer: '', model: '', installationDate: '', location: '', status: 'Active' };

export const MachineCatalog = ({ records, t: propT, onEdit, onDelete }) => {
    const { t: hookT } = useTranslation('settings');
    const t = typeof propT === 'function' ? propT : hookT;

    return (
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {records.map(machine => {
                const dateText = machine.installation_date 
                    ? new Date(machine.installation_date).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })
                    : null;
                
                return (
                    <article
                        key={machine.modality_id}
                        className="flex flex-col gap-4 p-4 transition-colors hover:bg-slate-50 dark:hover:bg-slate-950/40 lg:flex-row lg:items-center lg:justify-between"
                    >
                        <div className="flex min-w-0 items-start gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-50 text-cyan-600 dark:bg-cyan-950/30 dark:text-cyan-300">
                                <Server size={18} />
                            </span>
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="truncate text-sm font-black text-slate-900 dark:text-white">{machine.name}</h3>
                                    <Status value={machine.status || 'Active'} t={t} />
                                </div>
                                <p className="mt-1 text-xs font-bold uppercase tracking-wider text-slate-400">{machine.type}</p>
                                <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                                    <InlineDetail label={t('settings.clinical.machines.room', { defaultValue: 'Room' })} value={machine.room_number} />
                                    <InlineDetail label={t('settings.clinical.machines.location', { defaultValue: 'Location' })} value={machine.location} />
                                    <InlineDetail label={t('settings.clinical.machines.manufacturer', { defaultValue: 'Model' })} value={[machine.manufacturer, machine.model].filter(Boolean).join(' ')} />
                                    {dateText ? <InlineDetail label={t('settings.clinical.machines.installed', { defaultValue: 'Installed' })} value={dateText} /> : null}
                                </dl>
                            </div>
                        </div>
                        
                        <div className="flex gap-2 lg:shrink-0">
                            <button
                                type="button"
                                onClick={() => onEdit(machine)}
                                className="inline-flex min-h-9 flex-1 items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-700 transition-colors hover:border-cyan-200 hover:bg-cyan-50/50 hover:text-cyan-800 dark:border-slate-700 dark:text-slate-300 dark:hover:border-cyan-900 dark:hover:bg-cyan-950/30 dark:hover:text-cyan-300 lg:flex-none"
                            >
                                <Edit3 size={13} />
                                {t('settings.clinical.edit', { defaultValue: 'Edit' })}
                            </button>
                            <button
                                type="button"
                                onClick={() => onDelete(machine.modality_id, machine.name)}
                                className="inline-flex min-h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-rose-100 bg-rose-50/30 text-rose-600 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                                title={t('settings.clinical.delete', { defaultValue: 'Delete Machine' })}
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    </article>
                );
            })}
        </div>
    );
};

const InlineDetail = ({ label, value }) => value ? (
    <span><span className="font-bold text-slate-600 dark:text-slate-300">{label}:</span> {value}</span>
) : null;

export const MachineDialog = ({ open, editing, form, setForm, onClose, onSave, busy, t: propT }) => {
    const { t: hookT } = useTranslation('settings');
    const t = typeof propT === 'function' ? propT : hookT;

    return (
        <Modal
            isOpen={open}
            onClose={onClose}
            title={t(editing ? 'settings.clinical.machines.editTitle' : 'settings.clinical.machines.createTitle', {
                defaultValue: editing ? 'Edit Machine Specifications' : 'Register New Machine'
            })}
            size="wide"
            width="max-w-2xl"
        >
            <form onSubmit={onSave} className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                        label={t('settings.clinical.machines.name', { defaultValue: 'Machine Name' })}
                        required
                        placeholder={t('settings.clinical.machines.placeholders.name', { defaultValue: 'e.g. MRI 3T Bay 1' })}
                        value={form.name}
                        onChange={value => setForm({ ...form, name: value })}
                    />
                    <Select
                        label={t('settings.clinical.machines.type', { defaultValue: 'Modality Class' })}
                        required
                        value={form.type}
                        onChange={value => setForm({ ...form, type: value })}
                        options={machineTypes}
                    />
                    <Field
                        label={t('settings.clinical.machines.room', { defaultValue: 'Room Number' })}
                        placeholder={t('settings.clinical.machines.placeholders.room', { defaultValue: 'e.g. Room 102' })}
                        value={form.roomNumber}
                        onChange={value => setForm({ ...form, roomNumber: value })}
                    />
                    <Field
                        label={t('settings.clinical.machines.location', { defaultValue: 'Facility Location' })}
                        placeholder={t('settings.clinical.machines.placeholders.location', { defaultValue: 'e.g. Ground Floor, East Wing' })}
                        value={form.location}
                        onChange={value => setForm({ ...form, location: value })}
                    />
                    <Select
                        label={t('settings.clinical.machines.status', { defaultValue: 'Operational Status' })}
                        value={form.status}
                        onChange={value => setForm({ ...form, status: value })}
                        options={['Active', 'Under Maintenance', 'Out of Service']}
                        render={value => t(`settings.clinical.statuses.${value}`, { defaultValue: value })}
                    />
                </div>

                <div className="border-t border-slate-200 pt-4">
                    <h4 className="mb-3 text-sm font-semibold text-slate-950">
                        {t('settings.clinical.machines.deviceDetails', { defaultValue: 'Device details' })}
                    </h4>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field
                            label={t('settings.clinical.machines.manufacturer', { defaultValue: 'Manufacturer' })}
                            placeholder={t('settings.clinical.machines.placeholders.manufacturer', { defaultValue: 'e.g. Siemens Healthcare' })}
                            value={form.manufacturer}
                            onChange={value => setForm({ ...form, manufacturer: value })}
                        />
                        <Field
                            label={t('settings.clinical.machines.model', { defaultValue: 'Model' })}
                            placeholder={t('settings.clinical.machines.placeholders.model', { defaultValue: 'e.g. Magnetom Vida' })}
                            value={form.model}
                            onChange={value => setForm({ ...form, model: value })}
                        />
                        <Field
                            label={t('settings.clinical.machines.serial', { defaultValue: 'Serial Number' })}
                            placeholder={t('settings.clinical.machines.placeholders.serial', { defaultValue: 'e.g. SN-928374-X' })}
                            value={form.serialNumber}
                            onChange={value => setForm({ ...form, serialNumber: value })}
                        />
                        <Field
                            label={t('settings.clinical.machines.installationDate', { defaultValue: 'Installation Date' })}
                            type="date"
                            value={form.installationDate}
                            onChange={value => setForm({ ...form, installationDate: value })}
                        />
                    </div>
                </div>
                <Actions busy={busy} onClose={onClose} t={t} />
            </form>
        </Modal>
    );
};
