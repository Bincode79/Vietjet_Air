#!/usr/bin/env node
/** Probe font-family của nút CTA chính (hero) trên site thật. */
const puppeteer = require('puppeteer-core');
const fs = require('node:fs');

function chromePath() {
  // CHROME_PATH do nguoi chay dat — uu tien hon mac dinh, de chay duoc tren
  // may khong cai Google Chrome mac dinh (CI, Chromium portable).
  const fromEnv = process.env.CHROME_PATH;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ];
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) throw new Error('Không tìm thấy Chrome/Chromium');
  return found;
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: chromePath(),
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto('https://newweb.vietjetair.com/vi/', {
    waitUntil: 'domcontentloaded',
    timeout: 120000,
  });
  await new Promise((r) => setTimeout(r, 9000));

  const data = await page.evaluate(() => {
    const cta = Array.from(document.querySelectorAll('button')).find(
      (b) => (b.textContent || '').includes('Tìm chuyến bay') && b.getBoundingClientRect().width > 0
    );
    if (!cta) return null;
    const out = [];
    const walk = (el, depth) => {
      const s = getComputedStyle(el);
      out.push({
        depth,
        tag: el.tagName,
        cls: (el.className || '').toString().slice(0, 40),
        text: (el.textContent || '').trim().slice(0, 30),
        ff: s.fontFamily,
        fs: s.fontSize,
        fw: s.fontWeight,
        tt: s.textTransform,
      });
      Array.from(el.children).forEach((c) => walk(c, depth + 1));
    };
    walk(cta, 0);
    return out;
  });

  console.log(JSON.stringify(data, null, 2));
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
