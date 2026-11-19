const path = require('node:path');
const puppeteer = require('puppeteer-core');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:4028';
const CHROME =
  process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT_FILE = path.resolve(
  __dirname,
  '..',
  'docs',
  'qa',
  'payment-ui-audit',
  'movi-desktop-exact.png'
);

async function main() {
  // 1. Get CSRF & create real booking
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
  const flight = flights[0] || { id: 'fl-1', flight_no: 'VJ134' };

  const bookingRes = await fetch(`${BASE_URL}/api/dat-ve`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: cookieHeader,
      'x-csrf-token': csrfCookie?.value || '',
    },
    body: JSON.stringify({
      flightId: flight.id,
      flightNo: flight.flight_no || 'VJ134',
      from: 'SGN',
      to: 'HAN',
      fromCity: 'Tp. Hồ Chí Minh',
      toCity: 'Hà Nội',
      departDate: tomorrow,
      departTime: flight.depart_time || '05:00',
      arriveTime: flight.arrive_time || '07:10',
      fareType: 'Eco',
      basePrice: 1738800,
      ancillariesPrice: 44000,
      totalPrice: 2677581,
      passengers: [
        {
          title: 'MR',
          fullName: 'NGUYEN VAN A',
          type: 'adult',
          gender: 'male',
          dateOfBirth: '1990-01-01',
        },
      ],
      contactInfo: {
        fullName: 'NGUYEN VAN A',
        email: 'khach@vietjetair.com',
        phone: '0901234567',
      },
      ancillaries: [
        { type: 'insurance', price: 44000, name: 'Bảo hiểm du lịch Vietjet Travel Safe' },
      ],
    }),
  });

  const bookingData = await bookingRes.json();
  const bookingCode = bookingData.bookingCode || bookingData.booking_code || 'VJ134';
  console.log('Created booking:', bookingCode);

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,960'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 960, deviceScaleFactor: 1 });

    if (cookies.length) {
      await page.setCookie(...cookies);
    }

    const url = `${BASE_URL}/thanh-toan?bookingId=${bookingCode}`;
    await page.goto(url, { waitUntil: 'networkidle0' });

    // Click MOVI payment method button
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

    await new Promise((r) => setTimeout(r, 800));

    // Capture clean viewport
    await page.screenshot({ path: OUT_FILE });
    console.log('✓ Captured clean movi-desktop-exact.png');
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
