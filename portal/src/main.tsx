import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import App from './App';
import { store } from './store/store';
import './i18n';
import './index.css';
import './portal-templates/templates.css';
import './portal-landing.css';
import { applyPortalTheme, getStoredTheme } from './utils/theme';

// Resolve the saved appearance before React paints to prevent a bright flash
// when a user opens the application in dark or system-dark mode.
try {
    const saved = JSON.parse(localStorage.getItem('VIARA_preferences') || '{}');
    const requestedTheme = saved.theme || getStoredTheme();
    const root = document.documentElement;
    applyPortalTheme(requestedTheme);
    root.dataset.primaryColor = saved.primaryColor || 'cyan';
} catch (_) {
    // Invalid local preferences should never prevent the application mounting.
}

const rootElement = document.getElementById('root');

if (!rootElement) {
    throw new Error('VIARA portal root element was not found.');
}

ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
        <Provider store={store}>
            <App />
        </Provider>
    </React.StrictMode>,
);
