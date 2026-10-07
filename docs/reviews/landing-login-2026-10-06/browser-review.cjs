const { chromium } = require('C:/Users/Abdo/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright');
const fs = require('node:fs');
const path = require('node:path');
const output = __dirname;
const results = [];
const errors = [];
const base = 'http://127.0.0.1:5178';

async function prepare(browser, { language = 'ar', theme = 'light', width = 1440, height = 900, system = 'light', reduced = false } = {}) {
    const context = await browser.newContext({ viewport: { width, height }, colorScheme: system, reducedMotion: reduced ? 'reduce' : 'no-preference' });
    await context.addInitScript(({ language, theme }) => {
        localStorage.setItem('VIARA_lang', language);
        localStorage.setItem('VIARA_preferences', JSON.stringify({ language, theme }));
    }, { language, theme });
    await context.route(url => url.pathname.startsWith('/api/'), route => {
        const url = route.request().url();
        if (/auth\/refresh/.test(url)) return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'Review: signed out' }) });
        let data = {};
        if (/v1\/health/.test(url)) data = { status: 'OK' };
        if (/reset-password|forgot-password/.test(url)) data = { success: true, message: 'Success' };
        if (/public.*settings|settings.*public/.test(url)) data = { support_email: 'support@example.test', hotline: '19999' };
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    return { context, page };
}

async function inspect(page, selector) {
    return page.evaluate(selector => {
        const root = document.querySelector(selector);
        if (!root) return { missingRoot: selector, body: document.body.innerText.slice(0, 2000), url: location.href };
        const item = node => {
            if (!node) return null;
            const rect = node.getBoundingClientRect();
            const css = getComputedStyle(node);
            return { text: node.textContent.trim().slice(0, 150), x: +rect.x.toFixed(1), y: +rect.y.toFixed(1), width: +rect.width.toFixed(1), height: +rect.height.toFixed(1), display: css.display, fontSize: css.fontSize, color: css.color, background: css.backgroundColor, transform: css.transform, animation: css.animationName, duration: css.animationDuration };
        };
        const visible = [...root.querySelectorAll('a,button,input')].filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
        const overflow = [...root.querySelectorAll('*')].filter(el => {
            const r = el.getBoundingClientRect();
            return el.getClientRects().length && r.width && (r.left < -1 || r.right > innerWidth + 1) && getComputedStyle(el).position !== 'fixed';
        }).slice(0, 20).map(el => ({ class: el.className?.baseVal || el.className, ...item(el) }));
        return { title: document.title, rootClass: root.className, htmlClass: document.documentElement.className, viewport: [innerWidth, innerHeight], scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight,
            header: item(root.querySelector('header')), nav: item(root.querySelector('nav')), form: item(root.querySelector('.vlogin__form-pane')), helpers: item(root.querySelector('.vlogin__helpers')), submit: item(root.querySelector('button[type=submit]')), portal: item(root.querySelector('[href="/portal"]')), headline: item(root.querySelector('h1')), label: item(root.querySelector('label[for="staff-email"]')), input: item(root.querySelector('#staff-email')),
            smallControls: visible.filter(el => { const r = el.getBoundingClientRect(); return r.width < 40 || r.height < 40; }).map(item).slice(0, 15), overflow };
    }, selector);
}

