import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import WorkspaceSectionBoundary from './WorkspaceSectionBoundary';
import Topbar from './Topbar';
import NetworkStatusBanner from './NetworkStatusBanner';
import ChatBubble from '../communications/ChatBubble';
import TrialBanner from '../TrialBanner';
import { useTranslation } from 'react-i18next';
import useKeyboardShortcut from '../../hooks/useKeyboardShortcut';
import { confirmNavigation } from '../../utils/navigationGuard';

import { useSelector } from 'react-redux';
import { selectPreferences } from '../../store/preferencesSlice';
import '../../styles/workspace-chrome.css';
import ScrollToTop from '../ui/ScrollToTop';

const SIDEBAR_MIN = 232;
const SIDEBAR_MAX = 360;
const SIDEBAR_DEFAULT = 272;
const SIDEBAR_COLLAPSED = 72;
const SIDEBAR_MOBILE = 280;

const AppLayout = ({ children, role }) => {
    const navigate = useNavigate();
    const preferences = useSelector(selectPreferences);
    const { i18n, t } = useTranslation(['navigation']);
    const isRtl = i18n.dir() === 'rtl';

    // Alt + D: Jump to Main Dashboard
    useKeyboardShortcut('d', () => { if (confirmNavigation()) navigate('/dashboard'); }, { alt: true, ignoreInputs: false });

    // Mobile Drawer State
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [isMobileViewport, setIsMobileViewport] = useState(() => window.innerWidth < 1024);
    const menuButtonRef = useRef(null);
    const closeButtonRef = useRef(null);
    const drawerRef = useRef(null);
    const mainRef = useRef(null);

    // Desktop Collapse State (Persist in localStorage & fallback to user preferences)
    const [isCollapsed, setIsCollapsed] = useState(() => {
        try {
            const saved = localStorage.getItem('sidebar-collapsed');
            if (saved !== null) return saved === 'true';
            return Boolean(preferences?.compactSidebar);
        } catch {
            return Boolean(preferences?.compactSidebar);
        }
    });

    useEffect(() => {
        if (typeof preferences?.compactSidebar === 'boolean') {
            setIsCollapsed(preferences.compactSidebar);
        }
    }, [preferences?.compactSidebar]);

    const toggleCollapse = () => {
        const newState = !isCollapsed;
        setIsCollapsed(newState);
        try { localStorage.setItem('sidebar-collapsed', String(newState)); } catch { /* Storage is optional. */ }
    };

    // Resizable Sidebar State
    const [sidebarWidth, setSidebarWidth] = useState(() => {
        try {
            const saved = Number(localStorage.getItem('sidebar-width'));
            return saved >= SIDEBAR_MIN && saved <= SIDEBAR_MAX ? saved : SIDEBAR_DEFAULT;
        } catch { return SIDEBAR_DEFAULT; }
    });
    const [isResizing, setIsResizing] = useState(false);

    const startResizing = React.useCallback((e) => {
        e.preventDefault();
        setIsResizing(true);
    }, []);

    const stopResizing = React.useCallback(() => {
        setIsResizing(false);
        try { localStorage.setItem('sidebar-width', sidebarWidth); } catch { /* Storage is optional. */ }
    }, [sidebarWidth]);

    const resize = React.useCallback(
        (e) => {
            if (isResizing) {
                let newWidth = isRtl ? window.innerWidth - e.clientX : e.clientX;
                if (newWidth < SIDEBAR_MIN) newWidth = SIDEBAR_MIN;
                if (newWidth > SIDEBAR_MAX) newWidth = SIDEBAR_MAX;
                setSidebarWidth(newWidth);
            }
        },
        [isResizing, isRtl]
    );

    const resizeWithKeyboard = React.useCallback((event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        let nextWidth = sidebarWidth;
        if (event.key === 'Home') nextWidth = SIDEBAR_MIN;
        else if (event.key === 'End') nextWidth = SIDEBAR_MAX;
        else {
            const physicalDirection = event.key === 'ArrowRight' ? 1 : -1;
            nextWidth += (isRtl ? -physicalDirection : physicalDirection) * 10;
            nextWidth = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, nextWidth));
        }
        setSidebarWidth(nextWidth);
        try { localStorage.setItem('sidebar-width', nextWidth); } catch { /* Storage is optional. */ }
    }, [isRtl, sidebarWidth]);

    useEffect(() => {
        if (isResizing) {
            window.addEventListener('mousemove', resize);
            window.addEventListener('mouseup', stopResizing);
            document.body.style.userSelect = 'none';
            document.body.style.cursor = 'col-resize';
        }
        return () => {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResizing);
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        };
    }, [isResizing, resize, stopResizing]);

    // Close mobile drawer on resize to desktop
    useEffect(() => {
        const handleResize = () => {
            setIsMobileViewport(window.innerWidth < 1024);
            if (window.innerWidth >= 1024) {
                setIsSidebarOpen(false);
            }
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        if (!isSidebarOpen || window.innerWidth >= 1024) return undefined;
        const previousOverflow = document.body.style.overflow;
        const mainElement = mainRef.current;
        const triggerElement = menuButtonRef.current;
        const previousInert = mainElement?.inert;
        document.body.style.overflow = 'hidden';
        if (mainElement) mainElement.inert = true;
        closeButtonRef.current?.focus();
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                setIsSidebarOpen(false);
                return;
            }
            if (event.key !== 'Tab' || !drawerRef.current) return;
            const focusable = [...drawerRef.current.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])')]
                .filter((element) => element.getClientRects().length > 0 && !element.closest('[hidden]'));
            if (!focusable.length) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.body.style.overflow = previousOverflow;
            if (mainElement) mainElement.inert = previousInert || false;
            document.removeEventListener('keydown', handleKeyDown);
            triggerElement?.focus();
        };
    }, [isSidebarOpen]);

    return (
        <div className="app-shell viara-workspace-shell relative flex h-dvh min-h-0 overflow-hidden bg-[var(--VIARA-canvas)]">
            <a href="#main-content" className="skip-to-content">
                {t('aria.skipToContent', { defaultValue: 'Skip to main content' })}
            </a>

            {/* Mobile Sidebar Overlay */}
            {isSidebarOpen && (
                <div
                    className="workspace-overlay fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-[2px] lg:hidden"
                    onClick={() => setIsSidebarOpen(false)}
                    aria-hidden="true"
                />
            )}

            {/* Sidebar Container */}
            <aside
                ref={drawerRef}
                data-print-chrome
                {...(isMobileViewport && !isSidebarOpen ? { inert: '', 'aria-hidden': true } : {})}
                className={`
                    workspace-sidebar-frame viara-sidebar-frame fixed inset-y-0 start-0 z-50 border-e border-white/10 bg-[var(--viara-primary-dark)] text-white shadow-[0_24px_64px_-12px_rgba(2,6,23,0.55)] ease-in-out lg:shadow-none dark:border-[var(--VIARA-line)] dark:bg-[var(--VIARA-canvas)]
                    ${isResizing ? '' : 'transition-[width,transform] duration-300 motion-reduce:transition-none'}
                    ${isSidebarOpen ? 'translate-x-0' : (isRtl ? 'translate-x-full' : '-translate-x-full')}
                    lg:static lg:translate-x-0
                `}
                {...(isSidebarOpen ? { role: 'dialog', 'aria-modal': 'true', 'aria-label': t('aria.mainNavigation', { defaultValue: 'Navigation menu' }) } : {})}
                style={{
                    width: isSidebarOpen ? SIDEBAR_MOBILE : (isCollapsed ? SIDEBAR_COLLAPSED : sidebarWidth),
                    willChange: isResizing ? 'width' : undefined
                }}
            >
                <Sidebar
                    role={role}
                    isCollapsed={isCollapsed && !isSidebarOpen}
                    toggleCollapse={toggleCollapse}
                    onCloseMobile={() => setIsSidebarOpen(false)}
                    closeButtonRef={closeButtonRef}
                />

                {/* Drag Handle */}
                {!isCollapsed && (
                    <div
                        className="workspace-resize-handle vx-resize-handle absolute inset-y-0 end-0 z-[60] hidden w-3 translate-x-1/2 cursor-col-resize lg:block rtl:-translate-x-1/2"
                        data-resizing={isResizing}
                        onMouseDown={startResizing}
                        onKeyDown={resizeWithKeyboard}
                        tabIndex={0}
                        role="separator"
                        aria-orientation="vertical"
                        aria-valuemin={SIDEBAR_MIN}
                        aria-valuemax={SIDEBAR_MAX}
                        aria-valuenow={sidebarWidth}
                        aria-label={t('aria.resizeNavigation', { defaultValue: 'Resize navigation panel' })}
                    />
                )}
            </aside>

            {/* Main Content Wrapper */}
            <div className="workspace-main viara-workspace-main flex h-dvh min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <NetworkStatusBanner />
                <TrialBanner />

                <div data-print-chrome>
                    <Topbar
                        onMobileMenuClick={() => setIsSidebarOpen(true)}
                        menuButtonRef={menuButtonRef}
                        isCollapsed={isCollapsed}
                        toggleCollapse={toggleCollapse}
                    />
                </div>

                <main
                    id="main-content"
                    ref={mainRef}
                    tabIndex={-1}
                    aria-label={t('aria.mainContent', { defaultValue: 'Main content' })}
                    className="app-canvas workspace-canvas relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain scroll-smooth bg-[var(--VIARA-canvas)]"
                    style={{ scrollbarGutter: 'stable' }}
                >
                    <div className="app-content workspace-content min-h-full animate-fade-in-up">
                        <WorkspaceSectionBoundary>{children}</WorkspaceSectionBoundary>
                    </div>
                    <ScrollToTop scrollRef={mainRef} />
                </main>
            </div>

            <div data-print-chrome>
                <ChatBubble />
            </div>
        </div>
    );
};

export default AppLayout;