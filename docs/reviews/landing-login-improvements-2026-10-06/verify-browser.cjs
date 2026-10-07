const { chromium } = require('C:/Users/Abdo/AppData/Local/npm-cache/_npx/9833c18b2d85bc59/node_modules/playwright');
const { prepare } = require('../landing-login-2026-10-06/browser-review.cjs');
const fs = require('node:fs');
const path = require('node:path');
const checks = [];
const errors = [];
const base = 'http://127.0.0.1:5178';
let browser;
function check(name, pass, evidence) { checks.push({ name, pass: !!pass, evidence }); }
async function ready(page, route, selector) {
    await page.goto(base + route);
    await page.waitForSelector(selector);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1200);
}
async function layout(page) {
    return page.evaluate(() => {
        const visible = [...document.querySelectorAll('header a,header button')].filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden');
        const collisions = [];
        for (let i = 0; i < visible.length; i++) for (let j = i + 1; j < visible.length; j++) {
            const a = visible[i].getBoundingClientRect(), b = visible[j].getBoundingClientRect();
            if (Math.min(a.right,b.right)-Math.max(a.left,b.left)>1 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1) collisions.push([visible[i].textContent.trim(),visible[j].textContent.trim()]);
        }
        const form = document.querySelector('.vlogin__form-pane')?.getBoundingClientRect();
        return { collisions, width: innerWidth, scrollWidth: document.documentElement.scrollWidth, clippedControls: visible.filter(el=>{const r=el.getBoundingClientRect();return r.left < -1 || r.right > innerWidth+1}).map(el=>el.outerHTML.slice(0,160)), formCenter: form ? form.x + form.width / 2 : null };
    });
}
(async () => {
    browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
    const specs = process.argv.includes('--interactions-only') ? [] : [
        { language:'ar',width:320,height:740 }, { language:'ar',width:390,height:844 },
        { language:'ar',width:800,height:900 }, { language:'ar',width:820,height:1180 },
        { language:'ar',width:1024,height:900 }, { language:'ar',width:1025,height:900 },
        { language:'ar',width:1280,height:800 }, { language:'ar',width:1440,height:900 },
        { language:'en',width:320,height:740,theme:'dark' }, { language:'en',width:390,height:844 },
        { language:'en',width:820,height:900 }, { language:'en',width:1366,height:768,theme:'dark' },
        { language:'en',width:1440,height:900 }, { language:'en',width:1600,height:900 },
    ];
    for (const spec of specs) {
        const { context, page } = await prepare(browser,spec);
        page.on('pageerror', e=>errors.push(e.message));
        for (const [route,selector] of [['/landing','.vlp'],['/login','.vlogin']]) {
            await ready(page,route,selector);
            const data = await layout(page);
            check(`${route} ${spec.language} ${spec.width}: layout`, !data.collisions.length && !data.clippedControls.length && data.scrollWidth===data.width,data);
            if (route==='/login' && spec.width<=1024) check(`centered sign-in ${spec.language} ${spec.width}`,Math.abs(data.formCenter-spec.width/2)<2,data.formCenter);
            if (route==='/landing' && spec.width<=1400) {
                const menu = page.locator('.vlp__menu-toggle');
                await menu.click();
                check(`mobile navigation ${spec.language} ${spec.width}`,await page.locator('.vlp__nav [href="/portal"]').isVisible() && await page.locator('.vlp__nav [href="/doctor-portal"]').isVisible());
                await page.locator('.vlp__nav a').first().focus();
                await page.keyboard.press('Escape');
            }
            if ([320,390,820,1440].includes(spec.width)) await page.screenshot({path:path.join(__dirname,`${route.slice(1)}-${spec.language}-${spec.width}-${spec.theme||'light'}.png`)});
        }
        await context.close();
    }
    const {context,page} = await prepare(browser,{theme:'system',system:'dark'});
    await ready(page,'/landing','.vlp');
    check('landing starts in system dark',await page.locator('.vlp').evaluate(e=>e.classList.contains('vlp--dark')));
    await page.emulateMedia({colorScheme:'light'}); await page.waitForTimeout(150);
    check('landing follows system light change',!(await page.locator('.vlp').evaluate(e=>e.classList.contains('vlp--dark'))));
    await page.emulateMedia({colorScheme:'dark'});
    await page.locator('.vlp__header-signin').click(); await page.waitForSelector('.vlogin');
    check('sign-in preserves system dark',await page.locator('.vlogin').evaluate(e=>e.classList.contains('vlogin--dark')));
    await page.emulateMedia({colorScheme:'light'});await page.waitForTimeout(100);
    const trigger=page.getByRole('button',{name:'نسيت كلمة المرور؟'});
    await trigger.click();
    const dialog=page.getByRole('dialog',{name:'إعادة تعيين كلمة المرور'});
    await page.waitForTimeout(100);
    check('recovery focuses email and locks background',await page.locator('#forgot-email').evaluate(e=>e===document.activeElement) && await page.evaluate(()=>document.body.style.overflow==='hidden'));
    await dialog.getByRole('button',{name:'إغلاق',exact:true}).focus();
    await page.keyboard.press('Shift+Tab');
    check('recovery traps Shift+Tab',await dialog.getByRole('button',{name:'العودة لتسجيل الدخول'}).evaluate(e=>e===document.activeElement));
    await page.keyboard.press('Escape');await page.waitForTimeout(100);
    check('recovery closes and restores focus',!(await dialog.count()) && await trigger.evaluate(e=>e===document.activeElement));
    await ready(page,'/login?resetToken=review-token&email=review%40example.test','.vlogin');
    await page.locator('#reset-new-pw').fill('ReviewPassword123!');
    await page.locator('#reset-confirm-pw').fill('ReviewPassword123!');
    await page.getByRole('button',{name:'حفظ كلمة المرور الجديدة'}).click();await page.waitForTimeout(200);
    check('successful reset cleans URL and returns usable sign-in',page.url().endsWith('/login') && !(await page.locator('.public-dialog[open]').count()) && await page.locator('.vlogin__reset-success').isVisible());
    await page.screenshot({path:path.join(__dirname,'reset-success-inline.png')});
    await page.getByRole('button',{name:'متابعة تسجيل الدخول'}).click();await page.waitForTimeout(100);
    check('continue sign-in focuses email',await page.locator('#staff-email').evaluate(e=>e===document.activeElement));
    await page.locator('.vlogin__util-service').click();
    const service=page.getByRole('dialog',{name:'حالة النظام'});
    await page.waitForTimeout(100);
    check('public availability dialog hides administration commands',!(/docker|Orthanc|Backend API/.test(await service.innerText())));
    await page.screenshot({path:path.join(__dirname,'public-availability.png')});
    await service.getByRole('button',{name:'التواصل مع الدعم'}).click();
    await page.locator('.public-dialog[open] a[href="mailto:support@example.test"]').waitFor();
    check('support uses center contact details',await page.locator('.public-dialog[open] a[href="mailto:support@example.test"]').isVisible());
    check('support transition keeps background locked',await page.evaluate(()=>document.body.style.overflow==='hidden'));
    await page.screenshot({path:path.join(__dirname,'public-support.png')});
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    check('support returns focus to original service trigger',await page.locator('.vlogin__util-service').evaluate(e=>e===document.activeElement));
    await page.locator('#staff-email').fill('retained@example.test');
    await context.route(url=>url.pathname.endsWith('/v1/health'),route=>route.fulfill({status:503,contentType:'application/json',body:'{"status":"unavailable"}'}));
    await page.evaluate(()=>window.dispatchEvent(new Event('online')));await page.waitForTimeout(300);
    check('outage preserves sign-in route and email',page.url().endsWith('/login') && await page.locator('#staff-email').inputValue()==='retained@example.test' && await page.locator('.public-connection').isVisible());
    await page.screenshot({path:path.join(__dirname,'login-outage.png')});
    await context.close();
    for (const language of ['ar','en']) {
        const small=await prepare(browser,{language,theme:'dark',width:390,height:400,reduced:true});
        await ready(small.page,'/login?resetToken=expired&email=review%40example.test','.vlogin');
        const reset=small.page.locator('.public-dialog[open]');
        const geometry=await reset.evaluate(el=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom,width:r.width,viewport:innerHeight,scrollable:el.scrollHeight>el.clientHeight};});
        check(`short mobile reset ${language}: reachable scrolling dialog`,geometry.top>=0 && geometry.bottom<=geometry.viewport && geometry.scrollable,geometry);
        await small.context.route(url=>url.pathname.endsWith('/auth/reset-password'),route=>route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:'Reset link has expired.'})}));
        await small.page.locator('#reset-new-pw').fill('ReviewPassword123!');
        await small.page.locator('#reset-confirm-pw').fill('ReviewPassword123!');
        await reset.locator('button[type=submit]').click();
        await reset.getByRole('alert').waitFor();
        check(`expired reset ${language}: error preserves values`,(await reset.getByRole('alert').innerText()).includes('expired') && await small.page.locator('#reset-new-pw').inputValue()==='ReviewPassword123!');
        await small.page.screenshot({path:path.join(__dirname,`reset-expired-${language}-short-mobile.png`)});
        await small.page.keyboard.press('Escape');await small.page.waitForTimeout(100);
        check(`expired reset ${language}: Escape returns to sign-in`,small.page.url().endsWith('/login') && !(await reset.count()));
        await ready(small.page,'/landing','.vlp');
        const animations=await small.page.locator('.vlp').evaluate(el=>el.getAnimations({subtree:true}).filter(a=>a.effect?.getTiming().iterations===Infinity).length);
        check(`reduced motion ${language}: no repeating landing animation`,animations===0,animations);
        await small.context.close();
    }
    await browser.close();
    const resultFile=process.argv.includes('--interactions-only')?'interaction-results.json':'results.json';
    fs.writeFileSync(path.join(__dirname,resultFile),JSON.stringify({checks,errors},null,2));
    console.log(JSON.stringify({checks:checks.length,failures:checks.filter(x=>!x.pass),errors}));
    if (checks.some(x=>!x.pass)||errors.length)process.exitCode=1;
})().catch(async e=>{fs.writeFileSync(path.join(__dirname,'failure.json'),JSON.stringify({error:String(e),checks,errors},null,2));console.error(e);await browser?.close();process.exitCode=1;});
