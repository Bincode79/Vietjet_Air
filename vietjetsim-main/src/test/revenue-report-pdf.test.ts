import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ──────────────────────────────────────────────────────────────
   Báo cáo doanh thu là một file PDF dựng bằng toạ độ tuyệt đối.
   pdfkit không tự xuống trang trong chế độ đó, nên trước đây một
   khoảng ngày dài (endpoint nhận mọi `from`/`to`) vẽ các dòng vượt
   đáy trang ra ngoài khung giấy — báo cáo vẫn tải được nhưng thiếu
   ngày. Test này khoá việc ngắt trang.
   ────────────────────────────────────────────────────────────── */

const neon = vi.hoisted(() => ({ sql: vi.fn() }));
vi.mock('@/lib/neon', () => neon);

import { buildRevenueReportPdf } from '@/lib/report-service';

function dailyRows(days: number) {
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
    return { date, bookings: '3', revenue: '4500000' };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  neon.sql.mockImplementation((strings: TemplateStringsArray) => {
    const text = strings.join(' ');
    if (text.includes('total_bookings')) {
      return Promise.resolve([
        {
          total_bookings: '40',
          completed_bookings: '40',
          cancelled_bookings: '0',
          total_revenue: '180000000',
          completed_revenue: '180000000',
        },
      ]);
    }
    if (text.includes('to_char')) {
      return Promise.resolve(dailyRows(40));
    }
    return Promise.resolve([{ route: 'SGN - HAN', bookings: '40', revenue: '180000000' }]);
  });
});

describe('buildRevenueReportPdf', () => {
  it('ngắt trang khi bảng doanh thu theo ngày dài hơn một trang', async () => {
    const pdf = await buildRevenueReportPdf({ from: '2026-01-01', to: '2026-02-09' });
    const raw = pdf.toString('latin1');

    expect(raw.startsWith('%PDF')).toBe(true);
    const pages = raw.match(/\/Type\s*\/Page[^s]/g) ?? [];
    expect(pages.length).toBeGreaterThan(1);
  });
});
