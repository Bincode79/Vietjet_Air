import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/admin-auth';
import { auditAdmin } from '@/lib/admin-audit';
import {
  sendMail,
  buildPaymentInstructionHtml,
  buildPaymentSuccessHtml,
  buildFareAnnouncementHtml,
  buildFlightDelayHtml,
  buildTestPingEmailHtml,
} from '@/lib/mail';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function generateTestEmailPayload(template: string): {
  subject: string;
  html: string;
  text: string;
  title: string;
  category: string;
} {
  if (template === 'booking') {
    const res = buildPaymentInstructionHtml({
      fullName: 'Nguyễn Văn A (Mẫu thử nghiệm)',
      bookingCode: 'VJ9876',
      flightNumber: 'VJ 120',
      route: 'SGN (TP. Hồ Chí Minh) → HAN (Hà Nội)',
      departureTime: '08:30, Ngày mai',
      amount: 1450000,
      bankName: 'HDBank',
      accountNumber: '180012345678',
      accountHolder: 'CONG TY CP HANG KHONG VIETJET',
      expiresInMinutes: 30,
    });
    return {
      ...res,
      title: 'Vé máy bay & Hướng dẫn thanh toán (VietQR / PNR)',
      category: 'Đặt chỗ & Thanh toán',
    };
  }

  if (template === 'invoice') {
    const res = buildPaymentSuccessHtml({
      fullName: 'Nguyễn Văn A (Mẫu thử nghiệm)',
      bookingCode: 'VJ9876',
      amount: 1450000,
      method: 'vnpay',
      flightNumber: 'VJ 120',
      route: 'SGN → HAN',
      departureTime: '08:30, Ngày mai',
      pointsEarned: 1450,
      passengers: [{ name: 'NGUYEN VAN A', seat: '12A' }],
    });
    return {
      ...res,
      title: 'Xác nhận thanh toán thành công & Hóa đơn điện tử VAT',
      category: 'Hóa đơn & Phát hành vé',
    };
  }

  if (template === 'fare') {
    const res = buildFareAnnouncementHtml({
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
    return {
      ...res,
      title: 'Công văn biểu giá vé chính thức gửi Đại lý',
      category: 'Đối tác & Đại lý',
    };
  }

  if (template === 'delay') {
    const res = buildFlightDelayHtml({
      fullName: 'Nguyễn Văn A (Mẫu thử nghiệm)',
      bookingCode: 'VJ9876',
      flightNumber: 'VJ 120',
      route: 'SGN → HAN',
      originalTime: '07:00, Hôm nay',
      newTime: '08:30, Hôm nay (Chậm 1 giờ 30 phút)',
      delayReason: 'Điều kiện khai thác và an toàn kỹ thuật tàu bay',
    });
    return {
      ...res,
      title: 'Thông báo điều chỉnh giờ bay / hoãn chuyến',
      category: 'Khai thác bay & Cảnh báo',
    };
  }

  // Mặc định: 'test'
  const res = buildTestPingEmailHtml();
  return {
    ...res,
    title: 'Kiểm tra kết nối dịch vụ Email tự động (SMTP Ping)',
    category: 'Hệ thống & Chẩn đoán',
  };
}

/**
 * GET: Xem trước (Live Preview) nội dung và giao diện các mẫu email tự động
 */
export async function GET(request: NextRequest) {
  try {
    const { error, response } = await verifyAdminRequest(request, 'system:config');
    if (error) return response;

    const url = new URL(request.url);
    const template = url.searchParams.get('template') || 'booking';

    const payload = generateTestEmailPayload(template);

    return NextResponse.json({
      success: true,
      template,
      ...payload,
    });
  } catch (err) {
    console.error('Lỗi khi xem trước mẫu email:', err);
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: err instanceof Error ? err.message : 'Không thể tải mẫu email xem trước.',
      },
      { status: 500 }
    );
  }
}

/**
 * POST: Gửi thử nghiệm email tự động tới địa chỉ chỉ định
 */
export async function POST(request: NextRequest) {
  try {
    const { error, response, payload } = await verifyAdminRequest(request, 'system:config');
    if (error) return response;

    const body = await request.json();
    const to = typeof body?.to === 'string' ? body.to.trim() : '';
    const template = typeof body?.template === 'string' ? body.template : 'test';

    if (!to || !EMAIL_REGEX.test(to)) {
      return NextResponse.json(
        {
          error: 'Bad Request',
          message: 'Vui lòng cung cấp địa chỉ email người nhận hợp lệ.',
        },
        { status: 400 }
      );
    }

    const emailData = generateTestEmailPayload(template);

    const success = await sendMail({
      to,
      subject: emailData.subject,
      html: emailData.html,
      text: emailData.text,
    });

    await auditAdmin(request, payload, {
      action: 'system:send_test_email',
      targetType: 'system_setting',
      targetId: to,
      details: { to, template, success },
    });

    return NextResponse.json({
      success: true,
      message: success
        ? `Đã gửi email thử nghiệm (${emailData.title}) thành công tới ${to}`
        : `Lệnh gửi đã được gửi đi tới SMTP Server (kiểm tra hòm thư ${to}).`,
    });
  } catch (err) {
    console.error('Lỗi gửi email kiểm tra:', err);
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: err instanceof Error ? err.message : 'Không thể gửi email kiểm tra.',
      },
      { status: 500 }
    );
  }
}
