import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/admin-auth';
import {
  getBookingById,
  addBookingBaggage,
  getBookingBaggage,
  getPendingBaggageAmount,
  markBookingBaggagePaid,
  upsertBookingAncillary,
  getBookingAncillaries,
  getPendingAncillaryAmount,
  markBookingAncillariesPaid,
  addBookingExtraCharge,
  writeAuditLog,
} from '@/lib/db';
import { sql } from '@/lib/neon';
import {
  BAGGAGE_CATALOG,
  getMealPrice,
  TRAVEL_SAFE_INSURANCE_PRICE,
  getAncillaryPrice,
} from '@/features/bookings/pricing';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await verifyAdminRequest(request, 'booking:view');
    if (authResult.error || authResult.response) return authResult.response!;

    const { id: bookingId } = await params;
    if (!bookingId) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Mã đặt chỗ (ID) là bắt buộc.' },
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

    const baggage = await getBookingBaggage(booking.id);
    const ancillaries = await getBookingAncillaries(booking.id);
    const pendingBaggage = await getPendingBaggageAmount(booking.id);
    const pendingAncillaries = await getPendingAncillaryAmount(booking.id);

    return NextResponse.json({
      success: true,
      booking: {
        id: booking.id,
        booking_code: booking.booking_code,
        flight_id: booking.flight_id,
        flight_no: booking.flight?.flight_no,
        total_price: booking.total_price,
        status: booking.status,
        operator_notes: booking.operator_notes,
      },
      baggage,
      ancillaries,
      pendingAmount: pendingBaggage + pendingAncillaries,
    });
  } catch (error) {
    console.error('Error fetching admin booking ancillaries:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Không thể tải danh sách dịch vụ của đơn vé.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await verifyAdminRequest(request, 'booking:edit');
    if (authResult.error || authResult.response) return authResult.response!;

    const { id: bookingId } = await params;
    if (!bookingId) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Mã đặt chỗ (ID) là bắt buộc.' },
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
          message: 'Không thể thêm dịch vụ cho đơn đặt chỗ đã huỷ hoặc hoàn tiền.',
        },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { baggagePackageId, mealId, hasInsurance, hasTaxi, isPaidNow = true, notes } = body;

    let extraTotal = 0;
    const addedItems: Array<{ type: string; id: string; price: number }> = [];

    // 1. Hành lý ký gửi
    if (baggagePackageId) {
      const pkg = BAGGAGE_CATALOG.find((item) => item.id === String(baggagePackageId).trim());
      if (!pkg) {
        return NextResponse.json(
          { error: 'Invalid package', message: 'Gói hành lý không hợp lệ trong catalogue.' },
          { status: 400 }
        );
      }
      const unitPrice = pkg.price;
      extraTotal += unitPrice;
      await addBookingBaggage({
        bookingId: booking.id,
        packageId: pkg.id,
        weightKg: pkg.weight,
        unitPrice,
        quantity: 1,
        status: isPaidNow ? 'paid' : 'pending',
      });
      if (isPaidNow) {
        await markBookingBaggagePaid(booking.id);
      }
      addedItems.push({ type: 'baggage', id: pkg.id, price: unitPrice });
    }

    // 2. Suất ăn nóng Jet Café
    if (mealId) {
      const mealPrice = getMealPrice(String(mealId)) ?? 119000;
      extraTotal += mealPrice;
      await upsertBookingAncillary(booking.id, 'meal', mealPrice, 1);
      if (isPaidNow) {
        await markBookingAncillariesPaid(booking.id, 'ADMIN_MANUAL');
      }
      addedItems.push({ type: 'meal', id: String(mealId), price: mealPrice });
    }

    // 3. Bảo hiểm Travel Safe
    if (hasInsurance) {
      const insurancePrice = TRAVEL_SAFE_INSURANCE_PRICE;
      extraTotal += insurancePrice;
      await upsertBookingAncillary(booking.id, 'insurance', insurancePrice, 1);
      if (isPaidNow) {
        await markBookingAncillariesPaid(booking.id, 'ADMIN_MANUAL');
      }
      addedItems.push({ type: 'insurance', id: 'insurance', price: insurancePrice });
    }

    // 4. Taxi sân bay
    if (hasTaxi) {
      const taxiPrice = getAncillaryPrice('taxi') || 150000;
      extraTotal += taxiPrice;
      await upsertBookingAncillary(booking.id, 'taxi', taxiPrice, 1);
      if (isPaidNow) {
        await markBookingAncillariesPaid(booking.id, 'ADMIN_MANUAL');
      }
      addedItems.push({ type: 'taxi', id: 'taxi', price: taxiPrice });
    }

    if (addedItems.length === 0) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Vui lòng chọn ít nhất một dịch vụ bổ sung để thêm.' },
        { status: 400 }
      );
    }

    // Nếu đã thanh toán trực tiếp tại quầy / tổng đài, cộng thẳng vào tổng tiền vé
    if (isPaidNow && extraTotal > 0) {
      await addBookingExtraCharge(booking.id, extraTotal);
    }

    // Ghi chú operator nếu có
    if (notes || extraTotal > 0) {
      const itemSummaries = addedItems
        .map((i) => `${i.type} (${i.price.toLocaleString('vi-VN')}₫)`)
        .join(', ');
      const noteEntry = `[${new Date().toISOString()}] Admin thêm dịch vụ: ${itemSummaries}.${notes ? ` Ghi chú: ${notes}` : ''}`;
      const newNotes = booking.operator_notes
        ? `${booking.operator_notes}\n${noteEntry}`
        : noteEntry;
      await sql`
        UPDATE bookings
        SET operator_notes = ${newNotes}
        WHERE id = ${booking.id}
      `;
    }

    // Audit Log
    await writeAuditLog({
      adminId: authResult.payload.userId,
      adminEmail: authResult.payload.email,
      action: 'booking:add_ancillary',
      targetId: booking.id,
      targetType: 'booking',
      detailsJson: JSON.stringify({
        action: 'booking:add_ancillary',
        bookingId: booking.id,
        bookingCode: booking.booking_code,
        addedItems,
        extraTotal,
        isPaidNow,
        notes: notes ?? null,
      }),
      status: 'success',
    });

    return NextResponse.json({
      success: true,
      message: `Bổ sung dịch vụ thành công! Đã thêm ${addedItems.length} dịch vụ với tổng phí ${extraTotal.toLocaleString('vi-VN')}₫.`,
      extraTotal,
      isPaidNow,
      addedItems,
    });
  } catch (error) {
    console.error('Error adding admin booking ancillaries:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Không thể thêm dịch vụ cho đơn đặt chỗ.' },
      { status: 500 }
    );
  }
}
