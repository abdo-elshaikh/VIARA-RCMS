import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { 
    useGetPatientDocumentsQuery, 
    useUploadDocumentMutation, 
    useDeleteDocumentMutation 
} from '../../store/api';
import { FileText, Upload, Download, Trash2, Eye, File, FileImage, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { authenticatedFetch } from '../../utils/authenticatedFetch';
import { useTranslation } from 'react-i18next';
import ConfirmDialog from '../ui/ConfirmDialog';
import { useSelector } from 'react-redux';
import { selectCurrentUser } from '../../store/authSlice';
import { hasDeveloperOrAdminRole } from '../../utils/roles';

const DOCUMENT_TYPES = [
    'Consent Form',
    'Patient ID',
    'Passport',
    'Insurance Card',
    'Insurance Approval',
    'Prescription',
    'Previous Report',
    'Lab Result',
    'Invoice',
    'Signed Form',
    'Other'
];

const formatBytes = (bytes, decimals = 2) => {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

const getFileIcon = (mimeType) => {
    if (mimeType?.startsWith('image/')) return <FileImage size={20} className="text-blue-500" />;
    return <FileText size={20} className="text-red-500" />;
};

const DocumentsTab = ({ patient }) => {
    const { t } = useTranslation('patientDetail');
    const user = useSelector(selectCurrentUser);
    const canUpload = hasDeveloperOrAdminRole(user?.role) || ['Technician', 'Radiologist'].includes(user?.role);
    const canDelete = hasDeveloperOrAdminRole(user?.role);
    const { data: documents, isLoading } = useGetPatientDocumentsQuery(patient.patient_id);
    const [uploadDocument, { isLoading: isUploading }] = useUploadDocumentMutation();
    const [deleteDocument, { isLoading: isDeleting }] = useDeleteDocumentMutation();

    const [file, setFile] = useState(null);
    const [docType, setDocType] = useState('Patient ID');
    const [notes, setNotes] = useState('');
    const [previewUrl, setPreviewUrl] = useState(null);
    const [previewType, setPreviewType] = useState(null);
    const [documentToDelete, setDocumentToDelete] = useState(null);

    const fileInputRef = useRef(null);

    useEffect(() => () => {
        if (previewUrl?.startsWith('blob:')) {
            URL.revokeObjectURL(previewUrl);
        }
    }, [previewUrl]);

    const fetchDocumentBlob = async (doc) => {
        const baseUrl = import.meta.env.VITE_API_URL || '/api';
        const response = await authenticatedFetch(`${baseUrl}/documents/${doc.document_id}/download`);

        if (!response.ok) {
            throw new Error('Document could not be loaded');
        }

        return response.blob();
    };

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            const selected = e.target.files[0];
            if (selected.size > 10 * 1024 * 1024) {
                toast.error('File size exceeds 10MB limit.');
                return;
            }
            setFile(selected);
        }
    };

    const handleUpload = async (e) => {
        e.preventDefault();
        if (!file) {
            toast.error('Please select a file to upload');
            return;
        }

        const formData = new FormData();
        formData.append('file', file);
        formData.append('patient_id', patient.patient_id);
        formData.append('type', docType);
        formData.append('notes', notes);

        try {
            await uploadDocument(formData).unwrap();
            toast.success('Document uploaded successfully');
            setFile(null);
            setDocType('Patient ID');
            setNotes('');
            if (fileInputRef.current) fileInputRef.current.value = '';
        } catch (error) {
            toast.error(error?.data?.error || 'Failed to upload document');
        }
    };

    const handleDelete = async (docId) => {
        try {
            await deleteDocument(docId).unwrap();
            toast.success(t('documents.deleted'));
            return true;
        } catch (error) {
            toast.error(t('documents.deleteError'));
            return false;
        }
    };

    const handlePreview = async (doc) => {
        try {
            const blob = await fetchDocumentBlob(doc);
            if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
            setPreviewUrl(URL.createObjectURL(blob));
            setPreviewType(doc.mime_type);
        } catch (error) {
            toast.error(error.message || 'Failed to preview document');
        }
    };

    const handleDownload = async (doc) => {
        try {
            const blob = await fetchDocumentBlob(doc);
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = doc.file_name || 'document';
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
        } catch (error) {
            toast.error(error.message || 'Failed to download document');
        }
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Upload Section */}
                {canUpload && <div className="md:col-span-1 bg-slate-50 border border-slate-200 rounded-xl p-5 shadow-sm">
                    <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <Upload size={20} className="text-indigo-600" /> Upload Document
                    </h3>
                    <form onSubmit={handleUpload} className="space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">Document Type</label>
                            <select 
                                value={docType}
                                onChange={(e) => setDocType(e.target.value)}
                                className="input-field w-full"
                            >
                                {DOCUMENT_TYPES.map(type => (
                                    <option key={type} value={type}>{type}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">File</label>
                            <input 
                                type="file" 
                                ref={fileInputRef}
                                onChange={handleFileChange}
                                accept="image/jpeg, image/png, application/pdf"
                                className="block w-full text-sm text-slate-500
                                    file:mr-4 file:py-2 file:px-4
                                    file:rounded-full file:border-0
                                    file:text-sm file:font-bold
                                    file:bg-indigo-50 file:text-indigo-700
                                    hover:file:bg-indigo-100"
                            />
                            {file && <p className="text-xs text-slate-500 mt-1 pl-1">Selected: {file.name} ({formatBytes(file.size)})</p>}
                        </div>

                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">Notes (Optional)</label>
                            <textarea 
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                className="input-field w-full text-sm"
                                rows="2"
                                placeholder="Add any details about this document..."
                            />
                        </div>

                        <button 
                            type="submit"
                            disabled={!file || isUploading}
                            className="w-full bg-indigo-600 text-white font-bold py-2 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50"
                        >
                            {isUploading ? 'Uploading...' : 'Upload'}
                        </button>
                    </form>
                </div>}

                {/* List Section */}
                <div className={`${canUpload ? 'md:col-span-2' : 'md:col-span-3'} bg-white border border-slate-200 rounded-xl p-5 shadow-sm`}>
                    <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <File size={20} className="text-emerald-600" /> Patient Documents
                    </h3>

                    {isLoading ? (
                        <div className="text-center py-8 text-slate-500 font-medium">Loading documents...</div>
                    ) : documents?.length === 0 ? (
                        <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
                            <FileText size={48} className="mx-auto text-slate-300 mb-3" />
                            <p className="text-slate-500 font-medium">No documents uploaded yet.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                                    <tr>
                                        <th className="px-4 py-3 font-bold">Document</th>
                                        <th className="px-4 py-3 font-bold">Type</th>
                                        <th className="px-4 py-3 font-bold">Size</th>
                                        <th className="px-4 py-3 font-bold">Uploaded By</th>
                                        <th className="px-4 py-3 font-bold text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {documents?.map(doc => (
                                        <tr key={doc.document_id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-3">
                                                    {getFileIcon(doc.mime_type)}
                                                    <div>
                                                        <p className="font-bold text-slate-800 line-clamp-1" title={doc.file_name}>{doc.file_name}</p>
                                                        <p className="text-xs text-slate-500">{new Date(doc.created_at).toLocaleString()}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded-md text-xs font-bold border border-slate-200 whitespace-nowrap">
                                                    {doc.type}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-slate-600 text-xs font-medium whitespace-nowrap">
                                                {formatBytes(doc.size_bytes)}
                                            </td>
                                            <td className="px-4 py-3 text-slate-600 text-xs font-medium">
                                                {doc.uploader_name || 'System'}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        onClick={() => handlePreview(doc)}
                                                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                        title={t('documents.preview')}
                                                        aria-label={t('documents.previewAction', { name: doc.file_name })}
                                                    >
                                                        <Eye size={16} />
                                                    </button>
                                                    <button 
                                                        onClick={() => handleDownload(doc)}
                                                        className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                                                        title={t('documents.download')}
                                                        aria-label={t('documents.downloadAction', { name: doc.file_name })}
                                                    >
                                                        <Download size={16} />
                                                    </button>
                                                    {canDelete && <button
                                                        onClick={() => setDocumentToDelete(doc)}
                                                        disabled={isDeleting}
                                                        className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                                                        title={t('documents.delete')}
                                                        aria-label={t('documents.deleteAction', { name: doc.file_name })}
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* Preview Modal */}
            {previewUrl && createPortal(
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 md:p-10">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl h-[80vh] flex flex-col overflow-hidden">
                        <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50">
                            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                <Eye className="text-blue-500" size={20} /> Document Preview
                            </h2>
                            <button 
                                onClick={() => setPreviewUrl(null)}
                                className="p-2 hover:bg-slate-200 text-slate-500 rounded-full transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <div className="flex-1 bg-slate-100 p-4 flex items-center justify-center overflow-auto relative">
                            {previewType?.startsWith('image/') ? (
                                <img src={previewUrl} alt="Preview" className="max-w-full max-h-full object-contain rounded-lg shadow-sm" />
                            ) : previewType === 'application/pdf' ? (
                                <iframe src={previewUrl} className="w-full h-full rounded-lg shadow-sm bg-white" title="PDF Preview" />
                            ) : (
                                <div className="text-center">
                                    <FileText size={64} className="mx-auto text-slate-300 mb-4" />
                                    <p className="text-slate-600 font-medium">Preview not available for this file type.</p>
                                    <button 
                                        onClick={() => window.open(previewUrl, '_blank')}
                                        className="mt-4 bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold text-sm"
                                    >
                                        Download File Instead
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}

            <ConfirmDialog
                isOpen={Boolean(documentToDelete)}
                onClose={() => setDocumentToDelete(null)}
                onConfirm={() => handleDelete(documentToDelete?.document_id)}
                title={t('documents.deleteTitle')}
                message={t('documents.deleteMessage', { name: documentToDelete?.file_name || t('documents.fallbackName') })}
                confirmLabel={t('documents.delete')}
                cancelLabel={t('documents.cancel')}
                isLoading={isDeleting}
            />
        </div>
    );
};

export default DocumentsTab;
