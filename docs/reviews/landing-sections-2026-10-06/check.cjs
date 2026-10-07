const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.VIARA_PLAYWRIGHT_MODULE || 'C:/Users/Abdo/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright-core');
const sizes = [[320, 720], [390, 844], [600, 960], [768, 1024], [900, 600], [901, 768], [1024, 600], [1180, 780], [1201, 768], [1366, 768], [1536, 704], [1920, 880]];
async function main() {
    const browser = await chromium.launch({ executablePath: process.env.VIARA_CHROME_PATH || 'C:/Users/Abdo/AppData/Local/ms-playwright/chromium-1181/chrome-win/chrome.exe', headless: true });
    const results = [];
    try {
        const selected = process.argv.includes('--quick') ? [[320, 720], [390, 844], [901, 768], [1536, 704]] : sizes;
        for (const [width, height] of selected) {
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
                await page.locator('.vlp__footer-main').waitFor();
                await page.evaluate(() => document.fonts.ready);
                const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
                for (let y = 0; y < pageHeight; y += Math.max(200, height * .65)) {
                    await page.evaluate(y => window.scrollTo(0, y), y);
                    await page.waitForTimeout(35);
                }
                await page.waitForTimeout(300);
                const layout = await page.evaluate(() => {
                    const clipped = [...document.querySelectorAll('.vlp__modality, .vlp__metric-card, .vlp__feature-card, .vlp__step, .vlp__faq-trigger, .vlp__faq-answer p, .vlp__cta-actions, .vlp__footer-column, .vlp__footer-brand, .vlp__section-head')]
                        .filter(e => e.getClientRects().length)
                        .filter(e => { const r = e.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1 || e.scrollWidth > e.clientWidth + 1; })
                        .map(e => ({ className: e.className, text: e.textContent.slice(0, 70), width: e.clientWidth, scrollWidth: e.scrollWidth }));
                    return {
                        overflow: document.documentElement.scrollWidth > innerWidth,
                        clipped,
                        modalities: document.querySelectorAll('.vlp__modality').length,
                        features: document.querySelectorAll('.vlp__feature-card').length,
                        steps: document.querySelectorAll('.vlp__step').length,
                        footerLinks: [...document.querySelectorAll('.vlp__footer-column a')].map(e => e.getAttribute('href')),
                        headingsVisible: [...document.querySelectorAll('.vlp__section-head h2')].every(e => [...e.querySelectorAll('span')].every(s => getComputedStyle(s).opacity !== '0')),
                    };
                });
                let accordionWorks = true;
                const triggers = page.locator('.vlp__faq-trigger');
                for (let i = 0; i < await triggers.count(); i++) {
                    const trigger = triggers.nth(i);
                    if (await trigger.getAttribute('aria-expanded') === 'true') await trigger.click();
                    await trigger.click();
                    await page.locator(`#vlp-faq-answer-${i}`).waitFor({ state: 'visible' });
                    accordionWorks &&= (await trigger.getAttribute('aria-expanded') === 'true') && Boolean(await page.locator(`#vlp-faq-answer-${i} p`).textContent());
                    await trigger.click();
                }
                await triggers.first().click();
                await page.locator('.vlp__footer-service').click();
                const dialog = page.getByRole('dialog');
                await dialog.waitFor();
                const servicesWorks = await dialog.isVisible();
                await dialog.getByRole('button', { name: /إغلاق|Close/i }).first().click();
                if (language === 'ar' && [390, 768, 1536].includes(width)) {
                    await page.evaluate(() => window.scrollTo(0, 0));
                    await page.waitForTimeout(600);
                    await page.screenshot({ path: path.join(__dirname, `page-${name}.png`), fullPage: true });
                    for (const [label, selector] of [['features', '#vlp-features'], ['workflow', '#vlp-workflow'], ['faq', '#vlp-faq'], ['closing', '.vlp__cta']]) {
                        await page.locator(selector).screenshot({ path: path.join(__dirname, `${label}-${name}.png`) });
                    }
                }
                results.push({ name, ...layout, accordionWorks, servicesWorks, errors });
                await context.close();
            }
            console.log(`Checked ${width} x ${height}`);
        }
        const failures = results.filter(r => r.overflow || r.clipped.length || !r.headingsVisible || r.modalities !== 5 || r.features !== 3 || r.steps !== 4 || !r.accordionWorks || !r.servicesWorks || r.errors.length);
        fs.writeFileSync(path.join(__dirname, process.env.VIARA_REPORT_NAME || 'validation.json'), JSON.stringify(results, null, 2));
        console.log(JSON.stringify({ cases: results.length, failures }, null, 2));
        if (failures.length) process.exitCode = 1;
    } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
