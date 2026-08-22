import React from 'react';

const QUEUE_STAGE_ORDER = [
    'Scheduled',
    'Arrived',
    'Payment Pending',
    'Prep Pending',
    'Ready for Exam',
    'In Exam',
    'Reporting',
    'Finalized',
    'Delivered'
];

const QueueStageTracker = ({ stage, t }) => {
    const idx = QUEUE_STAGE_ORDER.indexOf(stage);
    return (
        <div className="flex items-center gap-1" aria-label={t ? t(`queue.stages.${stage}`, { defaultValue: stage }) : stage}>
            {QUEUE_STAGE_ORDER.map((s, i) => {
                const done = idx === -1 ? false : i <= idx;
                const isCurrent = i === idx;
                return (
                    <span
                        key={s}
                        title={t ? t(`queue.stages.${s}`, { defaultValue: s }) : s}
                        className={`h-1.5 rounded-none transition-all ${
                            isCurrent ? 'w-4 bg-teal-600 dark:bg-teal-400' : done ? 'w-1.5 bg-teal-300 dark:bg-teal-700' : 'w-1.5 bg-slate-200 dark:bg-slate-800'
                        }`}
                    />
                );
            })}
        </div>
    );
};

export default QueueStageTracker;
