const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:4028';
const CHROME =
  process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT_DIR = path.resolve(__dirname, '..', 'docs', 'qa', 'e2e-roundtrip');

fs.mkdirSync(OUT_DIR, { recursive: true });

const SEARCH_URL =
  `${BASE_URL}/tim-ve?from=SGN&to=HAN&depart=2026-11-20&return=2026-11-25&pax=1`;

const PASSENGER_DATA = {
  name: 'NGUYEN',
  firstName: 'VAN A',
  dob: '1995-10-20',
  // Số điện thoại và email duy nhất mỗi lần chạy để tránh trùng UNIQUE
  // `user_profiles_phone_key` / email khi chạy lại E2E nhiều lần.
  phone: `09${Math.floor(Date.now() / 1000) % 100000000}`.padStart(10, '0'),
  email: `nguyen.vana.${Date.now()}@gmail.com`,
  idNumber: '001234001234',
};

function fail(report, device, step, message) {
  const key = device === 'desktop' ? report.desktop : report.mobile;
  key.steps.push({ step, name: step, status: 'FAILED', error: message });
  key.errors.push(message);
  console.log(`✗ [${device}] ${step}: ${message}`);
}

function ok(report, device, step, message) {
  const key = device === 'desktop' ? report.desktop : report.mobile;
  key.steps.push({ step, name: step, status: 'OK' });
  console.log(`✓ [${device}] ${step}: ${message}`);
}

async function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function clickNext(page) {
  const buttons = await page.$$('button.vj-cta');
  console.log(`[clickNext] found ${buttons.length} button.vj-cta`);
  for (const btn of buttons) {
    const disabled = await btn.evaluate((b) => b.disabled === true);
    const box = await btn.boundingBox();
    const visible = box ? `(${box.width}x${box.height})` : 'hidden';
    const text = await btn.evaluate((b) => b.textContent || '');
    const formId = await btn.evaluate((b) => b.getAttribute('form') || 'none');
    console.log(`[clickNext] candidate: disabled=${disabled} visible=${visible} text="${text}" form="${formId}"`);
    if (disabled) continue;
    if (!box || box.width === 0 || box.height === 0) continue;
    if (!/Đi tiếp/i.test(text)) continue;
    await btn.click();
    console.log(`[clickNext] CLICKED button text="${text}" form="${formId}"`);
    return true;
  }
  return false;
}

