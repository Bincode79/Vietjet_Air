const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:4028';
const CHROME =
  process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT_DIR = path.resolve(__dirname, '..', 'docs', 'qa', 'ui-audit');

fs.mkdirSync(OUT_DIR, { recursive: true });

const PAGES_TO_TEST = [
  { name: '01_trang_chu', url: '/trang-chu', title: 'Trang chủ' },
  {
    name: '02_tim_ve',
    url: '/tim-ve?from=SGN&to=HAN&depart=2026-11-25&adults=1',
    title: 'Chọn chuyến bay',
  },
  { name: '03_chuyen_bay_cua_toi', url: '/chuyen-bay-cua-toi', title: 'Chuyến bay của tôi' },
  { name: '04_dat_ve_chi_tiet', url: '/dat-ve/HLJXC1', title: 'Chi tiết đặt vé' },
  { name: '05_thanh_toan', url: '/thanh-toan?bookingId=HLJXC1', title: 'Trang thanh toán' },
  { name: '06_lam_thu_tuc', url: '/lam-thu-tuc', title: 'Check-in trực tuyến' },
  { name: '07_dich_vu', url: '/dich-vu', title: 'Dịch vụ chuyến bay' },
  { name: '08_tai_khoan', url: '/tai-khoan', title: 'Tài khoản người dùng' },
];

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800, isMobile: false },
  { name: 'mobile', width: 390, height: 844, isMobile: true },
];

async function checkPage(page, pageInfo, vp) {
  const result = {
    page: pageInfo.name,
    title: pageInfo.title,
    url: pageInfo.url,
    viewport: vp.name,
    hasHorizontalOverflow: false,
    bodyScrollWidth: 0,
    windowInnerWidth: vp.width,
    overflowingElements: [],
    brokenImages: [],
    screenshot: '',
  };

  try {
    await page.goto(`${BASE_URL}${pageInfo.url}`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000,
    });
    // Wait for animations and initial dynamic data
    await new Promise((r) => setTimeout(r, 2000));

    // Audit layout
    const auditData = await page.evaluate((vpWidth) => {
      const docW = document.documentElement.scrollWidth;
      const bodyW = document.body.scrollWidth;
      const winW = window.innerWidth;
      const isOverflowing = docW > winW + 2 || bodyW > winW + 2;

      // Detect overflowing elements
      const overflows = [];
      const allEls = document.querySelectorAll('*');
      for (const el of allEls) {
        // Skip hidden or invisible elements
        if (el.offsetWidth === 0 || el.offsetHeight === 0) continue;
        const rect = el.getBoundingClientRect();
        if (rect.right > winW + 3) {
          overflows.push({
            tag: el.tagName.toLowerCase(),
            id: el.id || undefined,
            className: (el.className || '').toString().slice(0, 100),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
            diff: Math.round(rect.right - winW),
          });
          if (overflows.length >= 10) break; // Limit reporting per page
        }
      }

      // Detect broken images
      const broken = [];
      const images = document.querySelectorAll('img');
      for (const img of images) {
        if (!img.complete || img.naturalWidth === 0) {
          broken.push({
            src: img.src,
            alt: img.alt,
            className: (img.className || '').toString().slice(0, 80),
          });
        }
      }

      return {
        docW,
        bodyW,
        winW,
        isOverflowing,
        overflows,
        broken,
      };
    }, vp.width);

    result.hasHorizontalOverflow = auditData.isOverflowing;
    result.bodyScrollWidth = auditData.docW;
    result.overflowingElements = auditData.overflows;
    result.brokenImages = auditData.broken;

    // Screenshot
    const screenshotName = `${pageInfo.name}_${vp.name}.png`;
    const screenshotPath = path.join(OUT_DIR, screenshotName);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    result.screenshot = screenshotPath;
  } catch (err) {
    result.error = err.message;
  }

  return result;
}

async function run() {
  console.log(`[UI Audit] Launching Chrome against ${BASE_URL}...`);
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const results = [];

  for (const pageInfo of PAGES_TO_TEST) {
    console.log(`\n--- Auditing ${pageInfo.title} (${pageInfo.url}) ---`);
    for (const vp of VIEWPORTS) {
      const page = await browser.newPage();
      await page.setViewport({
        width: vp.width,
        height: vp.height,
        isMobile: vp.isMobile,
      });

      console.log(`  Checking ${vp.name} (${vp.width}x${vp.height})...`);
      const res = await checkPage(page, pageInfo, vp);
      results.push(res);

      if (res.hasHorizontalOverflow) {
        console.warn(
          `  ⚠️ [OVERFLOW] ${vp.name}: ScrollWidth=${res.bodyScrollWidth} > Viewport=${res.windowInnerWidth}`
        );
        res.overflowingElements.forEach((el, idx) => {
          console.warn(`     #${idx + 1}: <${el.tag} class="${el.className}"> +${el.diff}px`);
        });
      } else {
        console.log(`  ✅ [OK] ${vp.name}: Không bị tràn ngang.`);
      }

      if (res.brokenImages && res.brokenImages.length > 0) {
        console.warn(`  ⚠️ [BROKEN IMAGES] Found ${res.brokenImages.length} broken images:`);
        res.brokenImages.forEach((img) => console.warn(`     - ${img.src} (${img.alt})`));
      }

      await page.close();
    }
  }

  await browser.close();

  const reportPath = path.join(OUT_DIR, 'ui-audit-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\n[UI Audit] Completed! Report saved to ${reportPath}`);
}

run().catch((err) => {
  console.error('[UI Audit] Fatal error:', err);
  process.exit(1);
});
