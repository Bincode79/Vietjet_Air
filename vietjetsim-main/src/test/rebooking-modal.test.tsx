import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import RebookingModal from '@/features/admin/components/RebookingModal';
import * as adminServices from '@/features/admin/services';
import { POST as rebookRoute } from '@/app/api/quan-tri/dat-ve/[id]/doi-chuyen/route';
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
  const tagged = vi.fn((_strings: TemplateStringsArray, ..._values: unknown[]) => {
    return Promise.resolve([]);
  });
  return { sql: tagged };
});

vi.mock('@/lib/admin-auth', () => ({
  verifyAdminRequest: vi.fn(async () => ({
    payload: { userId: 'admin-1', email: 'admin@vietjetsim.vn', role: 'admin' },
  })),
}));

describe('RebookingModal & POST /api/quan-tri/dat-ve/[id]/doi-chuyen', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('API route POST /api/quan-tri/dat-ve/[id]/doi-chuyen xử lý đổi chuyến bay và tính đúng chênh lệch giá + phí đổi', async () => {
    const mockBooking = {
      id: 'b-rebook-01',
      booking_code: 'VJCHANGE1',
      flight_id: 'flight-old-01',
      status: 'confirmed',
      total_price: 599000,
      flight: {
        flight_no: 'VJ 120',
        from_code: 'SGN',
        to_code: 'HAN',
        price: 599000,
        class: 'economy',
      },
      passengers: [
        {
          id: 'p-1',
          name: 'HOANG MINH C',
          seat_number: '12A',
        },
      ],
    };

    const mockNewFlight = {
      id: 'flight-new-02',
      flight_no: 'VJ 128',
      from_code: 'SGN',
      to_code: 'HAN',
      depart_time: '2026-12-05T14:00:00Z',
      arrive_time: '2026-12-05T16:15:00Z',
      price: 899000,
      available: 50,
      class: 'economy',
    };

    vi.spyOn(db, 'getBookingById').mockResolvedValue(mockBooking as never);
    vi.spyOn(db, 'getFlightById').mockResolvedValue(mockNewFlight as never);
    const writeAuditLogSpy = vi.spyOn(db, 'writeAuditLog').mockResolvedValue({} as never);

    const req = new NextRequest(
      'http://localhost:4028/api/quan-tri/dat-ve/b-rebook-01/doi-chuyen',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newFlightId: 'flight-new-02',
          seatNumber: '15B',
          reason: 'Khách muốn bay chuyến chiều',
          waiveFee: false,
        }),
      }
    );

    const res = await rebookRoute(req, {
      params: Promise.resolve({ id: 'b-rebook-01' }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.newFlight.flightNo).toBe('VJ 128');
    // Fare difference: 899000 - 599000 = 300000
    expect(data.summary.totalFareDifference).toBe(300000);
    // Change fee: 350000 for Eco
    expect(data.summary.changeFee).toBe(350000);
    // Total additional: 300000 + 350000 = 650000
    expect(data.summary.totalAdditionalAmount).toBe(650000);
    expect(writeAuditLogSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'booking:rebook',
        targetId: 'b-rebook-01',
      })
    );
  });

  it('API route trả về lỗi 409 nếu chuyến bay mới đã hết chỗ', async () => {
    const mockBooking = {
      id: 'b-rebook-02',
      booking_code: 'VJFULL',
      flight_id: 'flight-old-01',
      status: 'confirmed',
      total_price: 599000,
      flight: { flight_no: 'VJ 120', price: 599000, class: 'economy' },
      passengers: [{ id: 'p-1', name: 'HOANG MINH C' }],
    };

    const mockFullFlight = {
      id: 'flight-full-03',
      flight_no: 'VJ 130',
      price: 999000,
      available: 0, // 0 seats left
    };

    vi.spyOn(db, 'getBookingById').mockResolvedValue(mockBooking as never);
    vi.spyOn(db, 'getFlightById').mockResolvedValue(mockFullFlight as never);

    const req = new NextRequest(
      'http://localhost:4028/api/quan-tri/dat-ve/b-rebook-02/doi-chuyen',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newFlightId: 'flight-full-03',
        }),
      }
    );

    const res = await rebookRoute(req, {
      params: Promise.resolve({ id: 'b-rebook-02' }),
    });

    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toBe('Flight full');
  });

  it('RebookingModal hiển thị danh sách chuyến bay, tính phí và gửi yêu cầu đổi chuyến thành công', async () => {
    const mockAvailableFlights: adminServices.AdminFlight[] = [
      {
        id: 'flight-alt-01',
        flight_no: 'VJ 160',
        from_code: 'SGN',
        to_code: 'HAN',
        airline: 'Vietjet Air',
        depart_time: '2026-12-05T10:00:00Z',
        arrive_time: '2026-12-05T12:15:00Z',
        price: 899000,
        available: 30,
        class: 'economy',
      },
    ];

    vi.spyOn(adminServices, 'listAdminFlights').mockResolvedValue({
      flights: mockAvailableFlights,
      pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
    } as never);

    const rebookSpy = vi.spyOn(adminServices, 'rebookAdminBooking').mockResolvedValue({
      success: true,
      message: 'Đổi chuyến bay thành công!',
      bookingId: 'b-test-01',
      oldFlight: { id: 'old-1', flightNo: 'VJ 120' },
      newFlight: {
        id: 'flight-alt-01',
        flightNo: 'VJ 160',
        from: 'SGN',
        to: 'HAN',
        departTime: '2026-12-05T10:00:00Z',
        arriveTime: '2026-12-05T12:15:00Z',
      },
      summary: {
        passengerCount: 1,
        oldPricePerPax: 599000,
        newPricePerPax: 899000,
        totalFareDifference: 300000,
        changeFee: 350000,
        totalAdditionalAmount: 650000,
        waivedFee: false,
      },
    });

    const mockBooking = {
      id: 'b-test-01',
      booking_code: 'VJABC88',
      flight_id: 'flight-old-01',
      flight_no: 'VJ 120',
      user_name: 'NGUYEN HOANG ANH',
      total_price: 599000,
      route: 'SGN → HAN',
      status: 'confirmed',
    };

    const onSuccessMock = vi.fn();

    render(
      <RebookingModal
        isOpen={true}
        onClose={vi.fn()}
        booking={mockBooking}
        onSuccess={onSuccessMock}
      />
    );

    // Verify modal header
    expect(screen.getByText('Đổi Chuyến Bay & Xử Lý Vé (Rebooking)')).toBeInTheDocument();
    expect(screen.getByText('VJABC88')).toBeInTheDocument();
    expect(screen.getByText('NGUYEN HOANG ANH')).toBeInTheDocument();

    // Click "Xem tất cả ngày" to see all alternative flights
    const allDaysBtn = screen.getByText('Xem tất cả ngày');
    fireEvent.click(allDaysBtn);

    // Wait for the alternative flight to render
    await waitFor(() => {
      expect(screen.getByText('VJ 160')).toBeInTheDocument();
    });

    // Select the flight
    fireEvent.click(screen.getByText('VJ 160'));

    // Check financial calculation: diff 300,000₫ + fee 350,000₫ = 650,000₫
    await waitFor(() => {
      expect(screen.getByText('650.000₫')).toBeInTheDocument();
    });

    // Submit form
    const submitBtn = screen.getByText('Xác nhận đổi chuyến bay');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(rebookSpy).toHaveBeenCalledWith(
        'b-test-01',
        expect.objectContaining({
          newFlightId: 'flight-alt-01',
        })
      );
      expect(onSuccessMock).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Đổi Chuyến Bay Thành Công!')).toBeInTheDocument();
    });
  });
});
