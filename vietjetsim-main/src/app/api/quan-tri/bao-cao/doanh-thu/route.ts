import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/admin-auth';
import { buildRevenueReportPdf } from '@/lib/report-service';

export const dynamic = 'force-dynamic';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `YYYY-MM-DD` phải là một ngày có thật, không chỉ đúng hình dạng: `2026-02-31`
 * khớp regex nhưng Postgres từ chối khi so sánh với `date`, biến một tham số
 * sai thành 500 thay vì 400.
 */
function isValidDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/** `YYYY-MM-DD` theo múi giờ Việt Nam, không phụ thuộc timezone của server. */
function vnDateString(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function defaultRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
  return { from: vnDateString(from), to: vnDateString(now) };
}

/**
 * GET /api/quan-tri/bao-cao/doanh-thu?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Xuất báo cáo PDF doanh thu & đặt vé trong khoảng thời gian.
 * Yêu cầu quyền `report:generate` (hoặc toàn quyền admin).
 *
 * Thiếu tham số thì dùng 7 ngày gần nhất thay vì redirect: redirect cũ ghép
 * `&from=` vào một URL chưa có query string, tạo ra path hỏng và trả 404 đúng
 * ở đường dẫn mà nút "Xuất báo cáo" gọi.
 */
export async function GET(request: NextRequest) {
  const { error, response } = await verifyAdminRequest(request, 'report:generate');
  if (error) return response;

  const { searchParams } = new URL(request.url);
  const defaults = defaultRange();
  const from = searchParams.get('from') || defaults.from;
  const to = searchParams.get('to') || defaults.to;

  if (!isValidDate(from) || !isValidDate(to)) {
    return NextResponse.json(
      { error: 'Invalid date', message: 'Ngày phải có định dạng YYYY-MM-DD và là ngày có thật.' },
      { status: 400 }
    );
  }
  if (from > to) {
    return NextResponse.json(
      { error: 'Invalid range', message: 'Ngày bắt đầu không được sau ngày kết thúc.' },
      { status: 400 }
    );
  }

  try {
    const pdf = await buildRevenueReportPdf({ from, to });
    const fileName = `bao-cao-doanh-thu-${from}_${to}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Error generating revenue report PDF:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Không sinh được file PDF báo cáo' },
      { status: 500 }
    );
  }
}
