import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useImportPatientsMutation } from '../../store/api';
import { Upload, X, FileText, AlertCircle, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';

const PatientImportModal = ({ isOpen, onClose }) => {
    const [file, setFile] = useState(null);
    const [importPatients, { isLoading }] = useImportPatientsMutation();
    const [result, setResult] = useState(null);

    if (!isOpen) return null;

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
        }
    };

    const handleImport = async () => {
        if (!file) return toast.error('Please select a CSV file');

        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await importPatients(formData).unwrap();
            setResult(res);
            toast.success('Import completed!');
        } catch (error) {
            toast.error(error?.data?.error || 'Import failed');
        }
    };

    const downloadTemplate = () => {
        const csvContent = "data:text/csv;charset=utf-8,FirstName,LastName,DOB,Gender,Phone,Email\nJohn,Doe,1990-01-01,Male,555-0101,john@example.com";
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "patient_import_template.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-xl w-full max-w-lg mx-4 overflow-hidden border border-slate-200 animate-in zoom-in-95 duration-200">
                <div className="p-6 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                            <Upload size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-800">Bulk Import Patients</h2>
                            <p className="text-sm text-slate-500 font-medium">Upload a CSV file to add multiple records</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-white rounded-lg transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {result ? (
                        <div className="text-center space-y-4">
                            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 mb-2">
                                <CheckCircle size={32} />
                            </div>
                            <h3 className="text-xl font-bold text-slate-800">Import Successful</h3>
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 grid grid-cols-2 gap-4 text-left">
                                <div>
                                    <p className="text-sm text-slate-500 font-bold">Total Rows Parsed</p>
                                    <p className="text-2xl font-black text-slate-800">{result.totalRows}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-slate-500 font-bold">Successfully Added</p>
                                    <p className="text-2xl font-black text-emerald-600">{result.successCount}</p>
                                </div>
                            </div>
                            {result.duplicateCount > 0 && (
                                <p className="text-sm text-amber-600 font-bold flex items-center justify-center gap-1">
                                    <AlertCircle size={16}/> {result.duplicateCount} duplicates skipped
                                </p>
                            )}
                            {result.failCount > 0 && (
                                <p className="text-sm text-red-600 font-bold flex items-center justify-center gap-1">
                                    <AlertCircle size={16}/> {result.failCount} rows failed validation
                                </p>
                            )}
                            {result.validationReport?.length > 0 && (
                                <div className="max-h-40 overflow-y-auto text-left text-xs bg-white border border-slate-200 rounded-lg p-3 mt-2">
                                    {result.validationReport.slice(0, 20).map((row, idx) => (
                                        <div key={idx} className="py-1 border-b border-slate-100 last:border-0">
                                            Row {row.row}: <span className="font-bold">{row.status}</span>
                                            {row.existingMrn && ` (existing MRN: ${row.existingMrn})`}
                                            {row.errors?.length > 0 && ` — ${row.errors.join(', ')}`}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        <>
                            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-3 text-blue-800">
                                <AlertCircle className="shrink-0 mt-0.5" size={20} />
                                <div className="text-sm font-medium">
                                    Ensure your CSV matches the exact column headers. Records with existing emails will be skipped.
                                    <button onClick={downloadTemplate} className="block mt-2 text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 underline">
                                        <FileText size={14}/> Download CSV Template
                                    </button>
                                </div>
                            </div>

                            <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:bg-slate-50 transition-colors">
                                <input 
                                    type="file" 
                                    accept=".csv"
                                    onChange={handleFileChange}
                                    className="hidden" 
                                    id="csvUpload"
                                />
                                <label htmlFor="csvUpload" className="cursor-pointer flex flex-col items-center">
                                    <div className="p-3 bg-indigo-50 text-indigo-600 rounded-full mb-3">
                                        <Upload size={24} />
                                    </div>
                                    <span className="text-slate-700 font-bold">
                                        {file ? file.name : 'Click to select CSV file'}
                                    </span>
                                    <span className="text-slate-500 text-sm mt-1">Maximum file size: 5MB</span>
                                </label>
                            </div>
                        </>
                    )}
                </div>

                <div className="flex justify-end gap-3 p-4 bg-slate-50 border-t border-slate-200">
                    <button 
                        onClick={onClose} 
                        className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors"
                    >
                        {result ? 'Close' : 'Cancel'}
                    </button>
                    {!result && (
                        <button 
                            onClick={handleImport}
                            disabled={!file || isLoading}
                            className="px-5 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl flex items-center gap-2 transition-colors disabled:opacity-50"
                        >
                            {isLoading ? 'Importing...' : 'Start Import'}
                        </button>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};

export default PatientImportModal;
