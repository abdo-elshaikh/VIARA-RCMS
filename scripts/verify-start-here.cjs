'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {chromium}=require('../scratch/start-here-tools/node_modules/playwright-core');
const {default:AxeBuilder}=require('../scratch/start-here-tools/node_modules/@axe-core/playwright');
const root=path.resolve(__dirname,'..'),output=path.join(root,'docs/reviews/start-here-2026-10-09');
const html=path.join(root,'viara-production-package/00_ابدأ_من_هنا_START_HERE.html');
async function main(){
 fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({executablePath:'C:/Users/Abdo/AppData/Local/ms-playwright/chromium-1181/chrome-win/chrome.exe',headless:true});
 const errors=[],externalRequests=[],checks=[];
 try{
  const context=await browser.newContext();const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))externalRequests.push(r.url());});
  for(const width of [320,390,768,1440]){
   await page.setViewportSize({width,height:1000});await page.goto(pathToFileURL(html).href);
   assert.equal(await page.locator('html').getAttribute('dir'),'rtl');assert(await page.locator('.brand img').evaluate(img=>img.complete&&img.naturalWidth>0));
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Overflow at ${width}`);
   const a11y=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
   assert.equal(a11y.violations.length,0,JSON.stringify(a11y.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))));
   await page.screenshot({path:path.join(output,`${width}.png`),fullPage:true});checks.push(`RTL, logo, no overflow and automated WCAG checks at ${width}px`);
  }
  await page.locator('[data-platform="windows"]').click();assert.equal(await page.locator('[data-platform="windows"]').getAttribute('aria-pressed'),'true');assert((await page.locator('#platform-info').textContent()).includes('Windows Server'));await page.locator('[data-platform="linux"]').click();
  for(const link of await page.locator('a[href^="#"]').all())assert.equal(await page.locator(await link.getAttribute('href')).count(),1);
  for(const link of await page.locator('a[href$=".md"]').all())assert(fs.existsSync(path.join(path.dirname(html),await link.getAttribute('href'))));
  const commands=await page.locator('.command code').evaluateAll(nodes=>nodes.map(n=>({id:n.id,command:n.textContent})));assert.equal(commands.length,5);
  await context.grantPermissions(['clipboard-read','clipboard-write']);
  await page.locator('[data-copy="cmd-setup"]').click();
  assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'bash setup.sh');
  await page.reload();await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.className),'skip');
  await page.keyboard.press('Enter');assert.equal(new URL(page.url()).hash,'#prepare');
  await page.locator('[data-platform="windows"]').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('[data-platform="windows"]').getAttribute('aria-pressed'),'true');
  await page.evaluate(()=>{window.__copied=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>window.__copied.push(value)}});});
  for(const {id,command} of commands){await page.locator(`[data-copy="${id}"]`).click();assert.equal(await page.evaluate(()=>window.__copied.at(-1)),command);}
  await page.evaluate(()=>{navigator.clipboard.writeText=async()=>{throw Error('denied')};document.execCommand=()=>true;});await page.locator('[data-copy="cmd-setup"]').click();assert.equal(await page.locator('#copy-fallback').isVisible(),false);
  await page.evaluate(()=>{document.execCommand=()=>false;});
  for(const {id,command} of commands){await page.locator(`[data-copy="${id}"]`).click();assert.equal(await page.locator('#copy-text').inputValue(),command);assert(await page.locator('#copy-fallback').isVisible());await page.locator('#close-fallback').click();}
  for(const box of await page.locator('.checklist input').all())await box.check();assert.equal(await page.locator('#check-progress').getAttribute('value'),'5');await page.reload();assert.equal(await page.locator('.checklist input:checked').count(),0);
  for(const summary of await page.locator('summary').all()){await summary.click();assert(await summary.evaluate(n=>n.parentElement.open));await summary.click();}
  await page.evaluate(()=>{window.print=()=>{window.__printed=true;};});await page.locator('#print-guide').click();assert(await page.evaluate(()=>window.__printed));await page.emulateMedia({media:'print'});assert.equal(await page.locator('.sidebar').isVisible(),false);assert(await page.locator('#cmd-setup').isVisible());await page.pdf({path:path.join(output,'guide.pdf'),format:'A4',printBackground:true});
  assert.deepEqual(errors,[]);assert.deepEqual(externalRequests,[]);checks.push('native clipboard write/read, keyboard skip/Enter, platform selection, links, all copy buttons, denied/manual clipboard fallbacks, checklist/reset, FAQs, print/PDF, zero external requests/errors');
  fs.writeFileSync(path.join(output,'browser-results.json'),JSON.stringify({passed:true,checks,commands,errors,externalRequests},null,2));console.log('PASS: offline START HERE browser and accessibility checks');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
