import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockAdminUser = {
  userId: 'admin-uuid-001',
  email: 'admin@vietjet.shop',
  role: 'admin',
};

const mockOutboundFlight = {
  id: 'flight-out-001',
  flight_no: 'VJ 272',
  from_code: 'SGN',
  to_code: 'HPH',
  depart_time: '2026-12-02 07:00:00',
  arrive_time: '2026-12-02 09:00:00',
  available: 150,
  economy_price: 500000,
  business_price: 1500000,
};

const mockReturnFlight = {
  id: 'flight-ret-002',
  flight_no: 'VJ 273',
  from_code: 'HPH',
  to_code: 'SGN',
  depart_time: '2026-12-05 10:00:00',
  arrive_time: '2026-12-05 12:00:00',
  available: 100,
  economy_price: 600000,
  business_price: 1800000,
};

const mockUser = {
  id: 'usr-customer-001',
  email: 'khach@example.com',
  full_name: 'NGUYEN VAN A',
  phone: '0912345678',
};

const writeAuditLogMock = vi.fn().mockResolvedValue(true);
const sendAutomaticPaymentInvoiceEmailMock = vi.fn().mockResolvedValue({ sent: true });

vi.mock('@/lib/admin-auth', () => ({
  verifyAdminRequest: vi.fn().mockImplementation(async (req: NextRequest) => {
    const authHeader = req.headers.get('authorization');
    if (authHeader === 'Bearer invalid') {
      return {
        payload: null,
        error: 'Unauthorized',
        response: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
      };
    }
    return {
      payload: mockAdminUser,
      error: undefined,
      response: undefined,
    };
  }),
}));

vi.mock('@/lib/payment-invoice', () => ({
  sendAutomaticPaymentInvoiceEmail: (...args: any[]) =>
    sendAutomaticPaymentInvoiceEmailMock(...args),
}));

vi.mock('@/lib/db', () => ({
  getAllBookings: vi.fn().mockResolvedValue({ bookings: [], total: 0 }),
  updateBookingStatus: vi.fn().mockResolvedValue({ id: 'bk-1', status: 'confirmed' }),
  getFlightById: vi.fn().mockImplementation(async (id: string) => {
    if (id === mockOutboundFlight.id) return mockOutboundFlight;
    if (id === mockReturnFlight.id) return mockReturnFlight;
    return null;
  }),
  findUserByEmail: vi.fn().mockImplementation(async (email: string) => {
    if (email === mockUser.email) return mockUser;
    return null;
  }),
  createUser: vi.fn().mockImplementation(async (email: string, _pass: string, name: string) => ({
    id: 'new-usr-999',
    email,
    full_name: name,
  })),
  createBooking: vi.fn().mockImplementation(async (bookingData: any) => ({
    id: bookingData.leg_role === 'inbound' ? 'bk-inbound-002' : 'bk-outbound-001',
    booking_code: bookingData.leg_role === 'inbound' ? 'VJRET2' : 'VJOUT1',
    user_id: bookingData.user_id,
    flight_id: bookingData.flight_id,
    total_price: bookingData.total_price,
    status: 'pending',
    trip_id: bookingData.trip_id,
    leg_role: bookingData.leg_role,
  })),
  writeAuditLog: (...args: any[]) => writeAuditLogMock(...args),
}));

vi.mock('@/lib/neon', () => {
  const sqlMock = vi.fn().mockImplementation(async () => []);
  return { sql: sqlMock };
});

import { POST } from '@/app/api/quan-tri/dat-ve/route';

describe('Admin Quick Booking API (POST /api/quan-tri/dat-ve)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('từ chối khi thiếu thông tin bắt buộc (flight_id hoặc passengers)', async () => {
    const req1 = new NextRequest('http://localhost:3000/api/quan-tri/dat-ve', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const res1 = await POST(req1);
    expect(res1.status).toBe(400);

    const req2 = new NextRequest('http://localhost:3000/api/quan-tri/dat-ve', {
      method: 'POST',
      body: JSON.stringify({ flight_id: 'flight-out-001', passengers: [] }),
    });
    const res2 = await POST(req2);
    expect(res2.status).toBe(400);
  });

  it('báo lỗi 404 nếu không tìm thấy chuyến bay', async () => {
    const req = new NextRequest('http://localhost:3000/api/quan-tri/dat-ve', {
      method: 'POST',
      body: JSON.stringify({
        flight_id: 'non-existent-flight',
        passengers: [{ name: 'NGUYEN VAN A' }],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it('đặt vé 1 chiều thành công và xác nhận (confirmed)', async () => {
    const req = new NextRequest('http://localhost:3000/api/quan-tri/dat-ve', {
      method: 'POST',
      body: JSON.stringify({
        flight_id: mockOutboundFlight.id,
        fare_class: 'eco',
        passengers: [
          {
            name: 'NGUYEN VAN A',
            gender: 'male',
            passenger_type: 'adult',
            phone: '0912345678',
            email: 'khach@example.com',
          },
        ],
        contact: {
          name: 'NGUYEN VAN A',
          email: 'khach@example.com',
          phone: '0912345678',
        },
        status: 'confirmed',
        payment_method: 'bank',
        note: 'Admin đặt vé hỗ trợ khách',
        send_email: true,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.booking.booking_code).toBe('VJOUT1');
    expect(body.booking.status).toBe('confirmed');
    expect(body.booking.payment_method).toBe('bank');

    // Kiểm tra audit log
    expect(writeAuditLogMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'booking:create',
        status: 'success',
      })
    );
  });

  it('đặt vé khứ hồi 2 chiều thành công và liên kết trip_id', async () => {
    const req = new NextRequest('http://localhost:3000/api/quan-tri/dat-ve', {
      method: 'POST',
      body: JSON.stringify({
        flight_id: mockOutboundFlight.id,
        return_flight_id: mockReturnFlight.id,
        fare_class: 'deluxe',
        passengers: [
          {
            name: 'TRAN THI B',
            gender: 'female',
            passenger_type: 'adult',
          },
        ],
        status: 'confirmed',
        payment_method: 'vietqr',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.booking.booking_code).toBe('VJOUT1');
    expect(body.booking.return_booking_id).toBe('bk-inbound-002');
    expect(body.booking.return_booking_code).toBe('VJRET2');
    expect(body.booking.trip_id).toBeDefined();
  });

  it('hỗ trợ ghi đè giá thực thu custom_price', async () => {
    const req = new NextRequest('http://localhost:3000/api/quan-tri/dat-ve', {
      method: 'POST',
      body: JSON.stringify({
        flight_id: mockOutboundFlight.id,
        passengers: [{ name: 'DAI LY CAP 1' }],
        custom_price: 350000,
        status: 'confirmed',
        payment_method: 'agency',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.booking.total_price).toBe(350000);
  });
});
