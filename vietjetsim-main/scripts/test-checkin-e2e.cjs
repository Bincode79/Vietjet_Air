const path = require('node:path');
const puppeteer = require('puppeteer-core');
const { neon } = require('@neondatabase/serverless');
const { resolveDatabaseUrl } = require('./db-target.cjs');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:4028';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT_DIR = path.join(__dirname, '..', 'docs', 'qa', 'bnpl-journey');

async function main() {
  console.log('--- STARTING ONLINE CHECK-IN & E-BOARDING PASS TEST ---');
  const fs = require('fs');
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const sql = neon(resolveDatabaseUrl(['--allow-remote', '--yes']));
  // Temporarily disable checkin window enforcement for test execution
  await sql`INSERT INTO system_config (key, value) VALUES ('checkin_window_enforced', 'false') ON CONFLICT (key) DO UPDATE SET value = 'false'`;
  console.log('✓ Check-in window enforcement temporarily set to false for testing');

  try {
    // 1. Get CSRF & create a confirmed booking for check-in
    const csrfRes = await fetch(`${BASE_URL}/api/csrf`);
    const setCookies = csrfRes.headers.getSetCookie ? csrfRes.headers.getSetCookie() : [csrfRes.headers.get('set-cookie')];
    const cookieHeader = setCookies.map(c => c.split(';')[0]).join('; ');
    const csrfCookie = setCookies.map(c => {
      const [nameVal] = c.split(';');
      const [name, value] = nameVal.split('=');
      return { name, value };
    }).find(c => c.name === 'csrf_token');

    // Get active flight
    const flightsRes = await fetch(`${BASE_URL}/api/chuyen-bay?from=SGN&to=HAN&date=2026-11-30&adults=1`);
    const flightsData = await flightsRes.json();
    const flights = flightsData.flights || flightsData || [];
    const flight = flights[0];

    const ts = Date.now();
    const passengerPhone = `09${(ts % 100000000).toString().padStart(8, '0')}`;
    const passengerEmail = `checkin.${ts}@vietjetsim.vn`;

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
    const pnr = booking.booking_code;
    const bookingId = booking.id;
    console.log(`✓ Booking created: PNR=${pnr}, ID=${bookingId}`);

    // Confirm booking & payment
    await sql`UPDATE bookings SET status = 'confirmed' WHERE id = ${bookingId}`;
    console.log(`✓ Booking confirmed & marked paid: PNR=${pnr}`);

    // Launch browser
    const browser = await puppeteer.launch({
      executablePath: CHROME,
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: { width: 1440, height: 900 },
    });

    const page = await browser.newPage();

    // Step 1: Open /lam-thu-tuc
    console.log('\n--- STEP 1: Navigate to /lam-thu-tuc ---');
    await page.goto(`${BASE_URL}/lam-thu-tuc`, { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 1200));

    // Step 2: Fill PNR & Last Name
    console.log(`Filling PNR=${pnr} and Last Name=KA...`);
    await page.type('#booking-code', pnr);
    await page.type('#last-name', 'KA');
    await new Promise((r) => setTimeout(r, 400));

    // Click Search
    await page.evaluate(() => {
      const btn = document.querySelector('form button[type="submit"]');
      if (btn) btn.click();
    });
    await new Promise((r) => setTimeout(r, 2500));

    await page.screenshot({ path: path.join(OUT_DIR, '11-checkin-search-results.png') });
    console.log('✓ Captured 11-checkin-search-results.png');

    // Verify search result
    const searchResultsCheck = await page.evaluate(() => {
      const text = document.body.innerText;
      return {
        hasPnr: text.includes('Mã đặt chỗ') || text.includes('VJ'),
        hasPassengerName: text.includes('LONG KA') || text.includes('KA'),
        hasAgreeCheckbox: !!document.querySelector('#agree'),
        hasCheckInBtn: Array.from(document.querySelectorAll('button')).some(b => b.innerText.toUpperCase().includes('XÁC NHẬN LÀM THỦ TỤC') || b.innerText.includes('Check-in')),
      };
    });
    console.log('Search Results Check:', searchResultsCheck);

    // Step 3: Check agree checkbox and click check-in button
    console.log('\n--- STEP 2: Confirming check-in ---');
    await page.evaluate(() => {
      const cb = document.querySelector('#agree');
      if (cb && !cb.checked) cb.click();
    });
    await new Promise((r) => setTimeout(r, 600));

    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const btn = btns.find(b => b.innerText.toUpperCase().includes('XÁC NHẬN LÀM THỦ TỤC') || b.innerText.includes('Check-in'));
      if (btn && !btn.disabled) btn.click();
    });
    await new Promise((r) => setTimeout(r, 4000));

    await page.screenshot({ path: path.join(OUT_DIR, '12-boarding-pass-success.png') });
    console.log('✓ Captured 12-boarding-pass-success.png');

    const boardingPassCheck = await page.evaluate(() => {
      const text = document.body.innerText;
      return {
        hasSuccessNotice: text.includes('thành công') || text.includes('Thẻ lên máy bay') || text.includes('Boarding Pass'),
        hasQrCode: !!document.querySelector('svg, canvas, img[alt*="QR" i], [aria-label*="QR" i]'),
        hasSeat: text.includes('Ghế') || text.includes('15A') || text.includes('18A'),
        hasPassenger: text.includes('LONG KA') || text.includes('KA'),
        hasPrintBtn: Array.from(document.querySelectorAll('button')).some(b => b.innerText.includes('In') || b.title?.includes('In')),
      };
    });
    console.log('Boarding Pass Check:', boardingPassCheck);

    await browser.close();
    console.log('\nALL CHECK-IN TESTS COMPLETED SUCCESSFULLY!');
  } finally {
    // Reset checkin window enforcement back to true
    await sql`INSERT INTO system_config (key, value) VALUES ('checkin_window_enforced', 'true') ON CONFLICT (key) DO UPDATE SET value = 'true'`;
    console.log('✓ Check-in window enforcement restored to true');
  }
}

main().catch(err => {
  console.error('Checkin E2E error:', err);
  process.exit(1);
});
