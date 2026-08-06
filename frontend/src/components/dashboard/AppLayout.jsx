import React, { useState, useEffect, useRef } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import ChatBubble from '../communications/ChatBubble';
import { useTranslation } from 'react-i18next';

const AppLayout = ({ children, role }) => {
    const { i18n, t } = useTranslation(['navigation']);
    const isRtl = i18n.dir() === 'rtl';
    
    // Mobile Drawer State
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const menuButtonRef = useRef(null);
    const closeButtonRef = useRef(null);
    const drawerRef = useRef(null);
    const mainRef = useRef(null);

    // Desktop Collapse State (Persist in localStorage)
    const [isCollapsed, setIsCollapsed] = useState(() => {
        return localStorage.getItem('sidebar-collapsed') === 'true';
    });

    const toggleCollapse = () => {
        const newState = !isCollapsed;
        setIsCollapsed(newState);
        localStorage.setItem('sidebar-collapsed', newState);
    };

    // Resizable Sidebar State
    const [sidebarWidth, setSidebarWidth] = useState(() => {
        const saved = localStorage.getItem('sidebar-width');
        return saved ? parseInt(saved, 10) : 280;
    });
    const [isResizing, setIsResizing] = useState(false);

    const startResizing = React.useCallback((e) => {
        e.preventDefault();
        setIsResizing(true);
    }, []);

    const stopResizing = React.useCallback(() => {
        setIsResizing(false);
        localStorage.setItem('sidebar-width', sidebarWidth);
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
            const focusable = [...drawerRef.current.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])')];
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

            {/* Mobile Sidebar Overlay */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 z-40 bg-slate-950/55 backdrop-blur-sm lg:hidden"
                    onClick={() => setIsSidebarOpen(false)}
                    aria-hidden="true"
                />
            )}

            {/* Sidebar Container */}
            <aside
                ref={drawerRef}
                className={`
                    fixed inset-y-0 start-0 z-50 border-e border-slate-200 bg-white text-slate-900 shadow-2xl ease-in-out dark:border-[var(--rcms-line)] dark:bg-[var(--rcms-surface)] dark:text-[var(--rcms-ink)]
                    ${isResizing ? '' : 'transition-all duration-300'}
                    ${isSidebarOpen ? 'translate-x-0' : (isRtl ? 'translate-x-full' : '-translate-x-full')}
                    lg:static lg:translate-x-0
                `}
                {...(isSidebarOpen ? { role: 'dialog', 'aria-modal': 'true', 'aria-label': t('aria.mainNavigation', { defaultValue: 'Navigation menu' }) } : {})}
                style={{
                    width: isCollapsed ? 80 : (window.innerWidth < 1024 ? 280 : sidebarWidth)
                }}
            >
                <Sidebar
                    role={role}
                    isCollapsed={isCollapsed}
                    toggleCollapse={toggleCollapse}
                    onCloseMobile={() => setIsSidebarOpen(false)}
                    closeButtonRef={closeButtonRef}
                />

                {/* Drag Handle */}
                {!isCollapsed && (
                    <div
                        className={`absolute inset-y-0 end-0 w-1.5 cursor-col-resize z-[60] transition-colors hidden lg:block hover:bg-cyan-500/50
                            ${isResizing ? 'bg-cyan-500/80' : ''}
                        `}
                        onMouseDown={startResizing}
                    />
                )}
            </aside>

            {/* Main Content Wrapper */}
            <div ref={mainRef} className="flex-1 flex flex-col h-screen overflow-hidden min-w-0">

                <Topbar
                    onMobileMenuClick={() => setIsSidebarOpen(true)}
                    menuButtonRef={menuButtonRef}
                    isCollapsed={isCollapsed}
                    toggleCollapse={toggleCollapse}
                />

                <main className="app-canvas relative flex-1 overflow-x-hidden overflow-y-auto p-4 scroll-smooth md:p-6 lg:p-7">
                    <div className="app-content mx-auto max-w-[1480px] animate-fade-in-up">
                        {children}
                    </div>
                </main>
            </div>

            <ChatBubble />
        </div>
    );
};

export default AppLayout;
