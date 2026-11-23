/**
 * Script xuất HTML của các mẫu email thông báo
 * Chạy: node scripts/preview-email-html.cjs
 */

// Load dotenv để đọc biến môi trường
require('dotenv').config({ path: '.env.local' });

const {
  buildPaymentInstructionHtml,
  buildPaymentSuccessHtml,
  buildPaymentFailedHtml,
  buildPaymentPendingReviewHtml,
  buildRefundNotificationHtml,
  buildPasswordResetHtml,
  buildRegistrationSuccessHtml,
  buildPasswordChangedHtml,
  buildOtpEmailHtml,
  buildFlightDelayHtml,
  buildFareAnnouncementHtml,
  buildTestPingEmailHtml,
} = require('../src/lib/mail.ts');

const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '..', 'email-templates-preview');

// Tạo thư mục output nếu chưa tồn tại
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function saveHtmlFile(filename, html) {
  const filepath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filepath, html, 'utf8');
  console.log(`✅ Đã lưu: ${filename}`);
}

async function previewAllEmails() {
  console.log('🔍 Bắt đầu xuất HTML các mẫu email thông báo...');
  console.log('─'.repeat(60));

  // 1. Email hướng dẫn thanh toán
  console.log('\n1️⃣ Email hướng dẫn thanh toán...');
  const paymentInstruction = buildPaymentInstructionHtml({
    fullName: 'Nguyễn Văn Test',
    bookingCode: 'VJ1234',
    flightNumber: 'VJ 120',
    route: 'SGN (TP. Hồ Chí Minh) → HAN (Hà Nội)',
    departureTime: '08:30, Ngày mai',
    amount: 1450000,
    bankName: 'HDBank',
    accountNumber: '180012345678',
    accountHolder: 'CONG TY CP HANG KHONG VIETJET',
    expiresInMinutes: 30,
  });
  saveHtmlFile('01-payment-instruction.html', paymentInstruction.html);

  // 2. Email xác nhận thanh toán thành công
  console.log('\n2️⃣ Email xác nhận thanh toán thành công...');
  const paymentSuccess = buildPaymentSuccessHtml({
    fullName: 'Nguyễn Văn Test',
    bookingCode: 'VJ1234',
    amount: 1450000,
    method: 'vnpay',
    flightNumber: 'VJ 120',
    route: 'SGN → HAN',
    departureTime: '08:30, Ngày mai',
    pointsEarned: 1450,
    passengers: [{ name: 'NGUYEN VAN TEST', seat: '12A' }],
  });
  saveHtmlFile('02-payment-success.html', paymentSuccess.html);

  // 3. Email thanh toán thất bại
  console.log('\n3️⃣ Email thanh toán thất bại...');
  const paymentFailed = buildPaymentFailedHtml({
    fullName: 'Nguyễn Văn Test',
    bookingCode: 'VJ1234',
    amount: 1450000,
    reason: 'Giao dịch bị gián đoạn, quá hạn hoặc thông tin biên lai chuyển khoản không khớp',
    flightNumber: 'VJ 120',
    route: 'SGN → HAN',
    departureTime: '08:30, Ngày mai',
  });
  saveHtmlFile('03-payment-failed.html', paymentFailed.html);

  // 4. Email chờ đối soát
  console.log('\n4️⃣ Email chờ đối soát...');
  const paymentPending = buildPaymentPendingReviewHtml({
    fullName: 'Nguyễn Văn Test',
    bookingCode: 'VJ1234',
    amount: 1450000,
    transferNote: 'VJ1234I98O',
    bankName: 'HDBank',
    flightNumber: 'VJ 120',
    route: 'SGN → HAN',
    departureTime: '08:30, Ngày mai',
    passengers: [{ name: 'NGUYEN VAN TEST', seat: '12A' }],
  });
  saveHtmlFile('04-payment-pending.html', paymentPending.html);

  // 5. Email hoàn tiền
  console.log('\n5️⃣ Email hoàn tiền...');
  const refund = buildRefundNotificationHtml({
    fullName: 'Nguyễn Văn Test',
    bookingCode: 'VJ1234',
    amount: 1450000,
    refundMethod: 'Tài khoản thanh toán ban đầu',
    reason: 'Yêu cầu hoàn vé / hủy đặt chỗ theo quy định',
  });
  saveHtmlFile('05-refund.html', refund.html);

  // 6. Email đặt lại mật khẩu
  console.log('\n6️⃣ Email đặt lại mật khẩu...');
  const passwordReset = buildPasswordResetHtml({
    token: 'test-token-12345',
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
  });
  saveHtmlFile('06-password-reset.html', passwordReset.html);

  // 7. Email đăng ký thành công
  console.log('\n7️⃣ Email đăng ký thành công...');
  const registration = buildRegistrationSuccessHtml({
    fullName: 'Nguyễn Văn Test',
  });
  saveHtmlFile('07-registration-success.html', registration.html);

  // 8. Email thay đổi mật khẩu
  console.log('\n8️⃣ Email thay đổi mật khẩu...');
  const passwordChanged = buildPasswordChangedHtml();
  saveHtmlFile('08-password-changed.html', passwordChanged.html);

  // 9. Email OTP
  console.log('\n9️⃣ Email OTP...');
  const otp = buildOtpEmailHtml({
    code: '123456',
    expiresInMinutes: 5,
    purpose: 'login',
  });
  saveHtmlFile('09-otp.html', otp.html);

  // 10. Email thông báo delay chuyến bay
  console.log('\n🔟 Email thông báo delay chuyến bay...');
  const flightDelay = buildFlightDelayHtml({
    fullName: 'Nguyễn Văn Test',
    bookingCode: 'VJ1234',
    flightNumber: 'VJ 120',
    route: 'SGN → HAN',
    originalTime: '07:00, Hôm nay',
    newTime: '08:30, Hôm nay (Chậm 1 giờ 30 phút)',
    delayReason: 'Điều kiện khai thác và an toàn kỹ thuật tàu bay',
  });
  saveHtmlFile('10-flight-delay.html', flightDelay.html);

  // 11. Email công văn giá vé
  console.log('\n1️⃣1️⃣ Email công văn giá vé...');
  const fareAnnouncement = buildFareAnnouncementHtml({
    documentNo: 'CV-VJC/2026/GVE-01',
    title: 'THÔNG BÁO VỀ VIỆC ÁP DỤNG BIỂU GIÁ VÉ VÀ CHÍNH SÁCH MỚI TRÊN CÁC ĐƯỜNG BAY',
    effectiveDate: 'Áp dụng ngay từ hôm nay',
    recipientName: 'Quý Đối tác & Đại lý bán vé máy bay',
    routes: [
      {
        from: 'SGN',
        to: 'HAN',
        flightNo: 'VJ 120 / VJ 121',
        ecoPrice: 599000,
        businessPrice: 1659000,
      },
      {
        from: 'SGN',
        to: 'DAD',
        flightNo: 'VJ 301 / VJ 302',
        ecoPrice: 499000,
        businessPrice: 1382000,
      },
      {
        from: 'HAN',
        to: 'PQC',
        flightNo: 'VJ 451 / VJ 452',
        ecoPrice: 799000,
        businessPrice: 2213000,
      },
    ],
    note: 'Giá vé chưa bao gồm thuế, phí sân bay theo quy định của Cục Hàng không Việt Nam. Tiêu chuẩn hành lý xách tay 07kg/khách.',
  });
  saveHtmlFile('11-fare-announcement.html', fareAnnouncement.html);

  // 12. Email test ping SMTP
  console.log('\n1️⃣2️⃣ Email test ping SMTP...');
  const testPing = buildTestPingEmailHtml();
  saveHtmlFile('12-test-ping.html', testPing.html);

  console.log('\n' + '─'.repeat(60));
  console.log('✅ Đã xuất xong tất cả HTML!');
  console.log('📁 Thư mục output:', OUTPUT_DIR);
  console.log('─'.repeat(60));
  console.log('\nMở file HTML trong trình duyệt để xem giao diện email.');
}

previewAllEmails().catch((error) => {
  console.error('❌ Lỗi:', error);
  process.exit(1);
});
