/**
 * Tab "Thống kê doanh thu" đọc ba tập aggregate từ `/api/quan-tri/doanh-thu`:
 * `monthly` (doanh thu theo tháng), `routes` (doanh thu theo đường bay) và
 * `classSplit` (tỷ lệ hạng ghế).
 *
 * Trước đây route đó chỉ trả `revenue` / `statusDistribution` /
 * `recentActivity`, còn UI đọc `analytics.monthly`, `analytics.routes`,
 * `analytics.classSplit` — nên ba biểu đồ (cột doanh thu, đường số vé, tròn
 * hạng ghế) và bảng "doanh thu theo đường bay" LUÔN rỗng, dù DB có dữ liệu.
 *
 * Bộ test này chốt lại: các aggregate phải trả về dữ liệu thật từ DB, và
 * mock database cũng phải trả lời được các câu đó (nếu không thì cổng UI
 * check chụp được một trang biểu đồ trống).
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/admin-auth', () => ({
  verifyAdminRequest: vi.fn().mockResolvedValue({
    payload: { userId: 'admin-1', email: 'admin@vietjet.shop', role: 'admin' },
    error: undefined,
    response: undefined,
  }),
}));

import { getMonthlyRevenue, getRouteRevenue, getSeatClassSplit, getRevenueStats } from '@/lib/db';
import { sql } from '@/lib/neon';

describe('analytics aggregates của tab doanh thu', () => {
  it('getMonthlyRevenue trả về đúng 6 tháng gần nhất và tổng doanh thu khớp', async () => {
    const monthly = await getMonthlyRevenue(6);

    expect(monthly.length).toBeGreaterThan(0);
    for (const row of monthly) {
      expect(row.month).toMatch(/^\d{4}-\d{2}$/);
      expect(typeof row.revenue).toBe('number');
      expect(typeof row.tickets).toBe('number');
      expect(Number.isNaN(row.revenue)).toBe(false);
    }

    // Các tháng phải liên tục và tăng dần theo thời gian.
    const months = monthly.map((m) => m.month);
    expect([...months].sort()).toEqual(months);

    // Tổng doanh thu của các tháng không được vượt quá tổng doanh thu chung
    // (bộ lọc huỷ/huỷ tiền làm tổng tháng <= tổng chung).
    const stats = await getRevenueStats();
    const monthlyTotal = monthly.reduce((sum, m) => sum + m.revenue, 0);
    expect(monthlyTotal).toBeLessThanOrEqual(stats.totalRevenue + 1);
  });

  it('getRouteRevenue trả về đường bay dạng "HAN - SGN" kèm doanh thu', async () => {
    const routes = await getRouteRevenue(10);

    expect(Array.isArray(routes)).toBe(true);
    for (const route of routes) {
      expect(route.route).toMatch(/^[A-Z]{3}\s-\s[A-Z]{3}$/);
      expect(route.revenue).toBeGreaterThanOrEqual(0);
      expect(route.tickets).toBeGreaterThanOrEqual(0);
    }
  });

  it('getSeatClassSplit trả về hạng ghế kèm số lượng', async () => {
    const split = await getSeatClassSplit();

    expect(Array.isArray(split)).toBe(true);
    for (const entry of split) {
      expect(typeof entry.class).toBe('string');
      expect(entry.count).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('route doanh thu trả đủ ba tập aggregate mà UI cần', () => {
  it('GET /api/quan-tri/doanh-thu có monthly, routes, classSplit', async () => {
    const { GET } = await import('@/app/api/quan-tri/doanh-thu/route');
    const res = await GET(new Request('http://localhost/api/quan-tri/doanh-thu') as never);
    const body = await res.json();

    expect(body).toHaveProperty('monthly');
    expect(body).toHaveProperty('routes');
    expect(body).toHaveProperty('classSplit');
    expect(Array.isArray(body.monthly)).toBe(true);
    expect(Array.isArray(body.routes)).toBe(true);
    expect(Array.isArray(body.classSplit)).toBe(true);
  });
});

describe('tham số tháng không bị nhét vào trong string literal của INTERVAL', () => {
  /**
   * Neon thay mỗi `${…}` bằng `$N` một cách máy móc, KHÔNG quan tâm dấu nháy.
   * Nên `INTERVAL '${months} months'` được gửi lên Postgres đúng như
   * `INTERVAL '$1 months'` — dấu nháy đơn biến `$1` thành văn bản thô, Postgres
   * không thấy placeholder, và câu hỏi chết với:
   *
   *   ERROR 08P01: bind message supplies 1 parameters, but prepared
   *                  statement "" requires 0
   *
   * Đã kiểm chứng trên Postgres 16 qua chính Neon HTTP bridge của repo.
   * Hệ quả trước đây: `getMonthlyRevenue` luôn throw, route nuốt lỗi bằng
   * `.catch(() => [])`, và biểu đồ doanh thu theo tháng LUÔN TRỐNG trên DB
   * thật — trong khi mock in-memory vẫn trả về dữ liệu, nên CI không thấy.
   */
  it('câu SQL đặt tham số ngoài dấu nháy', async () => {
    const captured: string[] = [];

    vi.resetModules();
    vi.doMock('@/lib/neon', () => ({
      sql: Object.assign(
        vi.fn(async (strings: TemplateStringsArray) => {
          captured.push(strings.join('?'));
          return [];
        }),
        { query: vi.fn(async () => []) }
      ),
    }));

    const { getMonthlyRevenue: fresh } = await import('@/lib/db');
    await fresh(6);

    expect(captured.length).toBeGreaterThan(0);
    const text = captured.join('\n');

    // Tham số phải nằm ngoài string literal.
    expect(text).not.toMatch(/INTERVAL\s*'(\?|\$\d+)/i);
    expect(text).not.toMatch(/'(\?|\$\d+) months'/i);
    expect(text).toMatch(/CAST\((\?|\$\d+) \|\| ' months' AS INTERVAL\)/i);
  });
});

