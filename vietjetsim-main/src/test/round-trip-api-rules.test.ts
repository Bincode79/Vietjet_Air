/**
 * Quy tắc khứ hồi phải được ép ở server, không chỉ ở UI.
 *
 *   1. Chặng về phải bay tuyến ngược với chặng đi và không cất cánh trước khi
 *      chặng đi hạ cánh — API trước đây chỉ tin `return_flight_id`.
 *   2. Số ghế chặng về phải khớp số hành khách có ghế — chặng đi bị chặn,
 *      chặng về không.
 *   3. Hoàn tiền một trip khứ hồi bị cap theo TỔNG trip, không theo dòng
 *      được match: migration 045 đặt toàn bộ giá tiền trên chặng đi và 0 trên
 *      chặng về, nên yêu cầu hoàn từ PNR chặng về từng bị chặn ở "0 VND".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── POST /api/dat-ve ───────────────────────────────────────────────────────

// Một file chỉ được mock `@/lib/db` một lần: khối `vi.mock` sau ghi đè khối
// trước, nên cả hai route chia sẻ chung một object mock.
const dbMocks = vi.hoisted(() => ({
  getBookingsByUserId: vi.fn(),
  createBooking: vi.fn(),
  getFlightById: vi.fn(),
  createUser: vi.fn(),
  findUserByEmail: vi.fn(),
  getActiveBankAccounts: vi.fn(),
  getBookingByCodeOrId: vi.fn(),
  getRefundsByUserId: vi.fn(),
  createRefund: vi.fn(),
  isRefundFeatureEnabled: vi.fn(),
  getBookingCashPaid: vi.fn(),
  getTripById: vi.fn(),
  getSeatLocksForSeats: vi.fn(async () => []),
}));

vi.mock('@/lib/db', () => dbMocks);

vi.mock('@/lib/system-config', () => ({
  getSystemConfigValue: vi.fn(async () => 9),
}));

vi.mock('@/lib/neon', () => ({
  sql: vi.fn(async () => []),
}));

vi.mock('@/lib/auth', () => ({
  verifyAuthRequest: vi.fn(async () => ({
    user: { userId: 'u1', email: 'user@example.com', role: 'user' },
    error: null,
    response: null,
  })),
  hashPassword: vi.fn(),
}));

vi.mock('@/lib/mail', () => ({
  // Route gọi `.catch()` trên giá trị trả về, nên mock phải là một Promise.
  sendPaymentInstructionEmail: vi.fn(() => Promise.resolve()),
}));
vi.mock('@/lib/transfer-note', () => ({ renderTransferNote: vi.fn(() => 'note') }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(() => null) }));
vi.mock('@/lib/guest-booking', () => ({ setGuestBookingCookie: vi.fn() }));

import { POST as createBookingRoute } from '@/app/api/dat-ve/route';

const OUTBOUND = {
  id: 'f-out',
  flight_no: 'VJ 301',
  from_code: 'HAN',
  to_code: 'SGN',
  depart_time: '2026-03-20T06:00:00+07:00',
  arrive_time: '2026-03-20T08:25:00+07:00',
  economy_price: '1000000.00',
  business_price: '2770000.00',
  available: 10,
  class: 'economy',
};

const RETURN_OK = {
  ...OUTBOUND,
  id: 'f-ret',
  flight_no: 'VJ 302',
  from_code: 'SGN',
  to_code: 'HAN',
  depart_time: '2026-03-27T10:00:00+07:00',
  arrive_time: '2026-03-27T12:25:00+07:00',
  economy_price: '1100000.00',
  business_price: '3047000.00',
};

function bookingRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost:4028/api/dat-ve', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      flight_id: 'f-out',
      passengers: [
        {
          name: 'NGUYEN VAN A',
          dob: '1990-01-01',
          idNumber: 'ID1',
          type: 'adult',
          phone: '0900000000',
          email: 'khach@example.com',
        },
      ],
      seats: ['12A'],
      consents: { marketing: false, survey: false, policyAccepted: true },
      ...body,
    }),
  });
}

describe('POST /api/dat-ve — quy tắc chặng về', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.getActiveBankAccounts.mockResolvedValue([]);
    dbMocks.createBooking.mockResolvedValue({ id: 'bk-1', booking_code: 'ABC123' });
  });

  it('chặn 400 khi chuyến về không bay tuyến ngược', async () => {
    dbMocks.getFlightById.mockImplementation(async (id: string) =>
      id === 'f-out' ? OUTBOUND : { ...RETURN_OK, from_code: 'HAN', to_code: 'SGN' }
    );

    const res = await createBookingRoute(
      bookingRequest({ return_flight_id: 'f-ret', return_seats: ['12B'] })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('route mismatch');
    expect(dbMocks.createBooking).not.toHaveBeenCalled();
  });

  it('chặn 400 khi chuyến về cất cánh trước khi chuyến đi hạ cánh', async () => {
    dbMocks.getFlightById.mockImplementation(async (id: string) =>
      id === 'f-out' ? OUTBOUND : { ...RETURN_OK, depart_time: '2026-03-20T07:00:00+07:00' }
    );

    const res = await createBookingRoute(
      bookingRequest({ return_flight_id: 'f-ret', return_seats: ['12B'] })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('before the outbound lands');
    expect(dbMocks.createBooking).not.toHaveBeenCalled();
  });

  it('chặn 400 khi số ghế chặng về không khớp số hành khách có ghế', async () => {
    dbMocks.getFlightById.mockImplementation(async (id: string) =>
      id === 'f-out' ? OUTBOUND : RETURN_OK
    );

    const res = await createBookingRoute(
      bookingRequest({
        return_flight_id: 'f-ret',
        // 1 hành khách có ghế nhưng 2 ghế chặng về
        return_seats: ['12B', '12C'],
      })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('return seats');
    expect(dbMocks.createBooking).not.toHaveBeenCalled();
  });

  it('chấp nhận cặp chuyến hợp lệ: tuyến đảo, khởi hành sau khi hạ cánh, đủ ghế', async () => {
    dbMocks.getFlightById.mockImplementation(async (id: string) =>
      id === 'f-out' ? OUTBOUND : RETURN_OK
    );

    const res = await createBookingRoute(
      bookingRequest({ return_flight_id: 'f-ret', return_seats: ['12B'] })
    );

    expect(res.status).toBe(201);
    // Hai chặng phải được tạo như hai dòng bookings cùng trip.
    expect(dbMocks.createBooking).toHaveBeenCalledTimes(2);
    expect(dbMocks.createBooking).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ flight_id: 'f-out', leg_role: 'outbound' }),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything()
    );
    expect(dbMocks.createBooking).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ flight_id: 'f-ret', leg_role: 'inbound' }),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything()
    );
  });
});

// ─── POST /api/hoan-tien ────────────────────────────────────────────────────

const refundMocks = dbMocks;

vi.mock('@/lib/auth', () => ({
  verifyAuthRequest: vi.fn().mockResolvedValue({
    user: { userId: 'user-1', email: 'a@example.com', role: 'user' },
    error: null,
    response: null,
  }),
}));

import { POST as createRefundRoute } from '@/app/api/hoan-tien/route';

const INBOUND_ROW = {
  id: 'bk-in',
  user_id: 'user-1',
  booking_code: 'XYZ789',
  status: 'confirmed',
  total_price: 0, // migration 045: tiền nằm trên chặng đi
  trip_id: 'trip-1',
  passengers: [],
};

const TRIP = {
  tripId: 'trip-1',
  legs: [
    { bookingId: 'bk-out', legRole: 'outbound', totalPrice: 2_000_000 },
    { bookingId: 'bk-in', legRole: 'inbound', totalPrice: 0 },
  ],
};

function refundRequest(amount: number) {
  return new NextRequest('http://localhost:4028/api/hoan-tien', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      booking_code: 'XYZ789',
      reason: 'Hủy chuyến',
      bank_name: 'Vietcombank',
      account_number: '0123456789',
      account_holder: 'NGUYEN VAN A',
      phone: '0901234567',
      amount,
    }),
  });
}

describe('POST /api/hoan-tien — cap theo tổng trip khứ hồi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refundMocks.isRefundFeatureEnabled.mockResolvedValue(true);
    refundMocks.createRefund.mockResolvedValue({ id: 'rf-1' });
    refundMocks.getBookingCashPaid.mockResolvedValue({
      cashPaid: 2_000_000,
      hasCompletedPayment: true,
    });
  });

  it('không bị cap 0₫ khi yêu cầu hoàn từ PNR chặng về', async () => {
    refundMocks.getBookingByCodeOrId.mockResolvedValue(INBOUND_ROW);
    refundMocks.getTripById.mockResolvedValue(TRIP);

    const res = await createRefundRoute(refundRequest(2_000_000));

    expect(res.status).toBe(201);
    expect(refundMocks.createRefund).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 2_000_000 })
    );
  });

  it('vẫn chặn khi vượt tổng trip', async () => {
    refundMocks.getBookingByCodeOrId.mockResolvedValue(INBOUND_ROW);
    refundMocks.getTripById.mockResolvedValue(TRIP);

    const res = await createRefundRoute(refundRequest(2_500_000));

    expect(res.status).toBe(400);
    expect(refundMocks.createRefund).not.toHaveBeenCalled();
  });

  it('cộng tiền mặt đã thu từ CẢ HAI chặng trước khi cap', async () => {
    refundMocks.getBookingByCodeOrId.mockResolvedValue(INBOUND_ROW);
    refundMocks.getTripById.mockResolvedValue(TRIP);
    // Chỉ chặng đi được trả tiền mặt 1,5tr; chặng về chưa có payment nào.
    refundMocks.getBookingCashPaid.mockImplementation(async (bookingId: string) =>
      bookingId === 'bk-out'
        ? { cashPaid: 1_500_000, hasCompletedPayment: true }
        : { cashPaid: 0, hasCompletedPayment: false }
    );

    const res = await createRefundRoute(refundRequest(2_000_000));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(String(body.message)).toContain('1.500.000');
  });

  it('đơn một chặng giữ nguyên cap theo chính nó', async () => {
    refundMocks.getBookingByCodeOrId.mockResolvedValue({
      ...INBOUND_ROW,
      id: 'bk-1',
      total_price: 2_000_000,
      trip_id: null,
    });

    const res = await createRefundRoute(refundRequest(2_000_000));

    expect(res.status).toBe(201);
    expect(refundMocks.getTripById).not.toHaveBeenCalled();
  });
});
