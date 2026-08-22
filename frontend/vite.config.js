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
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (!id.includes('node_modules')) return undefined;
                    if (id.includes('recharts') || id.includes('d3-')) return 'charts';
                    if (id.includes('framer-motion')) return 'motion';
                    if (id.includes('react-dom') || id.includes('react-router-dom') || id.includes('@reduxjs/toolkit') || id.includes('react-redux')) return 'framework';
                    if (id.includes('i18next')) return 'i18n';
                    if (id.includes('lucide-react')) return 'icons';
                    if (id.includes('date-fns')) return 'date-utils';
                    if (id.includes('@tanstack')) return 'data-table';
                    if (id.includes('axios')) return 'http';
                    if (id.includes('jspdf') || id.includes('html2canvas')) return 'pdf-export';
                    if (['/docx/', '/jszip/', '/hash.js/', '/nanoid/', '/xml-js/', '/xml/'].some((dependency) => id.replaceAll('\\', '/').includes(dependency))) return 'word-export';
                    return 'vendor';
                },
            },
        },
        sourcemap: true,
        reportCompressedSize: true,
        commonjsOptions: {
            include: [/node_modules/],
        },
    },
})
