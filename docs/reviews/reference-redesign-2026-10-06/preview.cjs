const { chromium } = require('C:/Users/Abdo/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright-core');
const path = require('node:path');
const fs = require('node:fs');
async function main() {
    const browser = await chromium.launch({ executablePath: 'C:/Users/Abdo/AppData/Local/ms-playwright/chromium-1181/chrome-win/chrome.exe', headless: true });
    const results = [];
    for (const [language, theme, width, height] of [
        ['ar', 'light', 1720, 914], ['ar', 'light', 1440, 900], ['ar', 'light', 390, 844],
        ['ar', 'light', 320, 720], ['ar', 'light', 820, 1180], ['en', 'light', 1440, 900],
        ['ar', 'dark', 1440, 900], ['en', 'dark', 390, 844], ['ar', 'light', 1536, 696],
    ]) {
        const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
        await context.addInitScript(({language, theme}) => {
            localStorage.setItem('VIARA_lang', language);
            localStorage.setItem('i18nextLng', language);
            localStorage.setItem('VIARA_preferences', JSON.stringify({ language, theme, motion: 'reduced' }));
        }, { language, theme });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        for (const route of ['/', '/login']) {
            await page.goto(`http://localhost:5173${route}`, { waitUntil: 'domcontentloaded' });
            await page.locator(route === '/' ? '.vlp' : '.vlogin').waitFor();
            await page.evaluate(() => document.fonts.ready);
            await page.waitForTimeout(1500);
            const name = `${route === '/' ? 'landing' : 'login'}-${language}-${theme}-${width}`;
            await page.screenshot({ path: path.join(__dirname, `${name}.png`), fullPage: width < 901 });
            if (width < 901) await page.screenshot({ path: path.join(__dirname, `${name}-viewport.png`) });
            results.push({name, ...await page.evaluate(() => ({
                overflow: document.documentElement.scrollWidth > window.innerWidth,
                title: document.querySelector('h1')?.textContent,
                pageHeight: document.documentElement.scrollHeight,
                card: (() => { const r = document.querySelector('.vlogin__form-pane')?.getBoundingClientRect(); return r && { x: r.x, y:r.y, width:r.width, height:r.height }; })(),
                missingImages: [...document.images].filter(i => !i.complete || !i.naturalWidth).map(i=>i.src),
            })), errors: [...errors]});
        }
        await context.close();
    }
    console.log(JSON.stringify(results, null, 2));
    fs.writeFileSync(path.join(__dirname, 'validation.json'), JSON.stringify(results, null, 2));
    await browser.close();
}
main().catch(error => { console.error(error); process.exitCode = 1; });
