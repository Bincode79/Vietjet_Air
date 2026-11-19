const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:4028';
const CHROME =
  process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT_DIR = path.resolve(__dirname, '..', 'docs', 'qa', 'payment-ui-audit');

fs.mkdirSync(OUT_DIR, { recursive: true });

const cookies = new Map();

function cookieHeader() {
  return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

function storeCookies(res) {
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0) cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}

async function api(apiPath, options = {}) {
  const headers = { 'content-type': 'application/json', ...(options.headers ?? {}) };
  if (cookies.size) headers['cookie'] = cookieHeader();
  const csrf = cookies.get('csrf_token');
  if (csrf && !headers['x-csrf-token']) headers['x-csrf-token'] = csrf;

  const res = await fetch(`${BASE_URL}${apiPath}`, { ...options, headers });
  storeCookies(res);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body, ok: res.ok };
}

async function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForPaymentLoaded(page) {
  // Chờ đến khi skeleton biến mất và giao diện thanh toán xuất hiện
  await page.waitForFunction(
    () => {
      const text = document.body.innerText;
      return (
        !text.includes('Đang tải thông tin đặt chỗ') &&
        (text.includes('PHƯƠNG THỨC THANH TOÁN') || text.includes('Phương thức thanh toán'))
      );
    },
    { timeout: 15000 }
  );
  await wait(500);
}

async function setInputValue(page, selector, value) {
  await page.evaluate(
    (sel, val) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      el.focus();
      const prototype = Object.getPrototypeOf(el);
      const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
      if (descriptor && descriptor.set) {
        descriptor.set.call(el, val);
      } else {
        el.value = val;
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    },
    selector,
    value
  );
}

