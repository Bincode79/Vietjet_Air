import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { verifyAdminRequest } from '@/lib/admin-auth';
import {
  getAllBookings,
  updateBookingStatus,
  getFlightById,
  createBooking,
  createUser,
  findUserByEmail,
  writeAuditLog,
} from '@/lib/db';
import { parsePaginationParams } from '@/lib/pagination';
import { sendAutomaticPaymentInvoiceEmail } from '@/lib/payment-invoice';
import { sql } from '@/lib/neon';
import { hashPassword } from '@/lib/auth';
import {
  FARE_CLASSES,
  FARE_RATE_BY_TYPE,
  TAX_AND_FEE_RATE,
  getFareForClass,
  getSeatCharge,
  type FareClassId,
} from '@/features/bookings/pricing';

// ─── GET: Get all bookings (admin) ──────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const {
      payload: _payload,
      error,
      response,
    } = await verifyAdminRequest(request, 'booking:list');
    if (error) return response;

    const { searchParams } = new URL(request.url);
    const { page, limit } = parsePaginationParams(searchParams);
    const status = searchParams.get('status') || undefined;
    const search = searchParams.get('search') || undefined;
    const userId = searchParams.get('user_id') || undefined;

    const { bookings, total } = await getAllBookings({ page, limit, status, search, userId });

    return NextResponse.json({
      bookings,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching admin bookings:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to fetch bookings' },
      { status: 500 }
    );
  }
}

// ─── PATCH: Update booking status ───────────────────────────────────────────

export async function PATCH(request: NextRequest) {
  try {
    const {
      payload: _payload,
      error,
      response,
    } = await verifyAdminRequest(request, 'booking:status_change');
    if (error) return response;

    const body = await request.json();
    const { bookingId, status } = body;

    if (!bookingId || !status) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'bookingId and status are required' },
        { status: 400 }
      );
    }

    const validStatuses = ['pending', 'confirmed', 'completed', 'cancelled', 'refunded'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        {
          error: 'Bad Request',
          message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
        },
        { status: 400 }
      );
    }

    const result = await updateBookingStatus(bookingId, status);

    if (!result) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Booking not found' },
        { status: 404 }
      );
    }

    // Tự động gửi email hoá đơn & vé điện tử khi đơn vé được chuyển sang Confirmed
    if (status === 'confirmed') {
      await sendAutomaticPaymentInvoiceEmail(bookingId).catch((err) => {
        console.error('Failed to auto-send payment invoice email:', err);
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Booking status updated successfully',
      bookingId,
      status,
    });
  } catch (error: unknown) {
    console.error('Error updating booking status:', error instanceof Error ? error.message : error);
    // Distinguish between DB errors and unexpected errors
    const status = error instanceof Error && error.message?.includes('violates') ? 409 : 500;
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Failed to update booking status',
      },
      { status }
    );
  }
}

