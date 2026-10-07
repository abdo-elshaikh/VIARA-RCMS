const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('C:/Users/Abdo/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright-core');

async function main() {
    const browser = await chromium.launch({ executablePath: 'C:/Users/Abdo/AppData/Local/ms-playwright/chromium-1181/chrome-win/chrome.exe', headless: true });
    const production = process.argv.includes('--production');
    const results = [];
    try {
        for (const [width, height] of [[320, 720], [390, 844], [768, 1024], [844, 390], [901, 768], [1024, 600], [1080, 420], [1366, 768], [1536, 704], [1920, 880]]) {
            for (const language of ['ar', 'en']) for (const theme of ['light', 'dark']) {
                const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
                await context.addInitScript(({ language, theme }) => {
                    localStorage.setItem('VIARA_lang', language);
                    localStorage.setItem('i18nextLng', language);
                    localStorage.setItem('VIARA_preferences', JSON.stringify({ language, theme, motion: 'reduced' }));
                }, { language, theme });
                const page = await context.newPage();
                const errors = [];
                let submissions = 0;
                page.on('pageerror', e => errors.push(e.message));
                page.on('request', r => { if (r.method() === 'POST' && /auth\/login/.test(r.url())) submissions++; });
                await page.goto(`http://127.0.0.1:${production ? 5190 : 5173}/login`, { waitUntil: 'domcontentloaded' });
                await page.locator('.vlogin__form-pane').waitFor();
                await page.evaluate(() => document.fonts.ready);
                await page.waitForTimeout(150);
                const layout = await page.evaluate(() => {
                    const visible = e => e && e.getClientRects().length && getComputedStyle(e).display !== 'none';
                    const rect = e => { const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
                    const overlap = (a, b) => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
                    const panel = document.querySelector('.vlogin__developer-panel');
                    const clipped = [...document.querySelectorAll('.vlogin__developer-panel, .vlogin__developer-head, .vlogin__developer-controls, .vlogin__developer-fill, .vlogin__developer-browse, .vlogin__form-pane')]
                        .filter(visible).filter(e => { const r = rect(e); return r.left < -1 || r.right > innerWidth + 1 || e.scrollWidth > e.clientWidth + 1; }).map(e => e.className);
                    const collisions = panel ? [...document.querySelectorAll('.vlogin__visual-title, .vlogin__visual-desc, .vlogin__scene-summary > div, .vlogin__form-pane')]
                        .filter(visible).filter(e => overlap(rect(panel), rect(e))).map(e => e.className) : [];
                    return { panel: visible(panel) === true, developerClass: document.querySelector('main').classList.contains('vlogin--developer'), overflow: document.documentElement.scrollWidth > innerWidth, clipped, collisions };
                });
                let fillWorks = true, browseWorks = true;
                if (!production) {
                    const panel = page.locator('.vlogin__developer-panel');
                    if (language === 'ar' && theme === 'light' && [390, 1536].includes(width)) {
                        await page.screenshot({ path: path.join(__dirname, `page-${width}.png`), fullPage: true });
                        await panel.screenshot({ path: path.join(__dirname, `panel-${width}.png`) });
                    }
                    await panel.locator('select').selectOption('Admin');
                    await panel.locator('.vlogin__developer-fill').click();
                    fillWorks = await page.locator('input[type="email"]').first().inputValue() === 'admin@viara.com' && Boolean(await page.locator('input[type="password"]').first().inputValue());
                    await panel.locator('.vlogin__developer-browse').click();
                    const dialog = page.locator('#viara-demo-dialog');
                    await dialog.waitFor({ state: 'visible' });
                    browseWorks = await dialog.locator('.vlogin__demo-item').count() === 9;
                    await page.keyboard.press('Escape');
                    await dialog.waitFor({ state: 'hidden' });
                    browseWorks &&= await panel.locator('.vlogin__developer-browse').evaluate(e => document.activeElement === e);
                }
                results.push({ width, height, language, theme, ...layout, fillWorks, browseWorks, submissions, errors });
                await context.close();
            }
            console.log(`Checked ${width} x ${height}`);
        }
        const failures = results.filter(r => r.panel !== !production || r.developerClass !== !production || r.overflow || r.clipped.length || r.collisions.length || !r.fillWorks || !r.browseWorks || r.submissions || r.errors.length);
        fs.writeFileSync(path.join(__dirname, production ? 'production.json' : 'development.json'), JSON.stringify(results, null, 2));
        console.log(JSON.stringify({ cases: results.length, failures }, null, 2));
        if (failures.length) process.exitCode = 1;
    } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
