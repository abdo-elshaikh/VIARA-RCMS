/**
 * Onboarding.jsx
 * --------------
 * Phase 7 — First-run setup wizard for new trial/standard installations.
 *
 * Steps
 * =====
 *  1. مرحباً — Welcome screen with system overview
 *  2. معلومات المركز — Center name, specialty, address, phone
 *  3. أول طبيب — Add first doctor + exam room
 *  4. أول موعد — Book a demo appointment
 *  5. جاهز! — Success + quick tour links + upgrade CTA
 *
 * Trigger
 * =======
 * The wizard auto-shows on first login if localStorage key
 * "viara_onboarding_complete" is absent.
 * After completion it sets that key so it never shows again.
 *
 * Can also be reached via /onboarding route.
 */

import React, { useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authenticatedFetch } from '../utils/authenticatedFetch';
import { isOnboardingComplete, markOnboardingComplete } from '../utils/onboardingState';
import { useLicense } from '../hooks/useLicense';

const UPGRADE_URL = import.meta.env.VITE_UPGRADE_URL || 'https://viara.net/upgrade';
const CONTACT_URL = import.meta.env.VITE_SALES_CONTACT_URL || 'https://viara.net/contact';
const API_BASE = import.meta.env.VITE_API_URL || '/api';

const TOTAL_STEPS = 5;

// ─── Phone validation ────────────────────────────────────────────────────────
// Accepts international formats: optional leading +, then 7–15 digits,
// with optional spaces/dashes as separators.
const PHONE_REGEX = /^\+?[\d\s-]{7,20}$/;

const validatePhone = (value) => {
    if (!value || !value.trim()) return null; // phone is optional
    return PHONE_REGEX.test(value.trim()) ? null : 'رقم الهاتف غير صحيح — أدخل أرقاماً فقط (7–15 خانة)';
};

// ─── Step components ────────────────────────────────────────────────────────

const StepWelcome = ({ onNext }) => (
    <div style={stepContent}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>🏥</div>
        <h2 style={stepTitle}>أهلاً بك في VIARA RCMS</h2>
        <p style={stepDesc}>
            نظام إدارة مراكز الأشعة الأكثر شمولاً. سنساعدك على إعداد نظامك في أقل من 5 دقائق.
        </p>
        <ul style={{ textAlign: 'right', marginTop: 16, lineHeight: 2, color: '#475569', fontSize: 14 }}>
            <li>✅ إدارة المواعيد والمرضى</li>
            <li>✅ التقارير الطبية والفواتير</li>
            <li>✅ نظام PACS للصور الطبية</li>
            <li>✅ لوحة تحكم شاملة وتحليلات</li>
        </ul>
        <button id="onboarding-step1-next" style={primaryBtn} onClick={onNext}>
            ابدأ الإعداد ←
        </button>
    </div>
);

