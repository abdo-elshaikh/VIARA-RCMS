/** @type {import('tailwindcss').Config} */
export default {
    darkMode: 'class',
    content: [
        './index.html',
        './src/**/*.{js,ts,jsx,tsx}',
    ],
    theme: {
        extend: {
            colors: {
                // VIARA colors exposed through legacy names for backwards compatibility
                primary: {
                    DEFAULT: 'rgb(var(--viara-primary-600-rgb) / <alpha-value>)',
                    foreground: 'var(--VIARA-accent-contrast)',
                    50: 'rgb(var(--viara-primary-50-rgb) / <alpha-value>)',
                    100: 'rgb(var(--viara-primary-100-rgb) / <alpha-value>)',
                    200: 'rgb(var(--viara-primary-200-rgb) / <alpha-value>)',
                    300: 'rgb(var(--viara-primary-300-rgb) / <alpha-value>)',
                    400: 'rgb(var(--viara-primary-400-rgb) / <alpha-value>)',
                    500: 'rgb(var(--viara-primary-500-rgb) / <alpha-value>)',
                    600: 'rgb(var(--viara-primary-600-rgb) / <alpha-value>)',
                    700: 'rgb(var(--viara-primary-700-rgb) / <alpha-value>)',
                    800: 'rgb(var(--viara-primary-800-rgb) / <alpha-value>)',
                    900: 'rgb(var(--viara-primary-900-rgb) / <alpha-value>)',
                    950: 'rgb(var(--viara-primary-950-rgb) / <alpha-value>)',
                },
                medical: {
                    blue: '#327C92',
                    green: '#16865F',
                    purple: '#5F6F6B',
                    amber: '#F4B942',
                },
                // VIARA Healthcare Technology brand palette derived from logo.png
                brand: {
                    50: '#DDF4EA',
                    100: '#BFEAD8',
                    200: '#9CDCC1',
                    300: '#72CAA7',
                    400: '#42B689',
                    500: '#16865F',
                    600: '#087F5B',
                    700: '#066A4C',
                    800: '#055A41',
                    900: '#064E3B',
                    950: '#063E30',
                    emerald: {
                        300: '#4eedb0',
                        400: '#10dc94',
                        500: '#00C988',
                        600: '#059669',
                        700: '#047857',
                        800: '#065F46',
                        900: '#064E3B',
                    },
                    amber: {
                        300: '#fde047',
                        400: '#facc15',
                        500: '#FFCC00',
                        600: '#F59E0B',
                        700: '#D97706',
                        800: '#B45309',
                    },
                    coral: {
                        300: '#fca5a5',
                        400: '#f87171',
                        500: '#FF3B30',
                        600: '#EF4444',
                        700: '#DC2626',
                        800: '#991B1B',
                    },
                },
                slate: {
                    50: '#f8fafc',
                    100: '#f1f5f9',
                    150: '#EAF0F5',
                    200: '#e2e8f0',
                    300: '#cbd5e1',
                    350: '#B0BCCB',
                    400: '#94a3b8',
                    450: '#7C8BA2',
                    500: '#64748b',
                    600: '#475569',
                    700: '#334155',
                    750: '#293549',
                    800: '#1e293b',
                    850: '#172334',
                    900: '#0f172a',
                    950: '#020617',
                },
                surface: {
                    DEFAULT: 'var(--VIARA-surface)',
                    muted: 'var(--VIARA-surface-muted)',
                    dark: 'var(--VIARA-canvas)',
                    darkMuted: 'var(--VIARA-surface-muted)',
                }
            },
            fontFamily: {
                sans: ['Inter', 'system-ui', 'sans-serif'],
                arabic: ['Noto Sans Arabic', 'Inter', 'system-ui', 'sans-serif'],
                mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', "Liberation Mono", "Courier New", 'monospace'],
            },
            borderRadius: {
                none: '0px',
                xs: 'calc(var(--VIARA-radius-control) * 0.4)',
                sm: 'calc(var(--VIARA-radius-control) * 0.65)',
                DEFAULT: 'var(--VIARA-radius-control)',
                md: 'var(--VIARA-radius-control)',
                lg: 'var(--VIARA-radius-control)',
                xl: 'var(--VIARA-radius-control)',
                '2xl': 'var(--VIARA-radius-surface)',
                '3xl': 'var(--VIARA-radius-overlay)',
                full: 'var(--VIARA-radius-pill)',
            },
            boxShadow: {
                card: '0 1px 2px rgba(23,35,38,.06)',
                'card-hover': '0 4px 12px rgba(23,35,38,.08)',
                'glass': '0 4px 12px rgba(23,35,38,.08)',
                'glass-dark': '0 4px 12px rgba(0,0,0,.22)',
                'glow': '0 0 0 rgba(8,127,91,0)',
                'glow-dark': '0 0 0 rgba(46,174,130,0)',
                'glow-emerald': '0 0 25px rgba(0, 201, 136, 0.35)',
                'glow-amber': '0 0 25px rgba(245, 158, 11, 0.35)',
                'glow-coral': '0 0 25px rgba(255, 59, 48, 0.35)',
                'elevated': '0 10px 30px rgba(23,35,38,.12)',
            },
            backgroundImage: {
                'glass-gradient': 'linear-gradient(145deg, rgba(255, 255, 255, 0.8) 0%, rgba(255, 255, 255, 0.4) 100%)',
                'glass-gradient-dark': 'linear-gradient(145deg, rgba(15, 23, 42, 0.8) 0%, rgba(15, 23, 42, 0.4) 100%)',
                'brand-gradient': 'linear-gradient(135deg, #00C988 0%, #F59E0B 50%, #FF3B30 100%)',
                'brand-emerald-gradient': 'linear-gradient(135deg, #00C988 0%, #064E3B 100%)',
                'brand-amber-gradient': 'linear-gradient(135deg, #FFCC00 0%, #D97706 100%)',
                'brand-coral-gradient': 'linear-gradient(135deg, #FF3B30 0%, #991B1B 100%)',
            },
            animation: {
                'slide-progress': 'slideProgress linear forwards',
                'fade-in': 'fadeIn 0.5s ease-out',
                'fade-up': 'fadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
                'fade-down': 'fadeDown 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
                'slide-in-right': 'slideInRight 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
                'slide-in-left': 'slideInLeft 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
                'scale-in': 'scaleIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                'blob': 'blob 12s infinite alternate',
                'gradient-x': 'gradientX 6s ease infinite',
                'pulse-ring': 'pulseRing 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                'shimmer': 'shimmer 2.5s linear infinite',
                'showcase-progress': 'showcaseProgress linear forwards',
                /* help page */
                'help-hero-in':   'helpHeroIn 0.7s cubic-bezier(0.16,1,0.3,1) both',
                'help-card-in':   'helpCardIn 0.5s cubic-bezier(0.16,1,0.3,1) both',
                'help-search-glow': 'helpSearchGlow 2.5s ease-in-out infinite',
                'kbd-press':      'kbdPress 0.15s ease-in-out',
                'count-up':       'countUp 0.4s cubic-bezier(0.16,1,0.3,1) both',
                /* button ripple */
                'btn-ripple':     'btnRipple 480ms linear forwards',
                /* toast progress bar */
                'toast-progress': 'toastProgress linear forwards',
                /* page transitions */
                'fade-in-up':     'fadeInUp 0.35s cubic-bezier(0.16,1,0.3,1) both',
                'slide-up':       'slideUp 0.25s cubic-bezier(0.16,1,0.3,1) both',
            },
            keyframes: {
                slideProgress: {
                    '0%': { width: '0%' },
                    '100%': { width: '100%' },
                },
                fadeIn: {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                fadeUp: {
                    '0%': { opacity: '0', transform: 'translateY(16px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                fadeDown: {
                    '0%': { opacity: '0', transform: 'translateY(-16px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                slideInRight: {
                    '0%': { opacity: '0', transform: 'translateX(20px)' },
                    '100%': { opacity: '1', transform: 'translateX(0)' },
                },
                slideInLeft: {
                    '0%': { opacity: '0', transform: 'translateX(-20px)' },
                    '100%': { opacity: '1', transform: 'translateX(0)' },
                },
                scaleIn: {
                    '0%': { opacity: '0', transform: 'scale(0.92)' },
                    '100%': { opacity: '1', transform: 'scale(1)' },
                },
                blob: {
                    '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
                    '33%': { transform: 'translate(30px, -40px) scale(1.05)' },
                    '66%': { transform: 'translate(-20px, 20px) scale(0.95)' },
                },
                gradientX: {
                    '0%, 100%': { backgroundPosition: '0% 50%' },
                    '50%': { backgroundPosition: '100% 50%' },
                },
                pulseRing: {
                    '0%': { transform: 'scale(0.8)', opacity: '0.8' },
                    '80%, 100%': { transform: 'scale(2.2)', opacity: '0' },
                },
                shimmer: {
                    '0%': { backgroundPosition: '-200% 0' },
                    '100%': { backgroundPosition: '200% 0' },
                },
                showcaseProgress: {
                    '0%': { transform: 'scaleX(0)' },
                    '100%': { transform: 'scaleX(1)' },
                },
                /* help page */
                helpHeroIn: {
                    '0%':   { opacity: '0', transform: 'translateY(22px) scale(0.98)' },
                    '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
                },
                helpCardIn: {
                    '0%':   { opacity: '0', transform: 'translateY(14px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                helpSearchGlow: {
                    '0%, 100%': { boxShadow: '0 0 0 0 rgba(8,127,91,0)' },
                    '50%':      { boxShadow: '0 0 0 6px rgba(8,127,91,0.10)' },
                },
                kbdPress: {
                    '0%':   { transform: 'scale(1)' },
                    '50%':  { transform: 'scale(0.92)' },
                    '100%': { transform: 'scale(1)' },
                },
                countUp: {
                    '0%':   { opacity: '0', transform: 'translateY(8px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                /* button click ripple */
                btnRipple: {
                    '0%':   { transform: 'scale(0)', opacity: '0.16' },
                    '80%':  { transform: 'scale(3)', opacity: '0.06' },
                    '100%': { transform: 'scale(3.5)', opacity: '0' },
                },
                /* toast timer progress bar shrink */
                toastProgress: {
                    '0%':   { width: '100%' },
                    '100%': { width: '0%' },
                },
                /* page-level fade-in-up */
                fadeInUp: {
                    '0%':   { opacity: '0', transform: 'translateY(14px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                slideUp: {
                    '0%':   { opacity: '0', transform: 'translateY(8px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
            },
        },
    },
    plugins: [],
};
