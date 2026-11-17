const { chromium } = require('playwright');
const fs = require('fs');

const BASE = 'http://127.0.0.1:4028';
const OUT = '/tmp/uicheck-nov17';
fs.mkdirSync(OUT, { recursive: true });

const PAGES = [
  ['home', '/'],
  ['tim-ve', '/tim-ve?from=SGN&to=HAN'],
  ['tra-cuu', '/tra-cuu'],
  ['lam-thu-tuc', '/lam-thu-tuc'],
  ['chuyen-bay-cua-toi', '/chuyen-bay-cua-toi'],
  ['dang-nhap', '/dang-nhap'],
  ['dang-ky', '/dang-ky'],
  ['lien-he', '/lien-he'],
  ['hoi-dap', '/hoi-dap'],
  ['gioi-thieu', '/gioi-thieu'],
  ['thanh-toan', '/thanh-toan'],
  ['hanh-ly', '/hanh-ly'],
  ['quen-mat-khau', '/quen-mat-khau'],
  ['tai-khoan', '/tai-khoan'],
  ['quan-tri', '/quan-tri'],
];

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    args: ['--no-sandbox'],
  });
  const report = [];
  for (const [name, path] of PAGES) {
    for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
      const page = await browser.newPage({ viewport: vp });
      const errors = [];
      const failed = [];
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text().slice(0, 200));
      });
      page.on('requestfailed', (r) => failed.push(r.url().slice(0, 120)));
      page.on('response', (r) => {
        if (r.status() >= 400) failed.push(r.status() + ' ' + r.url().slice(0, 120));
      });
      const t0 = Date.now();
      let status = 'n/a';
      try {
        const resp = await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 30000 });
        status = resp ? resp.status() : 'n/a';
        await page.waitForTimeout(1500);
        // check horizontal overflow
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth
        );
        // check images without alt / broken
        const imgs = await page.evaluate(() =>
          Array.from(document.images).map((i) => ({
            src: i.currentSrc.slice(0, 80),
            w: i.naturalWidth,
            alt: i.alt,
          }))
        );
        const broken = imgs.filter((i) => i.w === 0);
        const noAlt = imgs.filter((i) => !i.alt);
        await page.screenshot({ path: `${OUT}/${name}-${vpName}.png`, fullPage: false });
        report.push({
          page: name,
          vp: vpName,
          status,
          ms: Date.now() - t0,
          overflowX: overflow,
          imgTotal: imgs.length,
          broken: broken.length,
          noAlt: noAlt.length,
          consoleErrors: errors.slice(0, 3),
          failedReqs: failed.slice(0, 5),
        });
      } catch (e) {
        report.push({ page: name, vp: vpName, status: 'ERROR', error: String(e).slice(0, 200) });
      }
      await page.close();
    }
  }
  await browser.close();
  fs.writeFileSync(OUT + '/report.json', JSON.stringify(report, null, 2));
  console.info(JSON.stringify(report, null, 2));
})();
