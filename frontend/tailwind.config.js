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
                // Legacy colors for backwards compatibility
                primary: {
                    50: '#eff6ff',
                    100: '#dbeafe',
                    200: '#bfdbfe',
                    300: '#93c5fd',
                    400: '#60a5fa',
                    500: '#3b82f6',
                    600: '#2563eb',
                    700: '#1d4ed8',
                    800: '#1e40af',
                    900: '#1e3a8a',
                    950: '#172554',
                },
                medical: {
                    blue: '#3b82f6',
                    green: '#10b981',
                    purple: '#8b5cf6',
                    amber: '#f59e0b',
                },
                // New Enterprise UI Tokens (Teal-based)
                brand: {
                    50: '#f0fdfa',
                    100: '#ccfbf1',
                    200: '#99f6e4',
                    300: '#5eead4',
                    400: '#2dd4bf',
                    500: '#14b8a6', 
                    600: '#0d9488',
                    700: '#0f766e',
                    800: '#115e59',
                    900: '#134e4a',
                    950: '#042f2e',
                },
                slate: {
                    50: '#f8fafc',
                    100: '#f1f5f9',
                    200: '#e2e8f0',
                    300: '#cbd5e1',
                    400: '#94a3b8',
                    500: '#64748b',
                    600: '#475569',
                    700: '#334155',
                    800: '#1e293b',
                    900: '#0f172a',
                    950: '#020617',
                },
                surface: {
                    DEFAULT: '#ffffff',
                    muted: '#f8fafc',
                    dark: '#0f172a',
                    darkMuted: '#1e293b',
                }
            },
            fontFamily: {
                sans: ['Inter', 'Manrope', 'system-ui', 'sans-serif'],
                arabic: ['Cairo', 'Tajawal', 'system-ui', 'sans-serif'],
                mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', "Liberation Mono", "Courier New", 'monospace'],
            },
            boxShadow: {
                card: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                'card-hover': '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                'glass': '0 4px 30px rgba(0, 0, 0, 0.05)',
                'glass-dark': '0 4px 30px rgba(0, 0, 0, 0.3)',
                'glow': '0 0 20px rgba(20, 184, 166, 0.25)',
                'glow-dark': '0 0 30px rgba(45, 212, 191, 0.15)',
                'elevated': '0 20px 40px -15px rgba(0,0,0,0.05)',
            },
            backgroundImage: {
                'glass-gradient': 'linear-gradient(145deg, rgba(255, 255, 255, 0.8) 0%, rgba(255, 255, 255, 0.4) 100%)',
                'glass-gradient-dark': 'linear-gradient(145deg, rgba(15, 23, 42, 0.8) 0%, rgba(15, 23, 42, 0.4) 100%)',
                'brand-gradient': 'linear-gradient(135deg, #14b8a6 0%, #0d9488 100%)',
            },
            animation: {
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
            },
            keyframes: {
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
            },
        },
    },
    plugins: [],
};
