const { chromium } = require('C:/Users/Abdo/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright');
const { prepare } = require('./browser-review.cjs');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
    const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
    const out = [];
    for (const spec of [{ language: 'ar', width: 1440 }, { language: 'en', width: 1280 }]) {
        const { context, page } = await prepare(browser, spec);
        await page.goto('http://127.0.0.1:5178/landing');
        await page.waitForSelector('.vlp');
        await page.waitForTimeout(1800);
        out.push({ scenario: 'header-collision', ...spec, ...await page.evaluate(() => {
            const a = document.querySelector('.vlp__nav-portal').getBoundingClientRect();
            const b = document.querySelector('.vlp__util-service').getBoundingClientRect();
            return { overlapWidth: Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)), overlapHeight: Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)) };
        }) });
        if (spec.language === 'ar') {
            for (const section of ['.vlp__metrics-strip', '#vlp-features', '#vlp-workflow', '#vlp-faq', '.vlp__cta']) {
                await page.locator(section).scrollIntoViewIfNeeded();
                await page.waitForTimeout(900);
            }
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.screenshot({ path: path.join(__dirname, 'landing-ar-full.png'), fullPage: true });
            await page.locator('.vlp__util-service').click();
            out.push({ scenario: 'service-dialog', focusInside: await page.evaluate(() => !!document.activeElement.closest('[role=dialog]')), bodyOverflow: await page.evaluate(() => getComputedStyle(document.body).overflow) });
        }
        await context.close();
    }
    const { context, page } = await prepare(browser, { theme: 'system', system: 'light' });
    await page.goto('http://127.0.0.1:5178/landing');
    await page.waitForSelector('.vlp');
    await page.waitForTimeout(1500);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForTimeout(200);
    out.push({ scenario: 'system-theme-change', htmlDark: await page.locator('html').evaluate(e => e.classList.contains('dark')), landingDark: await page.locator('.vlp').evaluate(e => e.classList.contains('vlp--dark')) });
    await context.close();
    await browser.close();
    fs.writeFileSync(path.join(__dirname, 'browser-details.json'), JSON.stringify(out, null, 2));
    console.log(JSON.stringify(out));
})().catch(e => { console.error(e); process.exitCode = 1; });
