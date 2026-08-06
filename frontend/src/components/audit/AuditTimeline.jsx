import React from 'react';
import { useGetAuditLogsQuery } from '../../store/api';
import { Clock, User, Shield, Info } from 'lucide-react';

const AuditTimeline = ({ resourceId, resourceTable }) => {
    // Poll infrequently or just fetch once for the timeline
    const { data, isLoading } = useGetAuditLogsQuery({ resourceId });
    const logs = data?.logs || [];

    if (isLoading) {
        return <div className="text-center text-sm text-slate-500 py-6 border border-dashed border-slate-200 rounded-lg">Loading history...</div>;
    }

    if (logs.length === 0) {
        return <div className="text-center text-sm text-slate-500 py-6 border border-dashed border-slate-200 rounded-lg">No audit history recorded.</div>;
    }

    return (
        <div className="relative ms-3 space-y-6 border-s-2 border-slate-200 py-2 ps-5">
            {logs.map(log => (
                <div key={log.log_id} className="relative">
                    <div className="absolute -start-[27px] top-1 h-3 w-3 rounded-full border-2 border-blue-500 bg-white"></div>
                    <div className="flex justify-between items-start mb-1">
                        <div className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                            <Shield size={14} className="text-blue-500" />
                            {log.action}
                        </div>
                        <div className="text-xs font-mono text-slate-500 flex items-center gap-1">
                            <Clock size={12} />
                            {new Date(log.timestamp).toLocaleString()}
                        </div>
                    </div>
                    <div className="text-sm text-slate-600 flex items-center gap-1.5 mb-1">
                        <User size={14} className="text-slate-400" />
                        <span className="font-medium">{log.user_name || 'System'}</span>
                        <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold">{log.user_role}</span>
                        <span className="ms-2 text-[10px] text-slate-400">IP: {log.ip_address}</span>
                    </div>
                    {log.details && Object.keys(log.details).length > 0 && (
                        <div className="mt-2 bg-slate-50 border border-slate-100 rounded p-2 text-xs font-mono text-slate-600 break-words flex gap-2 items-start">
                            <Info size={14} className="text-slate-400 shrink-0 mt-0.5" />
                            <span>{JSON.stringify(log.details)}</span>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};

export default AuditTimeline;
