import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    ArrowLeft,
    ArrowRight,
    BarChart2,
    Globe2,
    Menu,
    Moon,
    ScanLine,
    Sun,
    UserRound,
    Workflow,
    X,
} from 'lucide-react';

export const BrandLogo = ({ centerName = 'TIBA SCAN CENTER', logoUrl, isRtl = false }) => (
    <div className="command-brand">
        <div className="command-brand__mark" aria-hidden="true">
            {logoUrl ? (
                <img src={logoUrl} alt="" />
            ) : (
                <svg viewBox="0 0 54 54" focusable="false">
                    <circle cx="27" cy="27" r="24" fill="#fff" stroke="#8bc34a" strokeWidth="2" />
                    <path d="M27 10c3 6 4 11 3 16 5-2 9-6 13-11-1 10-5 17-12 21 2 4 5 7 9 10-6-1-10-4-13-8-3 4-7 7-13 8 4-4 7-7 9-11-7-4-11-11-12-20 4 5 8 9 13 11-1-5 0-10 3-16z" fill="#74b43e" />
                    <circle cx="27" cy="15" r="3.4" fill="#15965d" />
                    <path d="M27 22v17" stroke="#15965d" strokeWidth="2.2" strokeLinecap="round" />
                </svg>
            )}
        </div>
        <div className="command-brand__copy">
            <strong>{centerName}</strong>
            <span><i />{isRtl ? 'نظام قيادة مراكز الأشعة' : 'Radiology command system'}</span>
        </div>
    </div>
);

export const FloatingControls = ({
    t,
    isRtl,
    dark,
    navItems,
    activeZone,
    focusZone,
    toggleTheme,
    changeLanguage,
    language,
    centerName,
    logoUrl,
}) => {
    const [menuOpen, setMenuOpen] = useState(false);
    const menuButtonRef = useRef(null);
    const mobileMenuRef = useRef(null);
    const navIcons = { overview: BarChart2, modules: ScanLine, workflow: Workflow };
    const Arrow = isRtl ? ArrowLeft : ArrowRight;

    useEffect(() => {
        if (!menuOpen) return undefined;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const focusable = mobileMenuRef.current?.querySelectorAll('button, a[href]') || [];
        focusable[0]?.focus();

        const onKeyDown = (event) => {
            if (event.key === 'Escape') {
                setMenuOpen(false);
                menuButtonRef.current?.focus();
                return;
            }
            if (event.key !== 'Tab' || focusable.length < 2) return;
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
        window.addEventListener('keydown', onKeyDown);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            document.body.style.overflow = previousOverflow;
        };
    }, [menuOpen]);

    const chooseZone = (zoneId) => {
        focusZone(zoneId);
        setMenuOpen(false);
    };

    return (
        <header className="command-header" dir={isRtl ? 'rtl' : 'ltr'}>
            <div className="command-header__inner">
                <Link to="/" className="command-brand-link" aria-label={centerName}>
                    <BrandLogo centerName={centerName} logoUrl={logoUrl} isRtl={isRtl} />
                </Link>

                <nav className="command-nav" aria-label={t('nav.primaryLabel', 'Primary navigation')}>
                    {navItems.map((item) => {
                        const Icon = navIcons[item.id] || BarChart2;
                        const active = activeZone === item.id;
                        return (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => focusZone(item.id)}
                                className={active ? 'is-active' : ''}
                                aria-current={active ? 'page' : undefined}
                            >
                                <Icon aria-hidden="true" />
                                <span>{item.label}</span>
                            </button>
                        );
                    })}
                </nav>

                <div className="command-actions">
                    <Link to="/login" className="command-staff-link">
                        <UserRound className="command-staff-link__user" aria-hidden="true" />
                        <span>{isRtl ? 'دخول الموظفين' : t('managementLanding.signIn', 'Staff sign in')}</span>
                        <Arrow aria-hidden="true" />
                    </Link>
                    <button
                        type="button"
                        onClick={toggleTheme}
                        className="command-square-action"
                        aria-label={dark ? t('nav.lightMode', 'Use light mode') : t('nav.darkMode', 'Use dark mode')}
                    >
                        {dark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
                    </button>
                    <button
                        type="button"
                        onClick={changeLanguage}
                        className="command-language-action"
                        aria-label={t('nav.changeLanguage', 'Change language')}
                    >
                        <span>{language.startsWith('ar') ? 'EN' : 'AR'}</span>
                        <Globe2 aria-hidden="true" />
                    </button>
                    <button
                        ref={menuButtonRef}
                        type="button"
                        className="command-menu-button"
                        aria-expanded={menuOpen}
                        aria-controls="command-mobile-menu"
                        aria-label={menuOpen ? t('nav.closeMenu', 'Close navigation') : t('nav.openMenu', 'Open navigation')}
                        onClick={() => setMenuOpen((current) => !current)}
                    >
                        {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
                    </button>
                </div>
            </div>

            {menuOpen && (
                <>
                    <button className="command-menu-scrim" type="button" aria-label="Close" onClick={() => setMenuOpen(false)} />
                    <nav id="command-mobile-menu" ref={mobileMenuRef} className="command-mobile-menu">
                        {navItems.map((item) => {
                            const Icon = navIcons[item.id] || BarChart2;
                            return (
                                <button key={item.id} type="button" onClick={() => chooseZone(item.id)}>
                                    <Icon aria-hidden="true" />
                                    <span>{item.label}</span>
                                </button>
                            );
                        })}
                        <Link to="/login" onClick={() => setMenuOpen(false)}>
                            <Arrow aria-hidden="true" />
                            <span>{isRtl ? 'دخول الموظفين' : t('managementLanding.signIn', 'Staff sign in')}</span>
                        </Link>
                    </nav>
                </>
            )}
        </header>
    );
};
