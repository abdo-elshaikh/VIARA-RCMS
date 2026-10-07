const { chromium } = require('C:/Users/Abdo/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright-core');
const path = require('node:path');
(async () => {
    const browser = await chromium.launch({ executablePath: 'C:/Users/Abdo/AppData/Local/ms-playwright/chromium-1181/chrome-win/chrome.exe' });
    const page = await browser.newPage({ viewport: { width: 1720, height: 914 }, reducedMotion: 'reduce' });
    await page.addInitScript(() => {
        localStorage.setItem('VIARA_lang', 'ar');
        localStorage.setItem('VIARA_preferences', JSON.stringify({ language: 'ar', theme: 'light', motion: 'reduced' }));
    });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const route of ['/', '/login']) {
        await page.goto(`http://127.0.0.1:5190${route}`);
        await page.locator(route === '/' ? '.vlp' : '.vlogin').waitFor();
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(1000);
        console.log(route, await page.evaluate(() => {
            const element = document.querySelector('.vlogin__card') || document.querySelector('.vlp__hero');
            const style = getComputedStyle(element);
            return { css: [...document.querySelectorAll('link[rel="stylesheet"]')].map(link => link.href), background: style.background, columns: style.gridTemplateColumns, border: style.border, overflow: document.documentElement.scrollWidth > innerWidth };
        }), errors);
        await page.screenshot({ path: path.join(__dirname, `${route === '/' ? 'landing' : 'login'}-production.png`) });
    }
    await browser.close();
})().catch(error => { console.error(error); process.exitCode = 1; });
