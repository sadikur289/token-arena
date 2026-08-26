import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/data/data/com.termux/files/usr/bin/chromium-browser',
  args: ['--no-sandbox', '--disable-gpu'],
  headless: 'new',
});
const page = await browser.newPage();
await page.goto('https://token-arena-rho.vercel.app/', { waitUntil: 'networkidle2', timeout: 45000 });
await new Promise(r => setTimeout(r, 3000));

// Test 1: click Connect Wallet -> modal should open
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')];
  const b = btns.find(x => x.innerText.trim() === 'Connect Wallet');
  b?.click();
});
await new Promise(r => setTimeout(r, 2500));
const modalText = await page.evaluate(() => document.body.innerText.slice(0, 500));
console.log('AFTER CONNECT CLICK:', modalText.includes('Sign in with Google') ? 'MODAL OPENED ✓' : 'NO MODAL');
console.log(modalText.slice(0, 250));

// Screenshot proof
await page.screenshot({ path: '/data/data/com.termux/files/home/arena-modal.png' });
console.log('screenshot saved');

// Test 2: Outbid button opens bid modal
const btns2 = [...document.querySelectorAll('button')];
const outbid = btns2.find(x => x.innerText.trim().toUpperCase() === 'OUTBID');
if (outbid) { await outbid.click(); await new Promise(r => setTimeout(r, 1500)); }
const hasForm = await page.evaluate(() => !!document.querySelector('input[placeholder="$TOKEN"]'));
console.log('BID FORM:', hasForm ? 'OPENS ✓' : 'MISSING');

await browser.close();
