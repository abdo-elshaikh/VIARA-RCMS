import React from 'react';
import { useTranslation } from 'react-i18next';

const QUEUE_STAGE_ORDER = ['Scheduled', 'Arrived', 'Payment Pending', 'Prep Pending', 'Ready for Exam', 'Finalized'];

const QueueStageTracker = ({ stage, t }) => {
    const idx = QUEUE_STAGE_ORDER.indexOf(stage);
    return (
        <div className="flex items-center gap-1" aria-label={t(`queue.stages.${stage}`, { defaultValue: stage })}>
            {QUEUE_STAGE_ORDER.map((s, i) => {
                const done = idx === -1 ? false : i <= idx;
                const isCurrent = i === idx;
                return (
                    <span
                        key={s}
                        title={t(`queue.stages.${s}`, { defaultValue: s })}
                        className={`h-1.5 rounded-none transition-all ${isCurrent ? 'w-4 bg-teal-600' : done ? 'w-1.5 bg-teal-300' : 'w-1.5 bg-slate-200'
                            }`}
                    />
                );
            })}
        </div>
    );
};

export default QueueStageTracker;
