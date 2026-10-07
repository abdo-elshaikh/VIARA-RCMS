const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.VIARA_PLAYWRIGHT_MODULE || 'C:/Users/Abdo/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright-core');
const sizes = [[320, 720], [360, 640], [390, 844], [600, 960], [768, 1024], [844, 390], [901, 768], [1024, 600], [1180, 780], [1181, 780], [1201, 768], [1366, 768], [1536, 704], [1920, 880]];
const results = [];
async function main() {
    const browser = await chromium.launch({ executablePath: process.env.VIARA_CHROME_PATH || 'C:/Users/Abdo/AppData/Local/ms-playwright/chromium-1181/chrome-win/chrome.exe', headless: true });
    try {
        for (const [width, height] of sizes) {
            for (const language of ['ar', 'en']) for (const theme of ['light', 'dark']) {
                const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
                await context.addInitScript(({ language, theme }) => {
                    localStorage.setItem('VIARA_lang', language);
                    localStorage.setItem('i18nextLng', language);
                    localStorage.setItem('VIARA_preferences', JSON.stringify({ language, theme, motion: 'reduced' }));
                }, { language, theme });
                const page = await context.newPage();
                const errors = [];
                page.on('pageerror', e => errors.push(e.message));
                const name = `${language}-${theme}-${width}x${height}`;
                await page.goto(process.env.VIARA_BASE_URL || 'http://127.0.0.1:5173', { waitUntil: 'domcontentloaded' });
                await page.locator('.vlp__header').waitFor();
                await page.evaluate(() => document.fonts.ready);
                await page.waitForTimeout(150);
                const layout = await page.evaluate(() => {
                    const visible = e => e && e.getClientRects().length > 0;
                    const elements = ['.vlp__brand', '.vlp__navigation', '.vlp__actions'].map(s => document.querySelector(s)).filter(visible);
                    const boxes = elements.map(e => e.getBoundingClientRect());
                    const overlap = boxes.some((a, i) => boxes.slice(i + 1).some(b => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom && a.bottom > b.top));
                    const clipped = [...document.querySelectorAll('.vlp__header, .vlp__header a, .vlp__header button')].filter(visible).filter(e => { const r = e.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1; }).map(e => e.className);
                    const masthead = document.querySelector('.vlp__masthead').getBoundingClientRect();
                    return { overlap, clipped, overflow: document.documentElement.scrollWidth > innerWidth, firstFoldFits: innerWidth < 901 || innerHeight < 660 || masthead.bottom <= innerHeight + 1 };
                });
                const screenshot = language === 'ar' && [390, 1536].includes(width);
                if (screenshot) {
                    await page.waitForTimeout(1000);
                    await page.screenshot({ path: path.join(__dirname, `landing-${name}.png`) });
                    await page.locator('.vlp__header').screenshot({ path: path.join(__dirname, `header-${name}.png`) });
                }
                let menu = null;
                if (width <= 1180) {
                    const trigger = page.locator('.vlp__menu');
                    await trigger.click();
                    await page.locator('.vlp__navigation').waitFor({ state: 'visible' });
                    menu = await page.evaluate(() => {
                        const panel = document.querySelector('.vlp__navigation');
                        const r = panel.getBoundingClientRect();
                        const utilities = document.querySelector('.vlp__utilities').getBoundingClientRect();
                        const controlsFit = [...panel.querySelectorAll('button')].every(button => {
                            const b = button.getBoundingClientRect();
                            return [...button.children].filter(child => child.getClientRects().length).every(child => { const c = child.getBoundingClientRect(); return c.left >= b.left - 1 && c.right <= b.right + 1; });
                        });
                        return { fits: r.left >= -1 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1, controlsFit, utilitiesAccessible: utilities.bottom <= r.top + panel.scrollHeight, portals: panel.querySelectorAll('a[href="/portal"], a[href="/doctor-portal"]').length === 2 };
                    });
                    if (screenshot) await page.screenshot({ path: path.join(__dirname, `menu-${name}.png`) });
                    await page.keyboard.press('Escape');
                    menu.escape = await trigger.getAttribute('aria-expanded') === 'false';
                    menu.focusReturned = await trigger.evaluate(e => document.activeElement === e);
                    await trigger.click();
                    await page.locator('.vlp__hero').dispatchEvent('pointerdown');
                    menu.outsideCloses = await trigger.getAttribute('aria-expanded') === 'false';
                }
                let returnFromLogin = true;
                if (width === 1536 && language === 'ar' && theme === 'light') {
                    const signature = () => page.locator('.vlp__header').evaluate(e => {
                        const s = getComputedStyle(e);
                        return JSON.stringify([s.minHeight, s.borderRadius, s.gridTemplateColumns]);
                    });
                    const before = await signature();
                    await page.locator('.vlp__header-signin').click();
                    await page.locator('.vlogin__form-pane').waitFor();
                    await page.goBack();
                    await page.locator('.vlp__header').waitFor();
                    returnFromLogin = before === await signature();
                }
                results.push({ name, ...layout, menu, returnFromLogin, errors });
                await context.close();
            }
            console.log(`Checked ${width} x ${height}`);
        }
        const failures = results.filter(r => r.overlap || r.clipped.length || r.overflow || !r.firstFoldFits || !r.returnFromLogin || r.errors.length || (r.menu && Object.values(r.menu).some(v => !v)));
        fs.writeFileSync(path.join(__dirname, process.env.VIARA_REPORT_NAME || 'validation.json'), JSON.stringify(results, null, 2));
        console.log(JSON.stringify({ cases: results.length, failures }, null, 2));
        if (failures.length) process.exitCode = 1;
    } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
