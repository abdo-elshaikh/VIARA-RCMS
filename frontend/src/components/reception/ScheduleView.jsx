import React from 'react';
import { CalendarCheck2, CheckCircle2, AlertCircle, LayoutGrid } from 'lucide-react';
import MetricCard from '../ui/MetricCard';
import ModernWaitlistPanel from './ModernWaitlistPanel';
import DailyOperationsTable from './DailyOperationsTable';

const ScheduleView = ({ displayDate, appointments, appLoading, scheduleSummary, invoices, createAppointmentInvoice, moveQueue, i18n, t, selectedDate, queueItems, queueKpis, canManageQueue, canDeliverResults, onQueueMove, onPickup, onOpenPayment, onRequestPartialPaymentException }) => (
    <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-label={t('overview.label')}>
            <MetricCard icon={CalendarCheck2} label={t('overview.booked')} value={scheduleSummary.booked} tone="cyan" />
            <MetricCard icon={CheckCircle2} label={t('overview.ready')} value={scheduleSummary.ready} tone="emerald" />
            <MetricCard icon={AlertCircle} label={t('overview.priority')} value={scheduleSummary.urgent} tone="amber" />
            <MetricCard icon={LayoutGrid} label={t('overview.activeQueue')} value={scheduleSummary.activeQueue} tone="cyan" />
        </div>
        <div className="grid w-full min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
            <div className="min-w-0">
                <DailyOperationsTable appointments={appointments} queueItems={queueItems} queueKpis={queueKpis} invoices={invoices} appLoading={appLoading} canManageQueue={canManageQueue} canDeliverResults={canDeliverResults} createAppointmentInvoice={createAppointmentInvoice} onMove={onQueueMove || moveQueue} onPickup={onPickup} onOpenPayment={onOpenPayment} onRequestPartialPaymentException={onRequestPartialPaymentException} i18n={i18n} t={t} />
            </div>
            <div className="min-w-0 xl:sticky xl:top-[76px]">
                <ModernWaitlistPanel selectedDate={selectedDate} t={t} />
            </div>
        </div>
    </div>
);

export default ScheduleView;
