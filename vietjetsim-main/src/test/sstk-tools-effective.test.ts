/**
 * Tool SSTK phải làm đúng việc mà nhãn của nó nói.
 *
 * Ba lỗi đã được sửa ở đây:
 *
 *   * `sync-prices` trước đây tính `basePrice * (0.8 + Math.random() * 0.4)` và
 *     **không ghi gì xuống DB** (comment thừa nhận "In real implementation"),
 *     rồi báo "Đã đồng bộ giá cho N chuyến bay" với status `success`. Admin
 *     tưởng giá đã được cập nhật trong khi không có gì thay đổi.
 *
 *   * `bulk-cancel-flights` tên là "huỷ" nhưng gọi `deleteFlight` — tức là
 *     **xoá vĩnh viễn** chuyến bay (và chỉ chạy được khi chuyến bay chưa có
 *     booking nào) thay vì chuyển `status` sang `cancelled`.
 *
 *   * `reset-stuck-chat` chạy `DELETE` không có `RETURNING`, nên đếm được 0
 *     dù đã xoá hàng loạt presence cũ.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const updateFlight = vi.fn(async (_id: string, _updates: unknown) => ({}) as never);
const deleteFlight = vi.fn(async (_id: string) => {});
const getAllFlights = vi.fn(async () => ({ flights: [] as Record<string, unknown>[] }));
const insertSstkLog = vi.fn(async (..._args: unknown[]) => {});

const sqlMock = vi.fn(async (..._args: unknown[]) => [] as unknown[]);

vi.mock('@/lib/db', () => ({
  getAllFlights: () => getAllFlights(),
  getAllBookings: vi.fn(async () => ({ bookings: [], total: 0 })),
  getAllUsers: vi.fn(async () => ({ users: [], total: 0 })),
  getAllRefunds: vi.fn(async () => ({ refunds: [], total: 0 })),
  updateBookingStatus: vi.fn(async () => {}),
  updateFlight: (id: string, updates: unknown) => updateFlight(id, updates),
  deleteFlight: (id: string) => deleteFlight(id),
  getSstkLogs: vi.fn(async () => []),
  insertSstkLog: (...args: unknown[]) => insertSstkLog(...args),
  archiveOldRefunds: vi.fn(async () => 0),
  writeAuditLog: vi.fn(async () => {}),
}));

vi.mock('@/lib/neon', () => ({
  sql: (...args: unknown[]) => sqlMock(...args),
}));

vi.mock('@/lib/admin-auth', () => ({
  verifyAdminRequest: vi.fn(async () => ({
    payload: { userId: 'admin-1', email: 'admin@example.com', role: 'admin' },
  })),
}));

vi.mock('@/lib/roles', () => ({
  isAdminRole: vi.fn(() => true),
}));

import { POST as executeTool } from '@/app/api/quan-tri/cong-cu/route';

function makeFlight(overrides: Record<string, unknown> = {}) {
  return {
    id: 'f1',
    flight_no: 'VJ121',
    from_code: 'HAN',
    to_code: 'SGN',
    depart_time: '2026-12-01T08:00:00.000Z',
    arrive_time: '2026-12-01T10:00:00.000Z',
    price: 850000,
    economy_price: 850000,
    business_price: 2354500,
    class: 'economy',
    available: 100,
    status: 'active',
    gate: null,
    terminal: null,
    aircraft: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

async function runTool(toolKey: string, params: Record<string, unknown> = {}) {
  const req = new Request('http://localhost:4028/api/quan-tri/cong-cu', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ toolKey, params }),
  }) as never;
  const res = await executeTool(req);
  return { res, body: await res.json() };
}

describe('tool SSTK thực sự tác động dữ liệu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sqlMock.mockResolvedValue([]);
    getAllFlights.mockResolvedValue({ flights: [] });
  });

  describe('sync-prices', () => {
    it('ghi giá mới xuống DB thay vì chỉ tính toán', async () => {
      getAllFlights.mockResolvedValue({ flights: [makeFlight()] });

      const { body } = await runTool('sync-prices', { basePrice: 900000 });

      expect(updateFlight).toHaveBeenCalledTimes(1);
      expect(updateFlight).toHaveBeenCalledWith('f1', {
        price: 900000,
        economy_price: 900000,
        business_price: 900000 * 2.77,
      });
      expect(body.success).toBe(true);
    });

    it('không báo thành công khi không có chuyến bay nào được cập nhật', async () => {
      getAllFlights.mockResolvedValue({ flights: [makeFlight()] });
      updateFlight.mockRejectedValueOnce(new Error('DB down'));

      const { body } = await runTool('sync-prices', { basePrice: 900000 });

      expect(body.success).toBe(false);
      expect(body.status).toBe('partial');
    });

    it('từ chối giá cơ sở không hợp lệ thay vì âm thầm dùng giá mặc định', async () => {
      const { body } = await runTool('sync-prices', { basePrice: -5 });

      expect(updateFlight).not.toHaveBeenCalled();
      expect(body.success).toBe(false);
      expect(body.status).toBe('error');
    });

    it('không đặt giá thấp hơn giá sàn của hệ thống', async () => {
      getAllFlights.mockResolvedValue({ flights: [makeFlight()] });

      await runTool('sync-prices', { basePrice: 1000 });

      expect(updateFlight).toHaveBeenCalledWith(
        'f1',
        expect.objectContaining({ price: 99000, economy_price: 99000 })
      );
    });
  });

  describe('bulk-cancel-flights', () => {
    it('chuyển status sang cancelled chứ không xoá chuyến bay', async () => {
      getAllFlights.mockResolvedValue({ flights: [makeFlight()] });

      const { body } = await runTool('bulk-cancel-flights', {
        dateFrom: '2026-12-01',
        dateTo: '2026-12-02',
      });

      expect(deleteFlight).not.toHaveBeenCalled();
      expect(updateFlight).toHaveBeenCalledWith('f1', { status: 'cancelled' });
      expect(body.success).toBe(true);
    });

    it('không huỷ chuyến bay ngoài khoảng ngày', async () => {
      getAllFlights.mockResolvedValue({ flights: [makeFlight()] });

      await runTool('bulk-cancel-flights', { dateFrom: '2027-01-01', dateTo: '2027-01-31' });

      expect(updateFlight).not.toHaveBeenCalled();
    });
  });

  describe('reset-stuck-chat', () => {
    it('đếm đúng số presence đã xoá', async () => {
      sqlMock.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }]);

      const { body } = await runTool('reset-stuck-chat');

      expect(body.summary).toContain('3');
      // DELETE phải có RETURNING để số hàng bị xoá là con số thật.
      expect(String(sqlMock.mock.calls[0]?.[0])).toContain('RETURNING');
    });
  });
});
