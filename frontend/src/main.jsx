import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import App from './App';
import { store } from './store/store';
import './i18n';
import './index.css';
import { applyThemePalette, resolveBrandColor } from './utils/themePalette';

// Resolve the saved appearance before React paints to prevent a bright flash
// when a user opens the application in dark or system-dark mode.
try {
    const saved = JSON.parse(localStorage.getItem('VIARA_preferences') || '{}');
    const requestedTheme = saved.theme || 'system';
    const isDark = requestedTheme === 'dark'
        || (requestedTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const root = document.documentElement;
    root.classList.toggle('dark', isDark);
    root.classList.toggle('density-compact', saved.density === 'compact');
    root.classList.toggle('density-spacious', saved.density === 'spacious');
    root.classList.toggle('motion-reduced', saved.motion === 'reduced');
    root.classList.toggle('high-contrast', Boolean(saved.highContrast));
    root.dataset.resolvedTheme = isDark ? 'dark' : 'light';
    root.dataset.theme = isDark ? 'dark' : 'light';
    root.dataset.primaryColor = saved.primaryColor || 'emerald';
    root.dataset.density = saved.density || 'comfortable';
    root.dataset.fontScale = saved.fontScale || 'normal';
    root.dataset.fontFamily = saved.fontFamily || 'inter';
    root.dataset.borderRadius = saved.borderRadius || 'medium';
    root.style.colorScheme = isDark ? 'dark' : 'light';
    applyThemePalette(root, {
        brandColor: resolveBrandColor(saved),
        mode: isDark ? 'dark' : 'light',
        colorOverrides: saved.colorOverrides,
    });
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
