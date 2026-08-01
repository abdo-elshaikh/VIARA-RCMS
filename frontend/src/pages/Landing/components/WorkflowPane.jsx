import React from 'react';
import { Sparkles } from 'lucide-react';

const formatDuration = (minutes, isRtl) => {
    if (minutes < 60) return isRtl ? `${minutes} دقيقة في المتوسط` : `${minutes} min average`;
    const hours = Math.round((minutes / 60) * 10) / 10;
    if (hours < 24) return isRtl ? `${hours} ساعة في المتوسط` : `${hours} hr average`;
    const days = Math.round((hours / 24) * 10) / 10;
    return isRtl ? `${days} يوم في المتوسط` : `${days} day average`;
};

export const WorkflowPane = ({
    isRtl,
    activeZone,
    activeWorkflowIndex,
    setActiveWorkflowIndex,
    zoneRef,
    WORKFLOW_STEPS,
    workflowData,
    workflowWindowDays,
    isLoading,
    isError,
}) => (
    <section
        id="workflow"
        ref={zoneRef}
        tabIndex={-1}
        className={`command-workflow ${activeZone === 'workflow' ? 'is-focused' : ''}`}
        aria-label={isRtl ? 'مسار عمل الأشعة المتكامل' : 'Integrated radiology workflow'}
    >
        <div className="command-workflow__intro">
            <span className="command-workflow__intro-icon"><Sparkles aria-hidden="true" /></span>
            <span>
                <strong>{isRtl ? 'مسار الأشعة المتكامل' : 'Integrated imaging workflow'}</strong>
                <small>
                    {workflowWindowDays
                        ? (isRtl ? `متوسط الحالات المكتملة خلال ${workflowWindowDays} يومًا` : `${workflowWindowDays}-day completed-case averages`)
                        : (isRtl ? 'متوسط الحالات المكتملة' : 'Completed-case averages')}
                </small>
            </span>
        </div>

        <div className="command-workflow__steps" role="list">
            {WORKFLOW_STEPS.map((step, index) => {
                const Icon = step.icon;
                const active = activeWorkflowIndex === index;
                const minutes = workflowData?.[step.dataKey];
                const duration = minutes === null || minutes === undefined || isError
                    ? (isRtl ? 'لا توجد دورة مكتملة' : 'No completed cycle')
                    : formatDuration(minutes, isRtl);
                const title = isRtl ? step.fallbackTitleAr : step.fallbackTitleEn;
                return (
                    <div key={step.key} role="listitem">
                        <button
                            type="button"
                            onClick={() => setActiveWorkflowIndex(index)}
                            className={active ? 'is-active' : ''}
                            aria-pressed={active}
                            aria-label={`${title} — ${duration}`}
                        >
                            <span className="command-workflow__number">{step.number}</span>
                            <span className="command-workflow__copy">
                                <strong>{title}</strong>
                                <small>
                                    <i aria-hidden="true" />
                                    {isLoading ? <span className="command-live-skeleton command-live-skeleton--small" aria-hidden="true" /> : duration}
                                </small>
                            </span>
                            <span className="command-workflow__icon"><Icon aria-hidden="true" /></span>
                        </button>
                    </div>
                );
            })}
        </div>
    </section>
);
