import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ShieldCheck } from 'lucide-react';
import radiologyCommandIllustration from '../../../assets/rcms-hero-command-transparent.svg';

export const HeroPane = ({
    t,
    isRtl,
    activeZone,
    zoneRef,
    PORTAL_SHORTCUTS,
    isLoading,
    isError,
}) => {
    const Arrow = isRtl ? ArrowLeft : ArrowRight;
    const connectionLabel = isLoading
        ? (isRtl ? 'جاري الاتصال' : 'Connecting')
        : isError
            ? (isRtl ? 'البيانات غير متاحة' : 'Data unavailable')
            : (isRtl ? 'متصل ببيانات الخادم' : 'Backend data connected');

    return (
        <section
            ref={zoneRef}
            id="overview"
            tabIndex={-1}
            className={`command-hero ${activeZone === 'overview' ? 'is-focused' : ''}`}
            aria-labelledby="command-hero-title"
        >
            <div className="command-hero__wash" aria-hidden="true" />

            <div className="command-hero__topline">
                <span className="command-security-badge">
                    <ShieldCheck aria-hidden="true" />
                    {isRtl ? 'منصة عمليات الأشعة' : 'Radiology operations platform'}
                </span>
                <span className={`command-live-status ${isError ? 'is-unavailable' : ''}`} role="status">
                    <i aria-hidden="true" />
                    {connectionLabel}
                </span>
            </div>

            <div className="command-hero__intro">
                <div className="command-hero__copy">
                    <span className="command-hero__eyebrow">
                        <i aria-hidden="true" />
                        {isRtl ? 'وضوح تشغيلي في كل خطوة' : 'Operational clarity at every step'}
                    </span>
                    <h1 id="command-hero-title">
                        {isRtl ? 'أدر مركز الأشعة بالكامل ' : `${t('managementLanding.heroTitleLead')} `}
                        <strong>{isRtl ? 'من نظام قيادة واحد' : t('managementLanding.heroTitleAccent')}</strong>
                    </h1>
                    <p>
                        {isRtl
                            ? 'يجمع RCMS الاستقبال والجدولة وقوائم عمل PACS والتقارير والفوترة والتحليلات داخل مساحة تشغيل واحدة.'
                            : t('managementLanding.heroDescription')}
                    </p>
                </div>

                <div className="command-hero__visual">
                    <span className="command-hero__visual-label command-hero__visual-label--top" aria-hidden="true">
                        {isRtl ? 'لوحة القيادة' : 'COMMAND VIEW'}
                    </span>
                    <span className="command-hero__halo" aria-hidden="true" />
                    <span className="command-hero__visual-orbit command-hero__visual-orbit--one" aria-hidden="true" />
                    <span className="command-hero__visual-orbit command-hero__visual-orbit--two" aria-hidden="true" />
                    <img
                        src={radiologyCommandIllustration}
                        decoding="async"
                        alt={isRtl ? 'جهاز أشعة مقطعية متصل بلوحة قيادة رقمية' : 'CT scanner connected to a digital command dashboard'}
                    />
                    <span className="command-hero__visual-label command-hero__visual-label--bottom" aria-hidden="true">
                        <i />{isRtl ? 'تشغيل متصل وآمن' : 'Connected & secure operations'}
                    </span>
                </div>
            </div>

            <div className="command-portal-actions" aria-label={isRtl ? 'بوابات النظام' : 'System portals'}>
                {PORTAL_SHORTCUTS.map((shortcut) => {
                    const Icon = shortcut.icon;
                    return (
                        <Link key={shortcut.key} to={shortcut.path} className={shortcut.primary ? 'is-primary' : ''}>
                            <span><Icon aria-hidden="true" />{isRtl ? shortcut.arLabel : shortcut.enLabel}</span>
                            <Arrow aria-hidden="true" />
                        </Link>
                    );
                })}
            </div>
            <div className="command-hero__footnote" aria-hidden="true">
                <span>{isRtl ? 'مصمم لفرق الأشعة الحديثة' : 'Built for modern radiology teams'}</span>
                <span className="command-hero__footnote-line" />
                <span>{isRtl ? 'RCMS / 01' : 'RCMS / 01'}</span>
            </div>
        </section>
    );
};
