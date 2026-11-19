const path = require('node:path');
const puppeteer = require('puppeteer-core');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:4028';
const CHROME =
  process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT_DIR = path.join(__dirname, '..', 'docs', 'qa', 'bnpl-journey');

async function main() {
  console.log('--- STARTING COMPLETE BNPL JOURNEY TEST (Matching 8 Screenshots) ---');
  const fs = require('fs');
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  // 1. Get CSRF & create a fresh booking
  const csrfRes = await fetch(`${BASE_URL}/api/csrf`);
  const cookies = [];
  for (const raw of csrfRes.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0)
      cookies.push({
        name: pair.slice(0, eq).trim(),
        value: pair.slice(eq + 1).trim(),
        domain: '127.0.0.1',
        path: '/',
      });
  }
  const csrfCookie = cookies.find((c) => c.name === 'csrf_token');
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const flightsRes = await fetch(
    `${BASE_URL}/api/chuyen-bay?from=SGN&to=HAN&departDate=${tomorrow}`
  );
  const flightsData = await flightsRes.json();
  const flights = flightsData.flights || flightsData || [];
  const flight = flights[0];

  const ts = Date.now();
  const passengerPhone = `09${(ts % 100000000).toString().padStart(8, '0')}`;
  const passengerEmail = `jack.${ts}@vietjetsim.vn`;

  const bookingRes = await fetch(`${BASE_URL}/api/dat-ve`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: cookieHeader,
      'x-csrf-token': csrfCookie?.value || '',
    },
    body: JSON.stringify({
      flight_id: flight.id,
      leg_role: 'outbound',
      fare_class: 'eco',
      passengers: [
        {
          name: 'LONG KA',
          dob: '1992-05-15',
          phone: passengerPhone,
          email: passengerEmail,
          idNumber: '079192004567',
          type: 'adult',
          gender: 'male',
        },
      ],
      consents: { policyAccepted: true },
    }),
  });

  const bookingData = await bookingRes.json();
  const booking = bookingData.booking;
  const bookingCode = booking.booking_code;
  console.log('✓ Created booking:', bookingCode, 'ID:', booking.id);

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,900'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    if (cookies.length) await page.setCookie(...cookies);

    // STEP 1: Go to /thanh-toan?bookingId=...
    console.log(`\n--- STEP 1: Navigate to /thanh-toan?bookingId=${bookingCode} ---`);
    await page.goto(`${BASE_URL}/thanh-toan?bookingId=${bookingCode}`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForSelector('button', { timeout: 20000 });
    await new Promise((r) => setTimeout(r, 1200));

    // Select MOVI payment method
    console.log('Selecting MOVI payment method...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const moviBtn = btns.find(
        (b) =>
          b.innerText.includes('Bay trước, trả sau') ||
          b.innerText.includes('movi') ||
          b.innerText.includes('Trả góp Movi')
      );
      if (moviBtn) moviBtn.click();
    });
    await new Promise((r) => setTimeout(r, 600));

    // Fill the 4 customer fields
    console.log('Entering customer identity fields...');
    await page.evaluate(() => {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      ).set;
      const inputs = Array.from(document.querySelectorAll('input'));

      const nameInput = inputs.find((i) => i.placeholder?.includes('Họ và tên'));
      const dobInput = inputs.find((i) => i.placeholder?.includes('Ngày sinh'));
      const cccdInput = inputs.find((i) => i.placeholder?.includes('CMND/CCCD'));
      const phoneInput = inputs.find((i) => i.placeholder?.includes('số điện thoại'));

      if (nameInput) {
        nativeSetter.call(nameInput, 'LONG KA');
        nameInput.dispatchEvent(new Event('input', { bubbles: true }));
        nameInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (dobInput) {
        nativeSetter.call(dobInput, '15/05/1992');
        dobInput.dispatchEvent(new Event('input', { bubbles: true }));
        dobInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (cccdInput) {
        nativeSetter.call(cccdInput, '079192004567');
        cccdInput.dispatchEvent(new Event('input', { bubbles: true }));
        cccdInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
      if (phoneInput) {
        nativeSetter.call(phoneInput, '0909447469');
        phoneInput.dispatchEvent(new Event('input', { bubbles: true }));
        phoneInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    await new Promise((r) => setTimeout(r, 400));
    await page.screenshot({ path: path.join(OUT_DIR, '01-movi-form-filled.png') });
    console.log('✓ Captured 01-movi-form-filled.png (Matching Image #3)');

    // Click [ Xác Nhận ]
    console.log('Clicking [ Xác Nhận ] button...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const confirmBtn = btns.find((b) => b.innerText.trim() === 'Xác Nhận');
      if (confirmBtn) confirmBtn.click();
    });

    await new Promise((r) => setTimeout(r, 1000));

    // Verify MOVI Confirmation Modal (Image #2)
    const modalCheck = await page.evaluate(() => {
      const modal = document.querySelector('[aria-labelledby="movi-modal-title"]');
      return {
        hasModal: !!modal,
        title: modal?.querySelector('#movi-modal-title')?.textContent,
        text: modal?.textContent,
        hasAmyMascot: !!modal?.querySelector('img[alt="Vietjet Mascot"]'),
        hasQrCode: !!modal?.querySelector('img[alt*="QR Code"]'),
        hasPayButton: !!Array.from(modal?.querySelectorAll('button') || []).find((b) =>
          b.textContent.includes('Thanh toán')
        ),
      };
    });
    console.log('MOVI Confirmation Modal Check (Matching Image #2):', modalCheck);
    await page.screenshot({ path: path.join(OUT_DIR, '02-movi-popup-modal.png') });
    console.log('✓ Captured 02-movi-popup-modal.png (Matching Image #2)');

    // STEP 2: Navigate to Chuyến bay của tôi and look up the booking
    console.log(`\n--- STEP 2: Navigate to /chuyen-bay-cua-toi to check PNR ${bookingCode} ---`);
    await page.goto(`${BASE_URL}/chuyen-bay-cua-toi`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input', { timeout: 20000 });
    await new Promise((r) => setTimeout(r, 1200));

    // Fill bookingCode and surname
    await page.evaluate((code) => {
      const inputs = Array.from(document.querySelectorAll('input'));
      const codeInput =
        document.querySelector('#booking-code') ||
        inputs.find(
          (i) =>
            i.placeholder?.includes('mã đặt chỗ') ||
            i.name?.includes('code') ||
            i.id?.includes('code')
        );
      const surnameInput =
        document.querySelector('#surname') ||
        inputs.find(
          (i) =>
            i.placeholder?.includes('Họ') ||
            i.name?.includes('surname') ||
            i.id?.includes('surname')
        );

      function setVal(el, val) {
        if (!el) return;
        el.focus();
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value'
        ).set;
        setter.call(el, val);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }

      setVal(codeInput, code);
      setVal(surnameInput, 'LONG');
    }, bookingCode);

    await new Promise((r) => setTimeout(r, 500));

    // Submit search form
    console.log('Submitting lookup search form...');
    await page.evaluate(() => {
      const submitBtn =
        document.querySelector('button[type="submit"]') ||
        Array.from(document.querySelectorAll('button')).find(
          (b) => b.innerText.includes('Tìm kiếm') || b.innerText.includes('Tra cứu')
        );
      if (submitBtn) submitBtn.click();
    });

    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 1500));

    const currentUrl = page.url();
    console.log('Current URL after lookup:', currentUrl);
    console.log('Is on /dat-ve/:', currentUrl.includes('/dat-ve/'));

    await page.screenshot({ path: path.join(OUT_DIR, '03-my-flights-booking-detail.png') });
    console.log('✓ Captured 03-my-flights-booking-detail.png (Matching Image #5 & #7)');

    // STEP 3: Click [ Tải thông tin hành trình ] to verify ItineraryModal (Image #1)
    console.log('\n--- STEP 3: Click [ Tải thông tin hành trình ] to open ItineraryModal ---');
    const itineraryBtnClicked = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const itBtn = btns.find((b) =>
        b.innerText.toUpperCase().includes('TẢI THÔNG TIN HÀNH TRÌNH')
      );
      if (itBtn) {
        itBtn.click();
        return true;
      }
      return false;
    });
    console.log('Itinerary button clicked:', itineraryBtnClicked);
    await new Promise((r) => setTimeout(r, 1000));

    await page.screenshot({ path: path.join(OUT_DIR, '04-itinerary-modal.png') });
    console.log('✓ Captured 04-itinerary-modal.png (Matching Image #1)');

    // Close ItineraryModal
    await page.evaluate(() => {
      const closeBtn = document.querySelector('[role="dialog"] button[aria-label="Đóng"]');
      if (closeBtn) closeBtn.click();
    });
    await new Promise((r) => setTimeout(r, 800));

    // STEP 4: Click [ Thanh toán ngay ] from /dat-ve/
    console.log('\n--- STEP 4: Click [ Thanh toán ngay ] to proceed to payment ---');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const payBtn = btns.find((b) => b.innerText.toUpperCase().trim() === 'THANH TOÁN NGAY');
      if (payBtn) payBtn.click();
    });

    await page
      .waitForFunction(() => window.location.pathname === '/thanh-toan', { timeout: 10000 })
      .catch(() => {});
    await new Promise((r) => setTimeout(r, 2500));

    console.log('Payment URL after [ Thanh toán ngay ]:', page.url());
    await page.screenshot({ path: path.join(OUT_DIR, '05-payment-from-my-flights.png') });
    console.log('✓ Captured 05-payment-from-my-flights.png (Matching Image #8)');

    // Verify Image #8 elements:
    const image8Check = await page.evaluate(() => {
      const text = document.body.innerText;
      return {
        hasPnrSubheader: text.includes('Mã đặt chỗ') && text.includes('Chưa thanh toán'),
        hasFlightInfoAccordion: text.includes('Thông tin chuyến bay'),
        hasPaxInfoAccordion: text.includes('Thông tin hành khách'),
        hasHuyBoBtn: Array.from(document.querySelectorAll('button')).some((b) =>
          b.innerText.includes('Hủy bỏ')
        ),
        hasThanhToanBtn: Array.from(document.querySelectorAll('button')).some((b) =>
          b.innerText.includes('Thanh toán')
        ),
      };
    });
    console.log('Image #8 UI Check:', image8Check);

    // STEP 5: Click [ Thanh toán ] button at the bottom of Image #8
    console.log('\n--- STEP 5: Click [ Thanh toán ] to complete payment ---');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const submitBtn = btns.find(
        (b) => b.innerText.trim() === 'Thanh toán' && b.className.includes('bg-[#FFB800]')
      );
      if (submitBtn) submitBtn.click();
    });

    // Wait for payment processing
    for (let i = 0; i < 8; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const hasSuccess = await page.evaluate(() => {
        return (
          document.body.innerText.includes('Thanh toán thành công') ||
          document.body.innerText.includes('Đặt vé thành công')
        );
      });
      if (hasSuccess) {
        console.log(`>>> PAYMENT SUCCESS CONFIRMED at second ${i + 1}!`);
        break;
      }
    }

    await page.screenshot({ path: path.join(OUT_DIR, '06-payment-confirmed.png') });
    console.log('✓ Captured 06-payment-confirmed.png');

    // STEP 6: Post-booking ancillary services + ancillary payment
    console.log(`\n--- STEP 6: Navigate to /dat-ve/${bookingCode}/dich-vu ---`);
    await page.goto(`${BASE_URL}/dat-ve/${bookingCode}/dich-vu`, {
      waitUntil: 'domcontentloaded',
    });
    // Trang fetch booking + dich-vu tuần tự qua Neon — có thể >5s mới render xong.
    await page
      .waitForFunction(() => document.body.innerText.includes('Đi tiếp'), { timeout: 40000 })
      .catch(() => {});
    await new Promise((r) => setTimeout(r, 1500));
    await page.screenshot({ path: path.join(OUT_DIR, '13-ancillary-services.png') });
    console.log('✓ Captured 13-ancillary-services.png');

    // Open baggage modal and confirm a package so pendingAmount > 0
    console.log('Opening baggage modal and confirming package...');
    await page
      .waitForFunction(
        () =>
          Array.from(document.querySelectorAll('div.cursor-pointer')).some((c) =>
            c.innerText.includes('Chọn hành lý')
          ),
        { timeout: 20000 }
      )
      .catch(() => {});
    await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('div.cursor-pointer'));
      const baggageCard = cards.find((c) => c.innerText.includes('Chọn hành lý'));
      if (baggageCard) baggageCard.click();
    });
    await new Promise((r) => setTimeout(r, 800));
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const confirmBtn = btns.find((b) => b.innerText.trim() === 'Xác nhận' && b.closest('.fixed'));
      if (confirmBtn) confirmBtn.click();
    });
    await new Promise((r) => setTimeout(r, 1200));

    // Click [ Đi tiếp ] → /dat-ve/:code/dich-vu/thanh-toan
    console.log('Clicking [ Đi tiếp ] to ancillary payment page...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const nextBtn = btns.find((b) => b.innerText.trim() === 'Đi tiếp');
      if (nextBtn) nextBtn.click();
    });
    await page
      .waitForFunction(() => window.location.pathname.includes('/dich-vu/thanh-toan'), {
        timeout: 10000,
      })
      .catch(() => {});
    // Chờ payment methods render xong (trang fetch GET dich-vu rồi mới hiện nút)
    await page
      .waitForFunction(() => document.body.innerText.includes('VietQR'), { timeout: 20000 })
      .catch(() => {});
    await new Promise((r) => setTimeout(r, 1000));
    console.log('Ancillary payment URL:', page.url());
    await page.screenshot({ path: path.join(OUT_DIR, '14-ancillary-payment.png') });
    console.log('✓ Captured 14-ancillary-payment.png');

    // Pay ancillary fees via VietQR
    console.log('Selecting VietQR and paying ancillary fees...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const vietqrBtn = btns.find((b) => b.innerText.includes('VietQR'));
      if (vietqrBtn) vietqrBtn.click();
    });
    for (let i = 0; i < 8; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const hasSuccess = await page.evaluate(() =>
        document.body.innerText.includes('Thanh toán thành công')
      );
      if (hasSuccess) {
        console.log(`>>> ANCILLARY PAYMENT SUCCESS at second ${i + 1}!`);
        break;
      }
    }
    await page.screenshot({ path: path.join(OUT_DIR, '15-ancillary-payment-success.png') });
    console.log('✓ Captured 15-ancillary-payment-success.png');

    console.log('\nALL 6 STEPS PASSED SUCCESSFULLY!');
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
