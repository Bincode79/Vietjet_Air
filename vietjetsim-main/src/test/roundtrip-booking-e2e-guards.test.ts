import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock DB
const mocks = vi.hoisted(() => ({
  getFlightById: vi.fn(),
  createBooking: vi.fn(),
  findUserByEmail: vi.fn(),
  createUser: vi.fn(),
  getSystemConfigValue: vi.fn(),
  getSeatLocksForSeats: vi.fn(),
  getBookingsByUserId: vi.fn(),
}));

vi.mock('@/lib/db', () => mocks);
vi.mock('@/lib/auth', () => ({
  verifyAuthRequest: vi.fn().mockResolvedValue({ user: null, error: null, response: null }),
  hashPassword: vi.fn().mockResolvedValue('hashed_pw'),
}));

vi.mock('@/lib/system-config', () => ({
  getSystemConfigValue: vi.fn().mockResolvedValue(9),
}));

vi.mock('@/lib/guest-booking', () => ({
  setGuestBookingCookie: vi.fn(),
}));

import { POST as createBookingRoute } from '@/app/api/dat-ve/route';

describe('Giai đoạn B: Siết kiểm thử API đặt vé và chống hồi quy (Roundtrip & Security)', () => {
  const outboundFlight = {
    id: 'fl-outbound-1',
    flight_no: 'VJ123',
    economy_price: 1000000,
    business_price: 2500000,
    available: 50,
    depart_time: '2026-11-20T08:00:00.000Z',
    arrive_time: '2026-11-20T10:10:00.000Z',
  };

  const inboundFlight = {
    id: 'fl-inbound-2',
    flight_no: 'VJ124',
    economy_price: 1200000,
    business_price: 2800000,
    available: 50,
    depart_time: '2026-11-25T14:00:00.000Z',
    arrive_time: '2026-11-25T16:10:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getFlightById.mockImplementation(async (id: string) => {
      if (id === outboundFlight.id) return outboundFlight;
      if (id === inboundFlight.id) return inboundFlight;
      return null;
    });
    mocks.findUserByEmail.mockResolvedValue({ id: 'guest-user-1', email: 'guest@vietjetsim.vn' });
    mocks.createBooking.mockImplementation(async (params: any) => ({
      id: 'bk-new-123',
      booking_code: 'VJ8899',
      total_price: params.total_price,
      status: 'pending',
    }));
  });

  it('Server tự tính giá, từ chối tin giá total_price do client gửi lên (anti-tampering)', async () => {
    // Client cố tình gửi total_price: 1000₫ nhằm gian lận giá vé
    const req = new NextRequest('http://localhost:4028/api/dat-ve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        flight_id: outboundFlight.id,
        return_flight_id: inboundFlight.id,
        total_price: 1000, // Malicious fake price
        passengers: [
          {
            name: 'NGUYEN VAN A',
            dob: '1995-10-20',
            phone: '0912345678',
            email: 'nguyen.vana@gmail.com',
            idNumber: '001234001234',
            type: 'adult',
          },
        ],
        fareClass: 'eco',
        returnFareClass: 'eco',
        consents: { policyAccepted: true },
      }),
    });

    const res = await createBookingRoute(req);
    expect(res.status).toBe(201);

    // Kiểm tra createBooking được gọi với giá được tính lại từ bảng giá hệ thống, KHÔNG PHẢI 1000₫
    expect(mocks.createBooking).toHaveBeenCalled();
    const calledParams = mocks.createBooking.mock.calls[0][0];
    expect(calledParams.total_price).toBeGreaterThan(1000);
    // Giá vé đi (1.000.000 + thuế 100.000) + vé về (1.200.000 + thuế 120.000) + phí = 2.530.000₫
    expect(calledParams.total_price).toBe(2530000);
  });

  it('Từ chối tạo đặt vé nếu thiếu CCCD / Hộ chiếu (idNumber) của hành khách người lớn', async () => {
    const req = new NextRequest('http://localhost:4028/api/dat-ve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        flight_id: outboundFlight.id,
        passengers: [
          {
            name: 'NGUYEN VAN A',
            dob: '1995-10-20',
            phone: '0912345678',
            email: 'nguyen.vana@gmail.com',
            // Missing idNumber!
            type: 'adult',
          },
        ],
        consents: { policyAccepted: true },
      }),
    });

    const res = await createBookingRoute(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('everyone except infants needs an ID document');
  });

  it('Từ chối tạo đặt vé nếu chưa đồng ý điều khoản (policyAccepted: false)', async () => {
    const req = new NextRequest('http://localhost:4028/api/dat-ve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        flight_id: outboundFlight.id,
        passengers: [
          {
            name: 'NGUYEN VAN A',
            dob: '1995-10-20',
            phone: '0912345678',
            email: 'nguyen.vana@gmail.com',
            idNumber: '001234001234',
            type: 'adult',
          },
        ],
        consents: { policyAccepted: false },
      }),
    });

    const res = await createBookingRoute(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Policy acceptance is required');
  });

  it('Từ chối chặng về khởi hành trước khi chặng đi hạ cánh', async () => {
    const invalidInbound = {
      ...inboundFlight,
      depart_time: '2026-11-20T09:00:00.000Z', // Bay lúc 9h trong khi chặng đi hạ cánh 10h10!
    };
    mocks.getFlightById.mockImplementation(async (id: string) => {
      if (id === outboundFlight.id) return outboundFlight;
      if (id === invalidInbound.id) return invalidInbound;
      return null;
    });

    const req = new NextRequest('http://localhost:4028/api/dat-ve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        flight_id: outboundFlight.id,
        return_flight_id: invalidInbound.id,
        passengers: [
          {
            name: 'NGUYEN VAN A',
            dob: '1995-10-20',
            phone: '0912345678',
            email: 'nguyen.vana@gmail.com',
            idNumber: '001234001234',
            type: 'adult',
          },
        ],
        consents: { policyAccepted: true },
      }),
    });

    const res = await createBookingRoute(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Return flight departs before the outbound lands');
  });
});
