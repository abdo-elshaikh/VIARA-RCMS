const path = require('node:path');
const { chromium } = require(process.env.VIARA_PLAYWRIGHT_MODULE || 'C:/Users/Abdo/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright-core');
async function main() {
    const browser = await chromium.launch({ executablePath: process.env.VIARA_CHROME_PATH || 'C:/Users/Abdo/AppData/Local/ms-playwright/chromium-1181/chrome-win/chrome.exe', headless: true });
    try {
        for (const [width, height] of [[390, 844], [768, 1024], [1536, 704]]) {
            const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
            await context.addInitScript(() => {
                localStorage.setItem('VIARA_lang', 'ar');
                localStorage.setItem('i18nextLng', 'ar');
                localStorage.setItem('VIARA_preferences', JSON.stringify({ language: 'ar', theme: 'light', motion: 'reduced' }));
            });
            const page = await context.newPage();
            await page.goto(process.env.VIARA_BASE_URL || 'http://127.0.0.1:5190', { waitUntil: 'domcontentloaded' });
            await page.locator('.vlp__footer-main').waitFor();
            await page.evaluate(() => document.fonts.ready);
            for (const [label, selector] of [['modalities', '.vlp__marquee-wrap'], ['capabilities', '.vlp__metrics-strip'], ['footer', '.vlp__footer']]) {
                await page.locator(selector).scrollIntoViewIfNeeded();
                await page.waitForTimeout(700);
                await page.locator(selector).screenshot({ path: path.join(__dirname, `${label}-ar-light-${width}x${height}.png`) });
            }
            await context.close();
        }
    } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
