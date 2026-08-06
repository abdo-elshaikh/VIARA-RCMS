import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import './Landing/landing.css';
import { useGetPublicCenterSettingsQuery, useGetPublicLandingOverviewQuery } from '../store/api';
import { normalizeCenterSettings } from '../utils/centerSettings';
import { FloatingControls } from './Landing/components/FloatingControls';
import { HeroPane } from './Landing/components/HeroPane';
import { MetricsStrip } from './Landing/components/MetricsStrip';
import { ServicesPane } from './Landing/components/ServicesPane';
import { WorkflowPane } from './Landing/components/WorkflowPane';
import { ServiceDetailModal } from './Landing/components/ServiceDetailModal';
import { MobileTabs } from './Landing/components/MobileTabs';
import {
    METRICS,
    PORTAL_SHORTCUTS,
    WORKFLOW_STEPS,
    SERVICE_CATEGORIES,
    ALL_SERVICES,
    PATIENT_PORTAL_SERVICE,
} from './Landing/constants';

const Landing = () => {
    const { t, i18n } = useTranslation('landing');
    const isRtl = i18n.dir() === 'rtl';
    const [dark, setDark] = useState(() => {
        const saved = localStorage.getItem('theme');
        return saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    });
    const [activeZone, setActiveZone] = useState('overview');
    const [activeWorkflowIndex, setActiveWorkflowIndex] = useState(0);
    const [selectedCategory, setSelectedCategory] = useState('live');
    const [inspectService, setInspectService] = useState(null);
    const closeServiceModal = useCallback(() => setInspectService(null), []);
    const overviewRef = useRef(null);
    const modulesRef = useRef(null);
    const workflowRef = useRef(null);
    const zoneRefs = useRef({
        overview: overviewRef,
        modules: modulesRef,
        workflow: workflowRef,
    }).current;

    const { data: settingsData } = useGetPublicCenterSettingsQuery();
    const {
        data: liveOverview,
        isLoading: isOverviewLoading,
        isFetching: isOverviewFetching,
        isError: isOverviewError,
        refetch: refreshOverview,
    } = useGetPublicLandingOverviewQuery(undefined, {
        pollingInterval: 60000,
        refetchOnFocus: true,
        refetchOnReconnect: true,
    });
    const centerSettings = normalizeCenterSettings(settingsData || {});
    const centerName = settingsData?.center_name || 'TIBA SCAN CENTER';

    useEffect(() => {
        const root = document.documentElement;
        const body = document.body;
        const landingBodyClasses = ['antialiased', 'font-sans', 'min-h-screen'];
        root.classList.toggle('dark', dark);
        root.dir = isRtl ? 'rtl' : 'ltr';
        root.lang = i18n.language.startsWith('ar') ? 'ar' : 'en';
        localStorage.setItem('theme', dark ? 'dark' : 'light');
        body.dir = isRtl ? 'rtl' : 'ltr';
        body.classList.add(...landingBodyClasses);

        return () => body.classList.remove(...landingBodyClasses);
    }, [dark, i18n.language, isRtl]);

    const changeLanguage = () => {
        i18n.changeLanguage(i18n.language.startsWith('ar') ? 'en' : 'ar');
    };

    const focusZone = (zoneId) => {
        setActiveZone(zoneId);
        if (window.matchMedia('(max-width: 639px)').matches) return;
        const target = zoneRefs[zoneId]?.current;
        if (typeof target?.scrollIntoView === 'function') {
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    };

    const navItems = [
        { id: 'overview', label: t('managementLanding.nav.overview') },
        { id: 'modules', label: t('managementLanding.nav.modules') },
        { id: 'workflow', label: t('managementLanding.nav.workflow') },
    ];

    return (
        <div
            className="command-landing relative flex min-h-screen w-full flex-col justify-between overflow-x-hidden"
            data-page="landing"
            data-theme={dark ? 'dark' : 'light'}
            data-active-zone={activeZone}
        >
            <a className="command-skip-link" href="#command-main-content">
                {isRtl ? 'انتقل إلى المحتوى الرئيسي' : 'Skip to main content'}
            </a>
            <div className="command-backdrop" aria-hidden="true">
                <span className="command-backdrop__glow command-backdrop__glow--primary" />
                <span className="command-backdrop__glow command-backdrop__glow--secondary" />
                <span className="command-backdrop__grid" />
            </div>
            <FloatingControls
                t={t}
                isRtl={isRtl}
                dark={dark}
                navItems={navItems}
                activeZone={activeZone}
                focusZone={focusZone}
                toggleTheme={() => setDark((current) => !current)}
                changeLanguage={changeLanguage}
                language={i18n.language}
                centerName={centerName}
                logoUrl={centerSettings.logo_url}
            />

            <main id="command-main-content" className="command-main flex-1" tabIndex={-1}>
                <MobileTabs
                    items={navItems}
                    activeTab={activeZone}
                    onChange={focusZone}
                    isRtl={isRtl}
                    label={isRtl ? 'التنقل بين أقسام الصفحة' : 'Landing page sections'}
                />
                <section
                    className="command-layout command-content-frame"
                    dir={isRtl ? 'rtl' : 'ltr'}
                    aria-label={isRtl ? 'لوحة قيادة مركز الأشعة' : 'Radiology center command dashboard'}
                >
                    <section
                        className="command-operations min-w-0"
                        dir={isRtl ? 'rtl' : 'ltr'}
                        data-mobile-zone={activeZone}
                        aria-label={isRtl ? 'العمليات اليومية' : 'Daily operations'}
                    >
                        <MetricsStrip
                            isRtl={isRtl}
                            metrics={METRICS}
                            data={liveOverview?.metrics}
                            isLoading={isOverviewLoading}
                            isError={isOverviewError}
                        />
                        <ServicesPane
                            t={t}
                            isRtl={isRtl}
                            activeZone={activeZone}
                            selectedCategory={selectedCategory}
                            setSelectedCategory={setSelectedCategory}
                            setInspectService={setInspectService}
                            zoneRef={zoneRefs.modules}
                            SERVICE_CATEGORIES={SERVICE_CATEGORIES}
                            ALL_SERVICES={ALL_SERVICES}
                            PATIENT_PORTAL_SERVICE={PATIENT_PORTAL_SERVICE}
                            operationalData={liveOverview?.services}
                            generatedAt={liveOverview?.generatedAt}
                            isLoading={isOverviewLoading}
                            isFetching={isOverviewFetching}
                            isError={isOverviewError}
                            onRefresh={refreshOverview}
                        />
                        <WorkflowPane
                            t={t}
                            isRtl={isRtl}
                            activeZone={activeZone}
                            activeWorkflowIndex={activeWorkflowIndex}
                            setActiveWorkflowIndex={setActiveWorkflowIndex}
                            zoneRef={zoneRefs.workflow}
                            WORKFLOW_STEPS={WORKFLOW_STEPS}
                            workflowData={liveOverview?.workflow}
                            workflowWindowDays={liveOverview?.period?.workflowWindowDays}
                            isLoading={isOverviewLoading}
                            isError={isOverviewError}
                        />
                    </section>

                    <section
                        className="command-hero-column flex min-w-0"
                        dir={isRtl ? 'rtl' : 'ltr'}
                        data-mobile-active={activeZone === 'overview'}
                        aria-label={isRtl ? 'نظرة عامة على RCMS' : 'RCMS overview'}
                    >
                        <HeroPane
                            t={t}
                            isRtl={isRtl}
                            activeZone={activeZone}
                            zoneRef={zoneRefs.overview}
                            PORTAL_SHORTCUTS={PORTAL_SHORTCUTS}
                            isLoading={isOverviewLoading}
                            isError={isOverviewError}
                        />
                    </section>
                </section>
            </main>

            {inspectService && (
                <ServiceDetailModal
                    service={inspectService}
                    t={t}
                    isRtl={isRtl}
                    close={closeServiceModal}
                    operationalData={liveOverview?.services}
                    generatedAt={liveOverview?.generatedAt}
                    isLoading={isOverviewLoading}
                    isFetching={isOverviewFetching}
                    isError={isOverviewError}
                    onRefresh={refreshOverview}
                />
            )}

            <footer className="command-footer">
                <p className="command-footer__copy">
                    {isRtl
                        ? `جميع الحقوق محفوظة - ${new Date().getFullYear()} © ${centerName}`
                        : `All rights reserved · © ${new Date().getFullYear()} ${centerName}`}
                </p>
            </footer>
        </div>
    );
};

export default Landing;
