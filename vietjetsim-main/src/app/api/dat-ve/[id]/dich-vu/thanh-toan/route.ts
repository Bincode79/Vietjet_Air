import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthRequest } from '@/lib/auth';
import { isAdminRole } from '@/lib/rbac';
import {
  getBookingByCodeOrId,
  getPendingBaggageAmount,
  getPendingAncillaryAmount,
  markBaggagePaid,
  createPayment,
  addBookingExtraCharge,
  recalcBookingTotal,
} from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { isGuestBookingOwner } from '@/lib/guest-booking';

/**
 * Xử lý thanh toán cho các dịch vụ bổ sung và hành lý ký gửi mua sau khi đặt vé.
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
    const totalDue = pendingBaggage + pendingAncillaries;

    if (totalDue <= 0) {
      return NextResponse.json(
        { error: 'No pending charges', message: 'Không có khoản phí dịch vụ nào cần thanh toán.' },
        { status: 400 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const method = String(body.method || 'vietqr').toLowerCase();

    // Tạo bản ghi thanh toán dịch vụ bổ sung
    const payment = await createPayment({
      booking_id: booking.id,
      method,
      amount: totalDue,
      transfer_note: `DV_${booking.booking_code || booking.id.slice(0, 6)}_${Date.now()}`,
    });

    // Cập nhật trạng thái hành lý ký gửi
    if (pendingBaggage > 0) {
      await markBaggagePaid(booking.id, payment.id);
    }

    // Cộng khoản phụ phí vào tổng tiền đặt chỗ và đồng bộ
    await addBookingExtraCharge(booking.id, totalDue);
    await recalcBookingTotal(booking.id);

    return NextResponse.json({
      success: true,
      message: 'Thanh toán dịch vụ bổ sung thành công!',
      paymentId: payment.id,
      amount: totalDue,
      method,
      paidAt: payment.created_at,
    });
  } catch (error) {
    console.error('Error processing ancillary payment:', error);
    return NextResponse.json({ error: 'Payment failed', message: 'Không thể xử lý thanh toán.' }, { status: 500 });
  }
}
