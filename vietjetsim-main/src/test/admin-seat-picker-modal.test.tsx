import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AdminSeatPickerModal from '@/features/admin/components/AdminSeatPickerModal';
import * as adminServices from '@/features/admin/services';
import { GET as getFlightRoute } from '@/app/api/quan-tri/chuyen-bay/[id]/route';
import { NextRequest } from 'next/server';
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
  const tagged = vi.fn((strings: TemplateStringsArray, ..._values: unknown[]) => {
    const text = Array.isArray(strings) ? strings.join('?') : String(strings);
    if (/from\s+seats/i.test(text)) {
      return Promise.resolve([{ seat_number: '1A' }, { seat_number: '12B' }]);
    }
    if (/from\s+seat_locks/i.test(text)) {
      return Promise.resolve([{ seat_number: '15C' }]);
    }
    return Promise.resolve([]);
  });
  return { sql: tagged };
});

vi.mock('@/lib/admin-auth', () => ({
  verifyAdminRequest: vi.fn(async () => ({
    payload: { userId: 'admin-1', email: 'admin@vietjetsim.vn', role: 'admin' },
  })),
}));

describe('AdminSeatPickerModal & GET /api/quan-tri/chuyen-bay/[id]', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('GET /api/quan-tri/chuyen-bay/[id] trả về thông tin chuyến bay kèm danh sách ghế đã bán & tỷ lệ lấp đầy', async () => {
    vi.spyOn(db, 'getFlightById').mockResolvedValue({
      id: 'flight-test-01',
      flight_no: 'VJ 120',
      from_code: 'SGN',
      to_code: 'HAN',
      depart_time: '2026-12-01T07:00:00Z',
      arrive_time: '2026-12-01T09:15:00Z',
      price: 599000,
      economy_price: 599000,
      business_price: 1699000,
      available: 178,
      aircraft: 'Airbus A321',
      airline: 'Vietjet Air',
      class: 'economy',
    } as never);

    const req = new NextRequest('http://localhost:4028/api/quan-tri/chuyen-bay/flight-test-01');
    const res = await getFlightRoute(req, {
      params: Promise.resolve({ id: 'flight-test-01' }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.flight.flight_no).toBe('VJ 120');
    expect(data.occupiedSeats).toContain('1A');
    expect(data.occupiedSeats).toContain('12B');
    expect(data.lockedSeats).toContain('15C');
    expect(data.occupiedCount).toBe(2);
  });

  it('render modal sơ đồ ghế ở chế độ pick, chọn ghế thành công và gọi onConfirm', async () => {
    const mockSeatMapData: adminServices.AdminFlightSeatMapData = {
      flight: {
        id: 'flight-test-01',
        flight_no: 'VJ 120',
        from_code: 'SGN',
        to_code: 'HAN',
        airline: 'Vietjet Air',
        depart_time: '2026-12-01T07:00:00Z',
        arrive_time: '2026-12-01T09:15:00Z',
        price: 599000,
        available: 178,
        class: 'economy',
        aircraft: 'Airbus A321',
      },
      occupiedSeats: ['1A', '2B'],
      lockedSeats: ['3C'],
      totalSeats: 180,
      occupiedCount: 2,
      occupancyRate: 1.1,
    };

    vi.spyOn(adminServices, 'getAdminFlightSeatMap').mockResolvedValue(mockSeatMapData);
    const onConfirmMock = vi.fn();
    const onCloseMock = vi.fn();

    render(
      <AdminSeatPickerModal
        isOpen={true}
        onClose={onCloseMock}
        flightId="flight-test-01"
        mode="pick"
        maxSelectable={1}
        onConfirm={onConfirmMock}
      />
    );

    // Header checks
    await waitFor(() => {
      expect(screen.getByText('Chọn Ghế Cho Hành Khách')).toBeInTheDocument();
      expect(screen.getByText('VJ 120')).toBeInTheDocument();
    });

    // Check legend items
    expect(screen.getByText('Ghế trống')).toBeInTheDocument();
    expect(screen.getByText('SkyBoss (Hàng 1-3)')).toBeInTheDocument();

    // Seat 4A is free. Click on 4A
    const seat4A = screen.getByTitle(/Ghế 4A/i);
    expect(seat4A).toBeInTheDocument();
    fireEvent.click(seat4A);

    // Confirm button should show 1 seat selected
    const confirmBtn = screen.getByText(/Xác nhận gán ghế \(1\)/i);
    expect(confirmBtn).toBeEnabled();
    fireEvent.click(confirmBtn);

    expect(onConfirmMock).toHaveBeenCalledWith(['4A']);
    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });

  it('ở chế độ view, modal không cho chọn ghế và không có nút xác nhận gán ghế', async () => {
    const mockSeatMapData: adminServices.AdminFlightSeatMapData = {
      flight: {
        id: 'flight-test-01',
        flight_no: 'VJ 120',
        from_code: 'SGN',
        to_code: 'HAN',
        airline: 'Vietjet Air',
        depart_time: '2026-12-01T07:00:00Z',
        arrive_time: '2026-12-01T09:15:00Z',
        price: 599000,
        available: 178,
        class: 'economy',
      },
      occupiedSeats: ['1A'],
      lockedSeats: [],
      totalSeats: 180,
      occupiedCount: 1,
      occupancyRate: 0.6,
    };

    vi.spyOn(adminServices, 'getAdminFlightSeatMap').mockResolvedValue(mockSeatMapData);

    render(
      <AdminSeatPickerModal isOpen={true} onClose={vi.fn()} flightId="flight-test-01" mode="view" />
    );

    await waitFor(() => {
      expect(screen.getByText('Sơ Đồ Ghế Ngồi Chuyến Bay')).toBeInTheDocument();
    });

    // Confirmation button should NOT exist in view mode
    expect(screen.queryByText(/Xác nhận gán ghế/i)).not.toBeInTheDocument();
  });
});
