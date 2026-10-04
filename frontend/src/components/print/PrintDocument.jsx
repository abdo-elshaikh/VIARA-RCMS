import React from 'react';
import { getDocScaleClasses } from './printTheme';

/* Shared anatomy for every printed document (invoice, receipt, booking slip,
   sticker): tokenized scale via getDocScaleClasses() + accent edge + optional
   watermark, identity header, section heads, meta cells, pills, ledger, tear
   line and certification footer. Density/media variants retune tokens only. */

export const PrintDocument = ({
    as: Tag = 'div',
    scale = {},
    className = '',
    style,
    dir,
    accentEdge = true,
    watermark = null,
    children,
    ...rest
}) => (
    <Tag
        className={[getDocScaleClasses(scale), 'print-document relative overflow-hidden', className].filter(Boolean).join(' ')}
        style={{ padding: 'var(--pd-pad)', ...style }}
        dir={dir}
        {...rest}
    >
        {accentEdge ? <span className="pd-accent-edge" aria-hidden="true" /> : null}
        {watermark ? (
            <div className="pd-watermark" aria-hidden="true">
                <span style={{ color: 'var(--print-accent)' }}>{watermark}</span>
            </div>
        ) : null}
        {children}
    </Tag>
);

export const DocIdentityHeader = ({
    align = 'center',
    logoUrl,
    centerName,
    branchName,
    tagline,
    contact = [],
    taxLine,
    statusSlot = null,
    title = null,
    titleMeta = null,
    className = '',
}) => {
    const isCenter = align === 'center';
    const hasAside = Boolean(title || titleMeta);
    const identityInner = isCenter
        ? 'items-center text-center'
        : align === 'end'
            ? 'items-end text-end'
            : 'items-start text-start';
    const justify = hasAside ? 'justify-between' : isCenter ? 'justify-center' : align === 'end' ? 'justify-end' : 'justify-start';

    return (
        <header
            className={`pd-block print-keep-together relative z-10 flex gap-4 ${isCenter ? 'flex-col items-center text-center' : `flex-wrap items-center ${justify}`} ${className}`}
            style={{ borderBottom: '1px solid var(--pd-line)', paddingBottom: 'calc(var(--pd-gap) * 0.8)' }}
        >
            <div className={`flex min-w-0 flex-col gap-1.5 ${isCenter ? 'items-center' : identityInner}`}>
                <div className={`flex min-w-0 items-center gap-2.5 ${isCenter ? 'flex-col' : identityInner}`}>
                    {logoUrl ? (
                        <img src={logoUrl} alt="" className="w-auto shrink-0 object-contain" style={{ height: 'var(--pd-logo)' }} />
                    ) : (
                        <div
                            className="grid shrink-0 place-items-center rounded-xl text-white"
                            style={{ width: 'var(--pd-logo)', height: 'var(--pd-logo)', background: 'var(--print-accent)' }}
                        >
                            <span className="pd-label font-black">{String(centerName || '').trim().slice(0, 2).toUpperCase()}</span>
                        </div>
                    )}
                    <div className={`min-w-0 ${identityInner}`}>
                        <h1 className="pd-title font-black leading-tight tracking-tight" style={{ color: 'var(--print-accent)' }}>
                            {centerName}
                        </h1>
                        {branchName ? <p className="pd-kicker">{branchName}</p> : null}
                        {tagline ? <p className="pd-micro mt-0.5 font-semibold text-slate-500">{tagline}</p> : null}
                        {contact.filter(Boolean).map((line, idx) => (
                            <p key={idx} className="pd-micro font-medium text-slate-400">{line}</p>
                        ))}
                        {taxLine ? <p className="pd-micro mt-0.5 font-bold text-slate-500">{taxLine}</p> : null}
                    </div>
                </div>
                {statusSlot ? <div className={isCenter ? 'flex justify-center' : identityInner}>{statusSlot}</div> : null}
            </div>

            {hasAside ? (
                <div className={`flex min-w-0 flex-col gap-1 ${isCenter ? 'items-center' : 'items-end text-end'}`}>
                    {title ? (
                        <div
                            className="pd-display font-black uppercase leading-none tracking-tighter"
                            style={{ color: 'color-mix(in srgb, var(--print-accent) 18%, #fff)' }}
                        >
                            {title}
                        </div>
                    ) : null}
                    {titleMeta}
                </div>
            ) : null}
        </header>
    );
};

export const DocSectionHead = ({ label, trailing = null, hint = null }) => (
    <div className="pd-section-head">
        <span className="pd-section-label">{label}</span>
        {hint ? <span className="pd-micro font-semibold text-slate-400">{hint}</span> : null}
        <span className="pd-section-rule" aria-hidden="true" />
        {trailing}
    </div>
);

export const DocMetaCell = ({ icon: Icon, label, value, mono = false, wrap = false, align = 'start', valueSize = 'value', dir, className = '', children }) => (
    <div className={`pd-meta-cell ${align === 'end' ? 'pd-meta-end' : ''} ${className}`}>
        <div className="pd-meta-label">
            {Icon ? <Icon size={10} strokeWidth={2.4} className="shrink-0 opacity-70" aria-hidden="true" /> : null}
            <span className="truncate">{label}</span>
        </div>
        {children ?? (
            <div
                className={`pd-meta-value pd-${valueSize} ${mono ? 'font-mono ltr-embed' : ''} ${wrap ? 'pd-wrap' : ''}`}
                dir={dir}
                title={typeof value === 'string' ? value : undefined}
            >
                {value ?? '—'}
            </div>
        )}
    </div>
);

export const DocPill = ({ tone = 'neutral', icon: Icon, className = '', children }) => (
    <span data-tone={tone} className={`pd-pill ${className}`}>
        {Icon ? <Icon size={9} strokeWidth={2.6} aria-hidden="true" /> : null}
        {children}
    </span>
);

export const DocTear = ({ label }) => (
    <div className="pd-tear print-keep-together" aria-hidden="true">
        <span className="pd-tear-notch pd-tear-notch-left" />
        <span className="pd-tear-notch pd-tear-notch-right" />
        <span className="pd-tear-chip"><span aria-hidden="true">✂</span> {label}</span>
    </div>
);

export const DocFooter = ({ cert = null, lines = [], className = '' }) => (
    <footer className={`pd-footer print-keep-together relative z-10 ${className}`}>
        {cert ? <p className="pd-cert">{cert}</p> : null}
        {lines.filter(Boolean).map((line, idx) => (
            <p key={idx} className="whitespace-pre-wrap normal-case tracking-normal">{line}</p>
        ))}
    </footer>
);

export const DocWritingLines = ({ value, lines = 2 }) => (
    <div className="space-y-1">
        {Array.from({ length: lines }).map((_, index) => (
            <div key={index} className="pd-writing-line">
                {index === 0 ? value : ''}
            </div>
        ))}
    </div>
);
