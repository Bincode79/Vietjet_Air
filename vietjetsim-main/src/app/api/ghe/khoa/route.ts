import { type NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { rateLimit } from '@/lib/rate-limit';
import { resolveSeatSession, setSeatSessionCookie } from '@/lib/seat-session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface LockBody {
  flightId: string;
  seatIds: string[];
}

/**
 * `sessionId` không còn nằm trong body nữa.
 *
 * Trước đây client tự sinh chuỗi này và gửi lên — tức là tự khai quyền sở
 * hữu lock, không có bằng chứng nào. Giờ chủ sở hữu là cookie httpOnly do
 * server cấp (`src/lib/seat-session.ts`), nên body không còn mang thông tin
 * nào để xác định "ai đang giữ ghế".
 */
const SEAT_REGEX = /^[0-9]{1,3}[A-K]$/i;

interface SeatLockRow {
  seat_number: string;
  owner_token: string | null;
  expires_at: string;
}

interface BookedSeatRow {
  seat_number: string;
}

/**
 * Chuẩn hoá danh sách số ghế từ body: bỏ khoảng trắng, viết hoá, và chỉ giữ
 * lại những số ghế có dạng hợp lệ.
 */
function sanitizeSeatIds(seatIds: unknown): string[] {
  if (!Array.isArray(seatIds)) return [];
  return seatIds.map((s) => String(s).trim().toUpperCase()).filter((s) => SEAT_REGEX.test(s));
}

/**
 * Ghế đã có người đặt (một dòng trong `seats` gắn với một booking).
 *
 * Lock trên ghế đã bán là vô nghĩa — và nguy hiểm: nó khiến khách khác tưởng
 * ghế còn trống rồi điền hồ sơ, chỉ để báo lỗi ở bước cuối.
 */
async function findBookedSeats(flightId: string, seatNumbers: string[]): Promise<string[]> {
  if (seatNumbers.length === 0) return [];

  try {
    const rows = (await sql.query(
      `SELECT seat_number
         FROM seats
        WHERE flight_id = $1
          AND seat_number = ANY($2::text[])
          AND booking_id IS NOT NULL`,
      [flightId, seatNumbers]
    )) as BookedSeatRow[];
    return rows.map((r) => r.seat_number);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // `seats` luôn tồn tại (migration 000). Nếu lỗi không phải "bảng không
    // có" thì đây là lỗi hạ tầng — ném lên để route trả 500 chứ không âm
    // thầm coi như ghế trống.
    if (!message.includes('does not exist')) throw err;
    return [];
  }
}

/**
 * GET /api/ghe/khoa?flightId=...
 * Trả về các lock ghế đang hiệu lực của một chuyến bay.
 *
 * Cờ `mine` cho biết lock nào thuộc về phiên của requester. Trước đây route
 * này trả `session_id` thô cho MỌI người xem — tức là rò rỉ chính cái
 * credential dùng để chứng minh chủ sở hữu. Giờ server tự tính cờ đó và
 * không bao giờ trả token.
 */
