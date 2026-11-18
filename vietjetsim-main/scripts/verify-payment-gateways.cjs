const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:4028';
const CHROME =
  process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUTPUT_DIR = path.join(__dirname, '..', 'docs', 'qa', 'payment-gateways');

/**
 * Booking the gateways are opened with. It used to be hard-coded, which meant the
 * script silently verified whatever row happened to exist in one developer's
 * database — on a fresh database every page fell back to the old demo booking and
 * still reported OK. Override it with `TEST_BOOKING_ID=<uuid|PNR>`.
 */
const TEST_BOOKING_ID = process.env.TEST_BOOKING_ID || 'ea21a432-d223-439d-bce5-86f10e0e467c';

async function run() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const results = {
    testedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    bookingId: TEST_BOOKING_ID,
    steps: [],
    overall: { passed: false },
  };

  console.log(`Starting Payment Gateways Verification on ${BASE_URL}...`);
  console.log(`Booking under test: ${TEST_BOOKING_ID}`);

  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: CHROME,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    const testBookingId = TEST_BOOKING_ID;

    // Step 1: Main Payment Selection Page
    console.log('\n--- 1. Kiểm tra Trang chọn phương thức (/thanh-toan) ---');
    await page.goto(`${BASE_URL}/thanh-toan?bookingId=${testBookingId}`, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });
    await page
      .waitForFunction(
        () =>
          document.body.innerText.includes('Phương thức thanh toán') ||
          document.body.innerText.includes('Chi tiết thanh toán') ||
          document.body.innerText.includes('Chưa có đơn đặt vé'),
        { timeout: 10000 }
      )
      .catch(() => {});

    const selectionState = await page.evaluate(() => {
      const text = document.body.innerText;
      if (text.includes('Phương thức thanh toán') || text.includes('Chi tiết thanh toán')) {
        return 'payment-ui';
      }
      if (text.includes('Chưa có đơn đặt vé') || text.includes('Không tìm thấy')) {
        return 'no-booking';
      }
      return 'unknown';
    });

    await page.screenshot({
      path: path.join(OUTPUT_DIR, '01-payment-methods-page.png'),
      fullPage: true,
    });
    console.log(`✓ Trang chọn phương thức: state=${selectionState}`);
    results.steps.push({
      step: '1_payment_selection',
      bookingId: testBookingId,
      selectionState,
      status: selectionState === 'payment-ui' ? 'OK' : 'WARNING',
    });

    // Step 2: Cổng QR chuyên dụng (/thanh-toan/gateway/qr)
    console.log('\n--- 2. Kiểm tra Cổng VNPAY-QR / VietQR (/thanh-toan/gateway/qr) ---');
    await page.goto(`${BASE_URL}/thanh-toan/gateway/qr?bookingId=${testBookingId}`, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });
    await page
      .waitForFunction(
        () =>
          document.body.innerText.includes('Quét mã QR') ||
          document.body.innerText.includes('VNPAY-QR'),
        { timeout: 10000 }
      )
      .catch(() => {});

    const hasCountdown = await page.evaluate(() => {
      const text = document.body.innerText;
      return text.includes('Thời gian giữ vé') || /\d{2}:\d{2}/.test(text);
    });

    const hasQrContent = await page.evaluate(() => {
      const text = document.body.innerText;
      return text.includes('Quét mã QR') && text.includes('Nội dung chuyển khoản');
    });

    await page.screenshot({
      path: path.join(OUTPUT_DIR, '02-gateway-qr.png'),
      fullPage: true,
    });
    console.log(`✓ Cổng QR: countdown=${hasCountdown}, qrContent=${hasQrContent}`);
    results.steps.push({
      step: '2_gateway_qr',
      hasCountdown,
      hasQrContent,
      status: hasCountdown && hasQrContent ? 'OK' : 'WARNING',
    });

    // Step 3: Cổng Thẻ Quốc Tế (/thanh-toan/gateway/card)
    console.log('\n--- 3. Kiểm tra Cổng Thẻ Quốc Tế (/thanh-toan/gateway/card) ---');
    await page.goto(`${BASE_URL}/thanh-toan/gateway/card?bookingId=${testBookingId}`, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });
    let cardFormVisible = true;
    try {
      await page.waitForSelector('#cardNumber', { timeout: 10000 });
    } catch {
      cardFormVisible = false;
    }

    if (cardFormVisible) {
      await page.type('#cardNumber', '4111222233334444');
      await page.type('#cardName', 'NGUYEN VAN A');
      await page.type('#cardExpiry', '1228');
      await page.type('#cardCvv', '888');
    }

    const cardBrandText =
      cardFormVisible &&
      (await page.evaluate(() => {
        return document.body.innerText.includes('VISA');
      }));

    await page.screenshot({
      path: path.join(OUTPUT_DIR, '03-gateway-card.png'),
      fullPage: true,
    });
    console.log(`✓ Cổng Thẻ: form=${cardFormVisible}, brandDetection(VISA)=${cardBrandText}`);
    results.steps.push({
      step: '3_gateway_card',
      cardFormVisible,
      brandDetection: cardBrandText,
      status: cardFormVisible && cardBrandText ? 'OK' : 'WARNING',
    });

    // Step 4: Cổng Thẻ ATM Nội Địa Napas (/thanh-toan/gateway/napas)
    console.log('\n--- 4. Kiểm tra Cổng Thẻ Nội Địa Napas (/thanh-toan/gateway/napas) ---');
    await page.goto(`${BASE_URL}/thanh-toan/gateway/napas?bookingId=${testBookingId}`, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });
    await page
      .waitForFunction(
        () =>
          document.body.innerText.includes('Vietcombank') ||
          document.body.innerText.includes('NAPAS'),
        { timeout: 10000 }
      )
      .catch(() => {});

    const hasBankGrid = await page.evaluate(() => {
      const text = document.body.innerText;
      return text.includes('Vietcombank') && text.includes('VietinBank') && text.includes('BIDV');
    });

    await page.screenshot({
      path: path.join(OUTPUT_DIR, '04-gateway-napas.png'),
      fullPage: true,
    });
    console.log(`✓ Cổng Napas: bankGrid=${hasBankGrid}`);
    results.steps.push({
      step: '4_gateway_napas',
      hasBankGrid,
      status: hasBankGrid ? 'OK' : 'WARNING',
    });

    // Step 5: Cổng Ví Điện Tử (/thanh-toan/gateway/ewallet)
    console.log('\n--- 5. Kiểm tra Cổng Ví Điện Tử (/thanh-toan/gateway/ewallet) ---');
    await page.goto(`${BASE_URL}/thanh-toan/gateway/ewallet?bookingId=${testBookingId}`, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });
    await page
      .waitForFunction(
        () =>
          document.body.innerText.includes('Ví MoMo') ||
          document.body.innerText.includes('ZaloPay'),
        { timeout: 10000 }
      )
      .catch(() => {});

    const hasWallets = await page.evaluate(() => {
      const text = document.body.innerText;
      return text.includes('Ví MoMo') && text.includes('ZaloPay') && text.includes('ShopeePay');
    });

    await page.screenshot({
      path: path.join(OUTPUT_DIR, '05-gateway-ewallet.png'),
      fullPage: true,
    });
    console.log(`✓ Cổng Ví Điện Tử: walletChoices=${hasWallets}`);
    results.steps.push({
      step: '5_gateway_ewallet',
      hasWallets,
      status: hasWallets ? 'OK' : 'WARNING',
    });

    // Step 6: Cổng Trả Sau MOVI (/thanh-toan/gateway/movi)
    console.log('\n--- 6. Kiểm tra Cổng Bay Trước Trả Sau MOVI (/thanh-toan/gateway/movi) ---');
    await page.goto(`${BASE_URL}/thanh-toan/gateway/movi?bookingId=${testBookingId}`, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });
    await page
      .waitForFunction(
        () =>
          document.body.innerText.includes('MOVI') || document.body.innerText.includes('1 tháng'),
        { timeout: 10000 }
      )
      .catch(() => {});

    const hasMoviTenors = await page.evaluate(() => {
      const text = document.body.innerText;
      return text.includes('1 tháng') && text.includes('3 tháng') && text.includes('0%');
    });

    await page.screenshot({
      path: path.join(OUTPUT_DIR, '06-gateway-movi.png'),
      fullPage: true,
    });
    console.log(`✓ Cổng MOVI: tenors=${hasMoviTenors}`);
    results.steps.push({
      step: '6_gateway_movi',
      hasMoviTenors,
      status: hasMoviTenors ? 'OK' : 'WARNING',
    });

    // Step 7: Cổng Ví Vietjet / SkyPoint (/thanh-toan/gateway/wallet)
    console.log('\n--- 7. Kiểm tra Cổng Ví Tài Khoản (/thanh-toan/gateway/wallet) ---');
    await page.goto(`${BASE_URL}/thanh-toan/gateway/wallet?bookingId=${testBookingId}`, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });
    await page
      .waitForFunction(
        () =>
          document.body.innerText.includes('Số dư ví') ||
          document.body.innerText.includes('SkyPoint'),
        { timeout: 10000 }
      )
      .catch(() => {});

    const hasWalletBalance = await page.evaluate(() => {
      const text = document.body.innerText.toLowerCase();
      return text.includes('số dư ví khả dụng') && text.includes('skypoint');
    });

    await page.screenshot({
      path: path.join(OUTPUT_DIR, '07-gateway-wallet.png'),
      fullPage: true,
    });
    console.log(`✓ Cổng Ví Tài Khoản: walletBalance=${hasWalletBalance}`);
    results.steps.push({
      step: '7_gateway_wallet',
      hasWalletBalance,
      status: hasWalletBalance ? 'OK' : 'WARNING',
    });

    // Step 8: Trang kết quả (/thanh-toan/thanh-cong)
    console.log('\n--- 8. Kiểm tra Trang Kết Quả Thanh Toán (/thanh-toan/thanh-cong) ---');
    await page.goto(`${BASE_URL}/thanh-toan/thanh-cong?bookingId=${testBookingId}`, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });
    await page
      .waitForFunction(
        () =>
          document.body.innerText.includes('Thanh toán thành công') ||
          document.body.innerText.includes('Đang chờ thanh toán') ||
          document.body.innerText.includes('Không tìm thấy đơn đặt vé'),
        { timeout: 10000 }
      )
      .catch(() => {});

    const resultState = await page.evaluate(() => {
      const text = document.body.innerText.toUpperCase();
      if (text.includes('THANH TOÁN THÀNH CÔNG')) return 'confirmed';
      if (text.includes('ĐANG CHỜ THANH TOÁN')) return 'pending';
      if (text.includes('KHÔNG TÌM THẤY ĐƠN ĐẶT VÉ')) return 'not-found';
      return 'unknown';
    });
    // Trang cũ hard-code PNR "VJ8899" và 1.980.000₫, nên một bookingId không
    // tồn tại vẫn hiện "Thanh toán thành công". Trang đúng phải phản ánh trạng
    // thái thật của đơn và mở đúng PNR đã truyền vào — không in dữ liệu giả.
    //
    // Không dùng "VJ3018" làm dấu hiệu giả: đó là số hiệu chuyến bay thật của
    // tuyến SGN–HAN trong dữ liệu seed.
    const fakePnrGone = await page.evaluate(() => !document.body.innerText.includes('VJ8899'));
    const openedByPnr = !/^[0-9a-f-]{36}$/i.test(testBookingId);
    const showsOpenedPnr =
      !openedByPnr ||
      (await page.evaluate(
        (pnr) => document.body.innerText.toUpperCase().includes(pnr),
        testBookingId.toUpperCase()
      ));
    const hasSuccessDetails =
      (resultState === 'confirmed' || resultState === 'pending') && fakePnrGone && showsOpenedPnr;

    await page.screenshot({
      path: path.join(OUTPUT_DIR, '08-payment-success.png'),
      fullPage: true,
    });
    console.log(
      `✓ Trang Kết Quả: state=${resultState}, fakePnrGone=${fakePnrGone}, showsOpenedPnr=${showsOpenedPnr}`
    );
    results.steps.push({
      step: '8_payment_result',
      resultState,
      fakePnrGone,
      showsOpenedPnr,
      hasSuccessDetails,
      status: hasSuccessDetails ? 'OK' : 'WARNING',
    });

    results.overall.passed = results.steps.every((s) => s.status === 'OK');
    console.log(`\n======================================================`);
    console.log(
      `✓ TẤT CẢ 8 TRANG THANH TOÁN & GATEWAY HOÀN TẤT KIỂM TRA: ${results.overall.passed ? 'ĐẠT' : 'KHÔNG ĐẠT'}`
    );
    console.log(`======================================================\n`);
  } catch (err) {
    console.error('Lỗi trong quá trình kiểm tra:', err);
    results.error = err.message;
    results.overall.passed = false;
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(OUTPUT_DIR, 'report.json'), JSON.stringify(results, null, 2));
  }

  if (!results.overall.passed) {
    process.exit(1);
  }
}

run();
