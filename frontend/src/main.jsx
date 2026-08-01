import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import App from './App';
import { store } from './store/store';
import './i18n';
import './index.css';

// Resolve the saved appearance before React paints to prevent a bright flash
// when a user opens the application in dark or system-dark mode.
try {
    const saved = JSON.parse(localStorage.getItem('rcms_preferences') || '{}');
    const requestedTheme = saved.theme || 'system';
    const isDark = requestedTheme === 'dark'
        || (requestedTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const colorMap = {
        cyan: '#0891b2',
        indigo: '#4f46e5',
        rose: '#e11d48',
        emerald: '#059669',
        amber: '#d97706',
        slate: '#475569'
    };
    const selectedColor = saved.primaryColor === 'custom' ? saved.customColor : colorMap[saved.primaryColor || 'cyan'];
    const safeColor = /^#[0-9a-f]{6}$/i.test(selectedColor || '') ? selectedColor : colorMap.cyan;
    const rgb = Number.parseInt(safeColor.slice(1), 16);
    const root = document.documentElement;
    root.classList.toggle('dark', isDark);
    root.classList.toggle('density-compact', saved.density === 'compact');
    root.classList.toggle('density-spacious', saved.density === 'spacious');
    root.classList.toggle('motion-reduced', saved.motion === 'reduced');
    root.classList.toggle('high-contrast', Boolean(saved.highContrast));
    root.dataset.resolvedTheme = isDark ? 'dark' : 'light';
    root.dataset.primaryColor = saved.primaryColor || 'cyan';
    root.dataset.density = saved.density || 'comfortable';
    root.dataset.fontScale = saved.fontScale || 'normal';
    root.dataset.fontFamily = saved.fontFamily || 'inter';
    root.dataset.borderRadius = saved.borderRadius || 'medium';
    root.style.colorScheme = isDark ? 'dark' : 'light';
    root.style.setProperty('--rcms-accent', safeColor);
    root.style.setProperty('--rcms-accent-dark', safeColor);
    root.style.setProperty('--rcms-accent-rgb', `${(rgb >> 16) & 255}, ${(rgb >> 8) & 255}, ${rgb & 255}`);
} catch (_) {
    // Invalid local preferences should never prevent the application mounting.
}

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <Provider store={store}>
            <App />
        </Provider>
    </React.StrictMode>,
);
