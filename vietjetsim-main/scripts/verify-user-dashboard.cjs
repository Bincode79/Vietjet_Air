const path = require('node:path');
const puppeteer = require('puppeteer-core');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:4028';
const CHROME =
  process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT_DIR = path.resolve(__dirname, '..', 'docs', 'qa', 'ui-audit');

async function run() {
  console.log('[Dashboard Audit] Launching Chrome...');
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  // 1. Get CSRF token
  await page.goto(`${BASE_URL}/api/csrf`, { waitUntil: 'domcontentloaded' });
  const cookies = await page.cookies();
  const csrfCookie = cookies.find((c) => c.name === 'csrf_token');
  console.log('[Dashboard Audit] CSRF Cookie:', csrfCookie ? 'OK' : 'MISSING');

  // 2. Perform Login via API
  const loginRes = await page.evaluate(async (csrf) => {
    const res = await fetch('/api/xac-thuc/dang-nhap', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-csrf-token': csrf || '',
      },
      body: JSON.stringify({
        email: 'user@vietjetair.vn',
        password: 'user123',
      }),
    });
    return { ok: res.ok, status: res.status, data: await res.json() };
  }, csrfCookie?.value);

  console.log('[Dashboard Audit] Login result:', loginRes);

  // 3. Visit /tai-khoan on Desktop
  await page.goto(`${BASE_URL}/tai-khoan`, { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 2500));
  const desktopShot = path.join(OUT_DIR, '08_tai_khoan_logged_in_desktop.png');
  await page.screenshot({ path: desktopShot });
  console.log('[Dashboard Audit] Saved Desktop:', desktopShot);

  // 4. Visit /tai-khoan on Mobile
  await page.setViewport({ width: 390, height: 844, isMobile: true });
  await new Promise((r) => setTimeout(r, 1000));
  const mobileShot = path.join(OUT_DIR, '08_tai_khoan_logged_in_mobile.png');
  await page.screenshot({ path: mobileShot });
  console.log('[Dashboard Audit] Saved Mobile:', mobileShot);

  // Check horizontal overflow on mobile
  const overflow = await page.evaluate(() => {
    const docW = document.documentElement.scrollWidth;
    const winW = window.innerWidth;
    return { docW, winW, overflows: docW > winW + 2 };
  });
  console.log('[Dashboard Audit] Mobile overflow check:', overflow);

  await browser.close();
}

run().catch((err) => {
  console.error('[Dashboard Audit] Error:', err);
  process.exit(1);
});
