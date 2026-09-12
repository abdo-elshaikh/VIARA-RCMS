import React, { useState } from 'react';
import {
    Download,
    FileSpreadsheet,
    FileText,
    DoorClosed,
    Server,
    Network,
    CheckCircle2,
    X,
    Sparkles
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-hot-toast';
import Modal from '../ui/Modal';

export const ClinicalExportModal = ({
    isOpen,
    onClose,
    rooms = [],
    machines = [],
    exams = [],
    matrixData = null
}) => {
    const { t, i18n } = useTranslation('workspace');
    const isArabic = i18n.language?.startsWith('ar');

    const [dataset, setDataset] = useState('rooms'); // rooms | machines | procedures | hierarchy
    const [format, setFormat] = useState('csv'); // csv | json

    const handleDownload = () => {
        const timestamp = new Date().toISOString().split('T')[0];
        let filename = '';
        let fileContent = '';
        let mimeType = 'text/csv;charset=utf-8;';

        const escapeCSV = (val) => {
            if (val === null || val === undefined) return '""';
            const str = String(val).replace(/"/g, '""');
            return `"${str}"`;
        };

        if (format === 'json') {
            mimeType = 'application/json;charset=utf-8;';
            if (dataset === 'rooms') {
                filename = `viara_rooms_${timestamp}.json`;
                fileContent = JSON.stringify(rooms, null, 2);
            } else if (dataset === 'machines') {
                filename = `viara_equipment_${timestamp}.json`;
                fileContent = JSON.stringify(machines, null, 2);
            } else if (dataset === 'procedures') {
                filename = `viara_procedures_${timestamp}.json`;
                fileContent = JSON.stringify(exams, null, 2);
            } else {
                filename = `viara_clinical_hierarchy_${timestamp}.json`;
                fileContent = JSON.stringify(matrixData || { rooms, machines, exams }, null, 2);
            }
        } else {
            // CSV Export
            if (dataset === 'rooms') {
                filename = `viara_rooms_${timestamp}.csv`;
                const headers = ['Room Name', 'Room Number', 'Type', 'Floor', 'Status', 'Total Machines', 'Active Machines', 'Notes', 'Created At'];
                const rows = rooms.map(r => [
                    escapeCSV(r.name),
                    escapeCSV(r.room_number),
                    escapeCSV(r.type),
                    escapeCSV(r.floor || ''),
                    escapeCSV(r.status),
                    escapeCSV(r.total_machines || (r.machines || []).length),
                    escapeCSV(r.active_machines || 0),
                    escapeCSV(r.notes || ''),
                    escapeCSV(r.created_at || '')
                ].join(','));
                fileContent = [headers.map(escapeCSV).join(','), ...rows].join('\r\n');
            } else if (dataset === 'machines') {
                filename = `viara_equipment_${timestamp}.csv`;
                const headers = ['Machine Name', 'Modality Type', 'Room Number', 'Room Name', 'Manufacturer', 'Model', 'Serial Number', 'Installation Date', 'Location', 'Status', 'Procedures Count'];
                const rows = machines.map(m => [
                    escapeCSV(m.name),
                    escapeCSV(m.type),
                    escapeCSV(m.room_number || ''),
                    escapeCSV(m.room_name || ''),
                    escapeCSV(m.manufacturer || ''),
                    escapeCSV(m.model || ''),
                    escapeCSV(m.serial_number || ''),
                    escapeCSV(m.installation_date || ''),
                    escapeCSV(m.location || ''),
                    escapeCSV(m.status),
                    escapeCSV(m.active_procedures_count ?? m.procedures_count ?? 0)
                ].join(','));
                fileContent = [headers.map(escapeCSV).join(','), ...rows].join('\r\n');
            } else if (dataset === 'procedures') {
                filename = `viara_procedures_catalog_${timestamp}.csv`;
                const headers = ['Procedure Code', 'Procedure Name', 'Modality Name', 'Room Number', 'Duration Minutes', 'Price', 'Body Part', 'Contrast Required', 'Preparation Instructions', 'Active'];
                const rows = exams.map(e => [
                    escapeCSV(e.code || ''),
                    escapeCSV(e.name),
                    escapeCSV(e.modality_name || ''),
                    escapeCSV(e.room_number || ''),
                    escapeCSV(e.duration_minutes || 30),
                    escapeCSV(Number(e.price || 0).toFixed(2)),
                    escapeCSV(e.body_part || ''),
                    escapeCSV(e.contrast_required ? 'Yes' : 'No'),
                    escapeCSV(e.preparation_instructions || ''),
                    escapeCSV(e.is_active !== false ? 'Active' : 'Inactive')
                ].join(','));
                fileContent = [headers.map(escapeCSV).join(','), ...rows].join('\r\n');
            } else {
                // Hierarchy Flattened CSV
                filename = `viara_clinical_hierarchy_${timestamp}.csv`;
                const headers = ['Room Number', 'Room Name', 'Room Status', 'Machine Name', 'Machine Type', 'Machine Status', 'Procedure Code', 'Procedure Name', 'Duration', 'Price'];
                const rows = [];
                const matrixRoomsList = matrixData?.rooms || [];
                matrixRoomsList.forEach(r => {
                    const rMachines = r.machines || [];
                    if (rMachines.length === 0) {
                        rows.push([escapeCSV(r.room_number), escapeCSV(r.name), escapeCSV(r.status), '""', '""', '""', '""', '""', '""', '""'].join(','));
                    } else {
                        rMachines.forEach(m => {
                            const mProcs = m.procedures || [];
                            if (mProcs.length === 0) {
                                rows.push([escapeCSV(r.room_number), escapeCSV(r.name), escapeCSV(r.status), escapeCSV(m.name), escapeCSV(m.type), escapeCSV(m.status), '""', '""', '""', '""'].join(','));
                            } else {
                                mProcs.forEach(p => {
                                    rows.push([
                                        escapeCSV(r.room_number),
                                        escapeCSV(r.name),
                                        escapeCSV(r.status),
                                        escapeCSV(m.name),
                                        escapeCSV(m.type),
                                        escapeCSV(m.status),
                                        escapeCSV(p.code || ''),
                                        escapeCSV(p.name),
                                        escapeCSV(p.duration_minutes),
                                        escapeCSV(p.price)
                                    ].join(','));
                                });
                            }
                        });
                    }
                });
                fileContent = [headers.map(escapeCSV).join(','), ...rows].join('\r\n');
            }
        }

        // Trigger native download
        const blob = new Blob([fileContent], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        toast.success(isArabic ? `تم تصدير ملف ${filename} بنجاح` : `Exported ${filename} successfully`);
        onClose();
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={isArabic ? 'تصدير البيانات والأصول السريرية' : 'Export Clinical Assets & Catalog'}
            size="md"
        >
            <div className="space-y-5">
                <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                        {isArabic ? 'اختر مجموعة البيانات المراد تصديرها' : 'Select Dataset to Export'}
                    </label>
                    <div className="grid grid-cols-2 gap-2.5">
                        {[
                            { id: 'rooms', icon: DoorClosed, labelAr: 'الأجنحة والغرف', labelEn: 'Rooms & Suites', count: rooms.length },
                            { id: 'machines', icon: Server, labelAr: 'الأجهزة والمعدات', labelEn: 'Equipment Fleet', count: machines.length },
                            { id: 'procedures', icon: FileSpreadsheet, labelAr: 'كتالوج الفحوصات', labelEn: 'Procedures Catalog', count: exams.length },
                            { id: 'hierarchy', icon: Network, labelAr: 'المصفوفة الهرمية الكاملة', labelEn: 'Full Hierarchy Tree' }
                        ].map(item => {
                            const Icon = item.icon;
                            const isSelected = dataset === item.id;
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => setDataset(item.id)}
                                    className={`flex items-center gap-2.5 rounded-xl border p-3 text-start transition-all ${
                                        isSelected
                                            ? 'border-teal-500 bg-teal-50 text-teal-900 dark:border-teal-400 dark:bg-teal-950/40 dark:text-teal-200 ring-2 ring-teal-500/20'
                                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
                                    }`}
                                >
                                    <Icon size={18} className={isSelected ? 'text-teal-600 dark:text-teal-300' : 'text-slate-400'} />
                                    <div>
                                        <div className="text-xs font-black">{isArabic ? item.labelAr : item.labelEn}</div>
                                        {item.count !== undefined && (
                                            <div className="text-[10px] text-slate-400 font-semibold">{item.count} {isArabic ? 'سجل' : 'records'}</div>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                        {isArabic ? 'صيغة التصدير' : 'Export File Format'}
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            type="button"
                            onClick={() => setFormat('csv')}
                            className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-xs font-bold transition-all ${
                                format === 'csv'
                                    ? 'border-teal-500 bg-teal-50 text-teal-900 dark:border-teal-400 dark:bg-teal-950/40 dark:text-teal-200'
                                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
                            }`}
                        >
                            <FileSpreadsheet size={16} />
                            CSV (Excel / Sheets)
                        </button>
                        <button
                            type="button"
                            onClick={() => setFormat('json')}
                            className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-xs font-bold transition-all ${
                                format === 'json'
                                    ? 'border-teal-500 bg-teal-50 text-teal-900 dark:border-teal-400 dark:bg-teal-950/40 dark:text-teal-200'
                                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
                            }`}
                        >
                            <FileText size={16} />
                            JSON (Structured Data)
                        </button>
                    </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                    >
                        {isArabic ? 'إلغاء' : 'Cancel'}
                    </button>
                    <button
                        type="button"
                        onClick={handleDownload}
                        className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-xs font-black text-white shadow-md shadow-teal-600/20 hover:bg-teal-700"
                    >
                        <Download size={14} />
                        {isArabic ? 'تصدير وتنزيل الملف' : 'Export & Download'}
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default ClinicalExportModal;
