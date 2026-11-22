import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/admin-auth';
import { auditAdmin } from '@/lib/admin-audit';
import { createFlight } from '@/lib/db';
import { FLIGHT_NO_PATTERN, normalizeFlightNo } from '@/lib/flight-no';
import { isDuplicateFlightSchedule } from '@/lib/flight-bulk-price';
import { FARE_LADDER_RATIO } from '@/lib/flight-pricing-constants';

interface BatchFlightInput {
  flight_no?: string;
  from_code?: string;
  to_code?: string;
  depart_time?: string;
  arrive_time?: string;
  price?: number;
  economy_price?: number;
  business_price?: number;
  class?: string;
  available?: number;
  aircraft?: string | null;
}

export async function POST(request: NextRequest) {
  try {
    const { error, response, payload } = await verifyAdminRequest(request, 'flight:create');
    if (error) return response;

    const body = await request.json();
    const rawFlights: BatchFlightInput[] = Array.isArray(body?.flights) ? body.flights : [];

    if (rawFlights.length === 0) {
      return NextResponse.json(
        {
          error: 'Bad Request',
          message: 'Danh sách chuyến bay không được để trống (flights array is required).',
        },
        { status: 400 }
      );
    }

    if (rawFlights.length > 500) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Tối đa 500 chuyến bay mỗi lần nhập hàng loạt.' },
        { status: 400 }
      );
    }

    const created: unknown[] = [];
    const skipped: Array<{ flight_no: string; reason: string }> = [];

    for (let i = 0; i < rawFlights.length; i++) {
      const item = rawFlights[i];
      const flightNoRaw = item.flight_no ? String(item.flight_no).trim() : '';
      const fromCode = item.from_code ? String(item.from_code).trim().toUpperCase() : '';
      const toCode = item.to_code ? String(item.to_code).trim().toUpperCase() : '';
      const departTime = item.depart_time ? String(item.depart_time).trim() : '';
      const arriveTime = item.arrive_time ? String(item.arrive_time).trim() : '';

      if (!flightNoRaw || !fromCode || !toCode || !departTime || !arriveTime) {
        skipped.push({
          flight_no: flightNoRaw || `Dòng #${i + 1}`,
          reason: 'Thiếu thông tin bắt buộc (số hiệu, chặng bay, giờ bay)',
        });
        continue;
      }

      if (fromCode === toCode) {
        skipped.push({
          flight_no: flightNoRaw,
          reason: `Điểm đi và điểm đến trùng nhau (${fromCode})`,
        });
        continue;
      }

      const normalizedFlightNo = normalizeFlightNo(flightNoRaw);
      if (!FLIGHT_NO_PATTERN.test(normalizedFlightNo)) {
        skipped.push({
          flight_no: flightNoRaw,
          reason: `Số hiệu '${flightNoRaw}' không đúng định dạng (VD: VJ 120, VJ 3001)`,
        });
        continue;
      }

      const dTime = new Date(departTime);
      const aTime = new Date(arriveTime);
      if (isNaN(dTime.getTime()) || isNaN(aTime.getTime())) {
        skipped.push({
          flight_no: normalizedFlightNo,
          reason: 'Thời gian khởi hành hoặc hạ cánh không hợp lệ',
        });
        continue;
      }

      const ecoPrice = Number(item.economy_price ?? item.price ?? 499000);
      const bizPrice = Number(item.business_price ?? Math.round(ecoPrice * FARE_LADDER_RATIO));
      const seatClass = item.class === 'business' ? 'business' : 'economy';
      const price = seatClass === 'business' ? bizPrice : ecoPrice;
      const available = Number(item.available ?? 180);
      const aircraft = item.aircraft ? String(item.aircraft).trim() : 'A321';

      try {
        const flight = await createFlight({
          flight_no: normalizedFlightNo,
          from_code: fromCode,
          to_code: toCode,
          depart_time: departTime,
          arrive_time: arriveTime,
          price,
          economyPrice: ecoPrice,
          businessPrice: bizPrice,
          class: seatClass,
          available,
          aircraft,
        });
        created.push(flight);
      } catch (err) {
        const isDup =
          isDuplicateFlightSchedule(err) ||
          (typeof err === 'object' &&
            err !== null &&
            ((err as { code?: string }).code === '23505' ||
              String((err as { message?: string }).message || '')
                .toLowerCase()
                .includes('duplicate') ||
              String((err as { message?: string }).message || '')
                .toLowerCase()
                .includes('unique')));

        if (isDup) {
          skipped.push({
            flight_no: normalizedFlightNo,
            reason: `Trùng lịch bay: Chặng ${fromCode} → ${toCode} đã có chuyến bay lúc ${departTime}`,
          });
        } else {
          skipped.push({
            flight_no: normalizedFlightNo,
            reason: err instanceof Error ? err.message : 'Lỗi hệ thống khi lưu chuyến bay',
          });
        }
      }
    }

    if (created.length > 0) {
      await auditAdmin(request, payload, {
        action: 'flight:batch_create',
        targetType: 'flight',
        targetId: 'multiple',
        details: {
          totalRequested: rawFlights.length,
          createdCount: created.length,
          skippedCount: skipped.length,
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: `Đã tạo thành công ${created.length} chuyến bay${
        skipped.length > 0 ? ` (bỏ qua ${skipped.length} chuyến do trùng lịch hoặc lỗi)` : ''
      }.`,
      createdCount: created.length,
      skippedCount: skipped.length,
      flights: created,
      skipped,
    });
  } catch (error) {
    console.error('Error in batch flight creation:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