const StepCenterInfo = ({ onNext, onBack }) => {
    const [form, setForm] = useState({ name: '', specialty: '', phone: '', address: '' });
    const [includeDemo, setIncludeDemo] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [phoneError, setPhoneError] = useState('');

    // License upload / activation state
    const [licenseState, setLicenseState] = useState({ loading: false, success: null, error: null, info: null });
    const [showKeyPaste, setShowKeyPaste] = useState(false);
    const [pastedKey, setPastedKey] = useState('');
    const [isDragOver, setIsDragOver] = useState(false);
    const fileInputRef = React.useRef(null);

    const handleActivateKey = async (rawKey) => {
        if (!rawKey || !rawKey.trim()) return;
        setLicenseState({ loading: true, success: null, error: null, info: null });
        try {
            const res = await authenticatedFetch(`${API_BASE}/license/activate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: rawKey.trim() })
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.error || 'تعذّر تفعيل مفتاح الترخيص');
            }

            setLicenseState({
                loading: false,
                success: 'تم تفعيل مفتاح الترخيص بنجاح!',
                error: null,
                info: data.license
            });

            // Auto-fill center name from license if center name is currently blank
            if (data.license?.customerId && !form.name.trim()) {
                setForm(prev => ({ ...prev, name: data.license.customerId }));
            }
        } catch (err) {
            setLicenseState({
                loading: false,
                success: null,
                error: err.message || 'فشل قراءة وتفعيل مفتاح الترخيص',
                info: null
            });
        }
    };

    const handleFileChange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result;
            if (typeof text === 'string') {
                handleActivateKey(text);
            }
        };
        reader.onerror = () => {
            setLicenseState({
                loading: false,
                success: null,
                error: 'تعذّر قراءة الملف المحدد من جهازك',
                info: null
            });
        };
        reader.readAsText(file);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result;
            if (typeof text === 'string') {
                handleActivateKey(text);
            }
        };
        reader.readAsText(file);
    };

    const handleChange = (k) => (e) => {
        setForm(prev => ({ ...prev, [k]: e.target.value }));
        if (k === 'phone') setPhoneError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.name.trim()) { setError('اسم المركز مطلوب'); return; }

        // FIX #3: validate phone before submitting
        const phoneValidation = validatePhone(form.phone);
        if (phoneValidation) { setPhoneError(phoneValidation); return; }

        setSaving(true);
        setError('');
        try {
            const res = await authenticatedFetch(`${API_BASE}/settings/center`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    center_name: form.name,
                    center_specialty: form.specialty,
                    center_phone: form.phone,
                    center_address: form.address,
                }),
            });

            // fetch only rejects on network faults — a 401/403/500 is still a
            // resolved response, so the status has to be checked explicitly or
            // the wizard would report success on a rejected write.
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            // If includeDemo is checked, trigger demo seed API asynchronously
            if (includeDemo) {
                try {
                    await authenticatedFetch(`${API_BASE}/settings/demo-seed`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' }
                    });
                } catch {
                    // Non-blocking: proceed even if already seeded or demo seed fails
                }
            }

            onNext({ centerName: form.name, includeDemo });
        } catch {
            // Stay on this step so the warning is actually visible. The
            // installer is never trapped: "continue anyway" is right there,
            // and the details can be completed later from Settings.
            setError('تعذّر حفظ معلومات المركز تلقائياً. يمكنك المتابعة وإكمالها لاحقاً من الإعدادات.');
            setSaving(false);
        }
    };

    return (
        <div style={stepContent}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🏢</div>
            <h2 style={stepTitle}>معلومات المركز</h2>
            <p style={stepDesc}>أدخل البيانات الأساسية لمركزك ويمكنك تفعيل مفتاح الترخيص أدناه</p>

            {/* License Activation Card (Upload .txt or paste key) */}
            <div
                id="onboarding-license-card"
                style={{
                    width: '100%',
                    maxWidth: 400,
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: 12,
                    padding: '14px',
                    marginTop: 14,
                    textAlign: 'right',
                    boxSizing: 'border-box'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>🔑 ترخيص النظام (License Key)</span>
                    <span style={{ fontSize: 11, color: '#64748b' }}>اختياري</span>
                </div>
                <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 10px 0', lineHeight: 1.5 }}>
                    ارفع ملف الترخيص (.txt) المُرسل إليك أو الصق المفتاح مباشرة لتفعيل مميزات نسختك فوراً:
                </p>

                {/* Drag and drop zone */}
                <div
                    id="license-drop-zone"
                    onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                        border: isDragOver ? '2px dashed #2563eb' : '2px dashed #cbd5e1',
                        backgroundColor: isDragOver ? '#eff6ff' : '#ffffff',
                        borderRadius: 10,
                        padding: '14px 10px',
                        textAlign: 'center',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                    }}
                >
                    <input
                        ref={fileInputRef}
                        id="onboarding-license-file-input"
                        type="file"
                        accept=".txt,.lic,.key"
                        onChange={handleFileChange}
                        style={{ display: 'none' }}
                    />
                    <div style={{ fontSize: 22, marginBottom: 2 }}>📄</div>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#334155' }}>
                        اضغط لاختيار ملف <span dir="ltr">.txt</span> أو اسحبه هنا
                    </p>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>يدعم ملفات الترخيص المشفرة (.txt / .lic)</span>
                </div>

                {/* Toggle paste input */}
                <div style={{ textAlign: 'center', marginTop: 8 }}>
                    <button
                        type="button"
                        id="toggle-license-paste-btn"
                        onClick={() => setShowKeyPaste(prev => !prev)}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: '#2563eb',
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: 'pointer',
                            textDecoration: 'underline'
                        }}
                    >
                        {showKeyPaste ? 'إخفاء حقل اللصق المباشر' : 'أو الصق مفتاح الترخيص كنص 📋'}
                    </button>
                </div>

                {/* Paste Area */}
                {showKeyPaste && (
                    <div style={{ marginTop: 8 }}>
                        <textarea
                            id="onboarding-license-paste-input"
                            value={pastedKey}
                            onChange={(e) => setPastedKey(e.target.value)}
                            placeholder="الصق نص المفتاح المشفر هنا..."
                            dir="ltr"
                            rows={3}
                            style={{
                                width: '100%',
                                boxSizing: 'border-box',
                                padding: '8px 10px',
                                fontSize: 11,
                                borderRadius: 8,
                                border: '1px solid #cbd5e1',
                                fontFamily: 'monospace',
                                outline: 'none'
                            }}
                        />
                        <button
                            type="button"
                            id="activate-pasted-license-btn"
                            disabled={!pastedKey.trim() || licenseState.loading}
                            onClick={() => handleActivateKey(pastedKey)}
                            style={{
                                ...primaryBtn,
                                width: '100%',
                                padding: '8px',
                                fontSize: 12,
                                marginTop: 6,
                                background: '#3b82f6'
                            }}
                        >
                            {licenseState.loading ? 'جاري التحقق والتفعيل...' : 'تفعيل المفتاح المكتوب'}
                        </button>
                    </div>
                )}

                {/* Status messages */}
                {licenseState.loading && (
                    <p style={{ fontSize: 12, color: '#2563eb', textAlign: 'center', marginTop: 8 }}>
                        جاري فحص وتفعيل مفتاح الترخيص...
                    </p>
                )}

                {licenseState.success && (
                    <div id="license-success-box" style={{
                        marginTop: 10,
                        padding: '10px 12px',
                        background: '#f0fdf4',
                        border: '1px solid #bbf7d0',
                        borderRadius: 8,
                        fontSize: 12,
                        color: '#166534',
                        textAlign: 'right'
                    }}>
                        <div style={{ fontWeight: 700, marginBottom: 4 }}>✅ {licenseState.success}</div>
                        {licenseState.info && (
                            <div style={{ fontSize: 11, lineHeight: 1.6, color: '#15803d' }}>
                                <span>العميل: <strong>{licenseState.info.customerId}</strong></span><br />
                                <span>الإصدار: <strong>{licenseState.info.edition === 'trial' ? 'النسخة التجريبية (Trial)' : 'النسخة الكاملة (Standard)'}</strong></span>
                                {licenseState.info.daysRemaining !== null && (
                                    <span> — الأيام المتبقية: <strong>{licenseState.info.daysRemaining}</strong></span>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {licenseState.error && (
                    <div id="license-error-box" style={{
                        marginTop: 10,
                        padding: '8px 12px',
                        background: '#fef2f2',
                        border: '1px solid #fecaca',
                        borderRadius: 8,
                        fontSize: 12,
                        color: '#b91c1c',
                        textAlign: 'right'
                    }}>
                        ⚠️ {licenseState.error}
                    </div>
                )}
            </div>

            <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: 400, marginTop: 16 }}>
                <label style={labelStyle}>اسم المركز *</label>
                <input id="onboarding-center-name" style={inputStyle} value={form.name}
                    onChange={handleChange('name')} placeholder="مركز الأشعة التخصصي" required />

                <label style={labelStyle}>التخصص</label>
                <input id="onboarding-center-specialty" style={inputStyle} value={form.specialty}
                    onChange={handleChange('specialty')} placeholder="أشعة تشخيصية" />

                <label style={labelStyle}>رقم الهاتف</label>
                <input
                    id="onboarding-center-phone"
                    style={{ ...inputStyle, ...(phoneError ? { borderColor: '#ef4444' } : {}) }}
                    value={form.phone}
                    onChange={handleChange('phone')}
                    placeholder="+966 5x xxx xxxx"
                    aria-invalid={Boolean(phoneError)}
                    aria-describedby={phoneError ? 'phone-error' : undefined}
                />
                {phoneError && (
                    <p id="phone-error" style={{ color: '#ef4444', fontSize: 12, marginTop: 4, textAlign: 'right' }}>
                        {phoneError}
                    </p>
                )}

                <label style={labelStyle}>العنوان</label>
                <input id="onboarding-center-address" style={inputStyle} value={form.address}
                    onChange={handleChange('address')} placeholder="المدينة، الشارع" />

                {/* Demo Data Selection Card */}
                <div
                    id="onboarding-demo-card"
                    style={{
                        background: '#f8fafc',
                        border: includeDemo ? '2px solid #3b82f6' : '1px solid #e2e8f0',
                        borderRadius: 12,
                        padding: '12px 14px',
                        marginTop: 16,
                        textAlign: 'right',
                        boxSizing: 'border-box'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>📦 البيانات السريرية التجريبية (Demo Data)</span>
                        <span style={{ fontSize: 11, background: includeDemo ? '#dbeafe' : '#f1f5f9', color: includeDemo ? '#1e40af' : '#64748b', padding: '2px 8px', borderRadius: 6, fontWeight: 600 }}>
                            {includeDemo ? 'تضمين مفعل' : 'مستغنى عنها'}
                        </span>
                    </div>
                    <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 10px 0', lineHeight: 1.5 }}>
                        اختر ما إذا كنت ترغب في ملء بيانات سريرية تجريبية لاستكشاف النظام أو البدء بقاعدة بيانات نظيفة:
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <label
                            style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: 8,
                                padding: '8px 10px',
                                borderRadius: 8,
                                background: includeDemo ? '#eff6ff' : '#ffffff',
                                border: includeDemo ? '1px solid #93c5fd' : '1px solid #e2e8f0',
                                cursor: 'pointer'
                            }}
                        >
                            <input
                                type="radio"
                                name="demoOption"
                                id="onboarding-demo-include"
                                checked={includeDemo}
                                onChange={() => setIncludeDemo(true)}
                                style={{ marginTop: 2 }}
                            />
                            <div>
                                <strong style={{ color: '#1e3a8a', fontSize: 12, display: 'block' }}>
                                    تضمين بيانات تجريبية استكشافية (موصى به)
                                </strong>
                                <span style={{ color: '#64748b', fontSize: 11 }}>
                                    إضافة أجهزة، غرف فحص، أنواع فحوصات، ومرضى ومواعيد لاختبار دورة العمل فوراً.
                                </span>
                            </div>
                        </label>

                        <label
                            style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: 8,
                                padding: '8px 10px',
                                borderRadius: 8,
                                background: !includeDemo ? '#eff6ff' : '#ffffff',
                                border: !includeDemo ? '1px solid #93c5fd' : '1px solid #e2e8f0',
                                cursor: 'pointer'
                            }}
                        >
                            <input
                                type="radio"
                                name="demoOption"
                                id="onboarding-demo-skip"
                                checked={!includeDemo}
                                onChange={() => setIncludeDemo(false)}
                                style={{ marginTop: 2 }}
                            />
                            <div>
                                <strong style={{ color: '#334155', fontSize: 12, display: 'block' }}>
                                    الاستغناء عن البيانات التجريبية (بدء نظيف)
                                </strong>
                                <span style={{ color: '#64748b', fontSize: 11 }}>
                                    البدء بقاعدة بيانات نظيفة وخالية تماماً لإدخال بيانات المركز الحقيقية.
                                </span>
                            </div>
                        </label>
                    </div>
                </div>

                {error && (
                    <div style={errorBox}>
                        <p style={{ color: '#ef4444', fontSize: 13, margin: 0 }}>{error}</p>
                        <button
                            type="button"
                            id="onboarding-step2-continue-anyway"
                            style={{ ...secondaryBtn, padding: '8px 16px', fontSize: 13, marginTop: 10 }}
                            onClick={() => onNext({ centerName: form.name, includeDemo })}
                        >
                            متابعة على أي حال
                        </button>
                    </div>
                )}

                <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
                    <button type="button" id="onboarding-step2-back" style={secondaryBtn} onClick={onBack}>← السابق</button>
                    <button type="submit" id="onboarding-step2-next" style={primaryBtn} disabled={saving}>
                        {saving ? 'جاري الحفظ...' : 'التالي ←'}
                    </button>
                </div>
            </form>
        </div>
    );
};

// FIX #5 + #7: show centerName and add a direct link to Settings
const StepFirstDoctor = ({ onNext, onBack, centerName }) => (
    <div style={stepContent}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>👨‍⚕️</div>
        <h2 style={stepTitle}>أضف أول طبيب وغرفة</h2>
        {/* FIX #7: use centerName when available */}
        <p style={stepDesc}>
            {centerName
                ? <>يمكنك إضافة الأطباء والغرف لـ <strong>{centerName}</strong> الآن أو لاحقاً من الإعدادات.</>
                : 'يمكنك إضافة الأطباء والغرف من قسم الإعدادات في أي وقت.'}
        </p>
        <div style={cardGrid}>
            <div style={infoCard}>
                <span style={{ fontSize: 28 }}>👩‍⚕️</span>
                <strong>إضافة طبيب</strong>
                <span style={{ fontSize: 13, color: '#64748b' }}>من الإعدادات ← الموظفون</span>
            </div>
            <div style={infoCard}>
                <span style={{ fontSize: 28 }}>🚪</span>
                <strong>إضافة غرفة</strong>
                <span style={{ fontSize: 13, color: '#64748b' }}>من الإعدادات ← الغرف</span>
            </div>
        </div>
        {/* FIX #5: direct link to settings opens in same app, returns to onboarding context */}
        <Link
            to="/settings?tab=staff"
            id="onboarding-step3-goto-settings"
            style={{ ...secondaryBtn, textDecoration: 'none', display: 'inline-block', marginTop: 12, fontSize: 13 }}
        >
            ⚙️ فتح الإعدادات الآن
        </Link>
        <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
            <button id="onboarding-step3-back" style={secondaryBtn} onClick={onBack}>← السابق</button>
            <button id="onboarding-step3-next" style={primaryBtn} onClick={onNext}>التالي ←</button>
        </div>
    </div>
);

// FIX #1: "book" button navigates to /appointments instead of calling onNext
const StepFirstAppointment = ({ onNext, onBack, isTrial, navigate, includeDemo = true }) => (
    <div style={stepContent}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>📅</div>
        <h2 style={stepTitle}>جرِّب حجز موعد</h2>
        <p style={stepDesc}>
            الآن يمكنك حجز أول موعد لرؤية كيف يعمل النظام وتجربة سير العمل.
        </p>

        {includeDemo ? (
            <div id="onboarding-demo-seeded-box" style={{ ...infoCard, background: '#f0fdf4', border: '1px solid #bbf7d0', marginTop: 12, textAlign: 'right', width: '100%', maxWidth: 400 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: '#166534', fontSize: 13 }}>
                    <span>✅ تم تجهيز مرضى ومواعيد تجريبية</span>
                </div>
                <span style={{ fontSize: 12, color: '#15803d', marginTop: 4, lineHeight: 1.5 }}>
                    تم إنشاء مواعيد وحالات سريرية جاهزة بأجهزة الرنين والمقطعية والأشعة والسونار لتجربة دورة العمل بالكامل.
                </span>
            </div>
        ) : (
            <div id="onboarding-demo-clean-box" style={{ ...infoCard, background: '#f8fafc', marginTop: 12, textAlign: 'right', width: '100%', maxWidth: 400 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: '#334155', fontSize: 13 }}>
                    <span>📋 قاعدة بيانات نظيفة وجاهزة</span>
                </div>
                <span style={{ fontSize: 12, color: '#64748b', marginTop: 4, lineHeight: 1.5 }}>
                    اخترت البدء بقاعدة بيانات فارغة وخالية تماماً من البيانات التجريبية لإدخال بيانات مرضاك الفعليين.
                </span>
            </div>
        )}

        <div style={{ ...infoCard, marginTop: 12, width: '100%', maxWidth: 400 }}>
            <span style={{ fontSize: 32 }}>🎯</span>
            <div>
                <strong style={{ display: 'block', marginBottom: 4 }}>
                    {isTrial ? 'المواعيد في النسخة التجريبية' : 'المواعيد غير محدودة'}
                </strong>
                <span style={{ fontSize: 13, color: '#64748b' }}>
                    {isTrial
                        ? 'يمكنك حجز حتى 100 موعد خلال فترة التجربة الشهرية. بعد التعاقد لا يوجد حد للمواعيد.'
                        : 'لا يوجد حد لعدد المواعيد في اشتراكك.'}
                </span>
            </div>
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
            <button id="onboarding-step4-back" style={secondaryBtn} onClick={onBack}>← السابق</button>
            {/* FIX #1: mark onboarding complete then navigate to appointments */}
            <button
                id="onboarding-step4-book"
                style={{ ...primaryBtn, background: '#059669' }}
                onClick={() => {
                    markOnboardingComplete();
                    navigate('/appointments?new=1');
                }}
            >
                📅 حجز موعد تجريبي
            </button>
            <button id="onboarding-step4-skip" style={secondaryBtn} onClick={onNext}>تخطي</button>
        </div>
    </div>
);

const StepComplete = ({ onFinish, centerName, isTrial, daysRemaining, includeDemo = true }) => (
    <div style={stepContent}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>🎉</div>
        <h2 style={stepTitle}>نظامك جاهز!</h2>
        <p style={stepDesc}>
            أهلاً بك في VIARA{centerName ? ` — ${centerName}` : ''}.<br />
            {includeDemo ? (
                <span style={{ color: '#2563eb', fontWeight: 600, display: 'block', margin: '4px 0' }}>
                    ✨ تم إعداد النظام بنجاح مع البيانات السريرية التجريبية للاستكشاف السريع.
                </span>
            ) : (
                <span style={{ color: '#059669', fontWeight: 600, display: 'block', margin: '4px 0' }}>
                    ✨ تم إعداد النظام بنجاح مع قاعدة بيانات نظيفة وخالية من البيانات التجريبية.
                </span>
            )}
            {isTrial
                ? <>لديك <strong id="trial-days">{daysRemaining ?? 30}</strong> يوماً لاستكشاف جميع الميزات المتاحة في النسخة التجريبية.</>
                : <>جميع الميزات متاحة في اشتراكك. ابدأ بإضافة فريقك ومواعيدك.</>}
        </p>

        {/* FIX #4: use <Link> instead of <a href> to avoid full page reloads */}
        <div style={cardGrid}>
            <Link to="/appointments" style={{ ...infoCard, textDecoration: 'none', color: 'inherit' }}>
                <span style={{ fontSize: 28 }}>📅</span>
                <strong>المواعيد</strong>
            </Link>
            <Link to="/patients" style={{ ...infoCard, textDecoration: 'none', color: 'inherit' }}>
                <span style={{ fontSize: 28 }}>👥</span>
                <strong>المرضى</strong>
            </Link>
            <Link to="/dashboard" style={{ ...infoCard, textDecoration: 'none', color: 'inherit' }}>
                <span style={{ fontSize: 28 }}>📊</span>
                <strong>لوحة التحكم</strong>
            </Link>
            <Link to="/settings" style={{ ...infoCard, textDecoration: 'none', color: 'inherit' }}>
                <span style={{ fontSize: 28 }}>⚙️</span>
                <strong>الإعدادات</strong>
            </Link>
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 28, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button id="onboarding-finish-btn" style={primaryBtn} onClick={onFinish}>
                ابدأ الاستخدام →
            </button>
            {isTrial ? (
                <a href={UPGRADE_URL} target="_blank" rel="noopener noreferrer"
                    id="onboarding-upgrade-btn" style={{ ...secondaryBtn, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                    🚀 ترقية للنسخة الكاملة
                </a>
            ) : (
                <a href={CONTACT_URL} target="_blank" rel="noopener noreferrer"
                    id="onboarding-contact-btn" style={{ ...secondaryBtn, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                    💬 تواصل مع الدعم
                </a>
            )}
        </div>
    </div>
);

// ─── Progress bar ────────────────────────────────────────────────────────────

// FIX #8: add aria-label and role for accessibility
const ProgressBar = ({ step }) => (
    <div
        style={{ width: '100%', marginBottom: 32 }}
        role="progressbar"
        aria-valuenow={step}
        aria-valuemin={1}
        aria-valuemax={TOTAL_STEPS}
        aria-label={`الخطوة ${step} من ${TOTAL_STEPS}`}
    >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
                <div
                    key={i}
                    aria-label={`الخطوة ${i + 1}${i < step - 1 ? ' (مكتملة)' : i === step - 1 ? ' (الحالية)' : ''}`}
                    style={{
                        width: 32, height: 32, borderRadius: '50%',
                        background: i < step ? '#2563eb' : i === step - 1 ? '#2563eb' : '#e2e8f0',
                        color: i < step ? '#fff' : '#94a3b8',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 13, fontWeight: 700,
                        transition: 'all 0.3s',
                    }}
                >
                    {i < step - 1 ? '✓' : i + 1}
                </div>
            ))}
        </div>
        <div style={{ height: 4, background: '#e2e8f0', borderRadius: 2 }}>
            <div style={{
                height: '100%', borderRadius: 2, background: '#2563eb',
                width: `${((step - 1) / (TOTAL_STEPS - 1)) * 100}%`,
                transition: 'width 0.4s ease',
            }} />
        </div>
    </div>
);

// ─── License loading placeholder ─────────────────────────────────────────────

// FIX #2: show a spinner instead of blank content while license loads
const LicenseLoadingStep = () => (
    <div style={{ ...stepContent, paddingTop: 32, paddingBottom: 32 }}>
        <div style={{
            width: 40, height: 40, borderRadius: '50%',
            border: '3px solid #e2e8f0',
            borderTop: '3px solid #2563eb',
            animation: 'spin 0.8s linear infinite',
        }} />
        <p style={{ ...stepDesc, marginTop: 16 }}>جاري تحميل معلومات الترخيص…</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
);

// ─── Skip confirmation modal ──────────────────────────────────────────────────

// FIX #6: confirm before skipping so the user doesn't lose the wizard accidentally
const SkipConfirmModal = ({ onConfirm, onCancel }) => (
    <div style={modalOverlay} role="dialog" aria-modal="true" aria-labelledby="skip-modal-title">
        <div style={modalBox}>
            <h3 id="skip-modal-title" style={{ ...stepTitle, fontSize: 18, marginBottom: 8 }}>
                تخطي الإعداد؟
            </h3>
            <p style={{ ...stepDesc, marginBottom: 20 }}>
                لن يظهر هذا المعالج مرة أخرى. يمكنك دائماً إكمال الإعداد لاحقاً من صفحة الإعدادات.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button
                    id="skip-modal-cancel"
                    style={secondaryBtn}
                    onClick={onCancel}
                    autoFocus
                >
                    العودة للإعداد
                </button>
                <button
                    id="skip-modal-confirm"
                    style={{ ...primaryBtn, background: '#ef4444' }}
                    onClick={onConfirm}
                >
                    نعم، تخطي
                </button>
            </div>
        </div>
    </div>
);

// ─── Main wizard ─────────────────────────────────────────────────────────────

const Onboarding = () => {
    const navigate = useNavigate();
    const [step, setStep] = useState(1);
    const [data, setData] = useState({});
    const [showSkipModal, setShowSkipModal] = useState(false);
    const { isTrial, daysRemaining, loading: licenseLoading } = useLicense();

    const next = useCallback((extra = {}) => {
        setData(prev => ({ ...prev, ...extra }));
        setStep(prev => Math.min(prev + 1, TOTAL_STEPS));
    }, []);

    const back = useCallback(() => setStep(prev => Math.max(prev - 1, 1)), []);

    const finish = useCallback(() => {
        markOnboardingComplete();
        navigate('/dashboard');
    }, [navigate]);

    // FIX #6: gate the actual skip behind a confirmation
    const requestSkip = useCallback(() => setShowSkipModal(true), []);
    const confirmSkip = useCallback(() => { setShowSkipModal(false); finish(); }, [finish]);
    const cancelSkip = useCallback(() => setShowSkipModal(false), []);

    return (
        <div style={pageStyle}>
            {/* FIX #6: confirmation modal */}
            {showSkipModal && (
                <SkipConfirmModal onConfirm={confirmSkip} onCancel={cancelSkip} />
            )}

            {/* Card */}
            <div style={cardStyle}>
                {/* Header */}
                <div style={cardHeader}>
                    <span style={{ fontWeight: 800, fontSize: 20, color: '#2563eb' }}>VIARA</span>
                    <span style={{ fontSize: 13, color: '#64748b' }}>معالج الإعداد الأولي</span>
                </div>

                <ProgressBar step={step} />

                {/* Steps */}
                {step === 1 && <StepWelcome onNext={next} />}
                {step === 2 && <StepCenterInfo onNext={next} onBack={back} />}
                {step === 3 && (
                    <StepFirstDoctor
                        onNext={next}
                        onBack={back}
                        centerName={data.centerName}
                    />
                )}
                {/* FIX #2: show spinner while license loads on steps 4 & 5 */}
                {step === 4 && (
                    licenseLoading
                        ? <LicenseLoadingStep />
                        : <StepFirstAppointment onNext={next} onBack={back} isTrial={isTrial} navigate={navigate} includeDemo={data.includeDemo} />
                )}
                {step === 5 && (
                    licenseLoading
                        ? <LicenseLoadingStep />
                        : <StepComplete onFinish={finish} centerName={data.centerName} isTrial={isTrial} daysRemaining={daysRemaining} includeDemo={data.includeDemo} />
                )}
            </div>

            {/* FIX #6: skip link now triggers confirmation modal */}
            {step < 5 && (
                <button
                    id="onboarding-skip-all"
                    style={{ marginTop: 16, background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 13 }}
                    onClick={requestSkip}
                >
                    تخطي الإعداد — أبدأ مباشرةً
                </button>
            )}
        </div>
    );
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const pageStyle = {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)',
    padding: '24px 16px',
    fontFamily: 'system-ui, sans-serif',
    direction: 'rtl',
};

const cardStyle = {
    background: '#fff',
    borderRadius: '20px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.08)',
    padding: '40px 40px 32px',
    width: '100%',
    maxWidth: '540px',
};

const cardHeader = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
    paddingBottom: 16,
    borderBottom: '1px solid #f1f5f9',
};

const stepContent = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
};

const stepTitle = {
    fontSize: '22px',
    fontWeight: 800,
    color: '#1e293b',
    margin: '0 0 8px',
};

const stepDesc = {
    fontSize: 14,
    color: '#64748b',
    lineHeight: 1.7,
    margin: 0,
    maxWidth: 400,
};

const cardGrid = {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 12,
    width: '100%',
    maxWidth: 380,
    marginTop: 20,
};

const infoCard = {
    background: '#f8fafc',
    borderRadius: 12,
    padding: '16px 12px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    fontSize: 14,
    border: '1px solid #e2e8f0',
};

const labelStyle = {
    display: 'block',
    fontSize: 13,
    fontWeight: 600,
    color: '#374151',
    marginTop: 12,
    marginBottom: 4,
    textAlign: 'right',
};

const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid #d1d5db',
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
    textAlign: 'right',
    direction: 'rtl',
};

const errorBox = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 2,
    marginTop: 12,
    padding: '10px 12px',
    borderRadius: 8,
    background: '#fef2f2',
    border: '1px solid #fecaca',
};

const primaryBtn = {
    background: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    padding: '12px 28px',
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'opacity 0.15s',
    flexShrink: 0,
};

const secondaryBtn = {
    background: '#f1f5f9',
    color: '#475569',
    border: '1px solid #e2e8f0',
    borderRadius: 10,
    padding: '12px 20px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    flexShrink: 0,
};

const modalOverlay = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: 16,
};

const modalBox = {
    background: '#fff',
    borderRadius: 16,
    padding: '32px 28px',
    maxWidth: 380,
    width: '100%',
    textAlign: 'center',
    boxShadow: '0 8px 32px rgba(0,0,0,0.16)',
};

export default Onboarding;
