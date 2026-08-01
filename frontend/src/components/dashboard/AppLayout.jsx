import React, { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import ChatBubble from '../communications/ChatBubble';
import { useTranslation } from 'react-i18next';

const AppLayout = ({ children, role }) => {
    const { i18n } = useTranslation();
    const isRtl = i18n.dir() === 'rtl';
    
    // Mobile Drawer State
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

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

    return (
        <div className="app-shell relative flex h-screen overflow-hidden">

            {/* Mobile Sidebar Overlay */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 z-40 bg-slate-950/55 backdrop-blur-sm lg:hidden"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            {/* Sidebar Container */}
            <aside
                className={`
                    fixed inset-y-0 z-50 border-r border-slate-200 bg-white text-slate-900 shadow-2xl ease-in-out dark:border-[var(--rcms-line)] dark:bg-[var(--rcms-surface)] dark:text-[var(--rcms-ink)]
                    ${isResizing ? '' : 'transition-all duration-300'}
                    ${isRtl ? 'right-0' : 'left-0'}
                    ${isSidebarOpen ? 'translate-x-0' : (isRtl ? 'translate-x-full' : '-translate-x-full')}
                    lg:static lg:translate-x-0
                `}
                style={{
                    width: isCollapsed ? 80 : (window.innerWidth < 1024 ? 280 : sidebarWidth)
                }}
            >
                <Sidebar
                    role={role}
                    isCollapsed={isCollapsed}
                    toggleCollapse={toggleCollapse}
                    onCloseMobile={() => setIsSidebarOpen(false)}
                />

                {/* Drag Handle */}
                {!isCollapsed && (
                    <div
                        className={`absolute top-0 bottom-0 w-1.5 cursor-col-resize z-[60] transition-colors hidden lg:block
                            ${isRtl ? 'left-0 hover:bg-cyan-500/50' : 'right-0 hover:bg-cyan-500/50'}
                            ${isResizing ? 'bg-cyan-500/80' : ''}
                        `}
                        onMouseDown={startResizing}
                    />
                )}
            </aside>

            {/* Main Content Wrapper */}
            <div className="flex-1 flex flex-col h-screen overflow-hidden min-w-0">

                <Topbar
                    onMobileMenuClick={() => setIsSidebarOpen(true)}
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
