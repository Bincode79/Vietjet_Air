const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:4028';
const CHROME =
  process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT_DIR = path.resolve(__dirname, '..', 'docs', 'qa', 'brand-icons-test');

fs.mkdirSync(OUT_DIR, { recursive: true });

async function run() {
  console.log(`[QA] Launching Chrome against ${BASE_URL}...`);
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  // 1. Desktop - Flight Results
  const desktopPage = await browser.newPage();
  await desktopPage.setViewport({ width: 1280, height: 900 });
  await desktopPage.goto(`${BASE_URL}/tim-ve?from=SGN&to=HAN&depart=2026-11-25&adults=1`, {
    waitUntil: 'domcontentloaded',
  });
  await new Promise((r) => setTimeout(r, 2000));
  const desktopPath = path.join(OUT_DIR, '01-desktop-flight-results.png');
  await desktopPage.screenshot({ path: desktopPath });
  console.log(`[QA] Saved Desktop Flight Results: ${desktopPath}`);
  await desktopPage.close();

  // 2. Mobile - Flight Results
  const mobilePage = await browser.newPage();
  await mobilePage.setViewport({ width: 390, height: 844, isMobile: true });
  await mobilePage.goto(`${BASE_URL}/tim-ve?from=SGN&to=HAN&depart=2026-11-25&adults=1`, {
    waitUntil: 'domcontentloaded',
  });
  await new Promise((r) => setTimeout(r, 2000));
  const mobilePath = path.join(OUT_DIR, '02-mobile-flight-results.png');
  await mobilePage.screenshot({ path: mobilePath });
  console.log(`[QA] Saved Mobile Flight Results: ${mobilePath}`);

  // 3. Mobile Drawer
  await mobilePage.goto(`${BASE_URL}/trang-chu`, { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 1000));
  const menuBtn = await mobilePage.$(
    'button[aria-label*="menu" i], button[aria-label*="Menu" i], button.lg\\:hidden'
  );
  if (menuBtn) {
    await menuBtn.click();
    await new Promise((r) => setTimeout(r, 600));
    const drawerPath = path.join(OUT_DIR, '03-mobile-drawer.png');
    await mobilePage.screenshot({ path: drawerPath });
    console.log(`[QA] Saved Mobile Drawer: ${drawerPath}`);
  }
  await mobilePage.close();

  // 4. Desktop - Tra cuu / Chuyen bay cua toi
  const traCuuPage = await browser.newPage();
  await traCuuPage.setViewport({ width: 1280, height: 800 });
  await traCuuPage.goto(`${BASE_URL}/tra-cuu`, { waitUntil: 'domcontentloaded' });
  await new Promise((r) => setTimeout(r, 1000));
  const traCuuPath = path.join(OUT_DIR, '04-desktop-tra-cuu.png');
  await traCuuPage.screenshot({ path: traCuuPath });
  console.log(`[QA] Saved Tra cuu: ${traCuuPath}`);
  await traCuuPage.close();

  await browser.close();
  console.log('[QA] All screenshots captured successfully!');
}

run().catch((err) => {
  console.error('[QA] Error:', err);
  process.exit(1);
});
