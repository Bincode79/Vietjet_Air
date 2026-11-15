/**
 * Mock database phải trả lời được bảng `agencies` và `discount_codes`.
 *
 * Hai tab "Quản lý đại lý" và "Quản lý mã giảm giá" đọc/ghi hai bảng này. Không
 * có handler trong mock thì:
 *   * danh sách luôn rỗng (mọi câu `SELECT ... FROM agencies` trả `[]`);
 *   * `createAgency` đọc `results[0]` — là `undefined` ⇒ 500;
 *   * `updateAgency`/`deleteAgency` dùng `sql.query`, vốn chỉ có handler cho
 *     chat/bookings ⇒ trả `[]` ⇒ 500.
 *
 * Nên trong mock mode hai tab này trông như hỏng, dù code chạy đúng trên DB
 * thật. Cổng UI check chụp ảnh các màn này nên phải thấy dữ liệu thật.
 */
import { describe, it, expect } from 'vitest';
import { sql } from '@/lib/neon';

describe('mock database trả lời được đại lý và mã giảm giá', () => {
  it('đọc được danh sách đại lý', async () => {
    const rows = await sql`SELECT * FROM agencies ORDER BY created_at DESC`;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toMatchObject({
      id: expect.any(String),
      code: expect.any(String),
      name: expect.any(String),
      is_active: expect.any(Boolean),
    });
  });

  it('đọc được mã giảm giá', async () => {
    const rows = await sql`SELECT * FROM discount_codes ORDER BY created_at DESC`;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toMatchObject({
      id: expect.any(String),
      code: expect.any(String),
      type: expect.any(String),
      is_active: expect.any(Boolean),
    });
  });

  it('thêm đại lý rồi đọc lại được', async () => {
    const [created] = await sql`
      INSERT INTO agencies (
        code, name, contact_name, contact_email, contact_phone,
        address, commission_rate, notes, is_active
      )
      VALUES (
        ${'ag-test'}, ${'Đại lý test'}, ${'A'}, ${'a@b.vn'}, ${'0900'},
        ${'Hà Nội'}, ${5}, ${null}, ${true}
      )
      RETURNING *
    `;

    expect(created).toMatchObject({ code: 'AG-TEST', name: 'Đại lý test' });

    const rows = await sql`SELECT * FROM agencies WHERE id = ${String(created.id)}`;
    expect(rows.length).toBe(1);
  });

  it('cập nhật đại lý rồi đọc lại được', async () => {
    const rows = await sql`SELECT * FROM agencies LIMIT 1`;
    const target = rows[0];
    expect(target).toBeDefined();

    const [updated] = await sql`
      UPDATE agencies
      SET is_active = ${false}, commission_rate = ${12}
      WHERE id = ${String(target.id)}
      RETURNING *
    `;

    expect(updated).toMatchObject({ is_active: false, commission_rate: 12 });
  });

  it('đếm được tổng số đại lý', async () => {
    const rows = await sql`SELECT COUNT(*) as total FROM agencies`;
    expect(Number(rows[0]?.total)).toBeGreaterThan(0);
  });
});
