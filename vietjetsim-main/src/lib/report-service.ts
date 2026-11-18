/**
 * Sinh báo cáo PDF doanh thu & đặt vé cho trang Quản trị (`/quan-tri`).
 *
 * Mô hình tương tự `src/lib/pdf/boarding-pass.ts`: dùng `pdfkit` (thuần JS,
 * không cần Chromium) chạy server-side, nhúng font KoHo có sẵn trong
 * `public/fonts/` để tên tiếng Việt không bị ô chữ vuông.
 *
 * Dữ liệu được lấy trực tiếp từ DB qua `sql` (Neon), không phụ thuộc API
 * trung gian → endpoint báo cáo nhẹ, dễ bảo trì.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { sql } from '@/lib/neon';

const FONT_DIR = path.join(process.cwd(), 'public', 'fonts');
const FONT_REGULAR = path.join(FONT_DIR, 'KoHo-Regular.ttf');
const FONT_BOLD = path.join(FONT_DIR, 'KoHo-Bold.ttf');

const BRAND_RED = '#EC2029';
const INK = '#111827';
const MUTED = '#6B7280';
const BORDER = '#D1D5DB';

type Fonts = { regular: Buffer; bold: Buffer };

let fontBuffersPromise: Promise<Fonts> | null = null;

async function loadFonts(): Promise<Fonts> {
  if (!fontBuffersPromise) {
    fontBuffersPromise = (async () => {
      const [regular, bold] = await Promise.all([readFile(FONT_REGULAR), readFile(FONT_BOLD)]);
      return { regular, bold };
    })().catch((error) => {
      fontBuffersPromise = null;
      throw new Error(
        `Không đọc được file font KoHo (${FONT_DIR}): ${error instanceof Error ? error.message : error}`
      );
    });
  }
  return fontBuffersPromise;
}

function money(v: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(v);
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('vi-VN');
}

interface RevenueSummaryRow {
  total_bookings: string;
  completed_bookings: string;
  cancelled_bookings: string;
  total_revenue: string;
  completed_revenue: string;
}

interface DailyRevenueRow {
  date: string;
  bookings: string;
  revenue: string;
}

interface RouteRow {
  route: string;
  bookings: string;
  revenue: string;
}

export interface RevenueReportInput {
  from: string; // 'YYYY-MM-DD'
  to: string; // 'YYYY-MM-DD'
}

export async function buildRevenueReportPdf(input: RevenueReportInput): Promise<Buffer> {
  const fonts = await loadFonts();

  const [summaryRows, dailyRows, routeRows] = await Promise.all([
    // ── Tổng hợp trong khoảng thời gian ────────────────────────────────
    sql<RevenueSummaryRow>`
      SELECT
        COUNT(*)::int AS total_bookings,
        COUNT(*) FILTER (WHERE status NOT IN ('cancelled', 'refunded'))::int AS completed_bookings,
        COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_bookings,
        COALESCE(SUM(total_price), 0)::numeric AS total_revenue,
        COALESCE(SUM(total_price) FILTER (WHERE status NOT IN ('cancelled', 'refunded')), 0)::numeric AS completed_revenue
      FROM bookings
      WHERE (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= ${input.from}
        AND (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= ${input.to}
    `,
    // ── Doanh thu theo ngày ────────────────────────────────────────────
    sql<DailyRevenueRow>`
      SELECT
        to_char(created_at AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') AS date,
        COUNT(id)::int AS bookings,
        COALESCE(SUM(total_price) FILTER (WHERE status NOT IN ('cancelled', 'refunded')), 0)::numeric AS revenue
      FROM bookings
      WHERE (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= ${input.from}
        AND (created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= ${input.to}
      GROUP BY 1
      ORDER BY 1 ASC
    `,
    // ── Top 5 ruta ─────────────────────────────────────────────────────
    sql<RouteRow>`
      SELECT
        CONCAT(f.from_code, ' - ', f.to_code) AS route,
        COUNT(b.id)::int AS bookings,
        COALESCE(SUM(b.total_price), 0)::numeric AS revenue
      FROM bookings b
      JOIN flights f ON b.flight_id = f.id
      WHERE (b.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= ${input.from}
        AND (b.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= ${input.to}
      GROUP BY f.from_code, f.to_code
      ORDER BY bookings DESC, revenue DESC
      LIMIT 5
    `,
  ]);
  const summary = summaryRows[0] ?? {
    total_bookings: 0,
    completed_bookings: 0,
    cancelled_bookings: 0,
    total_revenue: 0,
    completed_revenue: 0,
  };

  const doc = new PDFDocument({
    size: 'A4',
    margin: 50,
    info: { Title: 'Báo cáo doanh thu Vietjet', Author: 'Vietjet Air Admin' },
  });

  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));

  // ── Font ─────────────────────────────────────────────────────────────
  doc.registerFont('KoHoRegular', fonts.regular);
  doc.registerFont('KoHoBold', fonts.bold);
  doc.font('KoHoRegular');

  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const contentBottom = pageHeight - 60;
  let pageNumber = 1;

  const drawFooter = (n: number) => {
    // Footer nằm trong lề dưới. pdfkit tự thêm trang mới khi `text` vượt
    // `page.maxY()`, nên tạm bỏ lề dưới — nếu không, chính footer sẽ sinh
    // trang mới và `pageAdded` lại vẽ footer, đệ quy vô hạn.
    const bottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font('KoHoRegular').fontSize(7.5).fillColor(MUTED);
    doc.text('Vietjet Air — Hệ thống Quản trị', 50, pageHeight - 40, {
      align: 'left',
      width: pageWidth - 100,
    });
    doc.text(String(n), pageWidth - 90, pageHeight - 40, { align: 'right', width: 40 });
    doc.page.margins.bottom = bottomMargin;
  };

  // Registered before any content so pages added mid-report also get a footer.
  doc.on('pageAdded', () => {
    pageNumber += 1;
    drawFooter(pageNumber);
  });
  drawFooter(pageNumber);

  // ── Header ───────────────────────────────────────────────────────────
  doc.fillColor(BRAND_RED).font('KoHoBold').fontSize(20).text('Vietjet Air', 50, 40);
  doc.fillColor(INK).font('KoHoRegular').fontSize(13);
  doc.text('BÁO CÁO DOANH THU & ĐẶT VÉ', 50, 66);
  doc.fontSize(9).fillColor(MUTED);
  doc.text(`Khoảng thời gian: ${input.from} → ${input.to}`, 50, 84);
  doc.text(
    `Ngày xuất: ${new Date().toLocaleDateString('vi-VN')} ${new Date().toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
    })}`,
    50,
    96
  );

  // Đường kẻ dưới header
  doc
    .moveTo(50, 112)
    .lineTo(pageWidth - 50, 112)
    .strokeColor(BORDER)
    .stroke();

  let y = 128;

  /**
   * Bảng doanh thu theo ngày có thể dài hơn một trang (endpoint nhận mọi
   * khoảng ngày). pdfkit không tự xuống trang khi `text` được gọi kèm toạ độ
   * tuyệt đối, nên các dòng vượt đáy trang sẽ bị vẽ ra ngoài và mất khỏi báo
   * cáo. Ngắt trang chủ động, và đặt lại font vì `addPage()` trả font về mặc
   * định (Helvetica không có đủ ký tự tiếng Việt/₫).
   */
  const ensureSpace = (needed: number) => {
    if (y + needed <= contentBottom) return;
    doc.addPage();
    doc.font('KoHoRegular').fontSize(8.5);
    y = 50;
  };

  // ── Thẻ tổng hợp (4 chỉ số) ──────────────────────────────────────────
  const cards = [
    { label: 'Tổng đặt vé', value: String(summary.total_bookings), color: '#2563eb' },
    { label: 'Đặt vé thành công', value: String(summary.completed_bookings), color: '#15803d' },
    { label: 'Đã hủy', value: String(summary.cancelled_bookings), color: '#b91c1c' },
    { label: 'Tổng doanh thu', value: money(Number(summary.total_revenue)), color: '#7c2d12' },
  ];

  const cardW = (pageWidth - 120) / 4;
  const cardH = 78;
  const gap = 12;

  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    const x = 50 + i * (cardW + gap);
    doc
      .roundedRect(x, y, cardW, cardH, 8)
      .fill('#FFFFFF')
      .strokeColor(BORDER)
      .lineWidth(1)
      .stroke();
    doc
      .fillColor(c.color)
      .font('KoHoBold')
      .fontSize(10)
      .text(c.label, x + 14, y + 14, {
        width: cardW - 28,
      });
    doc
      .fillColor(INK)
      .font('KoHoBold')
      .fontSize(17)
      .text(c.value, x + 14, y + 34, {
        width: cardW - 28,
        align: 'right',
      });
    doc
      .fillColor(MUTED)
      .font('KoHoRegular')
      .fontSize(7.5)
      .text(c.label.toLowerCase(), x + 14, y + 60, {
        width: cardW - 28,
      });
  }
  y += cardH + 22;
  // ── Bảng doanh thu theo ngày ─────────────────────────────────────────
  doc.fillColor(INK).font('KoHoBold').fontSize(12).text('Doanh thu theo ngày', 50, y);
  y += 20;

  const tableX = 50;
  const colDate = 110;
  const colBookings = 150;
  const rowH = 22;

  // Header bảng
  doc.fillColor('#FFFFFF').font('KoHoBold').fontSize(8.5);
  doc.rect(tableX, y, colDate - tableX, rowH).fill();
  doc.rect(tableX + (colDate - tableX), y, colBookings - colDate, rowH).fill();
  doc
    .rect(tableX + (colBookings - colDate), y, pageWidth - 50 - (colBookings - colDate), rowH)
    .fill();
  doc.fillColor(BRAND_RED);
  doc.text('Ngày', tableX + 8, y + 6, { width: colDate - tableX - 16 });
  doc.text('Đặt vé', tableX + (colDate - tableX) + 8, y + 6, {
    width: colBookings - colDate - 16,
    align: 'right',
  });
  doc.text('Doanh thu', tableX + (colBookings - colDate) + 8, y + 6, {
    width: pageWidth - 50 - (colBookings - colDate) - 16,
    align: 'right',
  });
  y += rowH;

  // Nội dung
  doc.font('KoHoRegular').fontSize(8.5);
  let grandBookings = 0;
  let grandRevenue = 0;
  for (let i = 0; i < dailyRows.length; i++) {
    ensureSpace(rowH);
    const row = dailyRows[i];
    const isAlt = i % 2 === 1;
    if (isAlt)
      doc
        .fillColor('#F9FAFB')
        .rect(tableX, y, pageWidth - 100, rowH)
        .fill();
    doc.fillColor(INK);
    const b = Number(row.bookings);
    const r = Number(row.revenue);
    grandBookings += b;
    grandRevenue += r;
    doc.text(formatDate(row.date), tableX + 8, y + 6, { width: colDate - tableX - 16 });
    doc.text(b.toLocaleString('vi-VN'), tableX + (colDate - tableX) + 8, y + 6, {
      width: colBookings - colDate - 16,
      align: 'right',
    });
    doc.text(money(r), tableX + (colBookings - colDate) + 8, y + 6, {
      width: pageWidth - 50 - (colBookings - colDate) - 16,
      align: 'right',
    });
    y += rowH;
  }

  // Hàng tổng
  ensureSpace(rowH + 18);
  doc.fillColor('#FFFFFF').font('KoHoBold').fontSize(8.5);
  doc.rect(tableX, y, pageWidth - 100, rowH).fill();
  doc.fillColor(BRAND_RED);
  doc.text('TỔNG', tableX + 8, y + 6, { width: colDate - tableX - 16 });
  doc.text(grandBookings.toLocaleString('vi-VN'), tableX + (colDate - tableX) + 8, y + 6, {
    width: colBookings - colDate - 16,
    align: 'right',
  });
  doc.text(money(grandRevenue), tableX + (colBookings - colDate) + 8, y + 6, {
    width: pageWidth - 50 - (colBookings - colDate) - 16,
    align: 'right',
  });
  y += rowH + 18;

  // ── Top ruta ─────────────────────────────────────────────────────────
  ensureSpace(20 + 16);
  doc.fillColor(INK).font('KoHoBold').fontSize(12).text('Top 5 ruta đặt nhiều nhất', 50, y);
  y += 20;

  doc.font('KoHoRegular').fontSize(8.5);
  for (const row of routeRows) {
    ensureSpace(16);
    doc.fillColor(INK);
    doc.text(row.route, tableX, y, { width: 120 });
    doc.text(Number(row.bookings).toLocaleString('vi-VN'), tableX + 120, y, {
      width: 60,
      align: 'right',
    });
    doc.text(money(Number(row.revenue)), tableX + 180, y, {
      width: pageWidth - 50 - 180,
      align: 'right',
    });
    y += 16;
  }

  y += 20;

  // ── Chú thích ────────────────────────────────────────────────────────
  doc.fillColor(MUTED).font('KoHoRegular').fontSize(7.5);
  doc.text(
    'Doanh thu chỉ tính các đặt vé chưa hủy/hoàn tiền (trừ trạng thái cancelled, refunded).\n' +
      'Múi giờ: Asia/Ho_Chi_Minh. Báo cáo được xuất từ hệ thống Quản trị Vietjet Air.',
    50,
    y,
    { width: pageWidth - 100, lineGap: 3 }
  );

  // ── Footer (mỗi trang) ───────────────────────────────────────────────
  // Footer trang 1 đã được vẽ ngay sau khi tạo document; `pageAdded` lo các
  // trang phát sinh trong lúc dựng bảng. Ở đây không vẽ lại: toạ độ tuyệt đối
  // sẽ ghi đè footer của *trang hiện tại* (trang cuối), không phải trang 1.

  // `doc.end()` không đảm bảo mọi chunk đã phát xong: với font TTF nhúng,
  // pdfkit có thể ghi tiếp ở tick sau, và `Buffer.concat(chunks)` ngay sau
  // `end()` từng trả buffer rỗng → route gửi một file PDF 0 byte nhưng vẫn
  // 200. Chờ sự kiện `end` rồi mới ghép.
  await new Promise<void>((resolve, reject) => {
    doc.on('end', resolve);
    doc.on('error', reject);
    doc.end();
  });

  return Buffer.concat(chunks);
}
