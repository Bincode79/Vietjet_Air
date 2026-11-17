import { type NextRequest } from 'next/server';
import { sql } from '@/lib/db';
import { resolveSeatSession } from '@/lib/seat-session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface BookedRow {
  seat_number: string;
}

interface LockRow {
  seat_number: string;
  owner_token: string | null;
  expires_at: string;
}

async function fetchSeatData(
  flightId: string,
  ownerToken: string
): Promise<{
  occupied: string[];
  locked: { seatId: string; expiresAt: string; mine: boolean }[];
}> {
  // Get confirmed/pending booked seats
  const bookedRows = (await sql`
    SELECT DISTINCT s.seat_number
    FROM seats s
    JOIN bookings b ON s.booking_id = b.id
    WHERE b.flight_id = ${flightId}
      AND b.status IN ('confirmed', 'pending')
  `) as BookedRow[];

  const occupied = bookedRows.map((r) => r.seat_number);

  // Get temporary locks (gracefully handle table not existing)
  let locked: { seatId: string; expiresAt: string; mine: boolean }[] = [];
  try {
    // Clean up expired locks first
    await sql`DELETE FROM seat_locks WHERE expires_at <= NOW()`;

    const lockRows = (await sql`
      SELECT seat_number, owner_token, expires_at
      FROM seat_locks
      WHERE flight_id = ${flightId}
        AND expires_at > NOW()
    `) as LockRow[];

    locked = lockRows.map((r) => ({
      seatId: r.seat_number,
      expiresAt: r.expires_at,
      // The server decides whether this lock belongs to the caller and says
      // so with a boolean. It used to hand out `session_id` — the very
      // credential that proves ownership — to EVERY viewer, which meant
      // reading the SSE stream was enough to steal somebody else's seat.
      //
      // The client needs to tell its own temporary hold apart from another
      // customer's, because rendering its own seat as "đã đặt" made it look
      // unavailable to its own holder, and `toggleSeat` then refused to
      // deselect it.
      mine: r.owner_token === ownerToken,
    }));
  } catch (err) {
    // seat_locks table may not exist yet — return empty locks array
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes('seat_locks') && !msg.includes('does not exist')) {
      console.error('[SSE ghe-ngoi] seat_locks error:', err);
    }
  }

  return { occupied, locked };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const flightId = searchParams.get('flightId');

  if (!flightId) {
    return new Response(JSON.stringify({ error: 'flightId là bắt buộc' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // The owner token comes from the server-issued cookie, so a viewer cannot
  // claim a lock is theirs. It never leaves the server.
  const { ownerToken } = resolveSeatSession(request);

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: object) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          // connection closed, ignore
        }
      };

      const fetchAndSend = async () => {
        try {
          const { occupied, locked } = await fetchSeatData(flightId, ownerToken);
          send('seats', {
            flightId,
            occupied,
            locked,
            updatedAt: new Date().toISOString(),
          });
        } catch (err) {
          console.error('[SSE ghe-ngoi] DB error:', err);
        }
      };

      // Send initial data immediately
      await fetchAndSend();

      // Poll every 5 seconds
      const pollInterval = setInterval(async () => {
        if (request.signal.aborted) {
          clearInterval(pollInterval);
          try {
            controller.close();
          } catch {
            /* already closed */
          }
          return;
        }
        await fetchAndSend();
      }, 5_000);
      // Total connection timeout: close the SSE stream even if the client never
      // sends an abort signal (tab closed forcefully, silent network drop).
      const totalTimeout = setTimeout(() => {
        clearInterval(pollInterval);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }, 60_000);

      // Cleanup on client disconnect
      request.signal.addEventListener('abort', () => {
        clearInterval(pollInterval);
        clearTimeout(totalTimeout);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
