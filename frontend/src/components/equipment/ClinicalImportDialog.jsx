import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
    Upload,
    Download,
    FileSpreadsheet,
    FileText,
    CheckCircle2,
    AlertTriangle,
    XCircle,
    DoorClosed,
    Server,
    Layers,
    RefreshCw,
    X,
    Search,
    ChevronDown,
    ChevronUp,
    Info,
    Check,
    ArrowRight,
    Sparkles,
    FileCode
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

// Normalize key for flexible header matching (strips non-alphanumeric, lowercases)
const normalizeKey = (k) => {
    if (!k) return '';
    return String(k)
        .toLowerCase()
        .replace(/[\s\-_]/g, '')
        .trim();
};

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
    const [currentActionItem, setCurrentActionItem] = useState('');
    const [previewFilter, setPreviewFilter] = useState('all'); // all | valid | existing | invalid
    const [previewSearch, setPreviewSearch] = useState('');
    const [showExecutionSummary, setShowExecutionSummary] = useState(false);
    const [executionReport, setExecutionReport] = useState(null);
    const fileInputRef = useRef(null);

    useEffect(() => {
        if (isOpen) {
            setImportType(defaultType);
            handleReset();
        }
    }, [defaultType, isOpen]);

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
        setPreviewFilter('all');
        setPreviewSearch('');
        setShowExecutionSummary(false);
        setExecutionReport(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleTypeChange = (type) => {
        setImportType(type);
        handleReset();
    };

    // Download CSV template
    const handleDownloadTemplate = (format = 'csv') => {
        let filename = '';
        let content = '';
        let mimeType = 'text/csv;charset=utf-8;';

        if (format === 'json') {
            mimeType = 'application/json;charset=utf-8;';
            if (importType === 'rooms') {
                filename = 'template_clinical_rooms.json';
                content = JSON.stringify([
                    {
                        room_name: 'Main 3T MRI Suite',
                        room_number: 'MRI-01',
                        type: 'Imaging',
                        floor: 'Ground Floor',
                        status: 'Active',
                        notes: 'RF Shielded with automated injector'
                    },
                    {
                        room_name: 'CT Scan Room 1',
                        room_number: 'CT-01',
                        type: 'Imaging',
                        floor: 'Ground Floor',
                        status: 'Active',
                        notes: 'Lead-lined 64-slice suite'
                    },
                    {
                        room_name: 'Preparation Bay 1',
                        room_number: 'PREP-01',
                        type: 'Preparation',
                        floor: '1st Floor',
                        status: 'Active',
                        notes: 'IV cannulation and contrast prep'
                    }
                ], null, 2);
            } else if (importType === 'machines') {
                filename = 'template_equipment_fleet.json';
                content = JSON.stringify([
                    {
                        machine_name: 'Siemens Magnetom 3T',
                        modality_type: 'MRI',
                        room_number: 'MRI-01',
                        manufacturer: 'Siemens',
                        model: 'Magnetom Vida',
                        serial_number: 'SN-998877',
                        location: 'Ground Floor',
                        status: 'Active'
                    },
                    {
                        machine_name: 'GE Revolution CT',
                        modality_type: 'CT',
                        room_number: 'CT-01',
                        manufacturer: 'GE Healthcare',
                        model: 'Revolution EVO',
                        serial_number: 'SN-443322',
                        location: 'Ground Floor',
                        status: 'Active'
                    }
                ], null, 2);
            } else {
                filename = 'template_procedures_catalog.json';
                content = JSON.stringify([
                    {
                        procedure_code: 'MRI-BRAIN-C',
                        procedure_name: 'Brain MRI with Contrast',
                        modality_type: 'MRI',
                        duration_minutes: 45,
                        price: 250.00,
                        body_part: 'Brain',
                        contrast_required: true,
                        preparation_instructions: 'Fasting 4 hours before exam. Normal creatinine required.'
                    },
                    {
                        procedure_code: 'CT-CHEST-NC',
                        procedure_name: 'Chest CT Plain',
                        modality_type: 'CT',
                        duration_minutes: 20,
                        price: 120.00,
                        body_part: 'Chest',
                        contrast_required: false,
                        preparation_instructions: 'Wear comfortable clothing without metal fasteners.'
                    }
                ], null, 2);
            }
        } else {
            // CSV with UTF-8 BOM
            if (importType === 'rooms') {
                filename = 'template_clinical_rooms.csv';
                content = '\uFEFF' +
                    'Room Name,Room Number,Type,Floor,Status,Notes\r\n' +
                    'Main 3T MRI Suite,MRI-01,Imaging,Ground Floor,Active,RF Shielded with automated injector\r\n' +
                    'CT Scan Room 1,CT-01,Imaging,Ground Floor,Active,Lead-lined 64-slice suite\r\n' +
                    'Preparation Bay 1,PREP-01,Preparation,1st Floor,Active,IV cannulation and contrast prep\r\n' +
                    'Recovery Room,RECOV-01,Recovery,1st Floor,Active,4 recovery beds with monitoring';
            } else if (importType === 'machines') {
                filename = 'template_equipment_fleet.csv';
                content = '\uFEFF' +
                    'Machine Name,Modality Type,Room Number,Manufacturer,Model,Serial Number,Location,Status\r\n' +
                    'Siemens Magnetom 3T,MRI,MRI-01,Siemens,Magnetom Vida,SN-998877,Ground Floor,Active\r\n' +
                    'GE Revolution CT,CT,CT-01,GE Healthcare,Revolution EVO,SN-443322,Ground Floor,Active\r\n' +
                    'Samsung Ultrasound V8,Ultrasound,PREP-01,Samsung,V8 Premium,SN-112233,1st Floor,Active';
            } else {
                filename = 'template_procedures_catalog.csv';
                content = '\uFEFF' +
                    'Procedure Code,Procedure Name,Modality Type,Duration Minutes,Price,Body Part,Contrast Required,Preparation Instructions\r\n' +
                    'MRI-BRAIN-C,Brain MRI with Contrast,MRI,45,250.00,Brain,Yes,Fasting 4 hours before exam. Normal creatinine required.\r\n' +
                    'CT-CHEST-NC,Chest CT Plain,CT,20,120.00,Chest,No,Wear comfortable clothing without metal fasteners.\r\n' +
                    'US-ABDOMEN,Abdominal Ultrasound,Ultrasound,30,80.00,Abdomen,No,Fasting 6-8 hours prior to scan. Full bladder recommended.';
            }
        }

        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    // Auto-detect delimiter from text
    const detectDelimiter = (firstLine) => {
        const counts = {
            ',': (firstLine.match(/,/g) || []).length,
            ';': (firstLine.match(/;/g) || []).length,
            '\t': (firstLine.match(/\t/g) || []).length,
            '|': (firstLine.match(/\|/g) || []).length
        };
        let best = ',';
        let maxCount = -1;
        Object.entries(counts).forEach(([del, c]) => {
            if (c > maxCount) {
                maxCount = c;
                best = del;
            }
        });
        return maxCount > 0 ? best : ',';
    };

    // CSV line parser supporting quotes and escaped quotes
    const parseCSVText = (rawText) => {
        const text = rawText.replace(/^\uFEFF/, ''); // Strip BOM
        const lines = text.split(/\r\n|\n/).filter(line => line.trim().length > 0);
        if (lines.length < 2) return [];

        const delimiter = detectDelimiter(lines[0]);

        const parseLine = (line) => {
            const result = [];
            let start = 0;
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
                if (line[i] === '"') inQuotes = !inQuotes;
                else if (line[i] === delimiter && !inQuotes) {
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

        const rawHeaders = parseLine(lines[0]);
        const normalizedHeaders = rawHeaders.map(h => normalizeKey(h));
        const rows = [];

        for (let i = 1; i < lines.length; i++) {
            const values = parseLine(lines[i]);
            if (values.every(v => !v)) continue;
            const rowObj = {};
            normalizedHeaders.forEach((h, idx) => {
                if (h) rowObj[h] = values[idx] || '';
            });
            rows.push({ rowIndex: i + 1, data: rowObj, raw: values.join(' | ') });
        }
        return rows;
    };

    // JSON file parser supporting arrays or keyed objects
    const parseJSONText = (text) => {
        const parsed = JSON.parse(text);
        let items = [];
        if (Array.isArray(parsed)) {
            items = parsed;
        } else if (parsed && typeof parsed === 'object') {
            if (Array.isArray(parsed.rooms)) items = parsed.rooms;
            else if (Array.isArray(parsed.machines)) items = parsed.machines;
            else if (Array.isArray(parsed.procedures) || Array.isArray(parsed.exams)) items = parsed.procedures || parsed.exams;
            else if (Array.isArray(parsed.data)) items = parsed.data;
            else items = [parsed];
        }

        return items.map((item, idx) => {
            const normalized = {};
            Object.entries(item).forEach(([k, v]) => {
                normalized[normalizeKey(k)] = v !== null && v !== undefined ? String(v) : '';
            });
            return {
                rowIndex: idx + 1,
                data: normalized,
                raw: JSON.stringify(item)
            };
        });
    };

    const handleFileChange = (e) => {
        const selected = e.target.files?.[0];
        if (!selected) return;

        const isJson = selected.name.toLowerCase().endsWith('.json');
        const isCsv = selected.name.toLowerCase().endsWith('.csv') ||
                      selected.name.toLowerCase().endsWith('.tsv') ||
                      selected.name.toLowerCase().endsWith('.txt');

        if (!isJson && !isCsv) {
            toast.error(isArabic ? 'يرجى تحميل ملف CSV أو JSON صالح' : 'Please select a valid CSV or JSON file');
            return;
        }

        setFile(selected);
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const text = String(event.target?.result || '');
                let parsed = [];
                if (isJson) {
                    parsed = parseJSONText(text);
                } else {
                    parsed = parseCSVText(text);
                }

                setParsedRows(parsed);
                if (parsed.length === 0) {
                    toast.error(isArabic ? 'الملف فارغ أو لا يحتوي على صفوف صالحة' : 'File is empty or contains no data');
                } else {
                    toast.success(isArabic ? `تمت قراءة ${parsed.length} صفاً بنجاح` : `Loaded ${parsed.length} rows`);
                }
            } catch (err) {
                toast.error(isArabic ? 'فشل تحليل الملف. تأكد من صحة التنسيق' : 'Failed to parse file format');
            }
        };
        reader.readAsText(selected);
    };

    // Helper to find value from row with multiple candidate keys (English and Arabic)
    const getVal = (row, ...keys) => {
        for (const k of keys) {
            const norm = normalizeKey(k);
            if (row[norm] !== undefined && row[norm] !== '') {
                return String(row[norm]).trim();
            }
        }
        return '';
    };

    // Validation & Matching Engine
    const validatedData = useMemo(() => {
        if (parsedRows.length === 0) return { valid: [], invalid: [], existingCount: 0, newCount: 0, internalDuplicates: 0 };

        const valid = [];
        const invalid = [];
        let existingCount = 0;
        let newCount = 0;
        let internalDuplicates = 0;

        const seenKeysInFile = new Set();

        parsedRows.forEach(item => {
            const r = item.data;
            let isValid = true;
            let reason = '';
            let isExisting = false;
            let existingId = null;

            if (importType === 'rooms') {
                const name = getVal(r, 'roomname', 'room_name', 'name', 'room', 'اسم الغرفة', 'اسم الجناح', 'الغرفة');
                const roomNumber = getVal(r, 'roomnumber', 'room_number', 'number', 'code', 'رقم الغرفة', 'كود الغرفة', 'رقم الجناح').toUpperCase();
                const type = getVal(r, 'type', 'roomtype', 'room_type', 'النوع', 'نوع الغرفة') || 'Imaging';
                const floor = getVal(r, 'floor', 'الطابق', 'الدور');
                const status = getVal(r, 'status', 'الحالة', 'حالة الغرفة') || 'Active';
                const notes = getVal(r, 'notes', 'note', 'description', 'ملاحظات', 'الوصف');

                if (!name || !roomNumber) {
                    isValid = false;
                    reason = isArabic ? 'اسم الغرفة ورقمها التعريفي مطلوبان' : 'Room name and number are required';
                } else if (seenKeysInFile.has(`room:${roomNumber}`)) {
                    isValid = false;
                    reason = isArabic ? `رقم الغرفة (${roomNumber}) مكرر داخل نفس الملف` : `Room number (${roomNumber}) duplicated in file`;
                    internalDuplicates++;
                } else {
                    seenKeysInFile.add(`room:${roomNumber}`);
                    const match = rooms.find(rm => rm.room_number?.toUpperCase() === roomNumber || rm.name?.toLowerCase() === name.toLowerCase());
                    if (match) {
                        isExisting = true;
                        existingId = match.room_id;
                        existingCount++;
                    } else {
                        newCount++;
                    }
                }

                const payload = {
                    name,
                    roomNumber,
                    type,
                    floor,
                    status,
                    notes
                };

                const displayTitle = name ? `${name} (${roomNumber || '---'})` : (roomNumber || `#${item.rowIndex}`);
                const displaySubtitle = `${type} • ${floor || (isArabic ? 'غير محدد' : 'N/A')}`;

                if (isValid) valid.push({ ...item, payload, isExisting, existingId, displayTitle, displaySubtitle, entityType: 'room' });
                else invalid.push({ ...item, reason, displayTitle: displayTitle || `#${item.rowIndex}`, displaySubtitle: 'Room', entityType: 'room' });

            } else if (importType === 'machines') {
                const name = getVal(r, 'machinename', 'machine_name', 'name', 'machine', 'اسم الجهاز', 'اسم المعدة', 'الجهاز');
                const type = getVal(r, 'modalitytype', 'modality_type', 'modality', 'type', 'نوع الجهاز', 'الموداليتي', 'النوع') || 'MRI';
                const roomNumber = getVal(r, 'roomnumber', 'room_number', 'room', 'رقم الغرفة', 'الغرفة').toUpperCase();
                const manufacturer = getVal(r, 'manufacturer', 'الشركة المصنعة', 'المصنع');
                const model = getVal(r, 'model', 'الموديل', 'طراز');
                const serialNumber = getVal(r, 'serialnumber', 'serial_number', 'serial', 'الرقم التسلسلي', 'سيريال');
                const location = getVal(r, 'location', 'الموقع', 'المكان');
                const status = getVal(r, 'status', 'الحالة') || 'Active';

                if (!name || !type) {
                    isValid = false;
                    reason = isArabic ? 'اسم الجهاز ونوع الموداليتي مطلوبان' : 'Machine name and modality type are required';
                } else if (serialNumber && seenKeysInFile.has(`sn:${serialNumber}`)) {
                    isValid = false;
                    reason = isArabic ? `الرقم التسلسلي (${serialNumber}) مكرر داخل الملف` : `Serial number (${serialNumber}) duplicated in file`;
                    internalDuplicates++;
                } else {
                    if (serialNumber) seenKeysInFile.add(`sn:${serialNumber}`);
                    seenKeysInFile.add(`mname:${name.toLowerCase()}`);

                    const match = machines.find(m =>
                        (serialNumber && m.serial_number && m.serial_number.toLowerCase() === serialNumber.toLowerCase()) ||
                        m.name?.toLowerCase() === name.toLowerCase()
                    );
                    if (match) {
                        isExisting = true;
                        existingId = match.modality_id;
                        existingCount++;
                    } else {
                        newCount++;
                    }
                }

                // Room resolution
                const matchedRoom = rooms.find(rm => rm.room_number?.toUpperCase() === roomNumber || rm.name?.toLowerCase() === roomNumber.toLowerCase());
                const payload = {
                    name,
                    type,
                    roomId: matchedRoom?.room_id || undefined,
                    roomNumber: roomNumber || undefined,
                    manufacturer,
                    model,
                    serialNumber,
                    location: location || (matchedRoom?.floor ? `Floor ${matchedRoom.floor}` : ''),
                    status
                };

                const displayTitle = name ? `${name} [${type}]` : `#${item.rowIndex}`;
                const displaySubtitle = `${manufacturer || ''} ${model || ''} • ${roomNumber ? `${isArabic ? 'غرفة' : 'Room'} ${roomNumber}` : (isArabic ? 'بدون غرفة' : 'Unassigned')}`;

                if (isValid) valid.push({ ...item, payload, isExisting, existingId, displayTitle, displaySubtitle, entityType: 'machine' });
                else invalid.push({ ...item, reason, displayTitle: displayTitle || `#${item.rowIndex}`, displaySubtitle: 'Equipment', entityType: 'machine' });

            } else {
                // procedures
                const name = getVal(r, 'procedurename', 'procedure_name', 'name', 'procedure', 'exam', 'اسم الفحص', 'اسم الإجراء', 'الفحص');
                const code = getVal(r, 'procedurecode', 'procedure_code', 'code', 'كود الفحص', 'رمز الفحص', 'الكود').toUpperCase();
                const modalityType = getVal(r, 'modalitytype', 'modality_type', 'modality', 'type', 'الموداليتي', 'نوع الفحص');
                const rawPrice = getVal(r, 'price', 'cost', 'السعر', 'التكلفة');
                const rawDuration = getVal(r, 'durationminutes', 'duration_minutes', 'duration', 'المدة', 'المدة بالدقائق');
                const bodyPart = getVal(r, 'bodypart', 'body_part', 'عضو الجسم', 'المنطقة');
                const contrastStr = getVal(r, 'contrastrequired', 'contrast_required', 'contrast', 'صبغة', 'هل يتطلب صبغة');
                const prepInstructions = getVal(r, 'preparationinstructions', 'preparation_instructions', 'preparation', 'تعليمات التحضير', 'التحضير');

                const price = Number(rawPrice || 0);
                const durationMinutes = Number(rawDuration || 30);

                if (!name) {
                    isValid = false;
                    reason = isArabic ? 'اسم الفحص الطبي مطلوب' : 'Procedure name is required';
                } else if (code && seenKeysInFile.has(`pcode:${code}`)) {
                    isValid = false;
                    reason = isArabic ? `كود الفحص (${code}) مكرر داخل الملف` : `Procedure code (${code}) duplicated in file`;
                    internalDuplicates++;
                } else {
                    if (code) seenKeysInFile.add(`pcode:${code}`);
                    const match = exams.find(e => (code && e.code === code) || e.name?.toLowerCase() === name.toLowerCase());
                    if (match) {
                        isExisting = true;
                        existingId = match.type_id;
                        existingCount++;
                    } else {
                        newCount++;
                    }
                }

                // Modality resolution
                const matchedMachine = machines.find(m =>
                    (modalityType && m.type?.toLowerCase() === modalityType.toLowerCase()) ||
                    (modalityType && m.name?.toLowerCase().includes(modalityType.toLowerCase()))
                );

                const contrastRequired = ['true', 'yes', '1', 'نعم', 'صحيح', 'y'].includes(contrastStr.toLowerCase());

                const payload = {
                    name,
                    code: code || undefined,
                    modalityId: matchedMachine?.modality_id || (machines[0]?.modality_id || ''),
                    price: isNaN(price) ? 0 : price,
                    durationMinutes: isNaN(durationMinutes) || durationMinutes < 5 ? 30 : durationMinutes,
                    bodyPart,
                    contrastRequired,
                    preparationInstructions: prepInstructions,
                    isActive: true
                };

                const displayTitle = name ? `${name} ${code ? `(${code})` : ''}` : `#${item.rowIndex}`;
                const displaySubtitle = `${modalityType || (isArabic ? 'موداليتي عام' : 'General')} • ${isNaN(durationMinutes) ? 30 : durationMinutes} min • ${isNaN(price) ? 0 : price} EGP`;

                if (isValid) valid.push({ ...item, payload, isExisting, existingId, displayTitle, displaySubtitle, entityType: 'procedure' });
                else invalid.push({ ...item, reason, displayTitle: displayTitle || `#${item.rowIndex}`, displaySubtitle: 'Procedure', entityType: 'procedure' });
            }
        });

        return { valid, invalid, existingCount, newCount, internalDuplicates };
    }, [parsedRows, importType, rooms, machines, exams, isArabic]);

    // Filtered Preview Data
    const filteredPreviewItems = useMemo(() => {
        const { valid, invalid } = validatedData;
        let combined = [
            ...valid.map(v => ({ ...v, status: v.isExisting ? 'existing' : 'new' })),
            ...invalid.map(inv => ({ ...inv, status: 'invalid' }))
        ];

        // Apply Tab Filter
        if (previewFilter === 'valid') combined = combined.filter(item => item.status === 'new');
        else if (previewFilter === 'existing') combined = combined.filter(item => item.status === 'existing');
        else if (previewFilter === 'invalid') combined = combined.filter(item => item.status === 'invalid');

        // Apply Search
        if (previewSearch.trim()) {
            const query = previewSearch.toLowerCase();
            combined = combined.filter(item =>
                item.displayTitle?.toLowerCase().includes(query) ||
                item.displaySubtitle?.toLowerCase().includes(query) ||
                item.reason?.toLowerCase().includes(query) ||
                item.raw?.toLowerCase().includes(query)
            );
        }

        return combined;
    }, [validatedData, previewFilter, previewSearch]);

    // Execute Import Engine
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
        const failedItems = [];

        for (let i = 0; i < valid.length; i++) {
            const item = valid[i];
            setProgress(Math.round(((i + 1) / valid.length) * 100));
            setCurrentActionItem(item.displayTitle || `Row ${item.rowIndex}`);

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
                failedItems.push({
                    title: item.displayTitle,
                    error: err?.data?.message || err?.message || (isArabic ? 'خطأ غير معروف في الخادم' : 'Server error')
                });
            }
        }

        setIsExecuting(false);
        const report = {
            totalProcessed: valid.length,
            created,
            updated,
            skipped,
            failed,
            failedItems,
            invalidCount: validatedData.invalid.length
        };
        setExecutionReport(report);
        setShowExecutionSummary(true);

        const message = isArabic
            ? `اكتمل الاستيراد: ${created} تم إنشاؤه، ${updated} تم تحديثه، ${skipped} تم تخطيه${failed ? `، ${failed} فشل` : ''}`
            : `Import complete: ${created} created, ${updated} updated, ${skipped} skipped${failed ? `, ${failed} failed` : ''}`;

        if (failed > 0) {
            toast.error(message);
        } else {
            toast.success(message);
        }
        onSuccess?.();
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={() => { if (!isExecuting) onClose(); }}
            title={isArabic ? 'استيراد البيانات والأصول السريرية (CSV / JSON)' : 'Import Clinical Assets (CSV / JSON)'}
            size="wide"
            width="max-w-4xl"
        >
            {showExecutionSummary && executionReport ? (
                /* Execution Result Summary View */
                <div className="space-y-5">
                    <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/30">
                        <CheckCircle2 size={24} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <div>
                            <h4 className="text-sm font-black text-emerald-950 dark:text-emerald-100">
                                {isArabic ? 'اكتملت عملية المعالجة والاستيراد بنجاح' : 'Import Processing Completed'}
                            </h4>
                            <p className="text-xs text-emerald-800 dark:text-emerald-300">
                                {isArabic
                                    ? `تمت معالجة ${executionReport.totalProcessed} سجلاً وفقاً لسياسة التعارض المحددة.`
                                    : `Processed ${executionReport.totalProcessed} records with the active conflict strategy.`}
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 text-center dark:border-emerald-900 dark:bg-emerald-950/20">
                            <div className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300">{isArabic ? 'تم إنشاؤه جديداً' : 'Newly Created'}</div>
                            <div className="mt-1 text-xl font-black text-emerald-800 dark:text-emerald-200">{executionReport.created}</div>
                        </div>

                        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3 text-center dark:border-blue-900 dark:bg-blue-950/20">
                            <div className="text-[10px] font-bold text-blue-700 dark:text-blue-300">{isArabic ? 'تم تحديثه (Upsert)' : 'Updated'}</div>
                            <div className="mt-1 text-xl font-black text-blue-800 dark:text-blue-200">{executionReport.updated}</div>
                        </div>

                        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 text-center dark:border-amber-900 dark:bg-amber-950/20">
                            <div className="text-[10px] font-bold text-amber-700 dark:text-amber-300">{isArabic ? 'تم تخطيه (سابق)' : 'Skipped'}</div>
                            <div className="mt-1 text-xl font-black text-amber-800 dark:text-amber-200">{executionReport.skipped}</div>
                        </div>

                        <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3 text-center dark:border-rose-900 dark:bg-rose-950/20">
                            <div className="text-[10px] font-bold text-rose-700 dark:text-rose-300">{isArabic ? 'عمليات فاشلة' : 'Failed'}</div>
                            <div className="mt-1 text-xl font-black text-rose-800 dark:text-rose-200">{executionReport.failed}</div>
                        </div>
                    </div>

                    {executionReport.failedItems?.length > 0 && (
                        <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-3 dark:border-rose-900/60 dark:bg-rose-950/30">
                            <h5 className="text-xs font-bold text-rose-900 dark:text-rose-200 mb-2">
                                {isArabic ? 'تفاصيل السجلات التي تعذر حفظها:' : 'Failed Records Details:'}
                            </h5>
                            <div className="max-h-36 overflow-y-auto space-y-1.5 text-xs text-rose-800 dark:text-rose-300 font-mono">
                                {executionReport.failedItems.map((fi, idx) => (
                                    <div key={idx} className="flex items-center justify-between bg-white/60 dark:bg-slate-900/60 p-2 rounded-lg">
                                        <span className="font-bold">{fi.title}</span>
                                        <span className="text-[11px] text-rose-600 dark:text-rose-400">{fi.error}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                        <button
                            type="button"
                            onClick={() => {
                                setShowExecutionSummary(false);
                                handleReset();
                            }}
                            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                        >
                            {isArabic ? 'استيراد ملف آخر' : 'Import Another File'}
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-xl bg-teal-600 px-5 py-2 text-xs font-black text-white hover:bg-teal-700 shadow-md"
                        >
                            {isArabic ? 'إغلاق ومتابعة' : 'Done & Close'}
                        </button>
                    </div>
                </div>
            ) : (
                /* Primary Upload & Preview View */
                <div className="space-y-4">
                    {/* Entity Type Selector */}
                    <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
                            {isArabic ? 'اختر نوع السجلات المراد استيرادها' : 'Select Entity to Import'}
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                            {[
                                { id: 'rooms', icon: DoorClosed, labelAr: 'الأجنحة والغرف', labelEn: 'Rooms & Suites' },
                                { id: 'machines', icon: Server, labelAr: 'الأجهزة والمعدات', labelEn: 'Equipment Fleet' },
                                { id: 'procedures', icon: FileSpreadsheet, labelAr: 'كتالوج الفحوصات', labelEn: 'Procedures Catalog' }
                            ].map(tItem => {
                                const Icon = tItem.icon;
                                const isSelected = importType === tItem.id;
                                return (
                                    <button
                                        key={tItem.id}
                                        type="button"
                                        disabled={isExecuting}
                                        onClick={() => handleTypeChange(tItem.id)}
                                        className={`flex items-center justify-center gap-2 rounded-xl border p-2.5 text-xs font-bold transition-all ${
                                            isSelected
                                                ? 'border-teal-500 bg-teal-50 text-teal-900 dark:border-teal-400 dark:bg-teal-950/40 dark:text-teal-200 ring-2 ring-teal-500/20'
                                                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
                                        }`}
                                    >
                                        <Icon size={16} />
                                        <span>{isArabic ? tItem.labelAr : tItem.labelEn}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Template Download Ribbon */}
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-teal-200/80 bg-teal-50/50 p-3.5 dark:border-teal-900/60 dark:bg-teal-950/20">
                        <div className="flex items-center gap-3">
                            <Sparkles size={18} className="text-teal-600 dark:text-teal-400 shrink-0" />
                            <div>
                                <h4 className="text-xs font-black text-teal-950 dark:text-teal-100">
                                    {isArabic ? 'قوالب ونماذج بيانات جاهزة للاستيراد' : 'Download Sample Verified Templates'}
                                </h4>
                                <p className="text-[11px] text-teal-800 dark:text-teal-300">
                                    {isArabic ? 'متوافقة 100% مع ترميز UTF-8 ومطابقة تلقائية للأعمدة باللغتين العربية والإنجليزية' : '100% UTF-8 compatible with auto bilingual column mapping'}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => handleDownloadTemplate('csv')}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-teal-300 bg-white px-2.5 py-1.5 text-xs font-bold text-teal-800 shadow-sm hover:bg-teal-50 dark:border-teal-800 dark:bg-slate-900 dark:text-teal-200"
                            >
                                <Download size={13} />
                                <span>CSV (Excel)</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => handleDownloadTemplate('json')}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-teal-300 bg-white px-2.5 py-1.5 text-xs font-bold text-teal-800 shadow-sm hover:bg-teal-50 dark:border-teal-800 dark:bg-slate-900 dark:text-teal-200"
                            >
                                <FileCode size={13} />
                                <span>JSON</span>
                            </button>
                        </div>
                    </div>

                    {/* Upload File Drag & Drop Box */}
                    {!file ? (
                        <label className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-300 bg-slate-50/50 p-8 text-center cursor-pointer transition-all hover:border-teal-500 hover:bg-teal-50/20 dark:border-slate-800 dark:bg-slate-950/40">
                            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-100 text-teal-600 dark:bg-teal-900/40 dark:text-teal-400">
                                <Upload size={22} />
                            </div>
                            <span className="mt-3 text-xs font-black text-slate-800 dark:text-slate-200">
                                {isArabic ? 'انقر لاختيار ملف البيانات أو قم بسحبه وإفلاته هنا' : 'Click to select or drag and drop a data file'}
                            </span>
                            <span className="mt-1 text-[11px] text-slate-400">
                                CSV, TSV, TXT, JSON (UTF-8)
                            </span>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".csv,.tsv,.txt,.json"
                                onChange={handleFileChange}
                                className="hidden"
                            />
                        </label>
                    ) : (
                        <div className="space-y-4">
                            {/* File Info Bar */}
                            <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                                <div className="flex items-center gap-2.5">
                                    <FileSpreadsheet size={20} className="text-teal-600 dark:text-teal-400" />
                                    <div>
                                        <p className="text-xs font-black text-slate-900 dark:text-white">{file.name}</p>
                                        <p className="text-[10px] text-slate-400">
                                            {(file.size / 1024).toFixed(1)} KB • {parsedRows.length} {isArabic ? 'إجمالي الصفوف' : 'total rows'}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    disabled={isExecuting}
                                    onClick={handleReset}
                                    className="inline-flex items-center gap-1 rounded-xl px-2.5 py-1 text-xs font-bold text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30"
                                >
                                    <RefreshCw size={12} />
                                    {isArabic ? 'تغيير الملف' : 'Change File'}
                                </button>
                            </div>

                            {/* Validation Metric Badges */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                <button
                                    type="button"
                                    onClick={() => setPreviewFilter('valid')}
                                    className={`rounded-xl border p-2.5 text-center transition-all ${
                                        previewFilter === 'valid'
                                            ? 'border-emerald-500 bg-emerald-100/70 ring-2 ring-emerald-500/20 dark:bg-emerald-950/60'
                                            : 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/20'
                                    }`}
                                >
                                    <div className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                                        {isArabic ? 'صفوف جديدة صالحة' : 'Valid New'}
                                    </div>
                                    <div className="mt-1 text-lg font-black text-emerald-800 dark:text-emerald-200">
                                        {validatedData.newCount}
                                    </div>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setPreviewFilter('existing')}
                                    className={`rounded-xl border p-2.5 text-center transition-all ${
                                        previewFilter === 'existing'
                                            ? 'border-amber-500 bg-amber-100/70 ring-2 ring-amber-500/20 dark:bg-amber-950/60'
                                            : 'border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/20'
                                    }`}
                                >
                                    <div className="text-[10px] font-bold text-amber-700 dark:text-amber-300">
                                        {isArabic ? 'سجلات موجودة مسبقاً' : 'Existing Matches'}
                                    </div>
                                    <div className="mt-1 text-lg font-black text-amber-800 dark:text-amber-200">
                                        {validatedData.existingCount}
                                    </div>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setPreviewFilter('invalid')}
                                    className={`rounded-xl border p-2.5 text-center transition-all ${
                                        previewFilter === 'invalid'
                                            ? 'border-rose-500 bg-rose-100/70 ring-2 ring-rose-500/20 dark:bg-rose-950/60'
                                            : 'border-rose-200 bg-rose-50/60 dark:border-rose-900 dark:bg-rose-950/20'
                                    }`}
                                >
                                    <div className="text-[10px] font-bold text-rose-700 dark:text-rose-300">
                                        {isArabic ? 'صفوف غير صالحة' : 'Invalid Rows'}
                                    </div>
                                    <div className="mt-1 text-lg font-black text-rose-800 dark:text-rose-200">
                                        {validatedData.invalid.length}
                                    </div>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setPreviewFilter('all')}
                                    className={`rounded-xl border p-2.5 text-center transition-all ${
                                        previewFilter === 'all'
                                            ? 'border-slate-500 bg-slate-100 ring-2 ring-slate-500/20 dark:bg-slate-800'
                                            : 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900'
                                    }`}
                                >
                                    <div className="text-[10px] font-bold text-slate-700 dark:text-slate-300">
                                        {isArabic ? 'كل الصفوف' : 'Total Rows'}
                                    </div>
                                    <div className="mt-1 text-lg font-black text-slate-800 dark:text-slate-200">
                                        {parsedRows.length}
                                    </div>
                                </button>
                            </div>

                            {/* Conflict Handling Strategy */}
                            {validatedData.existingCount > 0 && (
                                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-950/50">
                                    <div className="flex items-center gap-2 mb-2">
                                        <Info size={14} className="text-teal-600 dark:text-teal-400" />
                                        <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                            {isArabic ? 'سياسة التعامل مع السجلات الموجودة مسبقاً في النظام:' : 'Duplicate & Conflict Strategy:'}
                                        </label>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                                        <label className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all ${
                                            conflictStrategy === 'skip'
                                                ? 'border-teal-500 bg-teal-50/70 text-teal-950 dark:border-teal-500 dark:bg-teal-950/30 dark:text-teal-200'
                                                : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
                                        }`}>
                                            <input
                                                type="radio"
                                                name="conflict"
                                                value="skip"
                                                checked={conflictStrategy === 'skip'}
                                                onChange={() => setConflictStrategy('skip')}
                                                className="mt-0.5 text-teal-600 focus:ring-teal-500"
                                            />
                                            <div>
                                                <div className="font-bold">{isArabic ? 'تخطي السجلات الموجودة' : 'Skip Existing Records'}</div>
                                                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                                    {isArabic ? 'استيراد السجلات الجديدة فقط والحفاظ على السجلات الحالية كما هي' : 'Only import new records, preserve existing data intact'}
                                                </div>
                                            </div>
                                        </label>

                                        <label className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all ${
                                            conflictStrategy === 'update'
                                                ? 'border-teal-500 bg-teal-50/70 text-teal-950 dark:border-teal-500 dark:bg-teal-950/30 dark:text-teal-200'
                                                : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
                                        }`}>
                                            <input
                                                type="radio"
                                                name="conflict"
                                                value="update"
                                                checked={conflictStrategy === 'update'}
                                                onChange={() => setConflictStrategy('update')}
                                                className="mt-0.5 text-teal-600 focus:ring-teal-500"
                                            />
                                            <div>
                                                <div className="font-bold">{isArabic ? 'تحديث وتعديل (Upsert)' : 'Update & Overwrite (Upsert)'}</div>
                                                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                                    {isArabic ? 'تحديث السجلات الموجودة بالقيم والبيانات الجديدة الواردة بالملف' : 'Overwrite existing matched records with new file values'}
                                                </div>
                                            </div>
                                        </label>
                                    </div>
                                </div>
                            )}

                            {/* Data Preview & Diagnostics Table */}
                            <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
                                <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50/60 dark:bg-slate-950/40 border-b border-slate-100 dark:border-slate-800">
                                    <div className="flex items-center gap-2">
                                        <h5 className="text-xs font-black text-slate-800 dark:text-slate-200">
                                            {isArabic ? 'معاينة وتشخيص السجلات قبل الاستيراد' : 'Pre-Import Diagnostics & Preview'}
                                        </h5>
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                            {filteredPreviewItems.length}
                                        </span>
                                    </div>
                                    <div className="relative w-48">
                                        <Search size={12} className="absolute inset-y-0 start-2.5 my-auto text-slate-400" />
                                        <input
                                            type="text"
                                            value={previewSearch}
                                            onChange={e => setPreviewSearch(e.target.value)}
                                            placeholder={isArabic ? 'بحث في المعاينة...' : 'Search preview...'}
                                            aria-label={isArabic ? 'بحث في المعاينة' : 'Search preview'}
                                            className="w-full rounded-lg border border-slate-200 bg-white py-1 ps-7 pe-2 text-xs text-slate-800 placeholder-slate-400 focus:border-teal-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                                        />
                                    </div>
                                </div>

                                <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
                                    {filteredPreviewItems.length === 0 ? (
                                        <div className="p-6 text-center text-xs text-slate-400">
                                            {isArabic ? 'لا توجد صفوف تطابق عامل التصفية المحدد' : 'No rows match the selected filter'}
                                        </div>
                                    ) : (
                                        filteredPreviewItems.map((item, idx) => (
                                            <div key={idx} className="flex items-center justify-between p-2.5 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <span className="text-[10px] font-mono font-bold text-slate-400 w-6 text-center">
                                                        #{item.rowIndex}
                                                    </span>
                                                    <div className="min-w-0">
                                                        <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                                            {item.displayTitle}
                                                        </div>
                                                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                                            {item.displaySubtitle}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="shrink-0 ms-2">
                                                    {item.status === 'new' && (
                                                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-black text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300">
                                                            <CheckCircle2 size={11} />
                                                            {isArabic ? 'جديد صالح' : 'Valid New'}
                                                        </span>
                                                    )}
                                                    {item.status === 'existing' && (
                                                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-black text-amber-800 dark:bg-amber-950/80 dark:text-amber-300">
                                                            <RefreshCw size={11} />
                                                            {isArabic ? (conflictStrategy === 'update' ? 'سيتم التحديث' : 'سيتم التخطي') : (conflictStrategy === 'update' ? 'Will Upsert' : 'Will Skip')}
                                                        </span>
                                                    )}
                                                    {item.status === 'invalid' && (
                                                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-[10px] font-black text-rose-800 dark:bg-rose-950/80 dark:text-rose-300" title={item.reason}>
                                                            <XCircle size={11} />
                                                            <span>{item.reason}</span>
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Execution Progress Bar */}
                            {isExecuting && (
                                <div className="space-y-2 rounded-2xl border border-teal-200 bg-teal-50/60 p-3.5 dark:border-teal-900/60 dark:bg-teal-950/30">
                                    <div className="flex items-center justify-between text-xs font-bold text-teal-900 dark:text-teal-200">
                                        <span className="inline-flex items-center gap-1.5">
                                            <RefreshCw size={13} className="animate-spin text-teal-600" />
                                            {isArabic ? `جاري حفظ السجلات: ${currentActionItem}` : `Importing: ${currentActionItem}`}
                                        </span>
                                        <span className="font-mono">{progress}%</span>
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

                    {/* Action Footer Buttons */}
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
            )}
        </Modal>
    );
};

export default ClinicalImportDialog;
