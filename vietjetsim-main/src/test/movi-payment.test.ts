import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as processPayment } from '@/app/api/thanh-toan/route';
import { signAccessToken } from '@/lib/auth';
import * as db from '@/lib/db';

vi.mock('@/lib/neon', async () => {
  const queryMock = vi.fn().mockResolvedValue([{ total: '0' }]);
  const tagged = vi.fn().mockResolvedValue([]);
  const sqlMock = Object.assign(tagged, {
    query: queryMock,
    begin: vi.fn(),
    transaction: vi.fn().mockResolvedValue([[]]),
  });
  return { sql: sqlMock };
});

const CSRF_TOKEN = 'movi-csrf-token';

const customerUser = () => ({
  userId: 'user-movi-123',
  email: 'customer.movi@vietjet.shop',
  role: 'user' as const,
  fullName: 'TRAN THI MOVI',
});

const customerToken = () => signAccessToken(customerUser());

const withCsrf = (token?: string) => ({
  cookie: `access_token=${token ?? ''}; csrf_token=${CSRF_TOKEN}`,
  'x-csrf-token': CSRF_TOKEN,
  'content-type': 'application/json',
});

describe('Chức năng Mua trước trả sau (Bay trước – Trả sau MOVI)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('xử lý thanh toán thành công qua phương thức MOVI với thông tin CCCD và SĐT', async () => {
    const mockBooking = {
      id: 'bk-movi-test-01',
      booking_code: 'MOVI01',
      user_id: 'user-movi-123',
      flight_id: 'flight-101',
      total_price: 3200000,
      status: 'pending',
      created_at: new Date().toISOString(),
      passengers: [{ name: 'TRAN THI MOVI', email: 'customer.movi@vietjet.shop' }],
    };

    vi.spyOn(db, 'getBookingByCodeOrId').mockResolvedValue(mockBooking as any);
    const createPaymentSpy = vi.spyOn(db, 'createPaymentAndConfirmBooking').mockResolvedValue({
      payment: {
        id: 'pay-movi-101',
        booking_id: mockBooking.id,
        amount: 3200000,
        method: 'movi',
        status: 'completed',
        created_at: new Date().toISOString(),
      } as any,
      booking: { ...mockBooking, status: 'confirmed' } as any,
    });

    const moviPayload = {
      booking_id: mockBooking.id,
      method: 'movi',
      amount: 3200000,
      transfer_note: 'MOVI: TRAN THI MOVI - CCCD 079198001234 - SĐT 0912345678',
    };

    const req = new NextRequest('http://localhost:4028/api/thanh-toan', {
      method: 'POST',
      headers: withCsrf(customerToken()),
      body: JSON.stringify(moviPayload),
    });

    const res = await processPayment(req);
    expect(res.status).toBe(201);
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.booking_status).toBe('confirmed');
    expect(body.payment.method).toBe('movi');
    expect(createPaymentSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        booking_id: mockBooking.id,
        method: 'movi',
        amount: 3200000,
        transfer_note: 'MOVI: TRAN THI MOVI - CCCD 079198001234 - SĐT 0912345678',
      })
    );
  });

  it('từ chối giao dịch MOVI nếu số tiền thanh toán không khớp đơn vé', async () => {
    const mockBooking = {
      id: 'bk-movi-test-02',
      booking_code: 'MOVI02',
      user_id: 'user-movi-123',
      total_price: 3200000,
      status: 'pending',
    };

    vi.spyOn(db, 'getBookingByCodeOrId').mockResolvedValue(mockBooking as any);

    const req = new NextRequest('http://localhost:4028/api/thanh-toan', {
      method: 'POST',
      headers: withCsrf(customerToken()),
      body: JSON.stringify({
        booking_id: mockBooking.id,
        method: 'movi',
        amount: 2000000, // Sai số tiền
      }),
    });

    const res = await processPayment(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Invalid payment amount');
    expect(body.message).toContain('Số tiền phải đúng 3.200.000 VND');
  });

  it('từ chối thanh toán trùng lặp khi đặt chỗ MOVI đã được xác nhận trước đó', async () => {
    const mockBooking = {
      id: 'bk-movi-test-03',
      booking_code: 'MOVI03',
      user_id: 'user-movi-123',
      total_price: 3200000,
      status: 'confirmed', // Đã thanh toán trước đó
    };

    vi.spyOn(db, 'getBookingByCodeOrId').mockResolvedValue(mockBooking as any);

    const req = new NextRequest('http://localhost:4028/api/thanh-toan', {
      method: 'POST',
      headers: withCsrf(customerToken()),
      body: JSON.stringify({
        booking_id: mockBooking.id,
        method: 'movi',
        amount: 3200000,
      }),
    });

    const res = await processPayment(req);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe('Already paid');
    expect(body.message).toContain('Đặt chỗ này đã được thanh toán rồi');
  });
});
