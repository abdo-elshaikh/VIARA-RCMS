import React, { useState, useMemo } from 'react';
import {
    Download,
    FileSpreadsheet,
    FileText,
    DoorClosed,
    Server,
    Network,
    Wrench,
    AlertTriangle,
    Filter,
    CheckCircle2
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
    maintenance = [],
    downtime = [],
    matrixData = null
}) => {
    const { t, i18n } = useTranslation('workspace');
    const isArabic = i18n.language?.startsWith('ar');

    const [dataset, setDataset] = useState('rooms'); // rooms | machines | procedures | maintenance | downtime | hierarchy
    const [format, setFormat] = useState('csv'); // csv | json
    const [activeOnly, setActiveOnly] = useState(false);

    // Filter datasets based on activeOnly toggle
    const filteredData = useMemo(() => {
        const filteredRooms = activeOnly ? rooms.filter(r => r.status === 'Active') : rooms;
        const filteredMachines = activeOnly ? machines.filter(m => (m.status || 'Active') === 'Active') : machines;
        const filteredExams = activeOnly ? exams.filter(e => e.is_active !== false) : exams;
        const filteredMaintenance = activeOnly ? maintenance.filter(m => !['Completed', 'Cancelled'].includes(m.status)) : maintenance;
        const filteredDowntime = activeOnly ? downtime.filter(d => d.status !== 'Resolved') : downtime;

        let count = 0;
        if (dataset === 'rooms') count = filteredRooms.length;
        else if (dataset === 'machines') count = filteredMachines.length;
        else if (dataset === 'procedures') count = filteredExams.length;
        else if (dataset === 'maintenance') count = filteredMaintenance.length;
        else if (dataset === 'downtime') count = filteredDowntime.length;
        else count = matrixData?.rooms?.length || filteredRooms.length;

        return {
            rooms: filteredRooms,
            machines: filteredMachines,
            exams: filteredExams,
            maintenance: filteredMaintenance,
            downtime: filteredDowntime,
            count
        };
    }, [activeOnly, rooms, machines, exams, maintenance, downtime, dataset, matrixData]);

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

        const { rooms: rList, machines: mList, exams: eList, maintenance: maintList, downtime: dtList } = filteredData;

        if (format === 'json') {
            mimeType = 'application/json;charset=utf-8;';
            if (dataset === 'rooms') {
                filename = `viara_rooms_${timestamp}.json`;
                fileContent = JSON.stringify(rList, null, 2);
            } else if (dataset === 'machines') {
                filename = `viara_equipment_${timestamp}.json`;
                fileContent = JSON.stringify(mList, null, 2);
            } else if (dataset === 'procedures') {
                filename = `viara_procedures_${timestamp}.json`;
                fileContent = JSON.stringify(eList, null, 2);
            } else if (dataset === 'maintenance') {
                filename = `viara_maintenance_${timestamp}.json`;
                fileContent = JSON.stringify(maintList, null, 2);
            } else if (dataset === 'downtime') {
                filename = `viara_downtime_${timestamp}.json`;
                fileContent = JSON.stringify(dtList, null, 2);
            } else {
                filename = `viara_clinical_hierarchy_${timestamp}.json`;
                fileContent = JSON.stringify(matrixData || { rooms: rList, machines: mList, exams: eList }, null, 2);
            }
        } else {
            // CSV Export with UTF-8 BOM (\uFEFF) for Excel compatibility
            if (dataset === 'rooms') {
                filename = `viara_rooms_${timestamp}.csv`;
                const headers = ['Room Name', 'Room Number', 'Type', 'Floor', 'Status', 'Total Machines', 'Active Machines', 'Notes', 'Created At'];
                const rows = rList.map(r => [
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
                fileContent = '\uFEFF' + [headers.map(escapeCSV).join(','), ...rows].join('\r\n');
            } else if (dataset === 'machines') {
                filename = `viara_equipment_${timestamp}.csv`;
                const headers = ['Machine Name', 'Modality Type', 'Room Number', 'Room Name', 'Manufacturer', 'Model', 'Serial Number', 'Installation Date', 'Location', 'Status', 'Procedures Count', 'DICOM Synced'];
                const rows = mList.map(m => [
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
                    escapeCSV(m.active_procedures_count ?? m.procedures_count ?? 0),
                    escapeCSV(m.dicom_synced ? 'Yes' : 'No')
                ].join(','));
                fileContent = '\uFEFF' + [headers.map(escapeCSV).join(','), ...rows].join('\r\n');
            } else if (dataset === 'procedures') {
                filename = `viara_procedures_catalog_${timestamp}.csv`;
                const headers = ['Procedure Code', 'Procedure Name', 'Modality Name', 'Room Number', 'Duration Minutes', 'Price (EGP)', 'Body Part', 'Contrast Required', 'Preparation Instructions', 'Active'];
                const rows = eList.map(e => [
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
                fileContent = '\uFEFF' + [headers.map(escapeCSV).join(','), ...rows].join('\r\n');
            } else if (dataset === 'maintenance') {
                filename = `viara_maintenance_${timestamp}.csv`;
                const headers = ['Machine Name', 'Maintenance Type', 'Scheduled Date', 'Completed Date', 'Performed By', 'Cost (EGP)', 'Status', 'Notes'];
                const rows = maintList.map(m => [
                    escapeCSV(m.modality_name || m.machine_name || ''),
                    escapeCSV(m.maintenance_type || 'Routine'),
                    escapeCSV(m.scheduled_date ? m.scheduled_date.split('T')[0] : ''),
                    escapeCSV(m.completed_date ? m.completed_date.split('T')[0] : ''),
                    escapeCSV(m.performed_by || ''),
                    escapeCSV(Number(m.cost || 0).toFixed(2)),
                    escapeCSV(m.status || 'Scheduled'),
                    escapeCSV(m.notes || '')
                ].join(','));
                fileContent = '\uFEFF' + [headers.map(escapeCSV).join(','), ...rows].join('\r\n');
            } else if (dataset === 'downtime') {
                filename = `viara_downtime_${timestamp}.csv`;
                const headers = ['Machine Name', 'Status', 'Start Time', 'End Time', 'Reason', 'Resolution Notes'];
                const rows = dtList.map(d => [
                    escapeCSV(d.modality_name || ''),
                    escapeCSV(d.status || 'Planned'),
                    escapeCSV(d.start_time || ''),
                    escapeCSV(d.end_time || ''),
                    escapeCSV(d.reason || ''),
                    escapeCSV(d.resolution_notes || '')
                ].join(','));
                fileContent = '\uFEFF' + [headers.map(escapeCSV).join(','), ...rows].join('\r\n');
            } else {
                // Hierarchy Flattened CSV
                filename = `viara_clinical_hierarchy_${timestamp}.csv`;
                const headers = ['Room Number', 'Room Name', 'Room Status', 'Machine Name', 'Machine Type', 'Machine Status', 'Procedure Code', 'Procedure Name', 'Duration (min)', 'Price (EGP)'];
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
                fileContent = '\uFEFF' + [headers.map(escapeCSV).join(','), ...rows].join('\r\n');
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
                {/* Dataset Selection */}
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                            {isArabic ? 'اختر مجموعة البيانات المراد تصديرها' : 'Select Dataset to Export'}
                        </label>
                        <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 dark:text-slate-400 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={activeOnly}
                                onChange={e => setActiveOnly(e.target.checked)}
                                className="rounded text-teal-600 focus:ring-teal-500"
                            />
                            <span>{isArabic ? 'السجلات النشطة فقط' : 'Active Only'}</span>
                        </label>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {[
                            { id: 'rooms', icon: DoorClosed, labelAr: 'الأجنحة والغرف', labelEn: 'Rooms & Suites', count: filteredData.rooms.length },
                            { id: 'machines', icon: Server, labelAr: 'الأجهزة والمعدات', labelEn: 'Equipment Fleet', count: filteredData.machines.length },
                            { id: 'procedures', icon: FileSpreadsheet, labelAr: 'كتالوج الفحوصات', labelEn: 'Procedures Catalog', count: filteredData.exams.length },
                            { id: 'maintenance', icon: Wrench, labelAr: 'سجلات الصيانة', labelEn: 'Maintenance', count: filteredData.maintenance.length },
                            { id: 'downtime', icon: AlertTriangle, labelAr: 'سجلات الأعطال', labelEn: 'Downtime Logs', count: filteredData.downtime.length },
                            { id: 'hierarchy', icon: Network, labelAr: 'المصفوفة الهرمية', labelEn: 'Full Hierarchy Tree' }
                        ].map(item => {
                            const Icon = item.icon;
                            const isSelected = dataset === item.id;
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => setDataset(item.id)}
                                    className={`flex flex-col items-start justify-between rounded-xl border p-3 text-start transition-all ${
                                        isSelected
                                            ? 'border-teal-500 bg-teal-50 text-teal-900 dark:border-teal-400 dark:bg-teal-950/40 dark:text-teal-200 ring-2 ring-teal-500/20'
                                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                                    }`}
                                >
                                    <div className="flex items-center justify-between w-full mb-1">
                                        <Icon size={16} className={isSelected ? 'text-teal-600 dark:text-teal-300' : 'text-slate-400'} />
                                        {item.count !== undefined && (
                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                                                isSelected
                                                    ? 'bg-teal-200/60 text-teal-900 dark:bg-teal-900/60 dark:text-teal-200'
                                                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                                            }`}>
                                                {item.count}
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-xs font-black">{isArabic ? item.labelAr : item.labelEn}</div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Format Selection */}
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
                                    ? 'border-teal-500 bg-teal-50 text-teal-900 dark:border-teal-400 dark:bg-teal-950/40 dark:text-teal-200 ring-2 ring-teal-500/20'
                                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
                            }`}
                        >
                            <FileSpreadsheet size={16} className="text-emerald-600 dark:text-emerald-400" />
                            <span>CSV (Excel / UTF-8)</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setFormat('json')}
                            className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-xs font-bold transition-all ${
                                format === 'json'
                                    ? 'border-teal-500 bg-teal-50 text-teal-900 dark:border-teal-400 dark:bg-teal-950/40 dark:text-teal-200 ring-2 ring-teal-500/20'
                                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
                            }`}
                        >
                            <FileText size={16} className="text-blue-600 dark:text-blue-400" />
                            <span>JSON (Structured Data)</span>
                        </button>
                    </div>
                </div>

                {/* Info preview banner */}
                <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-xs font-semibold text-slate-600 dark:bg-slate-950/60 dark:text-slate-300 border border-slate-200/60 dark:border-slate-800">
                    <span>{isArabic ? 'عدد السجلات المجهزة للتصدير:' : 'Records prepared for export:'}</span>
                    <strong className="font-mono text-sm font-black text-teal-700 dark:text-teal-300">{filteredData.count}</strong>
                </div>

                {/* Footer Buttons */}
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
                        disabled={filteredData.count === 0}
                        className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-xs font-black text-white shadow-md shadow-teal-600/20 hover:bg-teal-700 disabled:opacity-50"
                    >
                        <Download size={14} />
                        {isArabic ? `تصدير وتنزيل (${filteredData.count})` : `Export & Download (${filteredData.count})`}
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default ClinicalExportModal;

