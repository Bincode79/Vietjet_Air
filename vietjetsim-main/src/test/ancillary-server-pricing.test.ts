/**
 * Dịch vụ bổ sung bị định giá HAI LẦN theo hai bảng giá khác nhau.
 *
 * Drawer báo giá theo gói thật (`BAGGAGE_PACKAGES` 200k-750k, combo ăn 119k,
 * Travel Safe 72k) nhưng API chỉ nhận id và định giá lại từ `ANCILLARY_OPTIONS`
 * (150k / 100k / 60k flat) — khách thấy tổng 400.000₫ cho gói 40kg nhưng bị
 * book đúng 150.000₫, rồi trang thanh toán hiện một số tiền khác với bước
 * dịch vụ. Giờ client gửi LỰA CHỌN (id gói, cờ ưu tiên, số lượng món) và
 * server định giá từ cùng catalogue — số tiền hiển thị và bị thu là một.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const dbMocks = vi.hoisted(() => ({
  getBookingsByUserId: vi.fn(),
  createBooking: vi.fn(),
  getFlightById: vi.fn(),
  createUser: vi.fn(),
  findUserByEmail: vi.fn(),
  getActiveBankAccounts: vi.fn(),
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

const FLIGHT = {
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

function serviceRequest(body: Record<string, unknown>) {
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
      seats: [],
      consents: { marketing: false, survey: false, policyAccepted: true },
      ...body,
    }),
  });
}

/** Ghế 12A là 55.000₫ + 15% thuế/phí = 63.250₫; vé eco 1tr + 15% thuế. */
const FARE = 1_000_000;
const TAX = 150_000;
const SEAT_12A = 63_250;

describe('POST /api/dat-ve — dịch vụ được định giá theo catalogue của server', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.getActiveBankAccounts.mockResolvedValue([]);
    dbMocks.getFlightById.mockResolvedValue(FLIGHT);
    dbMocks.createBooking.mockResolvedValue({ id: 'bk-1', booking_code: 'ABC123' });
  });

  it('gói 40kg + ưu tiên lên máy bay được thu đúng 630.000₫', async () => {
    const res = await createBookingRoute(
      serviceRequest({
        baggage: { outbound_package_id: 'bg-40', outbound_priority: true },
      })
    );

    expect(res.status).toBe(201);
    const ancillaryRows = dbMocks.createBooking.mock.calls[0][3];
    expect(ancillaryRows).toEqual([
      { option_id: 'baggage', unit_price: 400_000 + 230_000, quantity: 1 },
    ]);
    const total = dbMocks.createBooking.mock.calls[0][0].total_price;
    expect(total).toBe(FARE + TAX + 630_000);
  });

  it('gói hành lý cho CẢ HAI chặng được cộng dồn vào một dòng', async () => {
    dbMocks.getFlightById.mockImplementation(async (id: string) =>
      id === 'f-out'
        ? FLIGHT
        : {
            ...FLIGHT,
            id: 'f-ret',
            from_code: 'SGN',
            to_code: 'HAN',
            depart_time: '2026-03-27T10:00:00+07:00',
            arrive_time: '2026-03-27T12:25:00+07:00',
          }
    );

    const res = await createBookingRoute(
      serviceRequest({
        return_flight_id: 'f-ret',
        baggage: { outbound_package_id: 'bg-20', return_package_id: 'bg-30' },
        return_seats: [],
      })
    );

    expect(res.status).toBe(201);
    const ancillaryRows = dbMocks.createBooking.mock.calls[0][3];
    // 200.000 (đi) + 300.000 (về), một dòng duy nhất (UNIQUE booking+option).
    expect(ancillaryRows).toEqual([{ option_id: 'baggage', unit_price: 500_000, quantity: 1 }]);
  });

  it('hai món ăn được thu theo từng món 119.000₫', async () => {
    const res = await createBookingRoute(serviceRequest({ meals: { 'meal-my-y': 2 } }));

    expect(res.status).toBe(201);
    const ancillaryRows = dbMocks.createBooking.mock.calls[0][3];
    expect(ancillaryRows).toEqual([{ option_id: 'meal-my-y', unit_price: 119_000, quantity: 2 }]);
    const total = dbMocks.createBooking.mock.calls[0][0].total_price;
    expect(total).toBe(FARE + TAX + 2 * 119_000);
  });

  it('Travel Safe được thu đúng 72.000₫, một lần cho booking', async () => {
    const res = await createBookingRoute(serviceRequest({ ancillaries: ['insurance'] }));

    expect(res.status).toBe(201);
    const ancillaryRows = dbMocks.createBooking.mock.calls[0][3];
    expect(ancillaryRows).toEqual([{ option_id: 'insurance', unit_price: 72_000, quantity: 1 }]);
    const total = dbMocks.createBooking.mock.calls[0][0].total_price;
    expect(total).toBe(FARE + TAX + 72_000);
  });

  it('chặn 400 gói hành lý không có trong catalogue', async () => {
    const res = await createBookingRoute(
      serviceRequest({ baggage: { outbound_package_id: 'bg-999' } })
    );

    expect(res.status).toBe(400);
    expect(dbMocks.createBooking).not.toHaveBeenCalled();
  });

  it('chặn 400 món ăn không có trong catalogue', async () => {
    const res = await createBookingRoute(serviceRequest({ meals: { 'meal-tu-tien': 1 } }));

    expect(res.status).toBe(400);
    expect(dbMocks.createBooking).not.toHaveBeenCalled();
  });

  it('client cũ chỉ gửi id vẫn được định giá theo bảng flat (không vỡ hợp đồng)', async () => {
    const res = await createBookingRoute(
      serviceRequest({ ancillaries: ['baggage', 'meal'], meals: {}, baggage: {} })
    );

    expect(res.status).toBe(201);
    const ancillaryRows = dbMocks.createBooking.mock.calls[0][3];
    expect(ancillaryRows).toEqual([
      { option_id: 'baggage', unit_price: 150_000, quantity: 1 },
      { option_id: 'meal', unit_price: 100_000, quantity: 1 },
    ]);
  });

  it('ghế 12A + gói 40kg + 2 món + bảo hiểm khớp tổng drawer báo', async () => {
    const res = await createBookingRoute(
      serviceRequest({
        seats: ['12A'],
        baggage: { outbound_package_id: 'bg-40' },
        meals: { 'meal-my-y': 2 },
        ancillaries: ['insurance'],
      })
    );

    expect(res.status).toBe(201);
    const total = dbMocks.createBooking.mock.calls[0][0].total_price;
    // Đúng cái số khách nhìn thấy ở bước dịch vụ: vé + thuế + ghế + 400k
    // hành lý + 238k hai món + 72k bảo hiểm.
    expect(total).toBe(FARE + TAX + SEAT_12A + 400_000 + 238_000 + 72_000);
  });
});
