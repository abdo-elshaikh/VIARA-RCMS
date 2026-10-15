import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vitejs.dev/config/
export default defineConfig({

    plugins: [react()],
    resolve: {
        dedupe: ['react', 'react-dom', 'react-redux', 'react-router-dom', '@reduxjs/toolkit'],
    },
    optimizeDeps: {
        include: ['jsqr', 'docx', 'qrcode.react', 'lucide-react', 'framer-motion'],
    },
    server: {
        host: true, // Needed for Docker port mapping
        ...(process.env.PORT
            ? { port: Number(process.env.PORT), strictPort: true }
            : { port: 5173, strictPort: true }),
        proxy: {
            '/api': {
                target: process.env.API_PROXY_TARGET || 'http://127.0.0.1:3000',
                changeOrigin: true,
                ws: true,
                configure: (proxy) => {
                    proxy.on('error', (err) => {
                        if (err.code === 'ECONNRESET' || err.code === 'ECONNREFUSED') return;
                        console.warn('[vite proxy error]', err.message);
                    });
                }
            },
            '/pacs-viewer': {
                target: process.env.OHIF_PROXY_TARGET || 'http://127.0.0.1:3005',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/pacs-viewer/, ''),
            },
        }
    },
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: './src/setupTests.js',
        testTimeout: 10000,
    },
    build: {
        rollupOptions: {
            output: {
                onlyExplicitManualChunks: true,
                manualChunks(id) {
                    const normalizedId = id.replaceAll('\\', '/');
                    const locale = normalizedId.match(/\/src\/i18n\/locales\/(ar|en)\/([^/]+)\.json$/);
                    if (locale) return `translations-${locale[1]}-${locale[2]}`;
                    if (!id.includes('node_modules')) return undefined;
                    if (id.includes('recharts') || id.includes('d3-')) return 'charts';
                    if (id.includes('framer-motion')) return 'motion';
                    // Keep React and its shared dependencies together. Separating
                    // react-dom/Redux from React creates a vendor/framework cycle
                    // that can initialize the production runtime out of order.
                    if (/\/node_modules\/(react|react-dom|scheduler|react-redux|redux|redux-thunk|immer|reselect|use-sync-external-store|react-router|react-router-dom|@reduxjs\/toolkit|@standard-schema\/[^/]+)\//.test(normalizedId)) return 'framework';
                    if (id.includes('i18next')) return 'i18n';
                    if (id.includes('lucide-react')) return 'icons';
                    if (id.includes('date-fns')) return 'date-utils';
                    if (id.includes('@tanstack')) return 'data-table';
                    if (id.includes('axios')) return 'http';
                    if (id.includes('jspdf') || id.includes('html2canvas')) return 'pdf-export';
                    if (normalizedId.includes('/node_modules/docx/')) return 'word-export';
                    return 'vendor';
                },
            },
        },
        sourcemap: false,
        reportCompressedSize: true,
        commonjsOptions: {
            include: [/node_modules/],
        },
    },
})
