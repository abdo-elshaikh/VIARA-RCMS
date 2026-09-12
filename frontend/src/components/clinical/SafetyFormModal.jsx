import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSubmitSafetyResponseMutation } from '../../store/api';
import { AlertTriangle, CheckCircle, Save, X } from 'lucide-react';
import toast from 'react-hot-toast';

const SafetyFormModal = ({ isOpen, onClose, examId, template, onComplete }) => {
    const [answers, setAnswers] = useState({});
    const [submitForm, { isLoading }] = useSubmitSafetyResponseMutation();

    useEffect(() => {
        if (isOpen) setAnswers({});
    }, [examId, isOpen, template?.template_id]);

    if (!isOpen || !template) return null;

    const schema = template.schema_json;

    const handleChange = (id, value) => {
        setAnswers(prev => ({ ...prev, [id]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            await submitForm({
                examId,
                data: { templateId: template.template_id, answers }
            }).unwrap();
            toast.success('Safety protocol documented successfully');
            await onComplete();
        } catch (error) {
            toast.error(error?.data?.error || 'Failed to submit form');
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl mx-4 overflow-hidden border border-slate-200">
                <div className="p-6 bg-red-50 border-b border-red-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-red-100 text-red-600 rounded-lg">
                            <AlertTriangle size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-800">{template.name}</h2>
                            <p className="text-sm text-red-600 font-medium">Required Safety Protocol Check</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-white rounded-lg transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    <div className="space-y-4">
                        {schema.map(field => (
                            <div key={field.id} className="p-4 border border-slate-200 rounded-xl bg-slate-50">
                                <label className="block text-sm font-bold text-slate-700 mb-2">
                                    {field.question} {field.required && <span className="text-red-500">*</span>}
                                </label>
                                
                                {field.type === 'boolean' ? (
                                    <div className="flex gap-4">
                                        <label className="flex items-center gap-2">
                                            <input 
                                                type="radio" 
                                                name={field.id} 
                                                value="true"
                                                required={field.required}
                                                onChange={() => handleChange(field.id, true)}
                                                className="w-4 h-4 text-indigo-600 focus:ring-indigo-500"
                                            />
                                            <span className="font-medium text-slate-700">Yes</span>
                                        </label>
                                        <label className="flex items-center gap-2">
                                            <input 
                                                type="radio" 
                                                name={field.id} 
                                                value="false"
                                                required={field.required}
                                                onChange={() => handleChange(field.id, false)}
                                                className="w-4 h-4 text-indigo-600 focus:ring-indigo-500"
                                            />
                                            <span className="font-medium text-slate-700">No</span>
                                        </label>
                                    </div>
                                ) : (
                                    <input 
                                        type={field.type === 'number' ? 'number' : 'text'}
                                        required={field.required}
                                        onChange={(e) => handleChange(field.id, e.target.value)}
                                        className="input-field w-full"
                                        placeholder={`Enter ${field.type === 'number' ? 'value' : 'text'}...`}
                                    />
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                        <button 
                            type="button" 
                            onClick={onClose} 
                            className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            type="submit" 
                            disabled={isLoading}
                            className="px-5 py-2.5 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl flex items-center gap-2 transition-colors disabled:opacity-50"
                        >
                            <CheckCircle size={18} /> Sign & Authorize Exam
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
};

export default SafetyFormModal;