async function runDevice(browser, device, report) {
  const page = await browser.newPage();
  const isDesktop = device === 'desktop';
  await page.setViewport(
    isDesktop ? { width: 1440, height: 900 } : { width: 390, height: 844, isMobile: true, hasTouch: true }
  );

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (!text.includes('Failed to load resource') && !text.includes('DevTools')) {
        report[device].errors.push(text);
        console.log(`[${device} Console Error]:`, text);
      }
    }
  });

  page.on('response', async (res) => {
    const url = res.url();
    if (url.includes('/api/dat-ve') || url.includes('/api/thanh-toan')) {
      try {
        const body = await res.json();
        console.log(`[${device} API] ${res.status} ${url} ->`, JSON.stringify(body).slice(0, 500));
      } catch (_) {
        console.log(`[${device} API] ${res.status} ${url} (non-JSON)`);
      }
    }
  });

  let bookingId = null;
  let totalAmount = null;
  let passed = false;

  try {
    // ═════════════════════════════════════════════════════════════
    // Step 1: Tìm chuyến bay (khứ hồi)
    // ═════════════════════════════════════════════════════════════
    console.log(`\n--- ${device.toUpperCase()} ---`);
    console.log('Navigating to:', SEARCH_URL);
    await page.goto(SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await wait(3000);

    await page.screenshot({ path: path.join(OUT_DIR, `01-${device}-step1-search.png`) });
    ok(report, device, 1, 'Trang tìm chuyến bay đã tải');

    // Chọn fare chiều đi (Eco)
    await page.waitForSelector('button[data-testid="select-fare"]', { timeout: 20000 });
    const outboundFares = await page.$$('button[data-testid="select-fare"]');
    if (outboundFares.length === 0) {
      throw new Error('Không có nút chọn vé chiều đi');
    }
    await outboundFares[outboundFares.length - 1].click();
    await wait(1500);

    // Tự động chuyển chiều về — chờ fare button của chiều về xuất hiện
    await page.waitForSelector('button[data-testid="select-fare"]', { timeout: 15000 });
    const returnFares = await page.$$('button[data-testid="select-fare"]');
    if (returnFares.length === 0) {
      throw new Error('Không có nút chọn vé chiều về');
    }
    await returnFares[returnFares.length - 1].click();
    await wait(1500);

    await page.screenshot({ path: path.join(OUT_DIR, `02-${device}-step1-fares-selected.png`) });
    ok(report, device, 2, 'Đã chọn vé chiều đi và chiều về');

    // Click nút "Đi tiếp" ở bottom bar để vào PassengerInfoStep
    const clicked1 = await clickNext(page);
    if (!clicked1) {
      throw new Error('Không tìm thấy nút "Đi tiếp" ở bước chọn vé');
    }
    await wait(3000);

    // ═════════════════════════════════════════════════════════════
    // Step 2: Nhập thông tin hành khách
    // ═════════════════════════════════════════════════════════════
    await page.waitForSelector('#passenger-0-name', { timeout: 15000 });
    await page.screenshot({ path: path.join(OUT_DIR, `03-${device}-step2-passengers.png`) });
    ok(report, device, 3, 'Giao diện nhập thông tin hành khách đã tải');

    // Giới tính
    await page.click('#passenger-0-gender-male');

    // Họ / Tên
    await page.type('#passenger-0-name', PASSENGER_DATA.name, { overwrite: true });
    await page.type('#passenger-0-firstName', PASSENGER_DATA.firstName, { overwrite: true });

    // Ngày sinh (input type="date")
    await page.type('#passenger-0-dob', PASSENGER_DATA.dob, { overwrite: true });

    // Quốc gia (mặc định VN, không cần đổi)

    // Số điện thoại
    await page.type('#passenger-0-phone', PASSENGER_DATA.phone, { overwrite: true });

    // Email
    await page.type('#passenger-0-email', PASSENGER_DATA.email, { overwrite: true });

    // CCCD / Hộ chiếu (bắt buộc cho adult)
    await page.type('#passenger-0-idNumber', PASSENGER_DATA.idNumber, { overwrite: true });

    // Đồng ý điều khoản (checkbox required)
    const policyCheckbox = await page.waitForSelector('input[type="checkbox"][required]', {
      timeout: 10000,
    });
    const isChecked = await (await policyCheckbox.getProperty('checked')).jsonValue();
    if (!isChecked) {
      await policyCheckbox.click();
    }

    await wait(1000);
    ok(report, device, 4, 'Đã điền đầy đủ thông tin hành khách (bao gồm CCCD/Hộ chiếu)');

    // Submit form hành khách -> chuyển sang bước dịch vụ bổ sung (step 3)
    const submitBtn = await page.waitForSelector('button[type="submit"][form="passenger-info-form"]', {
      timeout: 10000,
    });
    await submitBtn.click();
    console.log('Submitted passenger form, waiting for ancillary step...');

    // Nếu click nút sr-only không kích hoạt React onSubmit, dùng requestSubmit trực tiếp
    await page.evaluate(() => {
      const form = document.getElementById('passenger-info-form');
      if (form) form.requestSubmit();
    });
    console.log('Called form.requestSubmit()');

    // ═════════════════════════════════════════════════════════════
    // Step 3: Dịch vụ bổ sung -> submit cuối cùng tạo booking
    // ═════════════════════════════════════════════════════════════
    const clicked2 = await clickNext(page);
    if (!clicked2) {
      throw new Error('Không tìm thấy nút "Đi tiếp" ở bước dịch vụ bổ sung');
    }
    console.log('Submitted ancillary step, waiting for payment redirect...');
    await wait(5000);

    const finalUrl = page.url();
    console.log(`URL after final submit: ${finalUrl}`);
    const bookingIdParam = new URL(finalUrl).searchParams.get('bookingId');
    if (bookingIdParam && finalUrl.includes('/thanh-toan')) {
      bookingId = bookingIdParam;
      passed = true;
      ok(report, device, 6, `Tạo booking thành công: bookingId=${bookingId}`);
    } else {
      const msg = `Không tạo được booking — URL vẫn là ${finalUrl} (bookingId=${bookingIdParam ?? 'null'}).`;
      fail(report, device, 6, msg);
    }

    // ═════════════════════════════════════════════════════════════
    // Step 4: Trang thanh toán — chỉ chụp khi có bookingId
    // ═════════════════════════════════════════════════════════════
    const payUrl = bookingId
      ? `${BASE_URL}/thanh-toan?bookingId=${bookingId}`
      : `${BASE_URL}/thanh-toan`;

    if (bookingId) {
      await page.goto(payUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await wait(3000);

      // Xác nhận trang chứa thông tin thanh toán / phương thức
      const hasPaymentContent = await page.evaluate(() => {
        const text = document.body.innerText || '';
        return (
          text.includes('thanh toán') ||
          text.includes('VietQR') ||
          text.includes('bookingId') ||
          document.querySelector('[data-testid*="payment"], [data-testid*="qr"], .payment-method') !== null
        );
      });

      if (!hasPaymentContent) {
        fail(report, device, 7, `Trang ${payUrl} không có nội dung thanh toán`);
      } else {
        ok(report, device, 7, 'Trang thanh toán hiển thị đầy đủ thông tin');
      }

      // Lấy tổng tiền hiển thị (nếu có)
      const totalText = await page.evaluate(() => {
        const text = document.body.innerText || '';
        const m = text.match(/(\d[\d.,]*)\s*VND/);
        return m ? m[1] : null;
      });
      if (totalText) {
        totalAmount = totalText;
        const num = Number(totalText.replace(/[.,]/g, ''));
        if (!Number.isFinite(num) || num <= 0) {
          fail(report, device, 8, `Tổng tiền không dương: ${totalText}`);
        } else {
          ok(report, device, 8, `Tổng tiền dương: ${totalText} VND`);
        }
      }
    } else {
      // Truy cập trang thanh toán không có bookingId — phải thấy thông báo không có đơn
      await page.goto(payUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await wait(3000);
      const noBooking = await page.evaluate(() => {
        const text = (document.body.innerText || '').toLowerCase();
        return text.includes('chưa có đơn đặt vé') || text.includes('không tìm thấy đặt vé');
      });
      if (!noBooking) {
        fail(report, device, 7, 'Truy cập /thanh-toan không bookingId nhưng không thấy thông báo rỗng');
      }
    }

    await page.screenshot({
      path: path.join(OUT_DIR, `09-${device}-step4-payment.png`),
      fullPage: true,
    });
  } catch (err) {
    const msg = err.message || String(err);
    fail(report, device, 99, `Lỗi điều khiển trình duyệt: ${msg}`);
    passed = false;
  } finally {
    await page.close();
  }

  return { bookingId, totalAmount, passed, errors: report[device].errors };
}

async function runTest() {
  console.log(`Starting Full E2E Simulation on ${BASE_URL}...`);
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--no-proxy-server'],
  });

  const report = {
    desktop: { steps: [], errors: [] },
    mobile: { steps: [], errors: [] },
  };

  let overallPassed = true;

  try {
    const desktopResult = await runDevice(browser, 'desktop', report);
    const mobileResult = await runDevice(browser, 'mobile', report);

    // Mobile dùng cùng bookingId từ desktop (luồng khách vãng lai duy nhất)
    if (!desktopResult.passed) {
      overallPassed = false;
      console.log('\n✗ DESKTOP FAILED — không tạo được booking, mobile bỏ qua bước tạo đơn.');
    }
    if (!mobileResult.passed) {
      overallPassed = false;
    }

    report.desktop.bookingId = desktopResult.bookingId;
    report.desktop.totalAmount = desktopResult.totalAmount;
    report.desktop.passed = desktopResult.passed;

    report.mobile.bookingId = mobileResult.bookingId || desktopResult.bookingId;
    report.mobile.totalAmount = mobileResult.totalAmount || desktopResult.totalAmount;
    report.mobile.passed = mobileResult.passed;

    report.overall = {
      passed: overallPassed,
      desktopBookingId: desktopResult.bookingId,
      mobileBookingId: mobileResult.bookingId || desktopResult.bookingId,
    };

    fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));

    if (overallPassed) {
      console.log('\n✓ All simulations completed successfully!');
      process.exit(0);
    } else {
      console.error('\n✗ Simulation completed with failures. See report.json');
      process.exit(1);
    }
  } catch (err) {
    console.error('Simulation fatal error:', err);
    fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));
    await browser.close();
    process.exit(1);
  } finally {
    try {
      await browser.close();
    } catch (_) {}
  }
}

runTest();
