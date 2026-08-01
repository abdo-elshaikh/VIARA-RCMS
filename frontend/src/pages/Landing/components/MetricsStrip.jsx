import React from 'react';

export const MetricsStrip = ({ isRtl, metrics, data, isLoading, isError }) => (
    <section
        className="command-metrics"
        aria-label={isRtl ? 'مؤشرات المركز اليوم' : 'Center metrics today'}
        aria-live="polite"
        aria-busy={isLoading}
    >
        {isError && (
            <span className="sr-only">{isRtl ? 'تعذر تحميل المؤشرات المباشرة' : 'Live metrics could not be loaded'}</span>
        )}
        {metrics.map((metric, index) => {
            const Icon = metric.icon;
            const rawValue = data?.[metric.dataKey];
            const hasValue = rawValue !== null && rawValue !== undefined && !isError;
            const displayValue = hasValue ? `${rawValue}${metric.suffix || ''}` : '—';
            return (
                <article
                    key={metric.key}
                    className={`command-metric command-metric--${metric.tone} ${isLoading ? 'is-loading' : ''}`}
                    style={{ '--metric-delay': `${index * 55}ms` }}
                >
                    <div className="command-metric__content">
                        <span className="command-metric__icon"><Icon aria-hidden="true" /></span>
                        <div>
                            <strong>{isLoading ? <i className="command-live-skeleton" aria-hidden="true" /> : displayValue}</strong>
                            <span>{isRtl ? metric.fallbackAr : metric.fallbackEn}</span>
                        </div>
                    </div>
                </article>
            );
        })}
    </section>
);
