import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Endpoint tải vé điện tử — kiểm thử tích hợp (chạy PDF thật).
 *
 * Vì sao cần test này:
 *
 * `src/lib/pdf/boarding-pass.ts` dùng `pdfkit`, và `pdfkit` đọc file font
 * chuẩn `Helvetica` từ đĩa bằng `fs.readFileSync(__dirname + '/data/Helvetica.afm')`.
 * Khi Next bundle `pdfkit` vào `.next/server/chunks/`, `__dirname` trỏ tới
 * thư mục chunk — nơi không có `data/` ⇒ ENOENT ⇒ endpoint trả 500 với lỗi
 * rất khó đoán. Đó chính là lỗi đã xảy ra và được sửa bằng
 * `serverExternalPackages: ['pdfkit']` trong `next.config.mjs`.
 *
 * Test này không phát hiện được lỗi bundle đó (nó chạy trên source, không
 * phải artifact) — việc đó do `scripts/verify-pdf-pipeline.cjs` đảm nhiệm
 * sau khi build. Ở đây ta khẳng định phần còn lại của hợp đồng HTTP:
 * status 200, `Content-Type: application/pdf`, magic bytes `%PDF-`, và tên
 * file theo PNR — những thứ mà khách hàng tải về điện thoại thực sự cần.
 */

vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<any>('@/lib/auth');
  return {
    ...actual,
    verifyAuthRequest: vi.fn().mockResolvedValue({
      user: { userId: 'user-1', email: 'khach@vietjetsim.vn', role: 'user', fullName: 'Khách' },
      error: null,
      response: null,
    }),
  };
});

const BOOKING = {
  id: 'bk-1',
  user_id: 'user-1',
  flight_id: 'fl-1',
  booking_code: 'VJ1234',
  trip_id: 'trip-1',
  leg_role: 'outbound' as const,
  status: 'confirmed' as const,
  total_price: 2500000,
  created_at: '2026-03-01T00:00:00.000Z',
  updated_at: '2026-03-01T00:00:00.000Z',
};

const TRIP = {
  tripId: 'trip-1',
  legs: [
    {
      bookingId: 'bk-1',
      bookingCode: 'VJ1234',
      legRole: 'outbound' as const,
      status: 'confirmed' as const,
      totalPrice: 2500000,
      flightId: 'fl-1',
      flightNo: 'VJ301',
      fromCode: 'HAN',
      toCode: 'SGN',
      fromCity: 'Hà Nội',
      toCity: 'TP. Hồ Chí Minh',
      departTime: '2026-03-20T23:00:00.000Z',
      arriveTime: '2026-03-21T01:25:00.000Z',
      flightStatus: 'active' as const,
      gate: 'A12',
      terminal: '1',
      passengers: [
        {
          id: 'p-1',
          name: 'Nguyễn Văn Anh',
          dob: '1990-01-01',
          id_number: 'C1234567',
          seat_number: '12A',
        },
      ],
      checkIns: [],
    },
  ],
};

vi.mock('@/lib/db', () => ({
  getBookingByCodeOrId: vi.fn().mockImplementation(async (codeOrId: string) => {
    if (codeOrId === BOOKING.id || codeOrId === BOOKING.booking_code) return { ...BOOKING };
    return null;
  }),
  getTripById: vi.fn().mockImplementation(async (tripId: string) => {
    if (tripId === TRIP.tripId) return TRIP;
    return null;
  }),
}));

vi.mock('@/lib/neon', () => ({
  sql: vi.fn().mockResolvedValue([]),
}));

/** Đọc `?leg=` của request. */
function requestFor(path: string) {
  return new NextRequest(`http://localhost:4028${path}`);
}

describe('GET /api/dat-ve/[id]/ve-dien-tu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('trả về file PDF hợp lệ khi tải bằng PNR', async () => {
    const { GET } = await import('@/app/api/dat-ve/[id]/ve-dien-tu/route');

    const res = await GET(requestFor('/api/dat-ve/VJ1234/ve-dien-tu'), {
      params: Promise.resolve({ id: 'VJ1234' }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toBe(
      'attachment; filename="ve-dien-tu-VJ1234.pdf"'
    );
    expect(res.headers.get('cache-control')).toBe('no-store');

    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buf.subarray(-6).toString()).toContain('EOF');
  });

  it('nhúng font tiếng Việt và ảnh QR vào file', async () => {
    const { GET } = await import('@/app/api/dat-ve/[id]/ve-dien-tu/route');

    const res = await GET(requestFor('/api/dat-ve/VJ1234/ve-dien-tu'), {
      params: Promise.resolve({ id: 'VJ1234' }),
    });

    const text = Buffer.from(await res.arrayBuffer()).toString('latin1');
    // Tên font đã đăng ký xuất hiện trong trang font của file PDF.
    expect(text).toContain('KoHo');
    // Mỗi hành khách một mã QR.
    expect((text.match(/\/Subtype\s*\/Image/g) ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it('không để lộ chi tiết khi đặt chỗ không tồn tại', async () => {
    const { GET } = await import('@/app/api/dat-ve/[id]/ve-dien-tu/route');

    const res = await GET(requestFor('/api/dat-ve/KHONG-TON-TAI/ve-dien-tu'), {
      params: Promise.resolve({ id: 'KHONG-TON-TAI' }),
    });

    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('trả 404 khi chặng bay không có hành khách để in vé', async () => {
    const db = await import('@/lib/db');
    (db.getTripById as any).mockResolvedValueOnce({
      ...TRIP,
      legs: [{ ...TRIP.legs[0], passengers: [] }],
    });

    const { GET } = await import('@/app/api/dat-ve/[id]/ve-dien-tu/route');

    const res = await GET(requestFor('/api/dat-ve/VJ1234/ve-dien-tu'), {
      params: Promise.resolve({ id: 'VJ1234' }),
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('No passengers');
  });
});
