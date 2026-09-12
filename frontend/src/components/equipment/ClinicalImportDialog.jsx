import React, { useState, useMemo } from 'react';
import {
    Upload,
    Download,
    FileSpreadsheet,
    CheckCircle2,
    AlertTriangle,
    XCircle,
    DoorClosed,
    Server,
    Layers,
    RefreshCw,
    X,
    FileText,
    Sparkles
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-hot-toast';
import Modal from '../ui/Modal';
import {
    useCreateRoomMutation,
    useUpdateRoomMutation,
    useCreateMachineMutation,
    useUpdateMachineMutation,
    useCreateExamTypeMutation,
    useUpdateExamTypeMutation
} from '../../store/api';

export const ClinicalImportDialog = ({
    isOpen,
    onClose,
    defaultType = 'rooms', // rooms | machines | procedures
    rooms = [],
    machines = [],
    exams = [],
    onSuccess
}) => {
    const { t, i18n } = useTranslation('workspace');
    const isArabic = i18n.language?.startsWith('ar');

    const [importType, setImportType] = useState(defaultType);
    const [file, setFile] = useState(null);
    const [parsedRows, setParsedRows] = useState([]);
    const [conflictStrategy, setConflictStrategy] = useState('skip'); // skip | update
    const [isExecuting, setIsExecuting] = useState(false);
    const [progress, setProgress] = useState(0);

    const [createRoom] = useCreateRoomMutation();
    const [updateRoom] = useUpdateRoomMutation();
    const [createMachine] = useCreateMachineMutation();
    const [updateMachine] = useUpdateMachineMutation();
    const [createExam] = useCreateExamTypeMutation();
    const [updateExam] = useUpdateExamTypeMutation();

    const handleReset = () => {
        setFile(null);
        setParsedRows([]);
        setProgress(0);
        setIsExecuting(false);
    };

    const handleTypeChange = (type) => {
        setImportType(type);
        handleReset();
    };

    // Download CSV template
    const handleDownloadTemplate = () => {
        let filename = '';
        let content = '';

        if (importType === 'rooms') {
            filename = 'template_clinical_rooms.csv';
            content = 'Room Name,Room Number,Type,Floor,Status,Notes\r\n' +
                'Main 3T MRI Suite,MRI-01,Imaging,Ground Floor,Active,RF Shielded with automated injector\r\n' +
                'CT Scan Room 1,CT-01,Imaging,Ground Floor,Active,Lead-lined 64-slice suite\r\n' +
                'Preparation Bay 1,PREP-01,Preparation,1st Floor,Active,IV cannulation and contrast prep\r\n' +
                'Recovery Room,RECOV-01,Recovery,1st Floor,Active,4 recovery beds with monitoring';
        } else if (importType === 'machines') {
            filename = 'template_equipment_fleet.csv';
            content = 'Machine Name,Modality Type,Room Number,Manufacturer,Model,Serial Number,Location,Status\r\n' +
                'Siemens Magnetom 3T,MRI,MRI-01,Siemens,Magnetom Vida,SN-998877,Ground Floor,Active\r\n' +
                'GE Revolution CT,CT,CT-01,GE Healthcare,Revolution EVO,SN-443322,Ground Floor,Active\r\n' +
                'Samsung Ultrasound V8,Ultrasound,PREP-01,Samsung,V8 Premium,SN-112233,1st Floor,Active';
        } else {
            filename = 'template_procedures_catalog.csv';
            content = 'Procedure Code,Procedure Name,Modality Type,Duration Minutes,Price,Body Part,Contrast Required,Preparation Instructions\r\n' +
                'MRI-BRAIN-C,Brain MRI with Contrast,MRI,45,250.00,Brain,Yes,Fasting 4 hours before exam. Normal creatinine required.\r\n' +
                'CT-CHEST-NC,Chest CT Plain,CT,20,120.00,Chest,No,Wear comfortable clothing without metal fasteners.\r\n' +
                'US-ABDOMEN,Abdominal Ultrasound,Ultrasound,30,80.00,Abdomen,No,Fasting 6-8 hours prior to scan. Full bladder recommended.';
        }

        const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    // CSV line parser supporting quoted values
    const parseCSVText = (text) => {
        const lines = text.split(/\r\n|\n/).filter(line => line.trim().length > 0);
        if (lines.length < 2) return [];

        const parseLine = (line) => {
            const result = [];
            let start = 0;
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
                if (line[i] === '"') inQuotes = !inQuotes;
                else if (line[i] === ',' && !inQuotes) {
                    let field = line.substring(start, i).trim();
                    if (field.startsWith('"') && field.endsWith('"')) {
                        field = field.slice(1, -1).replace(/""/g, '"');
                    }
                    result.push(field);
                    start = i + 1;
                }
            }
            let field = line.substring(start).trim();
            if (field.startsWith('"') && field.endsWith('"')) {
                field = field.slice(1, -1).replace(/""/g, '"');
            }
            result.push(field);
            return result;
        };

        const headers = parseLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
        const rows = [];

        for (let i = 1; i < lines.length; i++) {
            const values = parseLine(lines[i]);
            if (values.every(v => !v)) continue;
            const rowObj = {};
            headers.forEach((h, idx) => {
                rowObj[h] = values[idx] || '';
            });
            rows.push({ rowIndex: i + 1, data: rowObj });
        }
        return rows;
    };

    const handleFileChange = (e) => {
        const selected = e.target.files?.[0];
        if (!selected) return;

        if (!selected.name.toLowerCase().endsWith('.csv') && !selected.name.toLowerCase().endsWith('.txt')) {
            toast.error(isArabic ? 'يرجى تحميل ملف CSV صالح' : 'Please select a valid CSV file');
            return;
        }

        setFile(selected);
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const text = String(event.target?.result || '');
                const parsed = parseCSVText(text);
                setParsedRows(parsed);
                if (parsed.length === 0) {
                    toast.error(isArabic ? 'الملف فارغ أو لا يحتوي على صفوف صالحة' : 'File is empty or contains no data');
                } else {
                    toast.success(isArabic ? `تمت قراءة ${parsed.length} صفاً بنجاح` : `Loaded ${parsed.length} rows`);
                }
            } catch {
                toast.error(isArabic ? 'فشل تحليل ملف الـ CSV' : 'Failed to parse CSV');
            }
        };
        reader.readAsText(selected);
    };

    // Validation & Matching
    const validatedData = useMemo(() => {
        if (parsedRows.length === 0) return { valid: [], invalid: [], existingCount: 0 };

        const valid = [];
        const invalid = [];
        let existingCount = 0;

        parsedRows.forEach(item => {
            const r = item.data;
            let isValid = true;
            let reason = '';
            let isExisting = false;
            let existingId = null;

            if (importType === 'rooms') {
                const name = r.roomname || r.name || '';
                const roomNumber = (r.roomnumber || r.number || r.code || '').toUpperCase();
                if (!name || !roomNumber) {
                    isValid = false;
                    reason = isArabic ? 'اسم الغرفة ورقمها مطلوبان' : 'Room name and number are required';
                } else {
                    const match = rooms.find(rm => rm.room_number?.toUpperCase() === roomNumber);
                    if (match) {
                        isExisting = true;
                        existingId = match.room_id;
                        existingCount++;
                    }
                }
                const record = {
                    name,
                    roomNumber,
                    type: r.type || 'Imaging',
                    floor: r.floor || '',
                    status: r.status || 'Active',
                    notes: r.notes || ''
                };
                if (isValid) valid.push({ ...item, payload: record, isExisting, existingId });
                else invalid.push({ ...item, reason });

            } else if (importType === 'machines') {
                const name = r.machinename || r.name || '';
                const type = r.modalitytype || r.type || 'MRI';
                const roomNumber = (r.roomnumber || r.room || '').toUpperCase();
                if (!name || !type) {
                    isValid = false;
                    reason = isArabic ? 'اسم الجهاز ونوع الموداليتي مطلوبان' : 'Machine name and type are required';
                } else {
                    const match = machines.find(m => m.name?.toLowerCase() === name.toLowerCase());
                    if (match) {
                        isExisting = true;
                        existingId = match.modality_id;
                        existingCount++;
                    }
                }
                // Room resolution
                const matchedRoom = rooms.find(rm => rm.room_number?.toUpperCase() === roomNumber);
                const record = {
                    name,
                    type,
                    roomId: matchedRoom?.room_id || undefined,
                    roomNumber: roomNumber || undefined,
                    manufacturer: r.manufacturer || '',
                    model: r.model || '',
                    serialNumber: r.serialnumber || r.serial || '',
                    location: r.location || (matchedRoom?.floor ? `Floor ${matchedRoom.floor}` : ''),
                    status: r.status || 'Active'
                };
                if (isValid) valid.push({ ...item, payload: record, isExisting, existingId });
                else invalid.push({ ...item, reason });

            } else {
                // procedures
                const name = r.procedurename || r.name || '';
                const code = (r.procedurecode || r.code || '').toUpperCase();
                const modalityType = r.modalitytype || r.modality || '';
                const price = Number(r.price || 0);
                const durationMinutes = Number(r.durationminutes || r.duration || 30);

                if (!name) {
                    isValid = false;
                    reason = isArabic ? 'اسم الفحص الطبي مطلوب' : 'Procedure name is required';
                } else {
                    const match = exams.find(e => (code && e.code === code) || e.name?.toLowerCase() === name.toLowerCase());
                    if (match) {
                        isExisting = true;
                        existingId = match.type_id;
                        existingCount++;
                    }
                }

                // Modality resolution
                const matchedMachine = machines.find(m => m.type?.toLowerCase() === modalityType.toLowerCase() || m.name?.toLowerCase().includes(modalityType.toLowerCase()));
                const record = {
                    name,
                    code: code || undefined,
                    modalityId: matchedMachine?.modality_id || (machines[0]?.modality_id || ''),
                    price: isNaN(price) ? 0 : price,
                    durationMinutes: isNaN(durationMinutes) || durationMinutes < 5 ? 30 : durationMinutes,
                    bodyPart: r.bodypart || '',
                    contrastRequired: String(r.contrastrequired || '').toLowerCase().includes('y'),
                    preparationInstructions: r.preparationinstructions || r.preparation || '',
                    isActive: true
                };
                if (isValid) valid.push({ ...item, payload: record, isExisting, existingId });
                else invalid.push({ ...item, reason });
            }
        });

        return { valid, invalid, existingCount };
    }, [parsedRows, importType, rooms, machines, exams, isArabic]);

    // Execute Import
    const handleExecuteImport = async () => {
        const { valid } = validatedData;
        if (valid.length === 0) {
            toast.error(isArabic ? 'لا توجد صفوف صالحة للاستيراد' : 'No valid rows to import');
            return;
        }

        setIsExecuting(true);
        let created = 0;
        let updated = 0;
        let skipped = 0;
        let failed = 0;

        for (let i = 0; i < valid.length; i++) {
            const item = valid[i];
            setProgress(Math.round(((i + 1) / valid.length) * 100));

            try {
                if (item.isExisting) {
                    if (conflictStrategy === 'skip') {
                        skipped++;
                        continue;
                    } else if (conflictStrategy === 'update') {
                        if (importType === 'rooms') {
                            await updateRoom({ id: item.existingId, ...item.payload }).unwrap();
                        } else if (importType === 'machines') {
                            await updateMachine({ id: item.existingId, ...item.payload }).unwrap();
                        } else {
                            await updateExam({ id: item.existingId, ...item.payload }).unwrap();
                        }
                        updated++;
                    }
                } else {
                    if (importType === 'rooms') {
                        await createRoom(item.payload).unwrap();
                    } else if (importType === 'machines') {
                        await createMachine(item.payload).unwrap();
                    } else {
                        await createExam(item.payload).unwrap();
                    }
                    created++;
                }
            } catch (err) {
                failed++;
            }
        }

        setIsExecuting(false);
        toast.success(
            isArabic
                ? `اكتمل الاستيراد: ${created} تم إنشاؤه، ${updated} تم تحديثه، ${skipped} تم تخطيه`
                : `Import complete: ${created} created, ${updated} updated, ${skipped} skipped`
        );
        onSuccess?.();
        onClose();
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={() => { if (!isExecuting) onClose(); }}
            title={isArabic ? 'استيراد البيانات والأصول السريرية (CSV)' : 'Import Clinical Assets (CSV)'}
            size="wide"
            width="max-w-3xl"
        >
            <div className="space-y-5">
                {/* Type Selection */}
                <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                        {isArabic ? 'نوع البيانات المراد استيرادها' : 'Select Entity to Import'}
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                        {[
                            { id: 'rooms', icon: DoorClosed, labelAr: 'الأجنحة والغرف', labelEn: 'Rooms & Suites' },
                            { id: 'machines', icon: Server, labelAr: 'الأجهزة والمعدات', labelEn: 'Equipment' },
                            { id: 'procedures', icon: FileSpreadsheet, labelAr: 'كتالوج الفحوصات', labelEn: 'Procedures' }
                        ].map(t => {
                            const Icon = t.icon;
                            const isSelected = importType === t.id;
                            return (
                                <button
                                    key={t.id}
                                    type="button"
                                    disabled={isExecuting}
                                    onClick={() => handleTypeChange(t.id)}
                                    className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-xs font-bold transition-all ${
                                        isSelected
                                            ? 'border-teal-500 bg-teal-50 text-teal-900 dark:border-teal-400 dark:bg-teal-950/40 dark:text-teal-200 ring-2 ring-teal-500/20'
                                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
                                    }`}
                                >
                                    <Icon size={16} />
                                    <span>{isArabic ? t.labelAr : t.labelEn}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Template Download Banner */}
                <div className="flex items-center justify-between rounded-2xl border border-teal-200/80 bg-teal-50/50 p-4 dark:border-teal-900/60 dark:bg-teal-950/20">
                    <div className="flex items-center gap-3">
                        <FileText size={20} className="text-teal-600 dark:text-teal-400" />
                        <div>
                            <h4 className="text-xs font-black text-teal-950 dark:text-teal-100">
                                {isArabic ? 'هل تحتاج إلى نموذج CSV جاهز؟' : 'Need a formatted CSV template?'}
                            </h4>
                            <p className="text-[11px] text-teal-800 dark:text-teal-300">
                                {isArabic ? 'قم بتنزيل النموذج وتعبئته بالبيانات ثم رفعه هنا مباشرة' : 'Download sample template with verified columns'}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={handleDownloadTemplate}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-teal-300 bg-white px-3 py-2 text-xs font-bold text-teal-800 shadow-sm hover:bg-teal-50 dark:border-teal-800 dark:bg-slate-900 dark:text-teal-200"
                    >
                        <Download size={13} />
                        {isArabic ? 'تنزيل النموذج' : 'Download Template'}
                    </button>
                </div>

                {/* Upload File Box */}
                {!file ? (
                    <label className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-300 bg-slate-50/50 p-8 text-center cursor-pointer transition-all hover:border-teal-500 hover:bg-teal-50/20 dark:border-slate-800 dark:bg-slate-950/40">
                        <Upload size={32} className="text-slate-400" />
                        <span className="mt-3 text-xs font-black text-slate-800 dark:text-slate-200">
                            {isArabic ? 'انقر لاختيار ملف CSV أو قم بسحبه وإفلاته هنا' : 'Click to select or drag and drop a CSV file'}
                        </span>
                        <span className="mt-1 text-[11px] text-slate-400">
                            .csv, .tsv, .txt
                        </span>
                        <input
                            type="file"
                            accept=".csv,.tsv,.txt"
                            onChange={handleFileChange}
                            className="hidden"
                        />
                    </label>
                ) : (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
                            <div className="flex items-center gap-2.5">
                                <FileSpreadsheet size={18} className="text-teal-600" />
                                <div>
                                    <p className="text-xs font-black text-slate-900 dark:text-white">{file.name}</p>
                                    <p className="text-[10px] text-slate-400">{(file.size / 1024).toFixed(1)} KB • {parsedRows.length} {isArabic ? 'صفاً' : 'rows'}</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                disabled={isExecuting}
                                onClick={handleReset}
                                className="text-xs font-bold text-slate-500 hover:text-rose-600"
                            >
                                {isArabic ? 'تغيير الملف' : 'Change File'}
                            </button>
                        </div>

                        {/* Validation Summary */}
                        <div className="grid grid-cols-3 gap-2.5">
                            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-center dark:border-emerald-900 dark:bg-emerald-950/20">
                                <div className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300">{isArabic ? 'صفوف صالحة' : 'Valid Rows'}</div>
                                <div className="mt-1 text-lg font-black text-emerald-800 dark:text-emerald-200">{validatedData.valid.length}</div>
                            </div>

                            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-center dark:border-amber-900 dark:bg-amber-950/20">
                                <div className="text-[10px] font-bold text-amber-700 dark:text-amber-300">{isArabic ? 'سجلات مكررة/موجودة' : 'Existing Matches'}</div>
                                <div className="mt-1 text-lg font-black text-amber-800 dark:text-amber-200">{validatedData.existingCount}</div>
                            </div>

                            <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3 text-center dark:border-rose-900 dark:bg-rose-950/20">
                                <div className="text-[10px] font-bold text-rose-700 dark:text-rose-300">{isArabic ? 'صفوف غير صالحة' : 'Invalid Rows'}</div>
                                <div className="mt-1 text-lg font-black text-rose-800 dark:text-rose-200">{validatedData.invalid.length}</div>
                            </div>
                        </div>

                        {/* Conflict Strategy */}
                        {validatedData.existingCount > 0 && (
                            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/50">
                                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-2">
                                    {isArabic ? 'عند العثور على سجل مكرر أو موجود مسبقاً:' : 'When an existing record is detected:'}
                                </label>
                                <div className="flex items-center gap-4 text-xs font-semibold text-slate-700 dark:text-slate-300">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="conflict"
                                            value="skip"
                                            checked={conflictStrategy === 'skip'}
                                            onChange={() => setConflictStrategy('skip')}
                                        />
                                        {isArabic ? 'تخطي السجل والإبقاء على القديم' : 'Skip existing (keep current)'}
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="conflict"
                                            value="update"
                                            checked={conflictStrategy === 'update'}
                                            onChange={() => setConflictStrategy('update')}
                                        />
                                        {isArabic ? 'تحديث السجل بالبيانات الجديدة (Upsert)' : 'Update existing with new values'}
                                    </label>
                                </div>
                            </div>
                        )}

                        {/* Progress Bar */}
                        {isExecuting && (
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between text-xs font-bold text-slate-600">
                                    <span>{isArabic ? 'جاري الاستيراد والحفظ...' : 'Importing & persisting...'}</span>
                                    <span>{progress}%</span>
                                </div>
                                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                                    <div
                                        className="h-full bg-teal-600 transition-all duration-200"
                                        style={{ width: `${progress}%` }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Footer Buttons */}
                <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <button
                        type="button"
                        disabled={isExecuting}
                        onClick={onClose}
                        className="rounded-xl px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                    >
                        {isArabic ? 'إلغاء' : 'Cancel'}
                    </button>
                    {file && (
                        <button
                            type="button"
                            disabled={isExecuting || validatedData.valid.length === 0}
                            onClick={handleExecuteImport}
                            className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-5 py-2.5 text-xs font-black text-white shadow-md shadow-teal-600/20 hover:bg-teal-700 disabled:opacity-50"
                        >
                            <Upload size={14} />
                            {isExecuting
                                ? (isArabic ? 'جاري الاستيراد...' : 'Importing...')
                                : (isArabic ? `استيراد (${validatedData.valid.length}) سجل` : `Import (${validatedData.valid.length}) Records`)}
                        </button>
                    )}
                </div>
            </div>
        </Modal>
    );
};

export default ClinicalImportDialog;
