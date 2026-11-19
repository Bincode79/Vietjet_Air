import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthRequest } from '@/lib/auth';
import { isAdminRole } from '@/lib/rbac';
import { rateLimit } from '@/lib/rate-limit';
import { canAccessBooking } from '@/lib/booking-access';
import {
  getBookingByCodeOrId,
  setBookingHold,
  clearBookingHold,
  expireStaleBookingHolds,
} from '@/lib/db';
import { MOVI_HOLD_MINUTES } from '@/lib/movi';

/**
 * Giữ mã đặt chỗ cho phương thức "mua trước trả sau" (MOVI).
 *
 * Vì sao cần một endpoint riêng:
 *
 *   - Thời gian giữ chỗ phải do SERVER quyết định. Nếu client tự đếm 30
 *     phút rồi tự huỷ, thì một khách đóng tab hoặc chỉnh ngày giờ máy
 *     vẫn giữ được vé mãi — "tự hủy sau 30 phút" mà không có mốc thời gian
 *     ở server thì không phải là quy tắc, chỉ là hiệu ứng.
 *   - `bookings.hold_expires_at` (migration 055) là mốc thời gian đó. Mỗi
 *     lần khách chọn MOVI, endpoint này gia hạn lượt giữ chỗ còn 30 phút.
 *   - Khi đồng hồ đếm về 0, client gọi lại endpoint với `action: 'expire'`
 *     để server hủy booking ngay — thay vì chờ một request khác chạm vào
 *     nó. Endpoint này cũng quét toàn bộ các lượt giữ chỗ đã hết hạn, nên
 *     "tự hủy" không phụ thuộc vào việc khách còn mở trang.
 *
 * Luật sở hữu dùng chung với mọi route booking-scoped khác
 * (`canAccessBooking`): cookie khách vãng lai, PNR, hoặc đúng chủ đặt chỗ.
 */

const HOLD_METHOD = 'movi';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const limited = rateLimit(request, { windowMs: 60_000, maxRequests: 60 });
    if (limited) return limited;

    const { user, error, response } = await verifyAuthRequest(request);
    if (error === 'CSRF validation failed') return response!;

    const { id } = await params;

    let action = 'hold';
    try {
      const body = await request.json();
      if (body && typeof body.action === 'string') action = body.action.trim();
    } catch {
      // Body rỗng ⇒ mặc định là đặt/gia hạn lượt giữ chỗ.
    }

    if (action !== 'hold' && action !== 'expire') {
      return NextResponse.json(
        { error: 'Invalid action', message: 'Hành động không hợp lệ (hold hoặc expire).' },
        { status: 400 }
      );
    }

    const booking = await getBookingByCodeOrId(id);
    if (!booking) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Không tìm thấy thông tin đặt chỗ.' },
        { status: 404 }
      );
    }

    if (!canAccessBooking(request, booking, user, id)) {
      return NextResponse.json(
        {
          error: 'Forbidden',
          message: 'Bạn không có quyền giữ chỗ cho đặt chỗ này.',
        },
        { status: 403 }
      );
    }

    // Quét trước: một lượt giữ chỗ đã quá hạn phải bị hủy TRƯỚC khi ta trả
    // lời về trạng thái hiện tại — nếu không, client nhận "còn 30 phút" cho
    // một booking vừa bị hủy.
    const expiredIds = await expireStaleBookingHolds().catch((err) => {
      console.error('[MOVI][HOLD] Sweep failed:', err);
      return [] as string[];
    });

    if (action === 'expire') {
      const expired = expiredIds.includes(booking.id);
      const current = await getBookingByCodeOrId(id);
      return NextResponse.json({
        success: true,
        expired,
        booking_status: current?.status ?? booking.status,
        hold: current?.hold_expires_at
          ? {
              method: current.hold_method ?? HOLD_METHOD,
              expiresAt: current.hold_expires_at,
              minutes: MOVI_HOLD_MINUTES,
            }
          : null,
      });
    }

    // `action: 'hold'` — chỉ booking `pending` mới giữ chỗ được. Một booking
    // đã xác nhận thì vé đã bán; một booking đã hủy thì không "hồi sinh".
    if (booking.status !== 'pending') {
      return NextResponse.json(
        {
          error: 'Booking not reservable',
          message:
            booking.status === 'cancelled' || booking.status === 'refunded'
              ? 'Đặt chỗ này đã bị hủy, không thể giữ chỗ.'
              : 'Đặt chỗ này đã được thanh toán.',
          booking_status: booking.status,
        },
        { status: 409 }
      );
    }

    const expiresAt = new Date(Date.now() + MOVI_HOLD_MINUTES * 60 * 1000);
    const hold = await setBookingHold(booking.id, HOLD_METHOD, expiresAt);

    if (!hold) {
      return NextResponse.json(
        {
          error: 'Booking not reservable',
          message: 'Không thể giữ chỗ cho đặt chỗ này.',
          booking_status: booking.status,
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      success: true,
      booking_status: booking.status,
      hold: {
        method: hold.method ?? HOLD_METHOD,
        expiresAt: hold.expiresAt ?? expiresAt.toISOString(),
        minutes: MOVI_HOLD_MINUTES,
      },
    });
  } catch (err) {
    console.error('[MOVI][HOLD] Failed to update the reservation hold:', err);
    return NextResponse.json(
      { error: 'Internal server error', message: 'Không thể giữ chỗ. Vui lòng thử lại.' },
      { status: 500 }
    );
  }
}

/** Xoá lượt giữ chỗ (khách đổi sang phương thức thanh toán khác). */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const limited = rateLimit(request, { windowMs: 60_000, maxRequests: 60 });
    if (limited) return limited;

    const { user, error, response } = await verifyAuthRequest(request);
    if (error === 'CSRF validation failed') return response!;

    const { id } = await params;
    const booking = await getBookingByCodeOrId(id);
    if (!booking) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Không tìm thấy thông tin đặt chỗ.' },
        { status: 404 }
      );
    }

    if (!canAccessBooking(request, booking, user, id)) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Bạn không có quyền thay đổi đặt chỗ này.' },
        { status: 403 }
      );
    }

    await clearBookingHold(booking.id);

    return NextResponse.json({ success: true, hold: null });
  } catch (err) {
    console.error('[MOVI][HOLD] Failed to clear the reservation hold:', err);
    return NextResponse.json(
      { error: 'Internal server error', message: 'Không thể huỷ giữ chỗ. Vui lòng thử lại.' },
      { status: 500 }
    );
  }
}

/** Trạng thái lượt giữ chỗ hiện tại (mốc thời gian do server quyết định). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user } = await verifyAuthRequest(request);
    const { id } = await params;

    const booking = await getBookingByCodeOrId(id);
    if (!booking) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Không tìm thấy thông tin đặt chỗ.' },
        { status: 404 }
      );
    }

    const allowed =
      isAdminRole(user?.role) ||
      canAccessBooking(request, booking, user, id) ||
      booking.booking_code?.toUpperCase() === id.toUpperCase();
    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({
      booking_status: booking.status,
      hold: booking.hold_expires_at
        ? {
            method: booking.hold_method ?? HOLD_METHOD,
            expiresAt: booking.hold_expires_at,
            minutes: MOVI_HOLD_MINUTES,
          }
        : null,
    });
  } catch (err) {
    console.error('[MOVI][HOLD] Failed to read the reservation hold:', err);
    return NextResponse.json(
      { error: 'Internal server error', message: 'Không thể đọc trạng thái giữ chỗ.' },
      { status: 500 }
    );
  }
}