// ─── POST: Create quick booking (admin) ────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const {
      payload: adminUser,
      error,
      response,
    } = await verifyAdminRequest(request, 'booking:create');
    if (error) return response;

    const body = await request.json().catch(() => ({}));
    const {
      flight_id,
      return_flight_id,
      passengers,
      contact,
      fare_class = 'eco',
      return_fare_class,
      seats,
      return_seats,
      custom_price,
      status = 'confirmed',
      payment_method = 'cash',
      note,
      send_email = true,
    } = body;

    if (!flight_id) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Mã chuyến bay đi (flight_id) là bắt buộc.' },
        { status: 400 }
      );
    }

    if (!passengers || !Array.isArray(passengers) || passengers.length === 0) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Danh sách hành khách (passengers) không được để trống.' },
        { status: 400 }
      );
    }

    // Kiểm tra họ tên từng hành khách
    for (let i = 0; i < passengers.length; i++) {
      const p = passengers[i];
      if (!p?.name || typeof p.name !== 'string' || !p.name.trim()) {
        return NextResponse.json(
          { error: 'Bad Request', message: `Hành khách số ${i + 1} thiếu họ tên.` },
          { status: 400 }
        );
      }
    }

    const flight = await getFlightById(flight_id);
    if (!flight) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Không tìm thấy chuyến bay đi trong hệ thống.' },
        { status: 404 }
      );
    }

    let returnFlight = null;
    if (return_flight_id) {
      returnFlight = await getFlightById(return_flight_id);
      if (!returnFlight) {
        return NextResponse.json(
          { error: 'Not Found', message: 'Không tìm thấy chuyến bay về trong hệ thống.' },
          { status: 404 }
        );
      }
    }

    const counts = { adult: 0, child: 0, infant: 0 };
    const normalizedPassengers = passengers.map((p) => {
      const type = String(p.passenger_type || 'adult').toLowerCase();
      const validPType = type === 'child' || type === 'infant' ? type : 'adult';
      counts[validPType] += 1;
      return {
        name: String(p.name).trim(),
        dob: p.dob ? String(p.dob) : null,
        id_number: p.id_number ? String(p.id_number).trim() : null,
        gender: p.gender === 'female' ? 'female' : 'male',
        country_code: p.country_code ? String(p.country_code) : 'VN',
        phone: p.phone ? String(p.phone).trim() : null,
        email: p.email ? String(p.email).trim().toLowerCase() : null,
        residence: p.residence ? String(p.residence) : null,
        skyjoy_member_id: p.skyjoy_member_id ? String(p.skyjoy_member_id) : null,
        passenger_type: validPType,
        seat_number: p.seat_number ? String(p.seat_number).trim().toUpperCase() : null,
      };
    });

    const seatedCount = counts.adult + counts.child;
    const requiredSeats = seatedCount > 0 ? seatedCount : 1;

    if (flight.available < requiredSeats) {
      return NextResponse.json(
        { error: 'Flight fully booked', message: 'Chuyến bay đi đã hết ghế trống.' },
        { status: 409 }
      );
    }

    if (returnFlight && returnFlight.available < requiredSeats) {
      return NextResponse.json(
        { error: 'Return flight fully booked', message: 'Chuyến bay chiều về đã hết ghế trống.' },
        { status: 409 }
      );
    }

    // ─── Xác định hoặc tạo tài khoản khách hàng ──────────────────────────
    const primaryAdult =
      normalizedPassengers.find(
        (p) => p.passenger_type === 'adult' && p.email && p.email.includes('@')
      ) || normalizedPassengers[0];

    const contactEmail = (contact?.email || primaryAdult?.email || '').trim().toLowerCase();
    const contactPhone = (contact?.phone || primaryAdult?.phone || '').trim();
    const contactName = (contact?.name || primaryAdult?.name || 'Khách hàng').trim();

    let userRecord: { id: string; email?: string; full_name?: string } | null = null;
    if (contactEmail && contactEmail.includes('@')) {
      userRecord = await findUserByEmail(contactEmail);
    }

    if (!userRecord && contactPhone) {
      try {
        const phoneUsers = (await sql`
          SELECT id, email, full_name FROM user_profiles WHERE phone = ${contactPhone} LIMIT 1
        `) as Array<{ id: string; email?: string; full_name?: string }>;
        if (phoneUsers && phoneUsers.length > 0) {
          userRecord = phoneUsers[0];
        }
      } catch {
        // Fallback
      }
    }

    if (!userRecord) {
      const guestEmail =
        contactEmail && contactEmail.includes('@')
          ? contactEmail
          : `${contactPhone ? contactPhone.replace(/[^0-9]/g, '') : Date.now()}@khach.vietjetsim.vn`;
      const passwordHash = await hashPassword(randomUUID());
      try {
        userRecord = await createUser(
          guestEmail,
          passwordHash,
          contactName,
          'user',
          contactPhone && contactPhone.length >= 9 ? contactPhone : null
        );
      } catch {
        // Fallback unique collision
        userRecord = await createUser(
          `${Date.now()}_${Math.random().toString(36).substring(2, 7)}@khach.vietjetsim.vn`,
          passwordHash,
          contactName,
          'user',
          null
        );
      }
    }

    // ─── Tính giá vé ─────────────────────────────────────────────────────
    let totalPrice = 0;
    if (typeof custom_price === 'number' && custom_price > 0) {
      totalPrice = Math.round(custom_price);
    } else {
      const selectedFareClass = FARE_CLASSES.includes(fare_class as FareClassId)
        ? (fare_class as FareClassId)
        : 'eco';
      const farePerPassenger = getFareForClass(selectedFareClass, {
        economyPrice: flight.economy_price,
        businessPrice: flight.business_price,
      });
      const taxableFare =
        farePerPassenger * (counts.adult + counts.child * FARE_RATE_BY_TYPE.child);

      const seatRows = (seats || [])
        .concat(normalizedPassengers.map((p) => p.seat_number).filter(Boolean))
        .filter((s: string, idx: number, arr: string[]) => arr.indexOf(s) === idx)
        .map((s: string) => ({ seat_number: s, price: getSeatCharge(s) }));
      const seatFee = seatRows.reduce((sum: number, s: { price: number }) => sum + s.price, 0);

      const outboundTotal = Math.round(
        taxableFare +
          farePerPassenger * counts.infant * FARE_RATE_BY_TYPE.infant +
          taxableFare * TAX_AND_FEE_RATE +
          seatFee
      );

      let returnTotal = 0;
      if (returnFlight) {
        const retFareClass = FARE_CLASSES.includes(return_fare_class as FareClassId)
          ? (return_fare_class as FareClassId)
          : selectedFareClass;
        const retFarePerPassenger = getFareForClass(retFareClass, {
          economyPrice: returnFlight.economy_price,
          businessPrice: returnFlight.business_price,
        });
        const retTaxableFare =
          retFarePerPassenger * (counts.adult + counts.child * FARE_RATE_BY_TYPE.child);
        const retSeatRows = (return_seats || []).map((s: string) => ({
          seat_number: s,
          price: getSeatCharge(s),
        }));
        const retSeatFee = retSeatRows.reduce(
          (sum: number, s: { price: number }) => sum + s.price,
          0
        );
        returnTotal = Math.round(
          retTaxableFare +
            retFarePerPassenger * counts.infant * FARE_RATE_BY_TYPE.infant +
            retTaxableFare * TAX_AND_FEE_RATE +
            retSeatFee
        );
      }

      totalPrice = outboundTotal + returnTotal;
    }

    // ─── Tạo bản ghi đặt vé ──────────────────────────────────────────────
    const tripId = randomUUID();
    const outboundSeats = (seats || [])
      .concat(normalizedPassengers.map((p) => p.seat_number).filter(Boolean))
      .filter((s: string, idx: number, arr: string[]) => arr.indexOf(s) === idx)
      .map((s: string) => ({ seat_number: s, price: getSeatCharge(s) }));

    const booking = await createBooking(
      {
        user_id: userRecord.id,
        flight_id,
        total_price: totalPrice,
        seatedCount: requiredSeats,
        trip_id: tripId,
        leg_role: 'outbound',
      },
      normalizedPassengers,
      outboundSeats,
      [],
      {
        marketing: false,
        survey: false,
        retainForFutureBooking: true,
        policyAccepted: true,
      }
    );

    if (!booking) {
      return NextResponse.json(
        { error: 'Flight fully booked', message: 'Không thể tạo đặt vé do chuyến bay đã hết chỗ.' },
        { status: 409 }
      );
    }

    let returnBooking = null;
    if (return_flight_id) {
      const inboundSeats = (return_seats || []).map((s: string) => ({
        seat_number: s,
        price: getSeatCharge(s),
      }));
      returnBooking = await createBooking(
        {
          user_id: userRecord.id,
          flight_id: return_flight_id,
          total_price: 0,
          seatedCount: requiredSeats,
          trip_id: tripId,
          leg_role: 'inbound',
        },
        normalizedPassengers,
        inboundSeats,
        [],
        {
          marketing: false,
          survey: false,
          retainForFutureBooking: true,
          policyAccepted: true,
        }
      );
    }

    const finalStatus = status === 'confirmed' ? 'confirmed' : 'pending';
    const payMethod = payment_method || 'cash';

    if (finalStatus === 'confirmed') {
      await sql`
        INSERT INTO payments (booking_id, amount, method, status, transfer_note, created_at)
        VALUES (${booking.id}, ${totalPrice}, ${payMethod}, 'completed', ${note || 'Admin đặt vé nhanh'}, NOW())
      `;
      await sql`
        UPDATE bookings
        SET status = 'confirmed', updated_at = NOW()
        WHERE id = ${booking.id}
      `;
      if (returnBooking) {
        await sql`
          UPDATE bookings
          SET status = 'confirmed', updated_at = NOW()
          WHERE id = ${returnBooking.id}
        `;
      }

      if (
        send_email &&
        contactEmail &&
        contactEmail.includes('@') &&
        !contactEmail.includes('@khach.vietjetsim.vn')
      ) {
        sendAutomaticPaymentInvoiceEmail(booking.id, {
          paymentMethod: payMethod,
          customAmount: totalPrice,
          skipIdempotency: true,
          force: true,
        }).catch((err) => {
          console.error('Failed to auto-send payment invoice email in admin quick booking:', err);
        });
      }
    } else {
      if (note) {
        await sql`
          UPDATE bookings
          SET transfer_note = ${note}, updated_at = NOW()
          WHERE id = ${booking.id}
        `;
      }
    }

    // Ghi audit log
    void writeAuditLog({
      adminId: adminUser.userId,
      adminEmail: adminUser.email,
      action: 'booking:create',
      targetType: 'booking',
      targetId: booking.id,
      detailsJson: JSON.stringify({
        bookingCode: booking.booking_code,
        flightId: flight_id,
        returnFlightId: return_flight_id || null,
        totalPrice,
        status: finalStatus,
        paymentMethod: payMethod,
        passengerCount: normalizedPassengers.length,
        note: note || null,
      }),
      status: 'success',
    });

    return NextResponse.json({
      success: true,
      message: 'Đặt vé nhanh thành công',
      booking: {
        id: booking.id,
        booking_code: booking.booking_code,
        total_price: totalPrice,
        status: finalStatus,
        trip_id: tripId,
        flight_id,
        return_booking_id: returnBooking?.id,
        return_booking_code: returnBooking?.booking_code,
        flight_no: flight.flight_no,
        from_code: flight.from_code,
        to_code: flight.to_code,
        date: flight.depart_time,
        user_name: contactName,
        user_email: contactEmail || undefined,
        payment_method: payMethod,
      },
    });
  } catch (error: unknown) {
    console.error('Error creating admin quick booking:', error);
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Đặt vé nhanh thất bại',
      },
      { status: 500 }
    );
  }
}
