import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/neon';
import { verifyAdminRequest } from '@/lib/admin-auth';
import { parsePaginationParams } from '@/lib/pagination';
import { writeAuditLog } from '@/lib/db';

type CheckinRow = {
  id: string;
  booking_id: string;
  booking_code: string | null;
  passenger_name: string;
  seat_number: string;
  check_in_number: string;
  boarding_pass_number: string | null;
  flight_no: string;
  from_code: string;
  to_code: string;
  depart_time: string;
  gate: string | null;
  terminal: string | null;
  status: string;
  check_in_time: string;
  user_email: string | null;
};

/**
 * GET /api/quan-tri/lam-thu-tuc — danh sách check-in cho admin.
 * Query: page, limit, search (PNR/tên khách/số hiệu chuyến), status.
 */
export async function GET(request: NextRequest) {
  try {
    const { error, response } = await verifyAdminRequest(request, 'checkin:list');
    if (error) return response;

    const { searchParams } = new URL(request.url);
    const { page, limit } = parsePaginationParams(searchParams);
    const offset = (page - 1) * limit;
    const status = searchParams.get('status') || undefined;
    const search = searchParams.get('search')?.trim();

    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (status && status !== 'all') {
      conditions.push(`ci.status = $${idx++}`);
      values.push(status);
    }
    if (search) {
      conditions.push(
        `(UPPER(b.booking_code) LIKE UPPER($${idx}) OR UPPER(ci.passenger_name) LIKE UPPER($${idx}) OR UPPER(ci.flight_no) LIKE UPPER($${idx}) OR UPPER(ci.check_in_number) LIKE UPPER($${idx}))`
      );
      values.push(`%${search}%`);
      idx++;
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRows = (await sql.query(
      `SELECT COUNT(*)::int AS total
       FROM check_in ci
       LEFT JOIN bookings b ON b.id = ci.booking_id
       ${where}`,
      values
    )) as Array<{ total: number }>;
    const total = countRows[0]?.total ?? 0;

    const rows = (await sql.query(
      `SELECT ci.id, ci.booking_id,
              b.booking_code,
              ci.passenger_name, ci.seat_number, ci.check_in_number,
              ci.boarding_pass_number, ci.flight_no, ci.from_code, ci.to_code,
              ci.depart_time, ci.gate, ci.terminal, ci.status, ci.check_in_time,
              up.email AS user_email
       FROM check_in ci
       LEFT JOIN bookings b ON b.id = ci.booking_id
       LEFT JOIN user_profiles up ON up.id = b.user_id
       ${where}
       ORDER BY ci.check_in_time DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...values, limit, offset]
    )) as CheckinRow[];

    return NextResponse.json({
      checkins: rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('Error fetching admin check-ins:', err);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Không tải được danh sách check-in' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/quan-tri/lam-thu-tuc — huỷ check-in (mở lại ghế cho khách).
 * Body: { checkinId, action: 'cancel' }
 */
export async function PATCH(request: NextRequest) {
  try {
    const { payload, error, response } = await verifyAdminRequest(request, 'checkin:cancel');
    if (error) return response;

    const body = await request.json();
    const { checkinId, action } = body ?? {};

    if (!checkinId || action !== 'cancel') {
      return NextResponse.json(
        { error: 'Bad Request', message: 'checkinId và action=cancel là bắt buộc' },
        { status: 400 }
      );
    }

    const found = (await sql`
      SELECT ci.id, ci.booking_id, ci.seat_number, ci.status, ci.flight_no,
             s.id AS seat_id
      FROM check_in ci
      LEFT JOIN seats s ON s.booking_id = ci.booking_id AND s.seat_number = ci.seat_number
      WHERE ci.id = ${checkinId}
      LIMIT 1
    `) as Array<{
      id: string;
      booking_id: string;
      seat_number: string;
      status: string;
      flight_no: string;
      seat_id: string | null;
    }>;

    if (found.length === 0) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Không tìm thấy lượt check-in' },
        { status: 404 }
      );
    }

    const row = found[0];
    if (row.status === 'cancelled') {
      return NextResponse.json(
        { error: 'Conflict', message: 'Lượt check-in này đã bị huỷ trước đó' },
        { status: 409 }
      );
    }

    await sql`UPDATE check_in SET status = 'cancelled', updated_at = NOW() WHERE id = ${checkinId}`;
    if (row.seat_id) {
      await sql`UPDATE seats SET check_in_status = 'not_checked_in', check_in_time = NULL WHERE id = ${row.seat_id}`;
    }

    try {
      await writeAuditLog({
        adminId: payload.userId,
        adminEmail: payload.email ?? '',
        action: 'checkin.cancel',
        targetType: 'check_in',
        targetId: checkinId,
        detailsJson: JSON.stringify({
          booking_id: row.booking_id,
          flight_no: row.flight_no,
          seat_number: row.seat_number,
        }),
        status: 'success',
      });
    } catch {
      // Audit log không chặn nghiệp vụ chính.
    }

    return NextResponse.json({ success: true, message: 'Đã huỷ check-in, ghế được mở lại' });
  } catch (err) {
    console.error('Error cancelling check-in:', err);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Không huỷ được check-in' },
      { status: 500 }
    );
  }
}
