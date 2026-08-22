import React from 'react';
import { MessageSquare, Phone, Mail, Calendar, Clock } from 'lucide-react';
import { Empty } from '../ui/StateIndicators';

const getActivityIcon = (type?: string) => {
  switch (type) {
    case 'WhatsApp':
      return <MessageSquare size={15} />;
    case 'Call':
      return <Phone size={15} />;
    case 'Email':
      return <Mail size={15} />;
    case 'Visit':
      return <Calendar size={15} />;
    default:
      return <Clock size={15} />;
  }
};

export interface ActivityListProps {
  activities: any[];
  formatDate: (date: any, isDueDate?: boolean) => string;
  t: any;
}

export const ActivityList = ({ activities = [], formatDate, t }: ActivityListProps) => {
  if (!activities.length) return <Empty>{t('patient.empty.activities', 'No activity yet.')}</Empty>;

  return (
    <div className="space-y-3">
      {activities.map((activity) => (
        <div
          key={activity.activity_id || `${activity.activity_type}-${activity.created_at}`}
          className="flex gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm"
        >
          <span className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            {getActivityIcon(activity.activity_type)}
          </span>
          <div className="min-w-0">
            <p className="font-extrabold text-xs text-foreground">
              {activity.activity_type || t('patient.activityFallback', 'Activity')}
            </p>
            {activity.notes && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{activity.notes}</p>}
            <p className="mt-1 text-[10px] text-muted-foreground">
              {formatDate(activity.due_date || activity.created_at, Boolean(activity.due_date))}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
};

export default ActivityList;