async function main() {
  console.log('===============================================================');
  console.log(' KIỂM TRA TOÀN DIỆN GIAO DIỆN THANH TOÁN (/thanh-toan)');
  console.log('===============================================================\n');

  // 1. Tạo CSRF và booking mới
  console.log('1. Khởi tạo CSRF & tìm chuyến bay...');
  await api('/api/csrf');
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const flightsRes = await api(`/api/chuyen-bay?from=SGN&to=HAN&departDate=${tomorrow}`);
  const flights = flightsRes.body?.flights || flightsRes.body || [];
  if (!flights.length) throw new Error('Không có chuyến bay SGN -> HAN để test');

  const flight = flights[0];
  console.log(`   ✓ Chuyến bay: ${flight.flight_no} (${flight.from_code} -> ${flight.to_code})`);

  console.log('\n2. Tạo đơn đặt vé mới (pending) để kiểm tra thanh toán...');
  const ts = Date.now();
  const passengerPhone = `09${(ts % 100000000).toString().padStart(8, '0')}`;
  const passengerEmail = `payment.audit.${ts}@vietjetsim.vn`;
  const passengerName = 'NGUYEN VAN KIEM TRA';

  const bookingPayload = {
    flight_id: flight.id,
    leg_role: 'outbound',
    fare_class: 'eco',
    passengers: [
      {
        name: passengerName,
        dob: '1992-05-15',
        phone: passengerPhone,
        email: passengerEmail,
        idNumber: '079192004567',
        type: 'adult',
        gender: 'male',
      },
    ],
    consents: {
      policyAccepted: true,
    },
  };

  const createRes = await api('/api/dat-ve', {
    method: 'POST',
    body: JSON.stringify(bookingPayload),
  });

  if (!createRes.ok) {
    throw new Error(`Tạo booking thất bại: ${JSON.stringify(createRes.body)}`);
  }

  const booking = createRes.body.booking;
  const bookingId = booking.id;
  const bookingCode = booking.booking_code;
  console.log(`   ✓ Tạo booking thành công!`);
  console.log(`     - PNR: ${bookingCode}`);
  console.log(`     - ID: ${bookingId}`);
  console.log(`     - Tổng tiền: ${booking.total_price?.toLocaleString('vi-VN')} VND`);

  // 2. Khởi động Browser
  console.log('\n3. Khởi động Chrome...');
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--window-size=1280,900',
    ],
  });

  const auditResults = [];

  try {
    // DESKTOP TESTING (1280x800)
    console.log('\n4. Kiểm tra giao diện Desktop (1280x800)...');
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    const puppeteerCookies = [];
    for (const [name, value] of cookies.entries()) {
      puppeteerCookies.push({ name, value, domain: '127.0.0.1', path: '/' });
    }
    if (puppeteerCookies.length) {
      await page.setCookie(...puppeteerCookies);
    }

    const paymentUrl = `${BASE_URL}/thanh-toan?bookingId=${bookingCode}`;
    console.log(`   Đang tải URL: ${paymentUrl}`);
    await page.goto(paymentUrl, { waitUntil: 'domcontentloaded' });
    await waitForPaymentLoaded(page);

    // Kiểm tra tràn trang Desktop
    const deskOverflow = await page.evaluate(() => {
      return {
        bodyScrollWidth: document.body.scrollWidth,
        windowWidth: window.innerWidth,
        hasOverflow: document.body.scrollWidth > window.innerWidth,
      };
    });
    console.log(
      `   Desktop Overflow check: ${deskOverflow.hasOverflow ? 'LỖI TRÀN' : 'HOÀN HẢO (0px overflow)'} (${deskOverflow.bodyScrollWidth}px / ${deskOverflow.windowWidth}px)`
    );

    // 4.1 Quét mã VNPAY-QR (Mặc định)
    await page.screenshot({
      path: path.join(OUT_DIR, '01-desktop-default-vnpay-qr.png'),
      fullPage: true,
    });
    auditResults.push({
      step: 'Desktop Default VNPAY-QR',
      status: 'OK',
      screenshot: '01-desktop-default-vnpay-qr.png',
    });
    console.log('   ✓ Đã chụp ảnh 01-desktop-default-vnpay-qr.png');

    // 4.2 Chuyển tab Mobile Banking VietQR
    console.log('   Kiểm tra tab: Mobile Banking VietQR...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const btn = btns.find((b) => b.innerText.includes('Mobile Banking VietQR'));
      if (btn) btn.click();
    });
    await wait(600);
    await page.screenshot({ path: path.join(OUT_DIR, '02-desktop-vietqr.png'), fullPage: true });
    auditResults.push({
      step: 'Desktop VietQR',
      status: 'OK',
      screenshot: '02-desktop-vietqr.png',
    });
    console.log('   ✓ Đã chụp ảnh 02-desktop-vietqr.png');

    // 4.3 Chuyển tab Thẻ ATM nội địa (Napas)
    console.log('   Kiểm tra tab: Thẻ ATM nội địa (Napas)...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const btn = btns.find((b) => b.innerText.includes('Thẻ ATM nội địa'));
      if (btn) btn.click();
    });
    await wait(600);
    await page.screenshot({ path: path.join(OUT_DIR, '03-desktop-napas.png'), fullPage: true });
    auditResults.push({
      step: 'Desktop Napas ATM',
      status: 'OK',
      screenshot: '03-desktop-napas.png',
    });
    console.log('   ✓ Đã chụp ảnh 03-desktop-napas.png');

    // 4.4 Chuyển tab Thẻ tín dụng / ghi nợ quốc tế
    console.log('   Kiểm tra tab: Thẻ tín dụng / ghi nợ quốc tế...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const btn = btns.find((b) => b.innerText.includes('Thẻ tín dụng / ghi nợ quốc tế'));
      if (btn) btn.click();
    });
    await wait(600);

    // Điền thẻ ảo và kiểm tra hiệu ứng lật thẻ
    await setInputValue(page, '#cardNumber', '4111 2222 3333 4444');
    await setInputValue(page, '#cardName', 'NGUYEN VAN KIEM TRA');
    await setInputValue(page, '#cardExpiry', '12/28');
    await setInputValue(page, '#cardCvv', '888');
    await page.evaluate(() => {
      document.querySelector('#cardCvv')?.focus();
    });
    await wait(600);
    await page.screenshot({
      path: path.join(OUT_DIR, '04-desktop-credit-card.png'),
      fullPage: true,
    });
    auditResults.push({
      step: 'Desktop Credit Card (Interactive)',
      status: 'OK',
      screenshot: '04-desktop-credit-card.png',
    });
    console.log('   ✓ Đã chụp ảnh 04-desktop-credit-card.png');

    // 4.5 Chuyển tab Ví SkyJoy
    console.log('   Kiểm tra tab: Ví SkyJoy...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const btn = btns.find((b) => b.innerText.includes('Ví SkyJoy'));
      if (btn) btn.click();
    });
    await wait(600);
    await page.screenshot({ path: path.join(OUT_DIR, '05-desktop-skyjoy.png'), fullPage: true });
    auditResults.push({
      step: 'Desktop SkyJoy',
      status: 'OK',
      screenshot: '05-desktop-skyjoy.png',
    });
    console.log('   ✓ Đã chụp ảnh 05-desktop-skyjoy.png');

    // 4.6 Chuyển tab Ví MoMo
    console.log('   Kiểm tra tab: Ví MoMo...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const btn = btns.find((b) => b.innerText.includes('Ví MoMo'));
      if (btn) btn.click();
    });
    await wait(600);
    await page.screenshot({ path: path.join(OUT_DIR, '06-desktop-momo.png'), fullPage: true });
    auditResults.push({ step: 'Desktop MoMo', status: 'OK', screenshot: '06-desktop-momo.png' });
    console.log('   ✓ Đã chụp ảnh 06-desktop-momo.png');

    // 4.7 Chuyển tab Ví ZaloPay
    console.log('   Kiểm tra tab: Ví ZaloPay...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const btn = btns.find((b) => b.innerText.includes('Ví ZaloPay'));
      if (btn) btn.click();
    });
    await wait(600);
    await page.screenshot({ path: path.join(OUT_DIR, '07-desktop-zalopay.png'), fullPage: true });
    auditResults.push({
      step: 'Desktop ZaloPay',
      status: 'OK',
      screenshot: '07-desktop-zalopay.png',
    });
    console.log('   ✓ Đã chụp ảnh 07-desktop-zalopay.png');

    // 4.8 Chuyển tab Mua trước trả sau Trả góp MOVI
    console.log('   Kiểm tra tab: Trả góp Movi (Bay trước, trả sau)...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const btn = btns.find(
        (b) => b.innerText.includes('Trả góp Movi') || b.innerText.includes('Bay trước, trả sau')
      );
      if (btn) btn.click();
    });
    await wait(600);
    await page.screenshot({ path: path.join(OUT_DIR, '08-desktop-movi.png'), fullPage: true });
    auditResults.push({
      step: 'Desktop MOVI BNPL',
      status: 'OK',
      screenshot: '08-desktop-movi.png',
    });
    console.log('   ✓ Đã chụp ảnh 08-desktop-movi.png');

    // MOBILE TESTING (390x844)
    console.log('\n5. Kiểm tra giao diện Mobile (390x844)...');
    const mobilePage = await browser.newPage();
    await mobilePage.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    if (puppeteerCookies.length) {
      await mobilePage.setCookie(...puppeteerCookies);
    }

    await mobilePage.goto(paymentUrl, { waitUntil: 'domcontentloaded' });
    await waitForPaymentLoaded(mobilePage);

    // Kiểm tra tràn viền mobile
    const mobOverflow = await mobilePage.evaluate(() => {
      return {
        bodyScrollWidth: document.body.scrollWidth,
        windowWidth: window.innerWidth,
        hasOverflow: document.body.scrollWidth > window.innerWidth,
        overflowDelta: document.body.scrollWidth - window.innerWidth,
      };
    });
    console.log(
      `   Mobile Overflow check: ${mobOverflow.hasOverflow ? `LỖI TRÀN +${mobOverflow.overflowDelta}px` : 'HOÀN HẢO (0px overflow)'} (${mobOverflow.bodyScrollWidth}px / ${mobOverflow.windowWidth}px)`
    );

    // 5.1 Mobile Default (VNPAY-QR)
    await mobilePage.screenshot({
      path: path.join(OUT_DIR, '09-mobile-vnpay-qr.png'),
      fullPage: true,
    });
    auditResults.push({
      step: 'Mobile Default VNPAY-QR',
      status: 'OK',
      screenshot: '09-mobile-vnpay-qr.png',
    });
    console.log('   ✓ Đã chụp ảnh 09-mobile-vnpay-qr.png');

    // 5.2 Mobile Credit Card
    console.log('   Mobile: Chuyển tab Thẻ tín dụng...');
    await mobilePage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const btn = btns.find((b) => b.innerText.includes('Thẻ tín dụng / ghi nợ quốc tế'));
      if (btn) btn.click();
    });
    await wait(600);
    await mobilePage.screenshot({
      path: path.join(OUT_DIR, '10-mobile-credit-card.png'),
      fullPage: true,
    });
    auditResults.push({
      step: 'Mobile Credit Card',
      status: 'OK',
      screenshot: '10-mobile-credit-card.png',
    });
    console.log('   ✓ Đã chụp ảnh 10-mobile-credit-card.png');

    // 5.3 Mobile MOVI
    console.log('   Mobile: Chuyển tab MOVI...');
    await mobilePage.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const btn = btns.find(
        (b) => b.innerText.includes('Trả góp Movi') || b.innerText.includes('Bay trước, trả sau')
      );
      if (btn) btn.click();
    });
    await wait(600);
    await mobilePage.screenshot({ path: path.join(OUT_DIR, '11-mobile-movi.png'), fullPage: true });
    auditResults.push({ step: 'Mobile MOVI', status: 'OK', screenshot: '11-mobile-movi.png' });
    console.log('   ✓ Đã chụp ảnh 11-mobile-movi.png');

    // 6. Kiểm tra các cổng thanh toán chuyên dụng Gateway (/thanh-toan/gateway/[method])
    console.log('\n6. Kiểm tra các trang Gateway thanh toán toàn màn hình...');
    const gateways = [
      { method: 'qr', label: 'Cổng Quét mã QR', file: '12-gateway-qr.png' },
      { method: 'card', label: 'Cổng Thẻ Quốc Tế', file: '13-gateway-card.png' },
      { method: 'napas', label: 'Cổng Napas ATM', file: '14-gateway-napas.png' },
      { method: 'ewallet', label: 'Cổng Ví điện tử', file: '15-gateway-ewallet.png' },
      { method: 'movi', label: 'Cổng Movi BNPL', file: '16-gateway-movi.png' },
    ];

    for (const gw of gateways) {
      const gwUrl = `${BASE_URL}/thanh-toan/gateway/${gw.method}?bookingId=${bookingCode}`;
      console.log(`   Đang tải ${gw.label}: ${gwUrl}`);
      await page.goto(gwUrl, { waitUntil: 'networkidle2' });
      await wait(1200);
      await page.screenshot({ path: path.join(OUT_DIR, gw.file), fullPage: true });
      auditResults.push({ step: `Gateway: ${gw.label}`, status: 'OK', screenshot: gw.file });
      console.log(`   ✓ Đã kiểm tra ${gw.label}: ${gw.file}`);
    }

    console.log('\n===============================================================');
    console.log(' KẾT QUẢ KIỂM TRA GIAO DIỆN THANH TOÁN HOÀN TẤT');
    console.log('===============================================================');
    console.table(auditResults);

    fs.writeFileSync(
      path.join(OUT_DIR, 'audit-summary.json'),
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          booking: { id: bookingId, code: bookingCode, total: booking.total_price },
          desktopOverflow: deskOverflow,
          mobileOverflow: mobOverflow,
          results: auditResults,
        },
        null,
        2
      )
    );
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('Lỗi khi chạy kiểm tra giao diện thanh toán:', err);
  process.exit(1);
});
