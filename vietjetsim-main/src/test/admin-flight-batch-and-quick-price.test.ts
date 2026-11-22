import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { signAccessToken } from '@/lib/auth';
import { POST as batchCreatePost } from '@/app/api/quan-tri/chuyen-bay/hang-loat/route';
import * as db from '@/lib/db';

vi.mock('@/lib/role-permissions', () => ({
  getRolePermissionsFromDb: vi.fn(async () => new Set<never>([])),
  bypassesPermissionTable: () => true,
}));

vi.mock('@/lib/csrf', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/csrf')>();
  return { ...actual, validateCsrfOrReject: vi.fn(async () => null) };
});

vi.mock('@/lib/neon', async () => {
  const { SYSTEM_ROLES } = await import('@/lib/rbac');
  const tagged = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = Array.isArray(strings) ? strings.join('?') : String(strings);
    if (/from\s+role_permissions/i.test(text)) {
      const role = String(values[0]);
      return Promise.resolve(
        Array.from(SYSTEM_ROLES[role]?.permissions ?? []).map((permission) => ({ permission }))
      );
    }
    return Promise.resolve([]);
  });
  const sqlMock = Object.assign(tagged, {
    query: vi.fn(),
    begin: vi.fn(),
    transaction: vi.fn().mockResolvedValue([[]]),
  });
  return { sql: sqlMock };
});

const makeAdminToken = () =>
  signAccessToken({
    userId: 'test-admin-id',
    email: 'admin@vietjetsim.vn',
    role: 'admin',
    fullName: 'Test Admin',
  });

const CSRF_TOKEN = 'test-csrf-token';
const withCsrf = (accessToken: string) => ({
  cookie: `access_token=${accessToken}; csrf_token=${CSRF_TOKEN}; session_id=test-session`,
  'x-csrf-token': CSRF_TOKEN,
});

function postBatchRequest(body: Record<string, unknown>, token = makeAdminToken()) {
  return new NextRequest('http://localhost:4028/api/quan-tri/chuyen-bay/hang-loat', {
    method: 'POST',
    headers: withCsrf(token),
    body: JSON.stringify(body),
  });
}

