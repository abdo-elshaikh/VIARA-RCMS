import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
    AlertTriangle,
    CheckCircle2,
    Download,
    FileSpreadsheet,
    FileText,
    Microscope,
    Server,
    Upload,
    X,
    XCircle
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { machineTypes } from './MachineManagement';

const ClinicalImportModal = ({
    isOpen,
    onClose,
    targetType: initialTargetType = 'exams', // 'machines' or 'exams'
    machines = [],
    exams = [],
    onImportMachines,
    onUpdateMachine,
    onImportExams,
    onUpdateExam,
    isImporting = false
}) => {
    const { t } = useTranslation('settings');
    const [targetType, setTargetType] = useState(initialTargetType);
    const [file, setFile] = useState(null);
    const [rawRows, setRawRows] = useState([]);
    const [duplicateStrategy, setDuplicateStrategy] = useState('skip'); // 'skip' | 'replace' | 'replaceAll'
    const [importFinished, setImportFinished] = useState(false);
    const [importedSummary, setImportedSummary] = useState(null);

    useEffect(() => {
        if (initialTargetType) {
            setTargetType(initialTargetType);
        }
    }, [initialTargetType]);

    // Reset state when closing/opening
    const handleClose = () => {
        setFile(null);
        setRawRows([]);
        setDuplicateStrategy('skip');
        setImportFinished(false);
        setImportedSummary(null);
        onClose();
    };

    const handleSwitchTarget = (type) => {
        setTargetType(type);
        setFile(null);
        setRawRows([]);
        setImportFinished(false);
        setImportedSummary(null);
    };

    // Parse CSV / TSV file content safely with automatic delimiter detection
    const parseCSVText = (text) => {
        const lines = text.split(/\r\n|\n/).filter(line => line.trim().length > 0);
        if (lines.length === 0) return [];

        const firstLine = lines[0];
        let delimiter = ',';
        if (firstLine.includes('\t')) delimiter = '\t';
        else if (firstLine.includes(';') && !firstLine.includes(',')) delimiter = ';';

        const parseLine = (line) => {
            if (delimiter === '\t') {
                return line.split('\t').map(field => {
                    let f = field.trim();
                    if (f.startsWith('"') && f.endsWith('"')) {
                        f = f.slice(1, -1).replace(/""/g, '"');
                    }
                    return f;
                });
            }

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

        const headers = parseLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
        const rows = [];

        for (let i = 1; i < lines.length; i++) {
            const values = parseLine(lines[i]);
            if (values.every(v => !v)) continue;
            const rowObj = {};
            headers.forEach((header, idx) => {
                rowObj[header] = values[idx] || '';
            });
            rows.push({ rowIndex: i + 1, raw: rowObj });
        }
        return rows;
    };

    // File selection handler
    const handleFileChange = (e) => {
        const selectedFile = e.target.files?.[0];
        if (!selectedFile) return;

        const lowerName = selectedFile.name.toLowerCase();
        const isDelimited = lowerName.endsWith('.csv') || lowerName.endsWith('.tsv') || lowerName.endsWith('.txt');

        if (!isDelimited) {
            toast.error(t('settings.clinical.importModal.unsupportedFormat', { defaultValue: 'Unsupported file format. Please upload a .csv or .tsv file.' }));
            return;
        }

        setFile(selectedFile);

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const text = event.target?.result || '';
                const parsed = parseCSVText(String(text));
                setRawRows(parsed);
                if (parsed.length === 0) {
                    toast.error(t('settings.clinical.importModal.emptyFile', { defaultValue: 'The selected file contains no readable data rows.' }));
                } else {
                    toast.success(t('settings.clinical.importModal.loadedRows', {
                        defaultValue: `Loaded ${parsed.length} rows for verification.`,
                        count: parsed.length
                    }));
                }
            } catch {
                toast.error(t('settings.clinical.importModal.parseError', { defaultValue: 'Failed to parse spreadsheet file.' }));
            }
        };
        reader.readAsText(selectedFile);
    };

    // Pre-Upload Format Validation & Duplicate Check logic
    const validationResults = useMemo(() => {
        if (rawRows.length === 0) return { validRows: [], invalidRows: [], duplicateCount: 0, newCount: 0 };

        const validRows = [];
        const invalidRows = [];

        const machineMapByName = new Map();
        machines.forEach(m => {
            const id = m.modality_id || m.id;
            if (m.name) {
                machineMapByName.set(m.name.toLowerCase().trim(), id);
                machineMapByName.set(m.name.toLowerCase().replace(/[^a-z0-9]/g, ''), id);
            }
            if (id) machineMapByName.set(String(id).toLowerCase().trim(), id);
            if (m.type) machineMapByName.set(m.type.toLowerCase().trim(), id);
        });

        const examMapByCodeOrName = new Map();
        exams.forEach(e => {
            const id = e.type_id || e.id;
            if (e.code) examMapByCodeOrName.set(e.code.toLowerCase().trim(), id);
            if (e.name) examMapByCodeOrName.set(e.name.toLowerCase().trim(), id);
        });

        rawRows.forEach(({ rowIndex, raw }) => {
            const errors = [];

            if (targetType === 'machines') {
                const name = raw.machinename || raw.name || raw.title || raw.modalityname || '';
                const type = raw.modalityclass || raw.type || raw.modalitytype || 'MRI';
                const roomNumber = raw.roomnumber || raw.room || '';
                const serialNumber = raw.serialnumber || raw.serial || '';
                const manufacturer = raw.manufacturer || raw.make || '';
                const model = raw.model || '';
                const location = raw.facilitylocation || raw.location || '';
                const status = raw.status || 'Active';

                if (!name.trim()) errors.push(t('settings.clinical.importModal.missingMachineName', { defaultValue: 'Missing required Machine Name' }));
                if (type && !machineTypes.map(tStr => tStr.toLowerCase()).includes(type.toLowerCase())) {
                    errors.push(t('settings.clinical.importModal.unrecognizedClass', {
                        defaultValue: `Unrecognized Modality Class "${type}". Standard: ${machineTypes.join(', ')}`,
                        type
                    }));
                }

                // Duplicate machine check
                const matchedModalityId = machineMapByName.get(name.trim().toLowerCase());
                const isDuplicate = Boolean(matchedModalityId);

                if (errors.length === 0) {
                    validRows.push({
                        rowIndex,
                        isDuplicate,
                        existingId: matchedModalityId || null,
                        data: {
                            name: name.trim(),
                            type: type.trim(),
                            roomNumber: roomNumber.trim() || undefined,
                            serialNumber: serialNumber.trim() || undefined,
                            manufacturer: manufacturer.trim() || undefined,
                            model: model.trim() || undefined,
                            location: location.trim() || undefined,
                            status
                        }
                    });
                } else {
                    invalidRows.push({ rowIndex, raw, errors });
                }
            } else {
                const code = raw.procedurecode || raw.code || raw.cptcode || raw.cpt || raw.itemcode || '';
                const name = raw.procedurename || raw.name || raw.title || raw.procedure || raw.examname || raw.proceduretitle || '';
                
                const rawPrice = String(raw.price || raw.cost || raw.fee || raw.rate || raw.amount || '0').replace(/[^0-9.]/g, '');
                const priceNum = parseFloat(rawPrice || '0');

                const rawDuration = String(raw.durationminutes || raw.duration || raw.minutes || raw.time || '30').replace(/[^0-9]/g, '');
                const durationNum = parseInt(rawDuration || '30', 10);

                const bodyPart = raw.bodypart || raw.anatomy || raw.anatomybodypart || raw.region || raw.site || '';
                const prep = raw.preparationinstructions || raw.preparation || raw.instructions || raw.prep || raw.prepinstructions || '';
                const contrastStr = String(raw.contrastrequired || raw.contrast || raw.contrastagent || '').toLowerCase();
                const contrastRequired = ['true', 'yes', '1', 'contrast', 'optional'].includes(contrastStr);

                const machineRef = raw.modalitymachine || raw.machine || raw.modalityname || raw.modalityid || raw.equipment || '';
                let matchedModalityId = machineMapByName.get(machineRef.toLowerCase().trim())
                    || machineMapByName.get(machineRef.toLowerCase().replace(/[^a-z0-9]/g, ''));

                if (!matchedModalityId && machineRef) {
                    const found = machines.find(m =>
                        m.name && (machineRef.toLowerCase().includes(m.name.toLowerCase()) || m.name.toLowerCase().includes(machineRef.toLowerCase()))
                    );
                    if (found) matchedModalityId = found.modality_id || found.id;
                }

                if (!matchedModalityId && machines.length > 0) {
                    matchedModalityId = machines[0].modality_id || machines[0].id;
                }

                if (!name.trim()) errors.push(t('settings.clinical.importModal.missingExamName', { defaultValue: 'Missing required Procedure Name' }));
                if (isNaN(priceNum) || priceNum < 0) errors.push(t('settings.clinical.importModal.invalidPrice', { defaultValue: 'Invalid price. Must be a non-negative number.' }));
                if (isNaN(durationNum) || durationNum < 1) errors.push(t('settings.clinical.importModal.invalidDuration', { defaultValue: 'Invalid duration. Must be at least 1 minute.' }));
                if (!matchedModalityId) errors.push(t('settings.clinical.importModal.machineNotFound', { defaultValue: `No machine matching "${machineRef}" found in system registry.`, machine: machineRef }));

                // Duplicate procedure check by code or name
                let matchedTypeId = null;
                if (code.trim()) matchedTypeId = examMapByCodeOrName.get(code.trim().toLowerCase());
                if (!matchedTypeId && name.trim()) matchedTypeId = examMapByCodeOrName.get(name.trim().toLowerCase());
                const isDuplicate = Boolean(matchedTypeId);

                if (errors.length === 0) {
                    validRows.push({
                        rowIndex,
                        isDuplicate,
                        existingId: matchedTypeId || null,
                        data: {
                            modalityId: matchedModalityId,
                            code: code.trim() ? code.trim().toUpperCase() : undefined,
                            name: name.trim(),
                            price: priceNum,
                            durationMinutes: durationNum,
                            bodyPart: bodyPart.trim() || undefined,
                            preparationInstructions: prep.trim() || undefined,
                            contrastRequired,
                            isActive: true
                        }
                    });
                } else {
                    invalidRows.push({ rowIndex, raw, errors });
                }
            }
        });

        const duplicateCount = validRows.filter(r => r.isDuplicate).length;
        const newCount = validRows.filter(r => !r.isDuplicate).length;

        return {
            validRows,
            invalidRows,
            duplicateCount,
            newCount
        };
    }, [rawRows, targetType, machines, exams, t]);

    const handleExecuteImport = async () => {
        if (validationResults.validRows.length === 0) {
            toast.error(t('settings.clinical.importModal.noValidRows', { defaultValue: 'No valid rows available to import.' }));
            return;
        }

        try {
            let successCount = 0;
            let replacedCount = 0;
            let skippedCount = 0;
            let failCount = 0;
            const failureDetails = [];

            const rowsToProcess = validationResults.validRows;

            for (const item of rowsToProcess) {
                if (item.isDuplicate) {
                    if (duplicateStrategy === 'skip') {
                        skippedCount++;
                        continue;
                    }

                    // Perform Overwrite / Replace update
                    if (targetType === 'machines' && onUpdateMachine && item.existingId) {
                        try {
                            await onUpdateMachine(item.existingId, item.data);
                            replacedCount++;
                        } catch (err) {
                            failCount++;
                            failureDetails.push(`${item.data.name}: ${err?.data?.message || err?.message || 'Update failed'}`);
                        }
                    } else if (targetType === 'exams' && onUpdateExam && item.existingId) {
                        try {
                            await onUpdateExam(item.existingId, item.data);
                            replacedCount++;
                        } catch (err) {
                            failCount++;
                            failureDetails.push(`${item.data.name}: ${err?.data?.message || err?.message || 'Update failed'}`);
                        }
                    } else {
                        try {
                            if (targetType === 'machines') await onImportMachines(item.data);
                            else await onImportExams(item.data);
                            successCount++;
                        } catch (err) {
                            failCount++;
                            failureDetails.push(`${item.data.name}: ${err?.data?.message || err?.message || 'Import failed'}`);
                        }
                    }
                } else {
                    // New Record
                    try {
                        if (targetType === 'machines') await onImportMachines(item.data);
                        else await onImportExams(item.data);
                        successCount++;
                    } catch (err) {
                        failCount++;
                        failureDetails.push(`${item.data.name}: ${err?.data?.message || err?.message || 'Import failed'}`);
                    }
                }
            }

            setImportedSummary({
                total: rowsToProcess.length,
                success: successCount,
                replaced: replacedCount,
                skipped: skippedCount,
                failed: failCount,
                failureDetails
            });
            setImportFinished(true);
            if (failCount === 0) {
                toast.success(t('settings.clinical.importModal.importSuccess', {
                    defaultValue: `Import completed! Added ${successCount} new, updated ${replacedCount}, skipped ${skippedCount}.`,
                    newCount: successCount,
                    updatedCount: replacedCount,
                    skippedCount
                }));
            } else {
                toast.error(`Import finished with ${failCount} errors. ${successCount} added, ${replacedCount} updated.`);
            }
        } catch {
            toast.error(t('settings.clinical.importModal.importFailed', { defaultValue: 'An error occurred during bulk import execution.' }));
        }
    };

    // Template download handler
    const downloadCSVTemplate = () => {
        let csvContent = '';
        let fileName = '';

        if (targetType === 'machines') {
            csvContent = "\uFEFFMachine Name,Modality Class,Room Number,Serial Number,Manufacturer,Model,Facility Location,Status\n" +
                "MRI 3T Unit 1,MRI,Room 101,SN-928374-X,Siemens,Magnetom Vida,Ground Floor East,Active\n" +
                "CT Scanner 128,CT,Room 102,SN-448291-Y,GE Healthcare,Revolution CT,Ground Floor West,Active\n" +
                "Digital X-Ray Room,X-Ray,Room 103,SN-332918-Z,Philips,DigitalDiagnost,1st Floor,Active";
            fileName = "VIARA_machines_import_template.csv";
        } else {
            csvContent = "\uFEFFProcedure Code,Procedure Name,Modality Machine,Price,Duration Minutes,Body Part,Contrast Required,Preparation Instructions\n" +
                "MRI-BRAIN-C,Brain MRI with Contrast,MRI 3T Unit 1,1200.00,45,Brain,Yes,Fast for 4 hours prior\n" +
                "CT-CHEST-NC,Chest CT Non-Contrast,CT Scanner 128,850.00,20,Chest,No,No special preparation required\n" +
                "XRAY-CHEST-PA,Chest X-Ray PA View,Digital X-Ray Room,250.00,10,Chest,No,Remove metal jewelry";
            fileName = "VIARA_procedures_import_template.csv";
        }

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="flex w-full max-w-2xl max-h-[90vh] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
                {/* Modal Header */}
                <header className="shrink-0 flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800">
                    <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300">
                            {targetType === 'machines' ? <Server size={18} /> : <Microscope size={18} />}
                        </span>
                        <div>
                            <h3 className="text-base font-black text-slate-950 dark:text-white">
                                {targetType === 'machines'
                                    ? t('settings.clinical.importModal.titleMachines', { defaultValue: 'Bulk Import Modality Units' })
                                    : t('settings.clinical.importModal.titleExams', { defaultValue: 'Bulk Import Procedure Catalog' })}
                            </h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                {t('settings.clinical.importModal.subtitle', { defaultValue: 'Upload CSV/TSV spreadsheet export with duplicate checking.' })}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={handleClose}
                        className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    >
                        <X size={18} />
                    </button>
                </header>

                {/* Target Type Selector Switch */}
                {!importFinished && (
                    <div className="shrink-0 flex border-b border-slate-100 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-950/40 px-6 pt-2">
                        <button
                            type="button"
                            onClick={() => handleSwitchTarget('machines')}
                            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition-all ${
                                targetType === 'machines'
                                    ? 'border-teal-600 text-teal-700 dark:text-teal-300 bg-white dark:bg-slate-900 rounded-t-xl shadow-2xs'
                                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                            }`}
                        >
                            <Server size={14} />
                            <span>{t('settings.clinical.importModal.tabMachines', { defaultValue: 'Modality Units (Machines)' })}</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => handleSwitchTarget('exams')}
                            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-bold transition-all ${
                                targetType === 'exams'
                                    ? 'border-teal-600 text-teal-700 dark:text-teal-300 bg-white dark:bg-slate-900 rounded-t-xl shadow-2xs'
                                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                            }`}
                        >
                            <Microscope size={14} />
                            <span>{t('settings.clinical.importModal.tabExams', { defaultValue: 'Procedure Catalog' })}</span>
                        </button>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto p-6 space-y-5">
                    {importFinished ? (
                        /* Import Result Summary */
                        <div className="text-center space-y-4 py-4">
                            <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
                                <CheckCircle2 size={32} />
                            </span>
                            <div>
                                <h4 className="text-lg font-black text-slate-950 dark:text-white">
                                    {t('settings.clinical.importModal.finishedTitle', { defaultValue: 'Bulk Import Finished' })}
                                </h4>
                                <p className="text-xs text-slate-500">
                                    {t('settings.clinical.importModal.finishedDesc', { defaultValue: 'Processed records have been synchronized into the system registry.' })}
                                </p>
                            </div>

                            <div className="grid grid-cols-4 gap-2.5 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-center dark:border-slate-800 dark:bg-slate-950/50">
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                        {t('settings.clinical.importModal.totalRows', { defaultValue: 'Total Rows' })}
                                    </p>
                                    <p className="text-lg font-black text-slate-900 dark:text-white">{importedSummary?.total}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                                        {t('settings.clinical.importModal.newAdded', { defaultValue: 'New Added' })}
                                    </p>
                                    <p className="text-lg font-black text-emerald-600 dark:text-emerald-400">{importedSummary?.success}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400">
                                        {t('settings.clinical.importModal.overwritten', { defaultValue: 'Overwritten' })}
                                    </p>
                                    <p className="text-lg font-black text-teal-600 dark:text-teal-400">{importedSummary?.replaced}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                                        {t('settings.clinical.importModal.skipped', { defaultValue: 'Skipped' })}
                                    </p>
                                    <p className="text-lg font-black text-amber-600 dark:text-amber-400">{importedSummary?.skipped}</p>
                                </div>
                            </div>

                            {importedSummary?.failed > 0 && importedSummary?.failureDetails?.length > 0 && (
                                <div className="max-h-36 overflow-y-auto rounded-xl border border-rose-200 bg-rose-50/40 p-3 space-y-1 text-xs text-start dark:border-rose-900/50 dark:bg-rose-950/20">
                                    <p className="font-bold text-rose-700 dark:text-rose-400 text-[11px] uppercase tracking-wider">
                                        {t('settings.clinical.importModal.failedListTitle', {
                                            defaultValue: `Failed to import ${importedSummary.failed} record(s):`,
                                            count: importedSummary.failed
                                        })}
                                    </p>
                                    {importedSummary.failureDetails.map((errText, i) => (
                                        <div key={i} className="flex items-start gap-1.5 text-rose-800 dark:text-rose-300 text-[11px]">
                                            <XCircle size={13} className="mt-0.5 shrink-0 text-rose-500" />
                                            <span>{errText}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        <>
                            {/* Template Instructions Banner */}
                            <div className="flex items-start justify-between gap-3 rounded-2xl border border-teal-100 bg-teal-50/60 p-4 dark:border-teal-900/50 dark:bg-teal-950/30">
                                <div className="flex items-start gap-3">
                                    <FileSpreadsheet size={20} className="mt-0.5 shrink-0 text-teal-700 dark:text-teal-300" />
                                    <div>
                                        <p className="text-xs font-bold text-teal-900 dark:text-teal-200">
                                            {t('settings.clinical.importModal.instructionTitle', { defaultValue: 'Spreadsheet Format & Duplicate Check:' })}
                                        </p>
                                        <p className="mt-0.5 text-xs text-teal-700 dark:text-teal-300/80 leading-relaxed">
                                            {t('settings.clinical.importModal.instructionBody', {
                                                defaultValue: 'Ensure column headers match standard field names. The system checks duplicates and asks whether to skip or replace.'
                                            })}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={downloadCSVTemplate}
                                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-teal-200 bg-white px-3 py-1.5 text-xs font-bold text-teal-900 transition hover:bg-teal-100 dark:border-teal-800 dark:bg-slate-900 dark:text-teal-200"
                                >
                                    <Download size={13} />
                                    <span>{t('settings.clinical.importModal.downloadTemplate', { defaultValue: 'Download Template' })}</span>
                                </button>
                            </div>

                            {/* File Upload Drop Area */}
                            {!file ? (
                                <div className="relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-8 text-center transition hover:border-teal-400 hover:bg-teal-50/20 dark:border-slate-800 dark:bg-slate-950/30">
                                    <input
                                        type="file"
                                        accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
                                        onChange={handleFileChange}
                                        className="absolute inset-0 cursor-pointer opacity-0"
                                        id="clinicalSpreadsheetUpload"
                                    />
                                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300">
                                        <Upload size={22} />
                                    </span>
                                    <p className="mt-3 text-sm font-bold text-slate-900 dark:text-white">
                                        {t('settings.clinical.importModal.dropPrompt', { defaultValue: 'Click or drop file to parse & verify duplicates' })}
                                    </p>
                                    <p className="mt-1 text-xs text-slate-400">
                                        {t('settings.clinical.importModal.supportedTypes', { defaultValue: 'Supports .CSV, .TSV, and .TXT files up to 10MB' })}
                                    </p>
                                </div>
                            ) : (
                                /* Pre-Upload Format & Duplicate Summary */
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/50">
                                        <div className="flex items-center gap-2.5">
                                            <FileText size={18} className="text-slate-500" />
                                            <div>
                                                <p className="text-xs font-bold text-slate-900 dark:text-white">{file.name}</p>
                                                <p className="text-[10px] text-slate-400">
                                                    {t('settings.clinical.importModal.rowsParsed', {
                                                        defaultValue: `${rawRows.length} total rows parsed`,
                                                        count: rawRows.length
                                                    })}
                                                </p>
                                            </div>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={() => { setFile(null); setRawRows([]); }}
                                            className="text-xs font-bold text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                                        >
                                            {t('settings.clinical.importModal.changeFile', { defaultValue: 'Change File' })}
                                        </button>
                                    </div>

                                    {/* Verification Pills */}
                                    <div className="grid grid-cols-3 gap-2.5 text-center">
                                        <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-2.5 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                                                {t('settings.clinical.importModal.newRecords', { defaultValue: 'New Records' })}
                                            </span>
                                            <p className="text-lg font-black text-emerald-700 dark:text-emerald-300">{validationResults.newCount}</p>
                                        </div>
                                        <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-2.5 dark:border-amber-900/40 dark:bg-amber-950/20">
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                                                {t('settings.clinical.importModal.duplicatesDetected', { defaultValue: 'Duplicates Detected' })}
                                            </span>
                                            <p className="text-lg font-black text-amber-700 dark:text-amber-300">{validationResults.duplicateCount}</p>
                                        </div>
                                        <div className="rounded-xl border border-rose-100 bg-rose-50/60 p-2.5 dark:border-rose-900/40 dark:bg-rose-950/20">
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400">
                                                {t('settings.clinical.importModal.formatErrors', { defaultValue: 'Format Errors' })}
                                            </span>
                                            <p className="text-lg font-black text-rose-700 dark:text-rose-300">{validationResults.invalidRows.length}</p>
                                        </div>
                                    </div>

                                    {/* Duplicate Action Options Prompt */}
                                    {validationResults.duplicateCount > 0 && (
                                        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-xs dark:border-amber-900/50 dark:bg-amber-950/40 space-y-2.5">
                                            <div className="flex items-center gap-2 font-black text-amber-900 dark:text-amber-300 text-sm">
                                                <AlertTriangle size={17} className="text-amber-600 shrink-0" />
                                                {t('settings.clinical.importModal.duplicatesFound', {
                                                    defaultValue: `Found ${validationResults.duplicateCount} Duplicate Records in File`,
                                                    count: validationResults.duplicateCount
                                                })}
                                            </div>
                                            <p className="text-amber-800 dark:text-amber-300/80 leading-relaxed text-[11px]">
                                                {t('settings.clinical.importModal.chooseStrategy', {
                                                    defaultValue: 'Choose how to handle records that already exist in the database:'
                                                })}
                                            </p>
                                            <div className="grid gap-2 sm:grid-cols-3 pt-1">
                                                <label className={`flex cursor-pointer items-center gap-2 rounded-xl border p-2.5 transition text-[11px] ${
                                                    duplicateStrategy === 'skip'
                                                        ? 'border-amber-500 bg-white font-bold text-amber-950 shadow-sm dark:bg-slate-900 dark:text-amber-200'
                                                        : 'border-amber-200/60 bg-amber-50/30 text-amber-800 dark:border-amber-900/30 dark:text-amber-400'
                                                }`}>
                                                    <input
                                                        type="radio"
                                                        name="dupStrategy"
                                                        value="skip"
                                                        checked={duplicateStrategy === 'skip'}
                                                        onChange={() => setDuplicateStrategy('skip')}
                                                        className="accent-amber-600"
                                                    />
                                                    <span>{t('settings.clinical.importModal.skipStrategy', {
                                                        defaultValue: `Skip Duplicates (${validationResults.newCount} New)`,
                                                        count: validationResults.newCount
                                                    })}</span>
                                                </label>

                                                <label className={`flex cursor-pointer items-center gap-2 rounded-xl border p-2.5 transition text-[11px] ${
                                                    duplicateStrategy === 'replace'
                                                        ? 'border-amber-500 bg-white font-bold text-amber-950 shadow-sm dark:bg-slate-900 dark:text-amber-200'
                                                        : 'border-amber-200/60 bg-amber-50/30 text-amber-800 dark:border-amber-900/30 dark:text-amber-400'
                                                }`}>
                                                    <input
                                                        type="radio"
                                                        name="dupStrategy"
                                                        value="replace"
                                                        checked={duplicateStrategy === 'replace'}
                                                        onChange={() => setDuplicateStrategy('replace')}
                                                        className="accent-amber-600"
                                                    />
                                                    <span>{t('settings.clinical.importModal.replaceStrategy', {
                                                        defaultValue: `Replace Duplicates (${validationResults.duplicateCount} Existing)`,
                                                        count: validationResults.duplicateCount
                                                    })}</span>
                                                </label>

                                                <label className={`flex cursor-pointer items-center gap-2 rounded-xl border p-2.5 transition text-[11px] ${
                                                    duplicateStrategy === 'replaceAll'
                                                        ? 'border-amber-500 bg-white font-bold text-amber-950 shadow-sm dark:bg-slate-900 dark:text-amber-200'
                                                        : 'border-amber-200/60 bg-amber-50/30 text-amber-800 dark:border-amber-900/30 dark:text-amber-400'
                                                }`}>
                                                    <input
                                                        type="radio"
                                                        name="dupStrategy"
                                                        value="replaceAll"
                                                        checked={duplicateStrategy === 'replaceAll'}
                                                        onChange={() => setDuplicateStrategy('replaceAll')}
                                                        className="accent-amber-600"
                                                    />
                                                    <span>{t('settings.clinical.importModal.replaceAllStrategy', {
                                                        defaultValue: `Replace All (${validationResults.validRows.length} Total)`,
                                                        count: validationResults.validRows.length
                                                    })}</span>
                                                </label>
                                            </div>
                                        </div>
                                    )}

                                    {/* Format Error Log Details */}
                                    {validationResults.invalidRows.length > 0 && (
                                        <div className="max-h-36 overflow-y-auto rounded-xl border border-rose-200 bg-rose-50/30 p-3 space-y-1 text-xs dark:border-rose-900/50 dark:bg-rose-950/20">
                                            <p className="font-bold text-rose-700 dark:text-rose-400 text-[11px] uppercase tracking-wider">
                                                {t('settings.clinical.importModal.errorsHeader', { defaultValue: 'Format Errors:' })}
                                            </p>
                                            {validationResults.invalidRows.map((err, i) => (
                                                <div key={i} className="flex items-start gap-1.5 text-rose-800 dark:text-rose-300 text-[11px]">
                                                    <XCircle size={13} className="mt-0.5 shrink-0 text-rose-500" />
                                                    <span>Row {err.rowIndex}: {err.errors.join('; ')}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Modal Footer */}
                <footer className="shrink-0 flex items-center justify-between border-t border-slate-100 bg-slate-50 px-6 py-4 dark:border-slate-800 dark:bg-slate-950/50">
                    <button
                        type="button"
                        onClick={handleClose}
                        className="h-10 rounded-xl px-4 text-xs font-bold text-slate-600 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                    >
                        {importFinished
                            ? t('settings.clinical.close', { defaultValue: 'Close' })
                            : t('settings.clinical.cancel', { defaultValue: 'Cancel' })}
                    </button>

                    {!importFinished && (
                        <button
                            type="button"
                            onClick={handleExecuteImport}
                            disabled={!file || validationResults.validRows.length === 0 || isImporting}
                            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-teal-600 px-5 text-xs font-bold text-white shadow-sm transition hover:bg-teal-500 active:scale-95 disabled:opacity-40"
                        >
                            <Upload size={14} />
                            {isImporting
                                ? t('settings.clinical.importModal.importing', { defaultValue: 'Importing Records...' })
                                : duplicateStrategy === 'skip'
                                ? t('settings.clinical.importModal.executeNew', {
                                    defaultValue: `Import ${validationResults.newCount} New Records`,
                                    count: validationResults.newCount
                                })
                                : t('settings.clinical.importModal.executeOverwrite', {
                                    defaultValue: `Confirm & Import (${duplicateStrategy === 'replaceAll' ? validationResults.validRows.length : validationResults.duplicateCount + validationResults.newCount} records)`,
                                    count: duplicateStrategy === 'replaceAll' ? validationResults.validRows.length : validationResults.duplicateCount + validationResults.newCount
                                })
                            }
                        </button>
                    )}
                </footer>
            </div>
        </div>,
        document.body
    );
};

export default ClinicalImportModal;
