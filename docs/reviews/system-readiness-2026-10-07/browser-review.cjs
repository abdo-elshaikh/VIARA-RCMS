const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('C:/Users/Abdo/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright-core');
const axePath = require.resolve('./tools/node_modules/axe-core/axe.min.js');
async function main() {
    const browser = await chromium.launch({ executablePath: 'C:/Users/Abdo/AppData/Local/ms-playwright/chromium-1181/chrome-win/chrome.exe', headless: true });
    const results = [];
    try {
        for (const [width, height] of [[320, 720], [768, 1024], [1536, 704]]) {
            for (const language of ['ar', 'en']) for (const theme of ['light', 'dark']) {
                for (const [name, base, route] of [['staff-landing', 5190, '/'], ['staff-login', 5190, '/login'], ['portal-landing', 5191, '/'], ['patient-login', 5191, '/patient/login'], ['doctor-login', 5191, '/doctor/login']]) {
                    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
                    await context.addInitScript(({ language, theme }) => {
                        localStorage.setItem('VIARA_lang', language);
                        localStorage.setItem('i18nextLng', language);
                        localStorage.setItem('VIARA_preferences', JSON.stringify({ language, theme, motion: 'reduced' }));
                    }, { language, theme });
                    const page = await context.newPage();
                    // Offline font dependency check: staff keeps its bundled Cairo;
                    // portal uses fallback fonts. No external font server is required.
                    await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
                    await page.route('https://fonts.gstatic.com/**', route => route.abort());
                    await page.route('**/api/**', async route => {
                        const url = new URL(route.request().url());
                        url.port = '5310';
                        const response = await route.fetch({ url: url.toString(), timeout: 5000 });
                        await route.fulfill({ response });
                    });
                    const errors = [], failures = [];
                    page.on('pageerror', e => errors.push(e.message));
                    page.on('response', r => { if (r.status() >= 500 || (r.status() === 404 && !r.url().includes('/api/'))) failures.push({ status: r.status(), url: new URL(r.url()).pathname }); });
                    console.log(`Reviewing ${name} ${width} ${language} ${theme}`);
                    await page.goto(`http://127.0.0.1:${base}${route}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
                    await page.waitForTimeout(500);
                    await page.evaluate(() => Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 3000))]));
                    const layout = await page.evaluate(() => {
                        const visible = e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden';
                        const outside = [...document.querySelectorAll('main, h1, form, input, select, .vlogin__form-pane, .vlp__footer-main, footer')].filter(visible).filter(e => { const r = e.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1; }).map(e => e.tagName + '.' + e.className);
                        return { overflow: document.documentElement.scrollWidth > innerWidth + 1, outside, h1: document.querySelectorAll('h1').length, demoPanelPresent: Boolean(document.querySelector('.vlogin__developer-panel')), direction: document.documentElement.dir, language: document.documentElement.lang, brokenImages: [...document.images].filter(i => i.complete && !i.naturalWidth).map(i => new URL(i.src).pathname) };
                    });
                    await page.addScriptTag({ path: axePath });
                    const accessibility = await page.evaluate(async () => {
                        const report = await Promise.race([window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } }), new Promise((_, reject) => setTimeout(() => reject(new Error('Accessibility scan timeout')), 15000))]);
                        return { engine: report.testEngine.version, violations: report.violations.map(v => ({ id: v.id, impact: v.impact, description: v.description, helpUrl: v.helpUrl, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })), incompleteRules: report.incomplete.map(v => v.id) };
                    });
                    if (language === 'ar' && theme === 'light' && [320, 1536].includes(width)) await page.screenshot({ path: path.join(__dirname, `${name}-${width}.png`), fullPage: true });
                    results.push({ name, width, height, language, theme, externalFontsUnavailable: true, ...layout, accessibility, errors, failures });
                    await context.close();
                }
            }
            console.log(`Reviewed ${width} x ${height}`);
            fs.writeFileSync(path.join(__dirname, 'browser-review.json'), JSON.stringify(results, null, 2));
        }
        const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
        const page = await context.newPage();
        await page.route('**/api/**', route => route.abort());
        await page.goto('http://127.0.0.1:5190/login');
        await page.locator('.public-connection').waitFor({ state: 'visible' });
        const offlineNotice = await page.locator('.public-connection').isVisible();
        await context.close();
        const summary = { cases: results.length, layoutFailures: results.filter(r => r.overflow || r.outside.length || r.brokenImages.length).map(r => ({ name: r.name, width: r.width, language: r.language, theme: r.theme, overflow: r.overflow, outside: r.outside, brokenImages: r.brokenImages })), runtimeErrors: results.filter(r => r.errors.length || r.failures.length).map(r => ({ name: r.name, errors: r.errors, failures: r.failures })), accessibilityRules: [...new Set(results.flatMap(r => r.accessibility.violations.map(v => v.id)))], offlineNotice };
        fs.writeFileSync(path.join(__dirname, 'browser-summary.json'), JSON.stringify(summary, null, 2));
        console.log(JSON.stringify(summary, null, 2));
    } finally { await browser.close(); }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
