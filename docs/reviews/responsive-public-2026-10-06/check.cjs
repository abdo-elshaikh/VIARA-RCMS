const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.VIARA_PLAYWRIGHT_MODULE || 'C:/Users/Abdo/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright-core');
const sizes = [
    [320, 720], [360, 640], [390, 844], [430, 932], [600, 960], [768, 1024],
    [820, 1180], [844, 390], [900, 600], [901, 768], [1024, 600], [1024, 768],
    [1080, 420], [1180, 780], [1201, 768], [1280, 587], [1280, 720], [1366, 625],
    [1366, 768], [1440, 900], [1536, 704], [1920, 880], [2560, 1440],
];
const screenshots = new Set(['320x720', '390x844', '768x1024', '844x390', '901x768', '1024x600', '1536x704', '1920x880', '2560x1440']);
async function main() {
    const browser = await chromium.launch({ executablePath: process.env.VIARA_CHROME_PATH || 'C:/Users/Abdo/AppData/Local/ms-playwright/chromium-1181/chrome-win/chrome.exe', headless: true });
    const results = [];
    try {
        const selected = process.argv.includes('--quick') ? [[1536, 704], [1920, 880], [901, 768], [1180, 780], [1201, 768], [320, 720], [844, 390]] : sizes;
        for (const [width, height] of selected) {
            for (const language of ['ar', 'en']) {
                const theme = [390, 768, 1366].includes(width) ? 'dark' : 'light';
                const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
                await context.addInitScript(({ language, theme }) => {
                    localStorage.setItem('VIARA_lang', language);
                    localStorage.setItem('i18nextLng', language);
                    localStorage.setItem('VIARA_preferences', JSON.stringify({ language, theme, motion: 'reduced' }));
                }, { language, theme });
                const page = await context.newPage();
                const errors = [];
                page.on('pageerror', error => errors.push(error.message));
                for (const route of ['/', '/login']) {
                    const name = `${route === '/' ? 'landing' : 'login'}-${language}-${theme}-${width}x${height}`;
                    await page.goto(`${process.env.VIARA_BASE_URL || 'http://127.0.0.1:5173'}${route}`, { waitUntil: 'domcontentloaded' });
                    await page.locator(route === '/' ? '.vlp' : '.vlogin').waitFor();
                    await page.evaluate(() => document.fonts.ready);
                    await page.waitForTimeout(250);
                    const result = await page.evaluate(() => {
                        const rect = selector => {
                            const e = document.querySelector(selector);
                            if (!e || getComputedStyle(e).display === 'none') return null;
                            const r = e.getBoundingClientRect();
                            return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
                        };
                        const copy = rect('.vlp__copy'), stage = rect('.vlp__stage');
                        const clipped = [...document.querySelectorAll('.vlp__word-in, .vlp__capabilities li, .vlp__stage, .vlp__hero-summary, .vlp__nav a, .vlp__actions, .vlp__brand, .vlogin__form-pane, .vlogin__submit, .vlogin__passkey, .vlogin__header-brand, .vlogin__util-lang')]
                            .filter(e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden')
                            .filter(e => { const r = e.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1; })
                            .map(e => ({ className: e.className, text: e.textContent?.slice(0, 50) }));
                        const headerParts = ['.vlp__brand', '.vlp__nav', '.vlp__actions'].map(rect).filter(Boolean);
                        const headerOverlap = headerParts.some((a, i) => headerParts.slice(i + 1).some(b => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom && a.bottom > b.top));
                        return {
                            width: innerWidth, height: innerHeight,
                            horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
                            clipped, headerOverlap,
                            masthead: rect('.vlp__masthead'), card: rect('.vlogin__form-pane'), footer: rect('.vlogin__page-footer'),
                            primary: rect('.vlogin__submit') || rect('.vlp__cta-row'),
                            overlappingColumns: Boolean(copy && stage && copy.left < stage.right - 1 && copy.right > stage.left + 1 && copy.top < stage.bottom && copy.bottom > stage.top),
                        };
                    });
                    results.push({ name, ...result, errors: [...errors] });
                    if (screenshots.has(`${width}x${height}`) && language === 'ar') {
                        await page.waitForTimeout(1100);
                        await page.screenshot({ path: path.join(__dirname, `${name}.png`) });
                    }
                }
                await context.close();
            }
            console.log(`Checked ${width} × ${height}`);
        }
        fs.writeFileSync(path.join(__dirname, process.env.VIARA_REPORT_NAME || (process.argv.includes('--quick') ? 'quick.json' : 'validation.json')), JSON.stringify(results, null, 2));
        const failures = results.filter(r => r.horizontalOverflow || r.clipped.length || r.headerOverlap || r.overlappingColumns || r.errors.length);
        const desktopFit = results.filter(r => r.width >= 901 && r.height >= 660 && ((r.masthead && r.masthead.bottom > r.height + 1) || (r.footer && r.footer.bottom > r.height + 1)));
        console.log(JSON.stringify({ cases: results.length, failures, desktopFit }, null, 2));
        if (failures.length || desktopFit.length) process.exitCode = 1;
    } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
