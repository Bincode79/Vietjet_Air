import { describe, expect, it } from 'vitest';
import { createBooking, getBookingById } from '@/lib/db';
import { sql } from '@/lib/neon';

describe('mock booking identity', () => {
  it('keeps a new booking separate from the seeded payment fixture', async () => {
    const [flight] = await sql<{ id: string }>`SELECT * FROM flights`;
    expect(flight).toBeDefined();

    const created = await createBooking(
      {
        user_id: 'mock-user-support',
        flight_id: flight.id,
        total_price: 1_234_567,
        seatedCount: 1,
      },
      [{ name: 'NGUYEN VAN AN', dob: '1995-10-20', passenger_type: 'adult' }]
    );

    expect(created.id).not.toBe('00000000-0000-4000-8000-000000000001');
    const detail = await getBookingById(created.id);
    expect(detail?.id).toBe(created.id);
    expect(Number(detail?.total_price)).toBe(1_234_567);
    expect(detail?.passengers?.[0]?.name).toBe('NGUYEN VAN AN');
  });
});
