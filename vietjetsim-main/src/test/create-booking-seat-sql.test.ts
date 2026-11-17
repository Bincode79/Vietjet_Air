/**
 * Câu lệnh ghép ghế vào hành khách trong `createBooking` đã từng 500 trên Postgres
 * thật trong khi cả suite đều xanh: nó khai một column definition list cho
 * `jsonb_to_recordset` kèm `WITH ORDINALITY`, và Postgres từ chối hợp cả hai
 * ("WITH ORDINALITY cannot be used with a column definition list") — cột `ord`
 * còn bị khai thiếu kiểu, nên parser gật ngay dấu `)` của danh sách. Suite unit
 * mock `sql` nên chưa từng chạy SQL nào; lỗi chỉ hiện qua Neon thật, ở dạng
 * `NeonDbError: syntax error at or near ")"`.
 *
 * Test này đọc lại *text* SQL của `createBooking` và ghim hai điều: không câu
 * nào kết hợp `WITH ORDINALITY` với column definition list, và cột đánh số thứ
 * tự ghế phải đi cùng dữ liệu JSON (`ord` có kiểu `int`) để `ROW_NUMBER` giữ
 * đúng thứ tự chọn ghế.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createBooking } from '@/lib/db';

vi.mock('@/lib/neon', () => {
  const queryMock = vi.fn();
  const sqlMock = Object.assign(vi.fn(async () => [{ id: 'bk-1', booking_code: 'ABC123' }]), {
    query: queryMock,
  });
  return { sql: sqlMock };
});

import { sql } from '@/lib/neon';

function sqlText(call: unknown): string {
  if (!Array.isArray(call)) return '';
  const [strings] = call;
  if (!Array.isArray(strings) || typeof strings !== 'object' || strings === null) return '';
  return strings.reduce(
    (acc: string, chunk: unknown, i: number) => acc + (i > 0 ? `$${i}` : '') + String(chunk),
    ''
  );
}

function sqlStatements(): string[] {
  const mocked = sql as unknown as { mock: { calls: unknown[] } };
  return mocked.mock.calls.map(sqlText);
}

describe('createBooking — SQL ghép ghế phải parse được trên Postgres thật', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('không câu SQL nào kết hợp WITH ORDINALITY với column definition list', async () => {
    await createBooking(
      {
        user_id: 'u1',
        flight_id: 'f1',
        total_price: 100000,
        seatedCount: 1,
        trip_id: 't1',
        leg_role: 'outbound',
      },
      [
        {
          name: 'NGUYEN VAN A',
          dob: '1990-01-01',
          id_number: 'ID1',
          passenger_type: 'adult',
        },
      ],
      [{ seat_number: '12A', price: 63250 }],
      [{ option_id: 'baggage', unit_price: 400000, quantity: 1 }]
    );

    for (const statement of sqlStatements()) {
      const hasOrdinality = statement.includes('WITH ORDINALITY');
      // Column definition list = `AS alias(name type, …)` ngay sau jsonb_to_recordset.
      const hasColDefList = /AS\s+\w+\(\s*\w+\s+\w+/.test(statement);
      expect(
        hasOrdinality && hasColDefList,
        `WITH ORDINALITY không thể đứng cạnh column definition list — câu lệnh sẽ 500 trên Postgres thật:\n${statement}`
      ).toBe(false);
    }
  });

  it('cột thứ tự ghế (ord) đi cùng JSON, có kiểu, và giữ đúng thứ tự chọn', async () => {
    await createBooking(
      {
        user_id: 'u1',
        flight_id: 'f1',
        total_price: 100000,
        seatedCount: 2,
        trip_id: 't1',
        leg_role: 'outbound',
      },
      [],
      [
        { seat_number: '12A', price: 63250 },
        { seat_number: '12B', price: 63250 },
      ],
      []
    );

    const statements = sqlStatements();
    // Câu lệnh thứ hai là câu ghép ghế vào hành khách (chỉ chạy khi có ghế).
    const seatJoin = statements.find((s) => s.includes('seat_rows'));
    expect(seatJoin).toBeDefined();

    // Column definition list phải có kiểu cho từng cột — cột không kiểu từng
    // là nguyên nhân "syntax error at or near \")\"" của parser Postgres.
    expect(seatJoin).toContain('AS st2(seat_number text, ord int)');
    expect(seatJoin).not.toContain('WITH ORDINALITY');

    // JSON tham số phải mang số thứ tự mảng để ORDER BY st2.ord phản ánh
    // đúng thứ tự khách chọn ghế.
    const mocked = sql as unknown as { mock: { calls: unknown[][] } };
    const seatCall = mocked.mock.calls.find(
      (call) => sqlText(call).includes('seat_rows')
    );
    // call = [strings, v1, v2] — giá trị đầu tiên là JSON tham số.
    const jsonParam = JSON.parse(String(seatCall?.[1])) as {
      seat_number: string;
      ord: number;
    }[];
    expect(jsonParam).toEqual([
      { seat_number: '12A', ord: 0 },
      { seat_number: '12B', ord: 1 },
    ]);
  });
});
