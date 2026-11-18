import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getFareForClass, TAX_AND_FEE_RATE } from '@/features/bookings/pricing';

/* ──────────────────────────────────────────────────────────────
   Hợp đồng tiền tệ của API đặt vé & thanh toán:
   - server tự tính giá, bỏ qua `total_price` client gửi;
   - payment ghi đúng số tiền của booking, không tin `amount` client;
   - booking đã trả tiền không bị trừ/thu lần hai.

   Webhook VietQR (chữ ký, replay, amount mismatch) đã có bộ test riêng
   `src/test/vietqr-webhook.test.ts`; file này không lặp lại.
   ────────────────────────────────────────────────────────────── */

const db = vi.hoisted(() => ({
  getBookingsByUserId: vi.fn(),
  createBooking: vi.fn(),
  getFlightById: vi.fn(),
  createUser: vi.fn(),
  findUserByEmail: vi.fn(),
  getSeatLocksForSeats: vi.fn().mockResolvedValue([]),
  getBookingByCodeOrId: vi.fn(),
  getActiveBankAccounts: vi.fn().mockResolvedValue([]),
  createPaymentAndConfirmBooking: vi.fn(),
  updateBookingStatus: vi.fn(),
  getTripById: vi.fn().mockResolvedValue(null),
  getUserLoyaltyWithProgram: vi.fn(),
  spendLoyaltyPoints: vi.fn(),
  refundLoyaltyPoints: vi.fn(),
  awardBookingLoyaltyPoints: vi.fn(),
  findUserById: vi.fn(),
  getDiscountCodeById: vi.fn(),
  getDiscountCodeByCode: vi.fn(),
  countUserDiscountUsage: vi.fn(),
  claimDiscountUsage: vi.fn(),
  releaseDiscountUsage: vi.fn(),
}));

vi.mock('@/lib/db', () => db);

vi.mock('@/lib/auth', () => ({
  verifyAuthRequest: vi.fn().mockResolvedValue({ user: null, error: null, response: null }),
  hashPassword: vi.fn().mockResolvedValue('hashed'),
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn(() => null),
}));

vi.mock('@/lib/system-config', () => ({
  getSystemConfigValue: vi.fn().mockResolvedValue(9),
}));

vi.mock('@/lib/guest-booking', () => ({
  setGuestBookingCookie: vi.fn(),
  isGuestBookingOwner: vi.fn(() => true),
}));

vi.mock('@/lib/booking-access', () => ({
  canAccessBooking: vi.fn(() => true),
}));

vi.mock('@/lib/seat-session', () => ({
  readSeatSession: vi.fn(() => null),
  deriveOwnerToken: vi.fn(() => null),
}));

vi.mock('@/lib/mail', () => ({
  sendPaymentInstructionEmail: vi.fn().mockResolvedValue(true),
  sendPaymentFailedEmail: vi.fn().mockResolvedValue(true),
  sendPaymentPendingReviewEmail: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/lib/payment-invoice', () => ({
  sendAutomaticPaymentInvoiceEmail: vi.fn().mockResolvedValue(true),
}));

import { POST as createBookingRoute } from '@/app/api/dat-ve/route';
import { POST as createPaymentRoute } from '@/app/api/thanh-toan/route';

function jsonRequest(body: unknown, url = 'http://localhost/api/dat-ve') {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validPassenger = {
  name: 'NGUYEN VAN A',
  dob: '1995-10-20',
  idNumber: '001234001234',
  phone: '0912345678',
  email: 'nguyen@example.com',
  type: 'adult',
};

const booking = {
  id: 'booking-1',
  booking_code: 'FG7KH9',
  user_id: 'user-1',
  status: 'pending',
  total_price: 2_000_000,
  flight_id: 'flight-1',
  trip_id: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  db.getSeatLocksForSeats.mockResolvedValue([]);
  db.getTripById.mockResolvedValue(null);
  db.getActiveBankAccounts.mockResolvedValue([]);
  db.awardBookingLoyaltyPoints.mockResolvedValue(undefined);
  db.findUserByEmail.mockResolvedValue({ id: 'guest-1' });
  db.getFlightById.mockResolvedValue({
    id: 'flight-1',
    flight_no: 'VJ 301',
    from_code: 'SGN',
    to_code: 'HAN',
    depart_time: '2026-12-01T01:00:00Z',
    arrive_time: '2026-12-01T03:00:00Z',
    price: 1_000_000,
    economy_price: 1_000_000,
    business_price: 2_770_000,
    class: 'economy',
    available: 100,
  });
});

