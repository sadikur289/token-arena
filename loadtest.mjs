import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: '/data/data/com.termux/files/usr/bin/chromium-browser',
  args: ['--no-sandbox', '--disable-gpu'],
  headless: 'new',
});
const page = await browser.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
try {
  await page.goto('https://token-arena-rho.vercel.app/', { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise(r => setTimeout(r, 4000));
  const text = await page.evaluate(() => document.body.innerText.slice(0, 300));
  console.log('PAGE TEXT:', text);
} catch (e) {
  console.log('NAV ERROR:', e.message);
}
console.log('CONSOLE ERRORS:', JSON.stringify(errors.slice(0, 10), null, 1));
await browser.close();
