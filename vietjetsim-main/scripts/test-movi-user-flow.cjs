const path = require('node:path');
const puppeteer = require('puppeteer-core');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:4028';
const CHROME =
  process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function main() {
  console.log('Testing User Flow: Enter 4 MOVI fields and press Xác Nhận...');

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
  const passengerEmail = `test.movi.${ts}@vietjetsim.vn`;

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
          name: 'NGUYEN VAN TEST',
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
    }),
  });

  const bookingData = await bookingRes.json();
  const booking = bookingData.booking;
  const bookingCode = booking.booking_code;
  console.log('Created booking:', bookingCode, 'ID:', booking.id);

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,900'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.text().includes('movi') || msg.text().includes('payment')) {
        console.log('[BROWSER LOG]', msg.type(), msg.text());
      }
    });

    page.on('pageerror', (err) => {
      console.error('[BROWSER ERROR]', err);
    });

    if (cookies.length) {
      await page.setCookie(...cookies);
    }

    const url = `${BASE_URL}/thanh-toan?bookingId=${bookingCode}`;
    console.log('Navigating to:', url);
    await page.goto(url, { waitUntil: 'networkidle0' });

    // Click MOVI payment method
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

    // Find inputs and inspect them
    const inputsInfo = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input'));
      return inputs.map((i) => ({
        placeholder: i.placeholder,
        value: i.value,
        type: i.type,
      }));
    });
    console.log(
      'Inputs found on page:',
      inputsInfo.filter((i) => i.placeholder)
    );

    // Fill the inputs using real clicks and typing or React value setter
    console.log('Filling form fields...');
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
        nativeSetter.call(nameInput, 'NGUYEN VAN TEST');
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
        nativeSetter.call(phoneInput, '0912345678');
        phoneInput.dispatchEvent(new Event('input', { bubbles: true }));
        phoneInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    await new Promise((r) => setTimeout(r, 500));

    // Verify filled values
    const filledValues = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input'));
      return {
        name: inputs.find((i) => i.placeholder?.includes('Họ và tên'))?.value,
        dob: inputs.find((i) => i.placeholder?.includes('Ngày sinh'))?.value,
        cccd: inputs.find((i) => i.placeholder?.includes('CMND/CCCD'))?.value,
        phone: inputs.find((i) => i.placeholder?.includes('số điện thoại'))?.value,
      };
    });
    console.log('Filled input values in DOM:', filledValues);

    await page.screenshot({
      path: path.join(
        __dirname,
        '..',
        'docs',
        'qa',
        'payment-ui-audit',
        'movi-filled-before-submit.png'
      ),
    });
    console.log('✓ Captured movi-filled-before-submit.png');

    // Click "Xác Nhận" button
    console.log('Clicking [ Xác Nhận ] button...');
    const clickSuccess = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const confirmBtn = btns.find((b) => b.innerText.trim() === 'Xác Nhận');
      if (confirmBtn) {
        confirmBtn.click();
        return true;
      }
      return false;
    });
    console.log('Confirm button clicked:', clickSuccess);

    // Monitor for 8 seconds
    for (let i = 0; i < 8; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const state = await page.evaluate(() => {
        const text = document.body.innerText;
        return {
          hasSuccess: text.includes('Thanh toán thành công') || text.includes('Đặt vé thành công'),
          hasModalError: !!document.querySelector('.fixed.inset-0, [role="dialog"]'),
          modalText: document.querySelector('.fixed.inset-0, [role="dialog"]')?.innerText,
          buttonText: Array.from(document.querySelectorAll('button')).find(
            (b) => b.innerText.includes('Xác Nhận') || b.innerText.includes('Đang xử lý')
          )?.innerText,
        };
      });
      console.log(`Sec ${i + 1} state:`, state);
      if (state.hasSuccess) {
        console.log('>>> SUCCESS DETECTED!');
        break;
      }
    }

    await page.screenshot({
      path: path.join(__dirname, '..', 'docs', 'qa', 'payment-ui-audit', 'movi-after-submit.png'),
    });
    console.log('✓ Captured movi-after-submit.png');

    const finalText = await page.evaluate(() => ({
      hasSuccess:
        document.body.innerText.includes('Thanh toán thành công') ||
        document.body.innerText.includes('Đặt vé thành công'),
      bodySnippet: document.body.innerText.slice(0, 1000),
    }));
    console.log('Final Result:', finalText.hasSuccess ? 'PASSED' : 'FAILED');
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
