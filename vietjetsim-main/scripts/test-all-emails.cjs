/**
 * Script test gửi tất cả các mẫu email về bigdata779@gmail.com
 * Chạy: node scripts/test-all-emails.cjs
 */

// Load dotenv để đọc biến môi trường
require('dotenv').config({ path: '.env.local' });

const {
  sendPaymentInstructionEmail,
  sendPaymentSuccessEmail,
  sendPaymentFailedEmail,
  sendPaymentPendingReviewEmail,
  sendRefundNotificationEmail,
  sendPasswordResetEmail,
  sendRegistrationSuccessEmail,
  sendPasswordChangedEmail,
  sendOtpEmail,
  sendFareAnnouncementEmail,
  buildFlightDelayHtml,
  sendMail,
} = require('../src/lib/mail.ts');

const TEST_EMAIL = 'bigdata779@gmail.com';

async function testAllEmails() {
  console.log('🚀 Bắt đầu test gửi email về:', TEST_EMAIL);
  console.log('─'.repeat(60));

  const results = [];

  // 1. Email hướng dẫn thanh toán
  console.log('\n1️⃣ Email hướng dẫn thanh toán...');
  try {
    const success = await sendPaymentInstructionEmail({
      to: TEST_EMAIL,
      fullName: 'Nguyễn Văn Test',
      bookingCode: 'VJ1234',
      flightNumber: 'VJ 120',
      route: 'SGN → HAN',
      departureTime: '08:30, 25/11/2026',
      amount: 1450000,
      bankName: 'HDBank',
      accountNumber: '180012345678',
      accountHolder: 'CONG TY CP HANG KHONG VIETJET',
      expiresInMinutes: 30,
    });
    results.push({ name: 'Hướng dẫn thanh toán', success });
    console.log(success ? '✅ Thành công' : '❌ Thất bại');
  } catch (error) {
    console.error('❌ Lỗi:', error);
    results.push({ name: 'Hướng dẫn thanh toán', success: false });
  }

  // 2. Email xác nhận thanh toán thành công
  console.log('\n2️⃣ Email xác nhận thanh toán thành công...');
  try {
    const success = await sendPaymentSuccessEmail({
      to: TEST_EMAIL,
      fullName: 'Nguyễn Văn Test',
      bookingCode: 'VJ1234',
      amount: 1450000,
      method: 'vnpay',
      flightNumber: 'VJ 120',
      route: 'SGN → HAN',
      departureTime: '08:30, 25/11/2026',
      pointsEarned: 1450,
      passengers: [{ name: 'NGUYEN VAN TEST', seat: '12A' }],
    });
    results.push({ name: 'Thanh toán thành công', success });
    console.log(success ? '✅ Thành công' : '❌ Thất bại');
  } catch (error) {
    console.error('❌ Lỗi:', error);
    results.push({ name: 'Thanh toán thành công', success: false });
  }

  // 3. Email thanh toán thất bại
  console.log('\n3️⃣ Email thanh toán thất bại...');
  try {
    const success = await sendPaymentFailedEmail({
      to: TEST_EMAIL,
      fullName: 'Nguyễn Văn Test',
      bookingCode: 'VJ1234',
      amount: 1450000,
      reason: 'Giao dịch bị gián đoạn',
      flightNumber: 'VJ 120',
      route: 'SGN → HAN',
      departureTime: '08:30, 25/11/2026',
    });
    results.push({ name: 'Thanh toán thất bại', success });
    console.log(success ? '✅ Thành công' : '❌ Thất bại');
  } catch (error) {
    console.error('❌ Lỗi:', error);
    results.push({ name: 'Thanh toán thất bại', success: false });
  }

  // 4. Email chờ đối soát
  console.log('\n4️⃣ Email chờ đối soát...');
  try {
    const success = await sendPaymentPendingReviewEmail({
      to: TEST_EMAIL,
      fullName: 'Nguyễn Văn Test',
      bookingCode: 'VJ1234',
      amount: 1450000,
      transferNote: 'VJ1234I98O',
      bankName: 'HDBank',
      flightNumber: 'VJ 120',
      route: 'SGN → HAN',
      departureTime: '08:30, 25/11/2026',
      passengers: [{ name: 'NGUYEN VAN TEST', seat: '12A' }],
    });
    results.push({ name: 'Chờ đối soát', success });
    console.log(success ? '✅ Thành công' : '❌ Thất bại');
  } catch (error) {
    console.error('❌ Lỗi:', error);
    results.push({ name: 'Chờ đối soát', success: false });
  }

  // 5. Email hoàn tiền
  console.log('\n5️⃣ Email hoàn tiền...');
  try {
    const success = await sendRefundNotificationEmail({
      to: TEST_EMAIL,
      fullName: 'Nguyễn Văn Test',
      bookingCode: 'VJ1234',
      amount: 1450000,
      refundMethod: 'Tài khoản thanh toán ban đầu',
      reason: 'Yêu cầu hoàn vé',
    });
    results.push({ name: 'Hoàn tiền', success });
    console.log(success ? '✅ Thành công' : '❌ Thất bại');
  } catch (error) {
    console.error('❌ Lỗi:', error);
    results.push({ name: 'Hoàn tiền', success: false });
  }

  // 6. Email đặt lại mật khẩu
  console.log('\n6️⃣ Email đặt lại mật khẩu...');
  try {
    const success = await sendPasswordResetEmail({
      to: TEST_EMAIL,
      token: 'test-token-12345',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    });
    results.push({ name: 'Đặt lại mật khẩu', success });
    console.log(success ? '✅ Thành công' : '❌ Thất bại');
  } catch (error) {
    console.error('❌ Lỗi:', error);
    results.push({ name: 'Đặt lại mật khẩu', success: false });
  }

  // 7. Email đăng ký thành công
  console.log('\n7️⃣ Email đăng ký thành công...');
  try {
    const success = await sendRegistrationSuccessEmail({
      to: TEST_EMAIL,
      fullName: 'Nguyễn Văn Test',
    });
    results.push({ name: 'Đăng ký thành công', success });
    console.log(success ? '✅ Thành công' : '❌ Thất bại');
  } catch (error) {
    console.error('❌ Lỗi:', error);
    results.push({ name: 'Đăng ký thành công', success: false });
  }

  // 8. Email thay đổi mật khẩu
  console.log('\n8️⃣ Email thay đổi mật khẩu...');
  try {
    const success = await sendPasswordChangedEmail({
      to: TEST_EMAIL,
    });
    results.push({ name: 'Thay đổi mật khẩu', success });
    console.log(success ? '✅ Thành công' : '❌ Thất bại');
  } catch (error) {
    console.error('❌ Lỗi:', error);
    results.push({ name: 'Thay đổi mật khẩu', success: false });
  }

  // 9. Email OTP
  console.log('\n9️⃣ Email OTP...');
  try {
    const success = await sendOtpEmail({
      to: TEST_EMAIL,
      code: '123456',
      expiresInMinutes: 5,
      purpose: 'login',
    });
    results.push({ name: 'OTP', success });
    console.log(success ? '✅ Thành công' : '❌ Thất bại');
  } catch (error) {
    console.error('❌ Lỗi:', error);
    results.push({ name: 'OTP', success: false });
  }

  // 10. Email thông báo delay chuyến bay
  console.log('\n🔟 Email thông báo delay chuyến bay...');
  try {
    const { subject, html, text } = buildFlightDelayHtml({
      fullName: 'Nguyễn Văn Test',
      bookingCode: 'VJ1234',
      flightNumber: 'VJ 120',
      route: 'SGN → HAN',
      originalTime: '07:00, 25/11/2026',
      newTime: '08:30, 25/11/2026 (Chậm 1 giờ 30 phút)',
      delayReason: 'Điều kiện khai thác và an toàn kỹ thuật tàu bay',
    });
    const success = await sendMail({ to: TEST_EMAIL, subject, html, text });
    results.push({ name: 'Thông báo delay', success });
    console.log(success ? '✅ Thành công' : '❌ Thất bại');
  } catch (error) {
    console.error('❌ Lỗi:', error);
    results.push({ name: 'Thông báo delay', success: false });
  }

  // 11. Email công văn giá vé
  console.log('\n1️⃣1️⃣ Email công văn giá vé...');
  try {
    const success = await sendFareAnnouncementEmail({
      to: TEST_EMAIL,
      documentNo: 'CV-VJC/2026/GVE-01',
      title: 'THÔNG BÁO VỀ VIỆC ÁP DỤNG BIỂU GIÁ VÉ MỚI',
      effectiveDate: 'Áp dụng ngay',
      recipientName: 'Quý Đại lý',
      routes: [
        {
          from: 'SGN',
          to: 'HAN',
          flightNo: 'VJ 120',
          ecoPrice: 599000,
          businessPrice: 1659000,
        },
      ],
      note: 'Giá vé chưa bao gồm thuế, phí sân bay.',
    });
    results.push({ name: 'Công văn giá vé', success });
    console.log(success ? '✅ Thành công' : '❌ Thất bại');
  } catch (error) {
    console.error('❌ Lỗi:', error);
    results.push({ name: 'Công văn giá vé', success: false });
  }

  // 12. Email test ping SMTP
  console.log('\n1️⃣2️⃣ Email test ping SMTP...');
  try {
    const { html, text } = buildFlightDelayHtml({
      fullName: 'Admin Test',
      flightNumber: 'VJ TEST',
      route: 'SGN → HAN',
      originalTime: 'Test',
      newTime: 'Test',
      delayReason: 'Test SMTP connection',
    });
    const success = await sendMail({
      to: TEST_EMAIL,
      subject: '[TEST] Kiểm tra kết nối SMTP - VietjetSim',
      html,
      text,
    });
    results.push({ name: 'Test ping SMTP', success });
    console.log(success ? '✅ Thành công' : '❌ Thất bại');
  } catch (error) {
    console.error('❌ Lỗi:', error);
    results.push({ name: 'Test ping SMTP', success: false });
  }

  // Tổng kết
  console.log('\n' + '─'.repeat(60));
  console.log('📊 TỔNG KẾT KẾT QUẢ:');
  console.log('─'.repeat(60));
  results.forEach((r, i) => {
    console.log(`${i + 1}. ${r.name}: ${r.success ? '✅ Thành công' : '❌ Thất bại'}`);
  });

  const successCount = results.filter((r) => r.success).length;
  const failCount = results.length - successCount;
  console.log('─'.repeat(60));
  console.log(`Tổng: ${successCount}/${results.length} email gửi thành công`);
  console.log(`Thất bại: ${failCount}/${results.length}`);

  if (failCount > 0) {
    process.exit(1);
  }
}

testAllEmails().catch((error) => {
  console.error('❌ Lỗi nghiêm trọng:', error);
  process.exit(1);
});