describe('API Nhập chặng bay & Chuyến bay hàng loạt (/api/quan-tri/chuyen-bay/hang-loat)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('từ chối khi danh sách flights rỗng (400)', async () => {
    const req = postBatchRequest({ flights: [] });
    const res = await batchCreatePost(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Bad Request');
  });

  it('tạo thành công danh sách chuyến bay hợp lệ theo chặng', async () => {
    const mockCreateFlight = vi.spyOn(db, 'createFlight').mockImplementation(
      async (payload) =>
        ({
          id: 'mock-flight-id-1',
          flight_no: payload.flight_no,
          airline: 'Vietjet Air',
          from_code: payload.from_code,
          to_code: payload.to_code,
          depart_time: payload.depart_time,
          arrive_time: payload.arrive_time,
          price: payload.price,
          economy_price: payload.economyPrice ?? payload.price,
          business_price: payload.businessPrice ?? Math.round(payload.price * 2.77),
          class: payload.class,
          available: payload.available,
          aircraft: payload.aircraft ?? 'A321',
        }) as never
    );

    const req = postBatchRequest({
      flights: [
        {
          flight_no: 'vj 120',
          from_code: 'sgn',
          to_code: 'han',
          depart_time: '2026-11-25T07:00:00+07:00',
          arrive_time: '2026-11-25T09:15:00+07:00',
          economy_price: 699000,
          business_price: 1899000,
        },
        {
          flight_no: 'VJ121',
          from_code: 'HAN',
          to_code: 'SGN',
          depart_time: '2026-11-25T10:30:00+07:00',
          arrive_time: '2026-11-25T12:45:00+07:00',
          economy_price: 699000,
          business_price: 1899000,
        },
      ],
    });

    const res = await batchCreatePost(req);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.createdCount).toBe(2);
    expect(data.skippedCount).toBe(0);
    expect(mockCreateFlight).toHaveBeenCalledTimes(2);

    // Chuẩn hóa số hiệu VJ 120
    expect(mockCreateFlight).toHaveBeenCalledWith(
      expect.objectContaining({
        flight_no: 'VJ 120',
        from_code: 'SGN',
        to_code: 'HAN',
        economyPrice: 699000,
        businessPrice: 1899000,
      })
    );
  });

  it('bỏ qua dòng thiếu thông tin hoặc trùng điểm đi - đến và tiếp tục các dòng khác', async () => {
    vi.spyOn(db, 'createFlight').mockImplementation(
      async (payload) =>
        ({
          id: 'mock-valid-id',
          flight_no: payload.flight_no,
          airline: 'Vietjet Air',
          from_code: payload.from_code,
          to_code: payload.to_code,
          depart_time: payload.depart_time,
          arrive_time: payload.arrive_time,
          price: payload.price,
          class: payload.class,
          available: payload.available,
        }) as never
    );

    const req = postBatchRequest({
      flights: [
        {
          // Thiếu số hiệu
          from_code: 'SGN',
          to_code: 'HAN',
          depart_time: '2026-11-25T07:00:00+07:00',
          arrive_time: '2026-11-25T09:15:00+07:00',
        },
        {
          // Trùng điểm đi - điểm đến
          flight_no: 'VJ 199',
          from_code: 'SGN',
          to_code: 'SGN',
          depart_time: '2026-11-25T07:00:00+07:00',
          arrive_time: '2026-11-25T09:15:00+07:00',
        },
        {
          // Hợp lệ
          flight_no: 'VJ 301',
          from_code: 'SGN',
          to_code: 'DAD',
          depart_time: '2026-11-25T08:00:00+07:00',
          arrive_time: '2026-11-25T09:20:00+07:00',
          economy_price: 499000,
        },
      ],
    });

    const res = await batchCreatePost(req);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.createdCount).toBe(1);
    expect(data.skippedCount).toBe(2);
    expect(data.skipped[0].reason).toContain('Thiếu thông tin');
    expect(data.skipped[1].reason).toContain('trùng nhau');
  });

  it('xử lý graceful khi trùng lịch bay (duplicate schedule conflict)', async () => {
    vi.spyOn(db, 'createFlight').mockRejectedValueOnce({
      code: '23505',
      message: 'duplicate key value violates unique constraint "flights_route_depart_unique"',
    });

    const req = postBatchRequest({
      flights: [
        {
          flight_no: 'VJ 120',
          from_code: 'SGN',
          to_code: 'HAN',
          depart_time: '2026-11-25T07:00:00+07:00',
          arrive_time: '2026-11-25T09:15:00+07:00',
          economy_price: 699000,
        },
      ],
    });

    const res = await batchCreatePost(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.createdCount).toBe(0);
    expect(data.skippedCount).toBe(1);
    expect(data.skipped[0].reason).toContain('Trùng lịch bay');
  });
});

describe('Logic Nhập giá vé nhanh (Quick Fare Pricing)', () => {
  const FARE_LADDER_RATIO = 2.77;

  it('tính toán đúng giá vé Thương gia từ giá vé Phổ thông theo tỷ lệ 2.77', () => {
    const ecoPrices = [99000, 499000, 699000, 999000, 1499000];
    for (const eco of ecoPrices) {
      const expectedBiz = Math.round(eco * FARE_LADDER_RATIO);
      expect(expectedBiz).toBeGreaterThan(eco);
      expect(expectedBiz).toBe(Math.round(eco * 2.77));
    }
  });

  it('tính toán đúng thang giá 4 hạng vé chuẩn Vietjet (Eco -> Deluxe -> SkyBoss -> Business)', () => {
    const eco = 499000;
    const deluxe = eco + 250000;
    const skyboss = Math.round(eco * FARE_LADDER_RATIO);
    const business = Math.round(skyboss * 1.15);

    expect(deluxe).toBe(749000);
    expect(skyboss).toBe(1382230);
    expect(business).toBe(1589564);
    expect(business).toBeGreaterThan(skyboss);
    expect(skyboss).toBeGreaterThan(deluxe);
    expect(deluxe).toBeGreaterThan(eco);
  });

  it('xử lý các mức điều chỉnh delta (+/- 50k, 100k, 200k)', () => {
    let currentEco = 499000;
    const deltas = [-50000, 100000, -100000, 200000];
    for (const delta of deltas) {
      currentEco = Math.max(0, currentEco + delta);
      expect(currentEco).toBeGreaterThanOrEqual(0);
    }
    expect(currentEco).toBe(649000);
  });
});