describe('POST /api/dat-ve — server tự tính giá', () => {
  it('bỏ qua total_price client gửi và dùng giá server tính', async () => {
    db.createBooking.mockImplementationOnce(async (input: { total_price: number }) => ({
      ...booking,
      total_price: input.total_price,
    }));

    const res = await createBookingRoute(
      jsonRequest({
        flight_id: 'flight-1',
        passengers: [validPassenger],
        seats: [],
        fareClass: 'eco',
        consents: { policyAccepted: true },
        // Client cố tình gửi một con số vô lý; server phải bỏ qua.
        total_price: 999_999_999,
      })
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.booking.booking_code).toBe('FG7KH9');

    expect(db.createBooking).toHaveBeenCalledTimes(1);
    const sentTotal = (db.createBooking.mock.calls[0][0] as { total_price: number }).total_price;
    expect(sentTotal).not.toBe(999_999_999);

    // eco = giá economy của chuyến; một người lớn; thuế/phí theo hằng số
    // dùng chung với UI, không phải một bản sao trong route.
    const fare = getFareForClass('eco', {
      economyPrice: 1_000_000,
      businessPrice: 2_770_000,
    });
    expect(sentTotal).toBe(Math.round(fare + fare * TAX_AND_FEE_RATE));
  });

  it('từ chối fare class không tồn tại thay vì lặng lẽ hạ xuống eco', async () => {
    const res = await createBookingRoute(
      jsonRequest({
        flight_id: 'flight-1',
        passengers: [validPassenger],
        fareClass: 'Eco',
        consents: { policyAccepted: true },
      })
    );

    expect(res.status).toBe(400);
    expect(db.createBooking).not.toHaveBeenCalled();
  });

  it('báo 400 khi người lớn thiếu idNumber', async () => {
    const res = await createBookingRoute(
      jsonRequest({
        flight_id: 'flight-1',
        passengers: [{ ...validPassenger, idNumber: undefined }],
        consents: { policyAccepted: true },
      })
    );

    expect(res.status).toBe(400);
    expect(db.createBooking).not.toHaveBeenCalled();
  });
});

describe('POST /api/thanh-toan — số tiền và double-charge', () => {
  it('ghi nhận payment đúng giá booking và trả 201', async () => {
    db.getBookingByCodeOrId.mockResolvedValueOnce(booking);
    db.createPaymentAndConfirmBooking.mockResolvedValueOnce({
      payment: {
        id: 'payment-1',
        booking_id: booking.id,
        method: 'card',
        status: 'completed',
        amount: booking.total_price,
        created_at: '2026-11-18T00:00:00.000Z',
      },
      booking: { ...booking, status: 'confirmed' },
    });

    const res = await createPaymentRoute(
      jsonRequest(
        { booking_id: booking.booking_code, method: 'card', amount: booking.total_price },
        'http://localhost/api/thanh-toan'
      )
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.booking_status).toBe('confirmed');

    expect(db.createPaymentAndConfirmBooking).toHaveBeenCalledTimes(1);
    expect(db.createPaymentAndConfirmBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        booking_id: booking.id,
        method: 'card',
        amount: booking.total_price,
        status: 'completed',
      })
    );
  });

  it('từ chối amount do client gửi khi lệch giá booking', async () => {
    db.getBookingByCodeOrId.mockResolvedValueOnce(booking);

    const res = await createPaymentRoute(
      jsonRequest(
        { booking_id: booking.booking_code, method: 'card', amount: 1 },
        'http://localhost/api/thanh-toan'
      )
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid payment amount');
    expect(db.createPaymentAndConfirmBooking).not.toHaveBeenCalled();
  });

  it('báo 409 khi booking đã được thanh toán (double-charge)', async () => {
    db.getBookingByCodeOrId.mockResolvedValueOnce({ ...booking, status: 'confirmed' });

    const res = await createPaymentRoute(
      jsonRequest(
        { booking_id: booking.booking_code, method: 'card', amount: booking.total_price },
        'http://localhost/api/thanh-toan'
      )
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('Already paid');
    expect(db.createPaymentAndConfirmBooking).not.toHaveBeenCalled();
  });

  it('báo 404 khi booking không tồn tại', async () => {
    db.getBookingByCodeOrId.mockResolvedValueOnce(null);

    const res = await createPaymentRoute(
      jsonRequest(
        { booking_id: 'NONEXISTENT', method: 'card', amount: 100_000 },
        'http://localhost/api/thanh-toan'
      )
    );

    expect(res.status).toBe(404);
  });

  it('báo 400 khi thiếu amount', async () => {
    const res = await createPaymentRoute(
      jsonRequest(
        { booking_id: booking.booking_code, method: 'card' },
        'http://localhost/api/thanh-toan'
      )
    );

    expect(res.status).toBe(400);
  });
});
