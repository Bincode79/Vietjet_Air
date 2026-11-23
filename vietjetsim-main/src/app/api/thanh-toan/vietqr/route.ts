import { NextRequest, NextResponse } from 'next/server';
import { getBookingByCodeOrId, getActiveBankAccounts, getDiscountCodeByCode } from '@/lib/db';
import { verifyAuthRequest } from '@/lib/auth';
import { rateLimit } from '@/lib/rate-limit';
import { canAccessBooking } from '@/lib/booking-access';
import { renderTransferNote } from '@/lib/transfer-note';
import { buildVietQrPayload, lookupBankBin } from '@/lib/vietqr';
import { computeDiscountAmount } from '@/lib/discount';
import { getApiErrorMessage } from '@/shared/services';

/**
 * GET /api/thanh-toan/vietqr?bookingId=…
 *
 * Sinh mã VietQR động (EMVCo/NAPAS) cho một đặt chỗ: số tiền và nội dung
 * chuyển khoản được suy ra ở server (không tin dữ liệu client), CRC16 tính
 * tại chỗ. Client dùng payload này để render QR và poll trạng thái giao dịch.
 */
export async function GET(request: NextRequest) {
  try {
    const limited = rateLimit(request, { windowMs: 60_000, maxRequests: 60 });
    if (limited) return limited;

    const { user } = await verifyAuthRequest(request);

    const bookingId = request.nextUrl.searchParams.get('bookingId');
    const discountCode = request.nextUrl.searchParams.get('discountCode');
    if (!bookingId) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'bookingId là bắt buộc' },
        { status: 400 }
      );
    }

    // Resolve by UUID *or* PNR, same as `POST /api/thanh-toan`: a guest who
    // reaches the payment screen from the emailed link holds the PNR, not the
    // internal id.
    const booking = await getBookingByCodeOrId(bookingId);
    if (!booking) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Không tìm thấy thông tin đặt chỗ' },
        { status: 404 }
      );
    }

    // This route returns the receiving bank account and the exact amount, so
    // ownership matters here too. It previously checked only when `user` was
    // non-null, which let an anonymous caller read it with a booking UUID.
    if (!canAccessBooking(request, booking, user, bookingId)) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Đặt chỗ không thuộc về tài khoản này' },
        { status: 403 }
      );
    }

    const accounts = await getActiveBankAccounts();
    if (accounts.length === 0) {
      return NextResponse.json(
        { error: 'Unavailable', message: 'Chưa cấu hình tài khoản nhận tiền' },
        { status: 503 }
      );
    }

    const account = accounts[0];

    // Tính discountAmount từ discountCode nếu có
    let discountAmount = 0;
    let validatedDiscountId: string | undefined;
    let discountCodeForNote = '';

    if (discountCode) {
      const discount = await getDiscountCodeByCode(discountCode);
      if (discount && discount.is_active) {
        const now = new Date();
        if (now >= new Date(discount.start_date) && now <= new Date(discount.end_date)) {
          // Kiểm tra usage limit
          if (discount.usage_limit === null || discount.used_count < discount.usage_limit) {
            // Kiểm tra min booking amount
            if (booking.total_price >= Number(discount.min_booking_amount)) {
              discountAmount = computeDiscountAmount(discount, booking.total_price);
              validatedDiscountId = discount.id;
              discountCodeForNote = discount.code;
            }
          }
        }
      }
    }

    // Ưu tiên dùng discount_amount từ booking nếu đã có (đã thanh toán trước đó)
    const finalDiscountAmount = booking.discount_amount || discountAmount;
    const amount = Math.max(0, booking.total_price - finalDiscountAmount);
    const addInfo = renderTransferNote(account.transfer_note_template, {
      code: booking.booking_code ?? '',
      originalAmount: booking.total_price,
      discountAmount: finalDiscountAmount,
      amount,
      discountCode: discountCodeForNote,
    });

    const effectiveBin = lookupBankBin(account.bank_name, account.bank_bin);

    const payload = buildVietQrPayload({
      bin: effectiveBin,
      accountNumber: account.account_number,
      accountHolder: account.account_holder,
      bankName: account.bank_name,
    });

    return NextResponse.json({
      success: true,
      payload,
      pnr: booking.booking_code,
      amount,
      addInfo,
      bank: {
        id: account.id,
        name: account.bank_name,
        bin: effectiveBin,
        accountNumber: account.account_number,
        accountHolder: account.account_holder,
        logoUrl: account.logo_url || null,
      },
    });
  } catch (error) {
    console.error('VietQR API Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: getApiErrorMessage(error, 'Lỗi hệ thống') },
      { status: 500 }
    );
  }
}