module.exports = { prepare, inspect };
if (require.main === module) (async () => {
    const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
    for (const spec of [
        { name: 'ar-light-desktop', language: 'ar', theme: 'light', width: 1440, height: 900 },
        { name: 'en-dark-laptop', language: 'en', theme: 'dark', width: 1366, height: 768 },
        { name: 'en-light-1280', language: 'en', theme: 'light', width: 1280, height: 800 },
        { name: 'ar-light-tablet', language: 'ar', theme: 'light', width: 820, height: 1180 },
        { name: 'ar-light-mobile', language: 'ar', theme: 'light', width: 390, height: 844 },
        { name: 'en-dark-small', language: 'en', theme: 'dark', width: 320, height: 740 },
        { name: 'ar-system-dark', language: 'ar', theme: 'system', system: 'dark', width: 1440, height: 900 },
    ]) {
        const { context, page } = await prepare(browser, spec);
        for (const [route, selector] of [['/landing', '.vlp'], ['/login', '.vlogin']]) {
            await page.goto(base + route);
            await page.waitForSelector(selector, { timeout: 45000 }).catch(async error => { fs.writeFileSync(path.join(output, 'failure.json'), JSON.stringify({ errors, url: page.url(), body: await page.locator('body').innerText() }, null, 2)); throw error; });
            await page.evaluate(() => document.fonts.ready);
            await page.waitForTimeout(1800);
            results.push({ scenario: spec.name, route, ...await inspect(page, selector) });
            await page.screenshot({ path: path.join(output, `${route.slice(1)}-${spec.name}.png`) });
        }
        await context.close();
    }

    const { context, page } = await prepare(browser);
    await page.goto(base + '/login');
    await page.waitForSelector('.vlogin');
    await page.waitForTimeout(1000);
    await page.locator('button[type=submit]').first().click();
    await page.waitForTimeout(100);
    results.push({ scenario: 'empty-login', errors: await page.locator('[role=alert]').allTextContents(), focused: await page.evaluate(() => document.activeElement.id) });
    await page.screenshot({ path: path.join(output, 'login-validation.png') });
    await page.getByRole('button', { name: 'نسيت كلمة المرور؟' }).click();
    const activeBefore = await page.evaluate(() => document.activeElement.outerHTML.slice(0, 250));
    await page.keyboard.press('Escape');
    results.push({ scenario: 'forgot-dialog', activeBefore, remainsAfterEscape: await page.locator('[aria-labelledby=viara-forgot-title]').count(), bodyOverflow: await page.evaluate(() => getComputedStyle(document.body).overflow) });
    if (await page.locator('[aria-labelledby=viara-forgot-title]').count()) {
        await page.locator('[aria-labelledby=viara-forgot-title]').getByRole('button', { name: 'إغلاق', exact: true }).click();
    }
    await page.goto(base + '/login?resetToken=review-test-token&email=review%40example.test');
    await page.locator('#reset-new-pw').fill('ReviewOnly123!');
    await page.locator('#reset-confirm-pw').fill('ReviewOnly123!');
    await page.locator('[aria-labelledby=viara-reset-title] button[type=submit]').click();
    await page.waitForTimeout(1000);
    results.push({ scenario: 'reset-success', url: page.url(), successBanner: await page.getByText('تم التحديث!', { exact: true }).count(), actionable: await page.locator('.fixed.inset-0').last().locator('button,a').count() });
    await page.screenshot({ path: path.join(output, 'login-reset-success.png') });
    await context.close();

    const reduced = await prepare(browser, { reduced: true });
    await reduced.page.goto(base + '/landing');
    await reduced.page.waitForSelector('.vlp');
    await reduced.page.waitForTimeout(1500);
    const question = reduced.page.locator('.vlp__faq-trigger').nth(1);
    await question.scrollIntoViewIfNeeded();
    await question.click();
    await reduced.page.waitForTimeout(400);
    results.push({ scenario: 'reduced-motion-and-faq', ...await reduced.page.evaluate(() => ({ gradientAnimations: [...document.querySelectorAll('.vlp__word-in--grad')].map(el => ({ name: getComputedStyle(el).animationName, duration: getComputedStyle(el).animationDuration })), openFaqOuterTransform: getComputedStyle(document.querySelector('.vlp__faq-item--open .vlp__faq-icon')).transform, openFaqInnerTransform: getComputedStyle(document.querySelector('.vlp__faq-item--open .vlp__faq-icon svg')).transform, runningAnimations: document.getAnimations().filter(a => a.playState === 'running').length })) });
    await reduced.page.screenshot({ path: path.join(output, 'landing-faq.png') });
    await reduced.context.close();
    await browser.close();
    fs.writeFileSync(path.join(output, 'browser-results.json'), JSON.stringify({ note: 'Local Vite dev server; all API responses intercepted. Authentication and infrastructure were not verified.', results, errors }, null, 2));
    console.log(JSON.stringify({ scenarios: results.length, errors, output }));
})().catch(error => { fs.writeFileSync(path.join(output, 'failure.json'), JSON.stringify({ errors, results, error: String(error) }, null, 2)); console.error(error); process.exitCode = 1; });
