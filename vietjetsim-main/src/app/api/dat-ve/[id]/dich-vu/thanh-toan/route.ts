import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthRequest } from '@/lib/auth';
import { isAdminRole } from '@/lib/rbac';
import {
  getBookingByCodeOrId,
  getBookingBaggage,
  getBookingAncillaries,
  getPendingBaggageAmount,
  getPendingAncillaryAmount,
  markBookingBaggagePaid,
  markBookingAncillariesPaid,
  createPayment,
  addBookingExtraCharge,
  recalcBookingTotal,
  spendWalletBalance,
} from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { isGuestBookingOwner } from '@/lib/guest-booking';

/**
 * Xử lý thanh toán cho các dịch vụ bổ sung và hành lý ký gửi mua sau khi đặt vé.
 *
 * Số tiền do SERVER tính (`getPendingBaggageAmount` + `getPendingAncillaryAmount`),
 * client không gửi amount. Trừ tiền qua `spendWalletBalance` (idempotent),
 * đánh dấu hành lý đã trả qua `markBookingBaggagePaid` (idempotent), rồi cộng
 * phí vào tổng tiền đặt chỗ qua `addBookingExtraCharge`.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const limited = rateLimit(request, { windowMs: 60_000, maxRequests: 15 });
    if (limited) return limited;

    const { user, error, response } = await verifyAuthRequest(request);
    if (error === 'CSRF validation failed') return response!;

    const { id } = await params;
    const booking = await getBookingByCodeOrId(id);
    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    const canViewFullBooking =
      !!user && (isAdminRole(user.role) || booking.user_id === user.userId);
    const lookedUpByPnr = booking.booking_code?.toUpperCase() === id.toUpperCase();
    if (!canViewFullBooking && !lookedUpByPnr && !isGuestBookingOwner(request, booking.id)) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Không có quyền thực hiện giao dịch này.' },
        { status: 403 }
      );
    }

    if (booking.status === 'cancelled' || booking.status === 'refunded') {
      return NextResponse.json(
        { error: 'Booking not eligible', message: 'Đặt chỗ đã bị hủy hoặc hoàn tiền.' },
        { status: 409 }
      );
    }

    const pendingBaggage = await getPendingBaggageAmount(booking.id);
    const pendingAncillaries = await getPendingAncillaryAmount(booking.id);
    const amount = pendingBaggage + pendingAncillaries;

    if (amount <= 0) {
      return NextResponse.json(
        { error: 'No pending charges', message: 'Không có khoản phí dịch vụ nào cần thanh toán.' },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const method = String(body.method || 'vietqr').toLowerCase();

    // Trừ tiền ví qua spendWalletBalance (idempotent, không nhận amount từ client).
    // Không đủ số dư ⇒ 402, lỗi khác ⇒ 400. Khách vãng lai (guest/PNR) không có
    // ví — bỏ qua bước trừ, payment record vẫn là bằng chứng đã thu.
    if (user) {
      try {
        await spendWalletBalance(
          user.userId,
          amount,
          `DV_${booking.booking_code || booking.id.slice(0, 6)}_${Date.now()}`,
          `Thanh toán dịch vụ bổ sung đặt chỗ ${booking.booking_code || booking.id}`
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : '';
        const insufficient =
          message.includes('không đủ') ||
          message.includes('Số dư') ||
          message.includes('insufficient');
        return NextResponse.json(
          { error: 'Insufficient balance', message: 'Số dư ví không đủ.' },
          { status: insufficient ? 402 : 400 }
        );
      }
    }

    // Tạo bản ghi thanh toán dịch vụ bổ sung
    const payment = await createPayment({
      booking_id: booking.id,
      method,
      amount,
      transfer_note: `DV_${booking.booking_code || booking.id.slice(0, 6)}_${Date.now()}`,
    });

    // Đánh dấu cả hành lý lẫn dịch vụ bổ sung đã thu — idempotent: chỉ lật
    // dòng 'pending', lần gọi thứ hai markedCount = 0, không cộng tiền lại.
    const markedBaggage = await markBookingBaggagePaid(booking.id, payment.id);
    const markedAncillaries = await markBookingAncillariesPaid(booking.id, payment.id);
    if (markedBaggage + markedAncillaries > 0) {
      await addBookingExtraCharge(booking.id, amount);
      await recalcBookingTotal(booking.id);
    }

    return NextResponse.json({
      success: true,
      message: 'Thanh toán dịch vụ bổ sung thành công!',
      paymentId: payment.id,
      amount,
      method,
      paidAt: payment.created_at,
    });
  } catch (error) {
    console.error('Error processing ancillary payment:', error);
    return NextResponse.json(
      { error: 'Payment failed', message: 'Không thể xử lý thanh toán.' },
      { status: 500 }
    );
  }
}

/** Danh sách dịch vụ khách đã mua thêm. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const booking = await getBookingByCodeOrId(id);
    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    const baggage = await getBookingBaggage(booking.id);
    const pendingBaggage = await getPendingBaggageAmount(booking.id);
    const ancillaries = await getBookingAncillaries(booking.id);
    const pendingAncillaries = await getPendingAncillaryAmount(booking.id);
    const pendingAmount = pendingBaggage + pendingAncillaries;

    return NextResponse.json({ baggage, pendingAmount, ancillaries });
  } catch (error) {
    console.error('Error fetching baggage:', error);
    return NextResponse.json({ error: 'Failed to fetch baggage' }, { status: 500 });
  }
}