export async function GET(request: NextRequest) {
  try {
    const flightId = request.nextUrl.searchParams.get('flightId');
    if (!flightId) {
      return NextResponse.json({ error: 'flightId là bắt buộc' }, { status: 400 });
    }

    const { ownerToken, cookieValue } = resolveSeatSession(request);

    // Clean up expired locks first
    try {
      await sql`DELETE FROM seat_locks WHERE expires_at <= NOW()`;
    } catch {
      // Table may not exist yet or connection issue
    }

    try {
      const rows = (await sql`
        SELECT seat_number, owner_token, expires_at
        FROM seat_locks
        WHERE flight_id = ${flightId} AND expires_at > NOW()
      `) as SeatLockRow[];

      const response = NextResponse.json({
        flightId,
        locked: rows.map((r) => ({
          seatNumber: r.seat_number,
          expiresAt: r.expires_at,
          // Chỉ chủ sở hữu mới thấy cờ này là `true`; mọi người khác thấy
          // `false` — và không có đường nào để suy ra token từ cờ này.
          mine: r.owner_token === ownerToken,
        })),
      });
      if (cookieValue) setSeatSessionCookie(response, cookieValue);
      return response;
    } catch {
      const response = NextResponse.json({ flightId, locked: [] });
      if (cookieValue) setSeatSessionCookie(response, cookieValue);
      return response;
    }
  } catch (err) {
    console.error('[ghe/khoa GET] error:', err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const limited = rateLimit(request, { windowMs: 60_000, maxRequests: 120 });
    if (limited) return limited;

    const body: LockBody = await request.json();
    const { flightId, seatIds } = body;

    if (!flightId || !Array.isArray(seatIds) || seatIds.length === 0) {
      return NextResponse.json({ error: 'flightId và seatIds là bắt buộc' }, { status: 400 });
    }

    const validSeats = sanitizeSeatIds(seatIds);

    if (validSeats.length === 0) {
      return NextResponse.json({ error: 'Danh sách số ghế không hợp lệ' }, { status: 400 });
    }

    const { ownerToken, cookieValue } = resolveSeatSession(request);

    // Ghế đã có người đặt thì không giữ được — xem `findBookedSeats`.
    const bookedSeats = await findBookedSeats(flightId, validSeats);
    if (bookedSeats.length > 0) {
      const response = NextResponse.json(
        {
          error: 'Seat already booked',
          message: 'Một hoặc nhiều ghế đã được đặt. Vui lòng chọn ghế khác.',
          seats: bookedSeats,
        },
        { status: 409 }
      );
      if (cookieValue) setSeatSessionCookie(response, cookieValue);
      return response;
    }

    const lockedUntil = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    // A seat that is already locked by *another* session must not be silently
    // taken over.
    //
    // The insert used to be a bare
    //
    //   ON CONFLICT (flight_id, seat_number)
    //   DO UPDATE SET session_id = EXCLUDED.session_id, expires_at = …
    //
    // which is `ON CONFLICT DO UPDATE` — i.e. "last writer wins". Any client
    // could therefore steal a seat another customer was holding, silently
    // resetting the owner's timer. The owner would keep filling in passenger
    // details and only discover the loss at the final booking step, when the
    // unique index on `seats` refused the seat.
    //
    // The upsert is now conditional: the row is only taken over when it has
    // expired (or belongs to this very session, which is the ordinary
    // "extend my own hold" case). A live lock held by somebody else is
    // reported back to the caller.
    //
    // `owner_token IS NULL` nghĩa là "không ai chứng minh được chủ sở hữu" —
    // đó là các lock tạo bởi client cũ, trước khi `owner_token` ra đời. Chúng
    // không chặn ai: tự hết hạn sau 10 phút, và tới lúc đó chúng đã vô
    // nghĩa. Chặn chúng lại chỉ khiến khách phải chờ một lock mà không ai
    // giữ.
    const conflicts: string[] = [];

    for (const seatNumber of validSeats) {
      const result = await sql`
        INSERT INTO seat_locks (flight_id, seat_number, owner_token, expires_at)
        VALUES (
          ${flightId},
          ${seatNumber},
          ${ownerToken},
          ${lockedUntil}::timestamptz
        )
        ON CONFLICT (flight_id, seat_number)
        DO UPDATE SET
          owner_token = EXCLUDED.owner_token,
          expires_at = EXCLUDED.expires_at
        WHERE seat_locks.owner_token = EXCLUDED.owner_token
           OR seat_locks.expires_at <= NOW()
           OR seat_locks.owner_token IS NULL
        RETURNING seat_number
      `;

      // An empty result means the conflict was filtered out by the WHERE
      // clause: the seat is held by another live session.
      if (!Array.isArray(result) || result.length === 0) {
        conflicts.push(seatNumber);
      }
    }

    if (conflicts.length > 0) {
      const response = NextResponse.json(
        {
          error: 'Seat locked by another customer',
          message: 'Một hoặc nhiều ghế vừa được khách khác giữ. Vui lòng chọn ghế khác.',
          seats: conflicts,
        },
        { status: 409 }
      );
      if (cookieValue) setSeatSessionCookie(response, cookieValue);
      return response;
    }

    const response = NextResponse.json({ success: true, lockedUntil, seats: validSeats });
    if (cookieValue) setSeatSessionCookie(response, cookieValue);
    return response;
  } catch (err) {
    console.error('[ghe/khoa POST] error:', err);
    const msg = err instanceof Error ? err.message : 'Lỗi server';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const limited = rateLimit(request, { windowMs: 60_000, maxRequests: 120 });
    if (limited) return limited;

    const body: LockBody = await request.json();
    const { flightId, seatIds } = body;

    if (!flightId || !Array.isArray(seatIds) || seatIds.length === 0) {
      return NextResponse.json({ error: 'flightId và seatIds là bắt buộc' }, { status: 400 });
    }

    const validSeats = sanitizeSeatIds(seatIds);

    const { ownerToken, cookieValue } = resolveSeatSession(request);

    // Chỉ xoá lock của CHÍNH mình. `owner_token = ${ownerToken}` là điều kiện
    // bắt buộc: nếu thiếu nó, bất kỳ ai cũng xoá được lock của người khác.
    for (const seatNumber of validSeats) {
      await sql`
        DELETE FROM seat_locks
        WHERE flight_id = ${flightId}
          AND seat_number = ${seatNumber}
          AND owner_token = ${ownerToken}
      `;
    }

    const response = NextResponse.json({ success: true });
    if (cookieValue) setSeatSessionCookie(response, cookieValue);
    return response;
  } catch (err) {
    console.error('[ghe/khoa DELETE] error:', err);
    const msg = err instanceof Error ? err.message : 'Lỗi server';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