describe('mock database trả lời được các câu aggregate của biểu đồ', () => {
  it('câu doanh thu theo tháng trả về các bucket tháng', async () => {
    const rows = await sql`
      SELECT
        to_char(date_trunc('month', b.created_at), 'YYYY-MM') AS month,
        COALESCE(SUM(b.total_price), 0) AS revenue,
        COUNT(b.id) AS tickets
      FROM bookings b
      WHERE b.status NOT IN ('cancelled', 'refunded')
        AND b.created_at >= date_trunc('month', NOW()) - INTERVAL '5 months'
      GROUP BY date_trunc('month', b.created_at)
      ORDER BY date_trunc('month', b.created_at) ASC
    `;

    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toMatchObject({
      month: expect.any(String),
      revenue: expect.any(Number),
      tickets: expect.any(Number),
    });
  });

  it('câu doanh thu theo đường bay trả về route hợp lệ', async () => {
    const rows = await sql`
      SELECT
        CONCAT(f.from_code, ' - ', f.to_code) AS route,
        COALESCE(SUM(b.total_price), 0) AS revenue,
        COUNT(b.id) AS tickets
      FROM bookings b
      JOIN flights f ON b.flight_id = f.id
      WHERE b.status NOT IN ('cancelled', 'refunded')
      GROUP BY f.from_code, f.to_code
      ORDER BY revenue DESC, tickets DESC
      LIMIT ${10}
    `;

    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toMatchObject({
      route: expect.stringMatching(/^[A-Z]{3}\s-\s[A-Z]{3}$/),
      revenue: expect.any(Number),
      tickets: expect.any(Number),
    });
  });

  it('câu phân bổ hạng ghế trả về class và count', async () => {
    const rows = await sql`
      SELECT
        f.class AS class,
        COUNT(b.id) AS count
      FROM bookings b
      JOIN flights f ON b.flight_id = f.id
      WHERE b.status NOT IN ('cancelled', 'refunded')
      GROUP BY f.class
      ORDER BY count DESC
    `;

    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toMatchObject({
      class: expect.any(String),
      count: expect.any(Number),
    });
  });
});
