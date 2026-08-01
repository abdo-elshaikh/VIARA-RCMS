import React from 'react';
import { MessageSquare, Phone, Mail, Calendar, Clock } from 'lucide-react';
import { Empty } from '../ui/StateIndicators';

const getActivityIcon = (type) => {
    switch (type) {
        case 'WhatsApp': return <MessageSquare size={15} />;
        case 'Call': return <Phone size={15} />;
        case 'Email': return <Mail size={15} />;
        case 'Visit': return <Calendar size={15} />;
        default: return <Clock size={15} />;
    }
};

const ActivityList = ({ activities, formatDate, t }) => {
    if (!activities.length) return <Empty>{t('patient.empty.activities', 'No activity yet.')}</Empty>;

    return (
        <div className="space-y-3">
            {activities.map((activity) => (
                <div key={activity.activity_id || `${activity.activity_type}-${activity.created_at}`} className="flex gap-3 rounded-2xl border border-slate-200/50 bg-white p-4 dark:border-white/10 dark:bg-white/[0.04]">
                    <span className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700 dark:bg-primary-400/10 dark:text-primary-300">
                        {getActivityIcon(activity.activity_type)}
                    </span>
                    <div className="min-w-0">
                        <p className="font-display font-semibold text-slate-900 dark:text-white">{activity.activity_type || t('patient.activityFallback', 'Activity')}</p>
                        {activity.notes && <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-300">{activity.notes}</p>}
                        <p className="font-medium mt-1 text-[10px] text-slate-500 dark:text-slate-400">{formatDate(activity.due_date || activity.created_at, Boolean(activity.due_date))}</p>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default ActivityList;
