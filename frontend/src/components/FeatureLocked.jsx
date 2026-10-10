/**
 * FeatureLocked.jsx
 * -----------------
 * Placeholder component rendered in place of pages/sections that are
 * unavailable in the current license edition.
 *
 * Usage
 * =====
 *   import FeatureLocked from '../components/FeatureLocked';
 *
 *   // Option A: wrap an entire page route
 *   const FinancialsPage = () => {
 *       const { allowedModules } = useLicense();
 *       if (!featureAllowed(allowedModules, 'finance')) return <FeatureLocked feature="finance" />;
 *       return <ActualFinancialsContent />;
 *   };
 *
 *   // Option B: use directly as a route element
 *   <Route path="/financials" element={<FeatureLocked feature="finance" />} />
 */

import React from 'react';

const UPGRADE_URL = import.meta.env.VITE_UPGRADE_URL || 'https://viara.net/upgrade';
const CONTACT_URL = import.meta.env.VITE_SALES_CONTACT_URL || 'https://viara.net/contact';

/** Human-readable names for feature keys */
const FEATURE_LABELS = {
    finance: 'المحاسبة والفواتير',
    insurance: 'إدارة التأمين',
    hr: 'الموارد البشرية والرواتب',
    pacs: 'نظام PACS / DICOM',
    analytics: 'التقارير والتحليلات المتقدمة',
    backup: 'النسخ الاحتياطي والتصدير',
    import: 'استيراد البيانات',
    crm: 'إدارة العلاقات والتسويق والأطباء المحولين',
    inventory: 'إدارة المخزون والموردين',
    equipment: 'إدارة الأجهزة والصيانة والعقود',
    audit: 'سجلات التدقيق وتتبع نشاط المستخدمين',
    export: 'تصدير البيانات والتقارير',
    'end-of-day': 'الإغلاق والتقفيل اليومي',
    'multi-branch': 'إدارة متعددة الفروع',
    sso: 'تسجيل الدخول الموحد (SSO)',
};

/**
 * @param {{ feature?: string, title?: string, description?: string }} props
 */
const FeatureLocked = ({ feature, title, description }) => {
    const label = FEATURE_LABELS[feature] || feature || 'هذه الميزة';

    return (
        <div
            id={`feature-locked-${feature || 'generic'}`}
            role="region"
            aria-label={`${label} غير متاحة`}
            style={containerStyle}
        >
            {/* Lock icon */}
            <div style={iconWrapStyle}>
                <span aria-hidden="true" style={{ fontSize: '48px' }}>🔒</span>
            </div>

            {/* Heading */}
            <h2 style={headingStyle}>
                {title || `${label} غير متاحة في إصدارك الحالي`}
            </h2>

            {/* Description */}
            <p style={descStyle}>
                {description ||
                    `هذه الميزة متاحة فقط في إصدارات Standard وEnterprise. قم بالترقية للاستفادة من جميع إمكانيات نظام VIARA.`
                }
            </p>

            {/* CTA buttons */}
            <div style={{ display: 'flex', gap: '12px', marginTop: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                <a
                    href={UPGRADE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    id={`feature-locked-upgrade-btn-${feature || 'generic'}`}
                    style={primaryBtnStyle}
                >
                    ترقية الآن
                </a>
                <a
                    href={CONTACT_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    id={`feature-locked-contact-btn-${feature || 'generic'}`}
                    style={secondaryBtnStyle}
                >
                    تواصل مع المبيعات
                </a>
            </div>
        </div>
    );
};

// ── Styles ──────────────────────────────────────────────────────────────────

const containerStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    padding: '64px 24px',
    gap: '16px',
    minHeight: '400px',
    color: 'var(--color-text-secondary, #6b7280)',
};

const iconWrapStyle = {
    width: '96px',
    height: '96px',
    borderRadius: '50%',
    background: 'var(--color-surface-muted, rgba(99,102,241,0.08))',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '8px',
};

const headingStyle = {
    fontSize: '20px',
    fontWeight: 700,
    color: 'var(--color-text-primary, #111827)',
    margin: 0,
};

const descStyle = {
    fontSize: '14px',
    maxWidth: '420px',
    lineHeight: 1.6,
    margin: 0,
};

const primaryBtnStyle = {
    background: 'var(--color-primary, #2563eb)',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '10px 24px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    textDecoration: 'none',
    transition: 'opacity 0.15s',
};

const secondaryBtnStyle = {
    background: 'transparent',
    color: 'var(--color-text-secondary, #6b7280)',
    border: '1px solid var(--color-border, #d1d5db)',
    borderRadius: '8px',
    padding: '10px 24px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    textDecoration: 'none',
    transition: 'background 0.15s',
};

export default FeatureLocked;
