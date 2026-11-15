/**
 * Giới hạn số khách/đơn phải được ép ở server, không chỉ ở UI.
 *
 * `PassengerPicker` giới hạn 9 khách, nhưng đó là giới hạn client-side: ai
 * cũng có thể gửi `POST /api/dat-ve` với mảng `passengers` dài hơn. Trước đây
 * route không kiểm tra gì, nên mỗi khách trong mảng đó thành một hàng trong
 * bảng `passengers`.
 *
 * `max_passengers_per_booking` trong `system_config` giờ là giới hạn thật,
 * admin chỉnh được qua tab "Cài đặt hệ thống".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getSystemConfigValue = vi.fn();

vi.mock('@/lib/system-config', () => ({
  getSystemConfigValue: (...args: unknown[]) => getSystemConfigValue(...args),
  SYSTEM_CONFIG_SCHEMA: {
    max_passengers_per_booking: { type: 'number', default: 9, min: 1, max: 9, description: 'x' },
  },
  getSystemConfigBounds: () => ({ min: 1, max: 9 }),
}));

vi.mock('@/lib/neon', () => ({
  sql: vi.fn(async () => []),
}));

vi.mock('@/lib/auth', () => ({
  verifyAuthRequest: vi.fn(async () => ({
    user: { userId: 'u1', email: 'user@example.com', role: 'user' },
  })),
  hashPassword: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  getBookingsByUserId: vi.fn(async () => ({ bookings: [], total: 0 })),
  createBooking: vi.fn(),
  getFlightById: vi.fn(async () => null),
  createUser: vi.fn(),
  findUserByEmail: vi.fn(),
  getActiveBankAccounts: vi.fn(async () => []),
}));

vi.mock('@/lib/mail', () => ({
  sendPaymentInstructionEmail: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn(() => null),
}));

vi.mock('@/lib/csrf', () => ({
  validateCsrfOrReject: vi.fn(async () => null),
}));

import { POST as createBookingRoute } from '@/app/api/dat-ve/route';

function makePassenger(index: number) {
  return {
    name: `Khách ${index}`,
    dob: '1990-01-01',
    idNumber: `ID${index}`,
    type: 'adult',
    phone: '0900000000',
    email: 'khach@example.com',
  };
}

function makeRequest(passengerCount: number) {
  return new Request('http://localhost:4028/api/dat-ve', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      flight_id: 'f1',
      total_price: 1_000_000,
      passengers: Array.from({ length: passengerCount }, (_, i) => makePassenger(i)),
      consents: { marketing: false, survey: false, policyAccepted: true },
    }),
  }) as never;
}

describe('giới hạn số khách/đơn được ép ở API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSystemConfigValue.mockResolvedValue(9);
  });

  it('trả 400 khi số khách vượt giới hạn cấu hình', async () => {
    const res = await createBookingRoute(makeRequest(10));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.maxPassengers).toBe(9);
    expect(String(body.error)).toContain('at most 9');
  });

  it('đọc giới hạn từ system_config chứ không hard-code', async () => {
    getSystemConfigValue.mockResolvedValue(3);

    const res = await createBookingRoute(makeRequest(4));

    expect(getSystemConfigValue).toHaveBeenCalledWith('max_passengers_per_booking');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.maxPassengers).toBe(3);
  });

  it('không chặn khi số khách nằm trong giới hạn', async () => {
    // 3 khách ⇒ qua bước kiểm tra số lượng; request sẽ đi tiếp và fail ở
    // bước sau (flight không tồn tại), nhưng KHÔNG phải vì giới hạn khách.
    const res = await createBookingRoute(makeRequest(3));

    expect(res.status).not.toBe(400);
    const body = await res.json().catch(() => ({}));
    expect(body.maxPassengers).toBeUndefined();
  });
});
