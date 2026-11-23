import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/admin-auth';
import { getBookingById, getFlightById, writeAuditLog } from '@/lib/db';
import { sql } from '@/lib/neon';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await verifyAdminRequest(request, 'booking:edit');
    if (authResult.error || authResult.response) return authResult.response!;

    const { id: bookingId } = await params;
    if (!bookingId) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Mã đặt vé (ID) là bắt buộc.' },
        { status: 400 }
      );
    }

    const booking = await getBookingById(bookingId);
    if (!booking) {
      return NextResponse.json(
        { error: 'Not Found', message: `Không tìm thấy đơn đặt vé với ID: ${bookingId}` },
        { status: 404 }
      );
    }

    if (booking.status === 'cancelled' || booking.status === 'refunded') {
      return NextResponse.json(
        {
          error: 'Bad Request',
          message: 'Không thể đổi chuyến bay cho đơn đặt vé đã bị huỷ hoặc hoàn tiền.',
        },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { newFlightId, seatNumber, passengerSeats, waiveFee, reason, customChangeFee } = body;

    if (!newFlightId) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Vui lòng chọn chuyến bay mới cần đổi sang.' },
        { status: 400 }
      );
    }

    if (newFlightId === booking.flight_id) {
      return NextResponse.json(
        {
          error: 'Bad Request',
          message: 'Chuyến bay mới trùng với chuyến bay hiện tại của đơn đặt vé.',
        },
        { status: 400 }
      );
    }

    const newFlight = await getFlightById(newFlightId);
    if (!newFlight) {
      return NextResponse.json(
        { error: 'Not Found', message: `Không tìm thấy chuyến bay mới với ID: ${newFlightId}` },
        { status: 404 }
      );
    }

    const passengerCount =
      booking.passengers && booking.passengers.length > 0 ? booking.passengers.length : 1;

    if (newFlight.available < passengerCount) {
      return NextResponse.json(
        {
          error: 'Flight full',
          message: `Chuyến bay mới ${newFlight.flight_no} không còn đủ ghế (còn ${newFlight.available} ghế, yêu cầu ${passengerCount} ghế).`,
        },
        { status: 409 }
      );
    }

    // ─── Tính toán phí chênh lệch và phí thay đổi ─────────────────────────────
    const oldPricePerPax = Number(booking.flight.price) || 0;
    const newPricePerPax = Number(newFlight.price) || 0;
    const fareDifferencePerPax = Math.max(0, newPricePerPax - oldPricePerPax);

    const bookingClass = (booking.flight.class || 'economy').toLowerCase();
    const isFeeFree =
      Boolean(waiveFee) ||
      bookingClass.includes('deluxe') ||
      bookingClass.includes('skyboss') ||
      bookingClass.includes('business');

    let changeFee = 0;
    if (!isFeeFree) {
      if (typeof customChangeFee === 'number' && customChangeFee >= 0) {
        changeFee = customChangeFee;
      } else {
        // Vietjet standard domestic rebooking fee: 350.000₫ per passenger
        changeFee = 350000 * passengerCount;
      }
    }

    const totalFareDifference = fareDifferencePerPax * passengerCount;
    const totalAdditionalAmount = totalFareDifference + changeFee;

    // ─── Cập nhật dữ liệu vào Neon PostgreSQL ───────────────────────────────
    const oldFlightId = booking.flight_id;
    const oldFlightNo = booking.flight.flight_no;
    const adminUser = authResult.payload?.email || authResult.payload?.userId || 'admin';
    const logTimestamp = new Date().toLocaleString('vi-VN');

    const logEntry = `\n[${logTimestamp}] Đổi chuyến bay bởi ${adminUser}: Từ ${oldFlightNo} sang ${newFlight.flight_no}. Lý do: ${reason || 'Khách yêu cầu'}. Thu thêm: ${totalAdditionalAmount.toLocaleString('vi-VN')}₫ (Chênh lệch vé: ${totalFareDifference.toLocaleString('vi-VN')}₫, Phí đổi: ${changeFee.toLocaleString('vi-VN')}₫).`;

    // 1. Nhả chỗ chuyến bay cũ
    await sql`
      UPDATE flights
      SET available = available + ${passengerCount}
      WHERE id = ${oldFlightId}
    `;

    // 2. Trừ chỗ chuyến bay mới
    await sql`
      UPDATE flights
      SET available = GREATEST(0, available - ${passengerCount})
      WHERE id = ${newFlightId}
    `;

    // 3. Xoá ghế đã gán trên chuyến bay cũ
    try {
      await sql`
        DELETE FROM seats
        WHERE booking_id = ${bookingId}
      `;
    } catch (seatErr) {
      console.warn('[REBOOK] Could not delete old seats:', seatErr);
    }

    // 4. Nếu có chọn ghế mới hoặc danh sách ghế mới
    if (seatNumber) {
      try {
        await sql`
          INSERT INTO seats (id, flight_id, booking_id, seat_number, status)
          VALUES (gen_random_uuid(), ${newFlightId}, ${bookingId}, ${seatNumber}, 'occupied')
          ON CONFLICT DO NOTHING
        `;
        if (booking.passengers && booking.passengers.length > 0) {
          const firstPax = booking.passengers[0];
          await sql`
            UPDATE passengers
            SET seat_number = ${seatNumber}
            WHERE id = ${firstPax.id}
          `;
        }
      } catch (insertSeatErr) {
        console.warn('[REBOOK] Could not insert new seat:', insertSeatErr);
      }
    } else if (passengerSeats && typeof passengerSeats === 'object') {
      for (const [paxId, sNum] of Object.entries(passengerSeats)) {
        if (sNum && typeof sNum === 'string') {
          try {
            await sql`
              INSERT INTO seats (id, flight_id, booking_id, seat_number, status)
              VALUES (gen_random_uuid(), ${newFlightId}, ${bookingId}, ${sNum}, 'occupied')
              ON CONFLICT DO NOTHING
            `;
            await sql`
              UPDATE passengers
              SET seat_number = ${sNum}
              WHERE id = ${paxId}
            `;
          } catch {
            // Ignore duplicate seat entry
          }
        }
      }
    }

    // 5. Cập nhật booking sang chuyến bay mới
    await sql`
      UPDATE bookings
      SET flight_id = ${newFlightId},
          total_price = total_price + ${totalAdditionalAmount},
          operator_notes = COALESCE(operator_notes, '') || ${logEntry},
          updated_at = NOW()
      WHERE id = ${bookingId}
    `;

    // 6. Ghi Audit Log hệ thống
    try {
      await writeAuditLog({
        adminId: authResult.payload?.userId || 'system',
        adminEmail: authResult.payload?.email || 'admin@vietjetsim.vn',
        action: 'booking:rebook',
        targetType: 'booking',
        targetId: bookingId,
        detailsJson: JSON.stringify({
          oldFlightId,
          oldFlightNo,
          newFlightId,
          newFlightNo: newFlight.flight_no,
          fareDifference: totalFareDifference,
          changeFee,
          totalAdditionalAmount,
          reason,
        }),
        status: 'success',
      });
    } catch (auditErr) {
      console.warn('[REBOOK] Failed to write audit log:', auditErr);
    }

    return NextResponse.json({
      success: true,
      message: `Đổi sang chuyến bay ${newFlight.flight_no} thành công!`,
      bookingId,
      oldFlight: {
        id: oldFlightId,
        flightNo: oldFlightNo,
      },
      newFlight: {
        id: newFlightId,
        flightNo: newFlight.flight_no,
        from: newFlight.from_code,
        to: newFlight.to_code,
        departTime: newFlight.depart_time,
        arriveTime: newFlight.arrive_time,
      },
      summary: {
        passengerCount,
        oldPricePerPax,
        newPricePerPax,
        totalFareDifference,
        changeFee,
        totalAdditionalAmount,
        waivedFee: isFeeFree,
      },
    });
  } catch (error) {
    console.error('[REBOOK-ERROR]', error);
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: 'Đã xảy ra lỗi trong quá trình đổi chuyến bay.',
      },
      { status: 500 }
    );
  }
}
