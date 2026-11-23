import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/admin-auth';
import { getFlightById } from '@/lib/db';
import { sql } from '@/lib/neon';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await verifyAdminRequest(request, 'flight:view');
    if (authResult.error || authResult.response) return authResult.response!;

    const { id: flightId } = await params;
    const flight = await getFlightById(flightId);
    if (!flight) {
      return NextResponse.json(
        { error: 'Not Found', message: `Không tìm thấy chuyến bay với ID: ${flightId}` },
        { status: 404 }
      );
    }

    interface ManifestRow {
      id: string;
      booking_id: string;
      booking_code: string;
      booking_status: string;
      name: string;
      gender: string | null;
      dob: string | null;
      id_number: string | null;
      passenger_type: string | null;
      phone: string | null;
      email: string | null;
      seat_number: string | null;
      is_checked_in: boolean;
      check_in_time: string | null;
      boarding_pass_code: string | null;
      contact_email: string | null;
      contact_phone: string | null;
    }

    let passengers: ManifestRow[] = [];
    try {
      const rows = (await sql`
        SELECT 
          p.id,
          p.booking_id,
          b.booking_code,
          b.status as booking_status,
          p.name,
          p.gender,
          p.dob,
          p.id_number,
          p.passenger_type,
          p.phone,
          p.email,
          COALESCE(ci.seat_number, p.seat_number, s.seat_number, '—') as seat_number,
          CASE WHEN ci.id IS NOT NULL THEN true ELSE false END as is_checked_in,
          ci.check_in_time,
          ci.boarding_pass_code,
          u.email as contact_email,
          u.phone as contact_phone
        FROM passengers p
        JOIN bookings b ON p.booking_id = b.id
        LEFT JOIN check_in ci ON ci.passenger_id = p.id
        LEFT JOIN seats s ON s.booking_id = b.id AND s.seat_number = p.seat_number
        LEFT JOIN user_profiles u ON b.user_id = u.id
        WHERE b.flight_id = ${flightId}
          AND b.status IN ('confirmed', 'pending', 'completed')
        ORDER BY p.name ASC
      `) as ManifestRow[];
      passengers = rows;
    } catch (dbErr) {
      console.warn('[FLIGHT-MANIFEST] Error querying passengers:', dbErr);
    }

    const totalPassengers = passengers.length;
    const checkedInCount = passengers.filter((p) => p.is_checked_in).length;
    const notCheckedInCount = totalPassengers - checkedInCount;

    return NextResponse.json({
      success: true,
      flight,
      passengers,
      totalPassengers,
      checkedInCount,
      notCheckedInCount,
    });
  } catch (error) {
    console.error('[FLIGHT-MANIFEST-ERROR]', error);
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: 'Đã xảy ra lỗi khi lấy danh sách hành khách chuyến bay.',
      },
      { status: 500 }
    );
  }
}
