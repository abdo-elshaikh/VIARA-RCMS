import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import WorkspaceSectionBoundary from './WorkspaceSectionBoundary';
import Topbar from './Topbar';
import ChatBubble from '../communications/ChatBubble';
import { useTranslation } from 'react-i18next';
import useKeyboardShortcut from '../../hooks/useKeyboardShortcut';
import { confirmNavigation } from '../../utils/navigationGuard';

const AppLayout = ({ children, role }) => {
    const navigate = useNavigate();
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

    // Desktop Collapse State (Persist in localStorage)
    const [isCollapsed, setIsCollapsed] = useState(() => {
        try { return localStorage.getItem('sidebar-collapsed') === 'true'; } catch { return false; }
    });

    const toggleCollapse = () => {
        const newState = !isCollapsed;
        setIsCollapsed(newState);
        try { localStorage.setItem('sidebar-collapsed', newState); } catch { /* Storage is optional. */ }
    };

    // Resizable Sidebar State
    const [sidebarWidth, setSidebarWidth] = useState(() => {
        try {
            const saved = Number(localStorage.getItem('sidebar-width'));
            return saved >= 220 && saved <= 450 ? saved : 280;
        } catch { return 280; }
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
                if (newWidth < 220) newWidth = 220;
                if (newWidth > 450) newWidth = 450;
                setSidebarWidth(newWidth);
            }
        },
        [isResizing, isRtl]
    );

    const resizeWithKeyboard = React.useCallback((event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        let nextWidth = sidebarWidth;
        if (event.key === 'Home') nextWidth = 220;
        else if (event.key === 'End') nextWidth = 450;
        else {
            const physicalDirection = event.key === 'ArrowRight' ? 1 : -1;
            nextWidth += (isRtl ? -physicalDirection : physicalDirection) * 10;
            nextWidth = Math.min(450, Math.max(220, nextWidth));
        }
        setSidebarWidth(nextWidth);
        try { localStorage.setItem('sidebar-width', nextWidth); } catch { /* Storage is optional. */ }
    }, [isRtl, sidebarWidth]);

    useEffect(() => {
        if (isResizing) {
            window.addEventListener('mousemove', resize);
            window.addEventListener('mouseup', stopResizing);
        }
        return () => {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResizing);
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
        <div className="app-shell relative flex h-screen overflow-hidden">
            <a href="#main-content" className="skip-to-content">
                {t('aria.skipToContent', { defaultValue: 'Skip to main content' })}
            </a>

            {/* Mobile Sidebar Overlay */}
            {isSidebarOpen && (
                <div
                    className="workspace-overlay fixed inset-0 z-40 backdrop-blur-sm lg:hidden"
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
                    workspace-sidebar-frame fixed inset-y-0 start-0 z-50 border-e bg-[var(--viara-primary-dark)] text-white shadow-2xl ease-in-out dark:bg-[var(--VIARA-canvas)]
                    ${isResizing ? '' : 'transition-all duration-300'}
                    ${isSidebarOpen ? 'translate-x-0' : (isRtl ? 'translate-x-full' : '-translate-x-full')}
                    lg:static lg:translate-x-0
                `}
                {...(isSidebarOpen ? { role: 'dialog', 'aria-modal': 'true', 'aria-label': t('aria.mainNavigation', { defaultValue: 'Navigation menu' }) } : {})}
                style={{
                    width: isSidebarOpen ? 280 : (isCollapsed ? 80 : sidebarWidth)
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
                        className="workspace-resize-handle absolute inset-y-0 end-0 z-[60] hidden w-1.5 cursor-col-resize lg:block"
                        data-resizing={isResizing}
                        onMouseDown={startResizing}
                        onKeyDown={resizeWithKeyboard}
                        tabIndex={0}
                        role="separator"
                        aria-orientation="vertical"
                        aria-valuemin={220}
                        aria-valuemax={450}
                        aria-valuenow={sidebarWidth}
                        aria-label={t('aria.resizeNavigation', { defaultValue: 'Resize navigation panel' })}
                    />
                )}
            </aside>

            {/* Main Content Wrapper */}
            <div ref={mainRef} className="workspace-main flex h-screen min-w-0 flex-1 flex-col overflow-hidden">

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
                    tabIndex={-1}
                    aria-label={t('aria.mainContent', { defaultValue: 'Main content' })}
                    className="app-canvas workspace-canvas relative flex-1 overflow-x-hidden overflow-y-auto scroll-smooth"
                >
                    <div className="app-content workspace-content animate-fade-in-up">
                        <WorkspaceSectionBoundary>{children}</WorkspaceSectionBoundary>
                    </div>
                </main>
            </div>

            <div data-print-chrome>
                <ChatBubble />
            </div>
        </div>
    );
};

export default AppLayout;
