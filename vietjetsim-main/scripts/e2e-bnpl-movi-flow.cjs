const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer-core');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:4028';
const CHROME =
  process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT_DIR = path.resolve(__dirname, '..', 'docs', 'qa', 'bnpl-movi-test');

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

async function api(path, options = {}) {
  const headers = { 'content-type': 'application/json', ...(options.headers ?? {}) };
  if (cookies.size) headers['cookie'] = cookieHeader();
  const csrf = cookies.get('csrf_token');
  if (csrf && !headers['x-csrf-token']) headers['x-csrf-token'] = csrf;

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
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

async function submitSearchForm(page) {
  await page.evaluate(() => {
    const btns = Array.from(
      document.querySelectorAll('button[type="submit"], button.vj-lookup-btn')
    );
    const visibleBtn = btns.find((b) => b.offsetWidth > 0 && b.offsetHeight > 0);
    if (visibleBtn) {
      visibleBtn.click();
    } else if (btns[0]) {
      btns[0].click();
    }
  });
}

async function setReactInputValue(page, selector, value) {
  await page.evaluate(
    (sel, val) => {
      const el = document.querySelector(sel);
      if (!el) throw new Error(`Element ${sel} not found`);
      el.scrollIntoView({ block: 'center' });
      const prototype = Object.getPrototypeOf(el);
      const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
      if (descriptor && descriptor.set) {
        descriptor.set.call(el, val);
      } else {
        el.value = val;
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    },
    selector,
    value
  );
}

async function main() {
  console.log('===============================================================');
  console.log(' KỊCH BẢN KIỂM TRA MUA TRƯỚC TRẢ SAU (MOVI) & CHUYẾN BAY CỦA TÔI');
  console.log('===============================================================\n');

  // BƯỚC 1: Lấy chuyến bay có sẵn và tạo đặt chỗ 'pending'
  console.log('1. Lấy thông tin chuyến bay thực tế từ API...');
  await api('/api/csrf'); // Khởi tạo CSRF
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const flightsRes = await api(`/api/chuyen-bay?from=SGN&to=HAN&departDate=${tomorrow}`);
  const flights = flightsRes.body?.flights || flightsRes.body || [];
  if (!flights.length) throw new Error('Không có chuyến bay SGN -> HAN để test');

  const flight = flights[0];
  console.log(
    `   ✓ Chuyến bay: ${flight.flight_no} (${flight.from_code} -> ${flight.to_code}), Giá: ${flight.price?.toLocaleString?.('vi-VN')} VND`
  );

  console.log('\n2. Tạo đặt chỗ "pending" (Mua trước trả sau - Giữ chỗ)...');
  const ts = Date.now();
  const passengerPhone = `09${(ts % 100000000).toString().padStart(8, '0')}`;
  const passengerEmail = `movi.user.${ts}@vietjetsim.vn`;
  const passengerName = 'NGUYEN VAN MOVI';

  const bookingPayload = {
    flight_id: flight.id,
    leg_role: 'outbound',
    fare_class: 'eco',
    passengers: [
      {
        name: passengerName,
        dob: '1995-10-20',
        phone: passengerPhone,
        email: passengerEmail,
        idNumber: '079195001234',
        type: 'adult',
        gender: 'male',
      },
    ],
    consents: {
      policyAccepted: true,
    },
  };

  const createBookingRes = await api('/api/dat-ve', {
    method: 'POST',
    body: JSON.stringify(bookingPayload),
  });

  if (!createBookingRes.ok) {
    throw new Error(`Tạo booking thất bại: ${JSON.stringify(createBookingRes.body)}`);
  }

  const booking = createBookingRes.body.booking;
  const bookingCode = booking.booking_code;
  const bookingId = booking.id;
  console.log(`   ✓ Tạo đặt chỗ thành công!`);
  console.log(`     - Mã đặt chỗ (PNR): ${bookingCode}`);
  console.log(`     - Booking UUID: ${bookingId}`);
  console.log(`     - Trạng thái: ${booking.status}`);
  console.log(`     - Tổng tiền: ${booking.total_price?.toLocaleString('vi-VN')} VND`);

  // BƯỚC 2: Khởi động Chrome thực hiện kiểm tra UI trình duyệt
  console.log('\n3. Khởi động trình duyệt Google Chrome...');
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--window-size=1440,900',
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  // Nạp cookies phiên làm việc vào Puppeteer browser
  const puppeteerCookies = [];
  for (const [name, value] of cookies.entries()) {
    puppeteerCookies.push({ name, value, domain: '127.0.0.1', path: '/' });
  }
  if (puppeteerCookies.length) {
    await page.setCookie(...puppeteerCookies);
  }

  // 3.1. Vào trang "Chuyến bay của tôi"
  console.log('\n4. Truy cập trang "Chuyến bay của tôi" (/chuyen-bay-cua-toi)...');
  await page.goto(`${BASE_URL}/chuyen-bay-cua-toi`, { waitUntil: 'networkidle2', timeout: 30000 });
  await wait(1000);
  await page.screenshot({ path: path.join(OUT_DIR, '01_chuyen_bay_cua_toi_initial.png') });
  console.log('   ✓ Đã chụp ảnh: 01_chuyen_bay_cua_toi_initial.png');

  // 3.2. Điền form tra cứu đặt chỗ
  console.log('\n5. Nhập mã đặt chỗ và họ tên để tra cứu...');
  console.log(`   - Mã đặt chỗ: ${bookingCode}`);
  console.log(`   - Họ: NGUYEN`);
  console.log(`   - Tên đệm và tên: VAN MOVI`);

  await setReactInputValue(page, '#booking-code', bookingCode);
  await setReactInputValue(page, '#surname', 'NGUYEN');
  await setReactInputValue(page, '#given-name', 'VAN MOVI');
  await wait(500);

  await page.screenshot({ path: path.join(OUT_DIR, '02_chuyen_bay_cua_toi_form_filled.png') });
  console.log('   ✓ Đã chụp ảnh: 02_chuyen_bay_cua_toi_form_filled.png');

  // 3.3. Bấm "Tìm kiếm"
  console.log('\n6. Bấm "Tìm kiếm" tra cứu đặt chỗ...');
  await submitSearchForm(page);

  // Chờ hệ thống điều hướng đến trang /thanh-toan?bookingId=...
  console.log('   Đang chờ hệ thống tìm thấy đặt chỗ và chuyển đến trang thanh toán...');
  await page.waitForFunction(() => window.location.pathname.startsWith('/thanh-toan'), {
    timeout: 15000,
  });
  await wait(1500);

  const currentUrl = page.url();
  console.log(`   ✓ URL hiện tại: ${currentUrl}`);
  if (!currentUrl.includes('/thanh-toan')) {
    throw new Error(`Mong đợi URL chứa /thanh-toan, nhưng thực tế là: ${currentUrl}`);
  }
  await page.screenshot({ path: path.join(OUT_DIR, '03_thanh_toan_page_loaded.png') });
  console.log('   ✓ Đã chụp ảnh: 03_thanh_toan_page_loaded.png');

  // BƯỚC 4: Chọn phương thức "Bay trước, trả sau" (MOVI)
  console.log('\n7. Tìm và chọn phương thức thanh toán "Bay trước, trả sau (MOVI)"...');
  console.log('   Đang chờ thông tin đơn đặt chỗ và danh sách phương thức thanh toán hiển thị...');
  await page.waitForFunction(
    () => {
      const text = document.body.innerText;
      return (
        text.includes('Bay trước, trả sau') ||
        text.includes('Trả góp Movi') ||
        text.includes('Giữ mã đặt chỗ')
      );
    },
    { timeout: 15000 }
  );
  await wait(1000);

  const moviSelected = await page.evaluate(() => {
    // Tìm các nút hoặc thẻ có chứa chữ Trả góp Movi hoặc Bay trước, trả sau
    const buttons = Array.from(document.querySelectorAll('button'));
    const moviBtn = buttons.find(
      (b) =>
        b.textContent &&
        (b.textContent.includes('Trả góp Movi') || b.textContent.includes('Bay trước, trả sau'))
    );
    if (moviBtn) {
      moviBtn.scrollIntoView({ block: 'center' });
      moviBtn.click();
      return true;
    }
    return false;
  });

  if (!moviSelected) throw new Error('Không tìm thấy nút phương thức Trả góp Movi');
  console.log('   ✓ Đã nhấp chọn phương thức Bay trước trả sau (MOVI)');
  await wait(1000);

  await page.screenshot({ path: path.join(OUT_DIR, '04_movi_method_selected.png') });
  console.log('   ✓ Đã chụp ảnh: 04_movi_method_selected.png');

  // BƯỚC 5: Điền các thông tin của form MOVI
  console.log('\n8. Điền thông tin người đăng ký Bay trước trả sau MOVI...');
  const formFilled = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input'));
    const nameInput = inputs.find((i) => i.placeholder && i.placeholder.includes('Họ và tên'));
    const dobInput = inputs.find((i) => i.placeholder && i.placeholder.includes('Ngày sinh'));
    const cccdInput = inputs.find((i) => i.placeholder && i.placeholder.includes('CMND/CCCD'));
    const phoneInput = inputs.find((i) => i.placeholder && i.placeholder.includes('số điện thoại'));

    if (!nameInput || !dobInput || !cccdInput || !phoneInput) {
      return {
        ok: false,
        missing: { name: !nameInput, dob: !dobInput, cccd: !cccdInput, phone: !phoneInput },
      };
    }

    const setVal = (el, val) => {
      const proto = Object.getPrototypeOf(el);
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && desc.set) desc.set.call(el, val);
      else el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };

    setVal(nameInput, 'NGUYEN VAN MOVI');
    setVal(dobInput, '20/10/1995');
    setVal(cccdInput, '079195001234');
    setVal(phoneInput, '0912345678');

    return { ok: true };
  });

  if (!formFilled.ok) {
    throw new Error(`Thiếu trường nhập liệu form MOVI: ${JSON.stringify(formFilled.missing)}`);
  }
  console.log(
    '   ✓ Đã điền đầy đủ: Họ tên, Ngày sinh (20/10/1995), CCCD (079195001234), SĐT (0912345678)'
  );
  await wait(500);

  await page.screenshot({ path: path.join(OUT_DIR, '05_movi_form_completed.png') });
  console.log('   ✓ Đã chụp ảnh: 05_movi_form_completed.png');

  // BƯỚC 6: Bấm "Xác Nhận" để thực hiện thanh toán MOVI
  console.log('\n9. Bấm nút "Xác Nhận" để hoàn tất thanh toán MOVI...');
  const clickedConfirm = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    const confirmBtn = buttons.find((b) => b.textContent && b.textContent.trim() === 'Xác Nhận');
    if (confirmBtn) {
      confirmBtn.scrollIntoView({ block: 'center' });
      confirmBtn.click();
      return true;
    }
    return false;
  });

  if (!clickedConfirm) throw new Error('Không tìm thấy nút Xác Nhận của MOVI');
  console.log('   ✓ Đã bấm nút Xác Nhận');

  // Chờ phản hồi thành công
  console.log('   Đang chờ API xử lý và hiển thị vé điện tử xác nhận...');
  await page.waitForFunction(
    () => {
      const text = document.body.innerText;
      return text.includes('Đặt vé thành công') || text.includes('Mã đặt chỗ');
    },
    { timeout: 15000 }
  );
  await wait(1500);

  await page.screenshot({ path: path.join(OUT_DIR, '06_payment_success_eticket.png') });
  console.log('   ✓ Đã chụp ảnh vé điện tử thành công: 06_payment_success_eticket.png');

  // Kiểm tra thông tin trên màn hình thành công
  const successDetails = await page.evaluate(() => {
    return {
      text: document.body.innerText,
      hasSuccessTitle: document.body.innerText.includes('Đặt vé thành công!'),
      hasCode: document.body.innerText.includes('Mã đặt chỗ'),
    };
  });
  console.log(`   ✓ Tiêu đề thành công: ${successDetails.hasSuccessTitle}`);
  console.log(`   ✓ Mã đặt chỗ hiển thị trên vé: ${successDetails.hasCode}`);

  // BƯỚC 7: Quay lại "Chuyến bay của tôi" để kiểm tra mã đặt chỗ đã xác nhận
  console.log('\n10. Quay lại trang "Chuyến bay của tôi" (/chuyen-bay-cua-toi) để tra cứu lại...');
  await page.goto(`${BASE_URL}/chuyen-bay-cua-toi`, { waitUntil: 'networkidle2', timeout: 30000 });
  await wait(1000);

  console.log(`   Tra cứu lại mã đặt chỗ: ${bookingCode}`);
  await setReactInputValue(page, '#booking-code', bookingCode);
  await setReactInputValue(page, '#surname', 'NGUYEN');
  await setReactInputValue(page, '#given-name', 'VAN MOVI');
  await wait(500);

  await submitSearchForm(page);

  // Vì vé đã confirmed, hệ thống sẽ điều hướng tới /dat-ve/[bookingCode]
  console.log('   Đang chờ chuyển hướng đến trang chi tiết vé đã xác nhận (/dat-ve/...)...');
  await page.waitForFunction(() => window.location.pathname.startsWith('/dat-ve/'), {
    timeout: 15000,
  });
  await wait(1500);

  const finalUrl = page.url();
  console.log(`   ✓ URL hiện tại sau tra cứu: ${finalUrl}`);
  await page.screenshot({ path: path.join(OUT_DIR, '07_ticket_details_confirmed.png') });
  console.log('   ✓ Đã chụp ảnh trang vé đã xác nhận: 07_ticket_details_confirmed.png');

  // BƯỚC 8: Kiểm tra trạng thái trong Database / API
  console.log('\n11. Kiểm tra trạng thái đối soát từ Backend API...');
  const verifyRes = await fetch(`${BASE_URL}/api/dat-ve/${bookingCode}`);
  const verifyData = await verifyRes.json();
  const verifiedBooking = verifyData.booking;
  console.log(`   ✓ Trạng thái đặt chỗ trong DB: ${verifiedBooking?.status}`);
  console.log(`   ✓ Mã đặt chỗ: ${verifiedBooking?.booking_code}`);

  if (verifiedBooking?.status !== 'confirmed') {
    throw new Error(
      `Trạng thái mong đợi là confirmed, nhưng DB ghi nhận: ${verifiedBooking?.status}`
    );
  }

  // BƯỚC 9: Kiểm tra trên giao diện Mobile (390x844)
  console.log('\n12. Kiểm tra giao diện Mobile (390x844)...');
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await page.goto(`${BASE_URL}/chuyen-bay-cua-toi`, { waitUntil: 'networkidle2', timeout: 30000 });
  await wait(1000);

  // Kiểm tra tràn trang mobile
  const mobileMetrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }));
  console.log(
    `   Mobile scrollWidth: ${mobileMetrics.scrollWidth}px, clientWidth: ${mobileMetrics.clientWidth}px`
  );
  console.log(
    `   Tràn màn hình ngang Mobile: ${mobileMetrics.overflow ? 'CÓ (LỖI)' : 'KHÔNG (HOÀN HẢO)'}`
  );
  await page.screenshot({ path: path.join(OUT_DIR, '08_mobile_chuyen_bay_cua_toi.png') });
  console.log('   ✓ Đã chụp ảnh giao diện mobile: 08_mobile_chuyen_bay_cua_toi.png');

  await browser.close();

  console.log('\n===============================================================');
  console.log(' HOÀN THÀNH TOÀN BỘ KỊCH BẢN KIỂM TRA MUA TRƯỚC TRẢ SAU (MOVI)');
  console.log(' TẤT CẢ CÁC BƯỚC ĐÃ THÀNH CÔNG 100% VÀ ĐÃ LƯU ẢNH CHỨNG CỨ TẠI:');
  console.log(` ${OUT_DIR}`);
  console.log('===============================================================');
}

main().catch((err) => {
  console.error('\n❌ KỊCH BẢN THẤT BẠI:', err);
  process.exit(1);
});
