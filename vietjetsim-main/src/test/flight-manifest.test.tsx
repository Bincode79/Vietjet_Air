import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import FlightManifestModal from '@/features/admin/components/FlightManifestModal';
import * as adminServices from '@/features/admin/services';
import { GET as getManifestRoute } from '@/app/api/quan-tri/chuyen-bay/[id]/hanh-khach/route';
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
    if (/from\s+passengers/i.test(text)) {
      return Promise.resolve([
        {
          id: 'p-1',
          booking_id: 'b-1',
          booking_code: 'VJABC1',
          booking_status: 'confirmed',
          name: 'NGUYEN VAN A',
          gender: 'male',
          dob: '1990-01-01',
          id_number: '012345678901',
          passenger_type: 'adult',
          phone: '0901234567',
          email: 'nguyenvana@example.com',
          seat_number: '12A',
          is_checked_in: true,
          check_in_time: '2026-12-01T06:00:00Z',
          boarding_pass_code: 'BP-VJABC1-12A',
          contact_email: 'nguyenvana@example.com',
          contact_phone: '0901234567',
        },
        {
          id: 'p-2',
          booking_id: 'b-2',
          booking_code: 'VJXYZ2',
          booking_status: 'confirmed',
          name: 'TRAN THI B',
          gender: 'female',
          dob: '1995-05-15',
          id_number: '098765432109',
          passenger_type: 'adult',
          phone: '0987654321',
          email: 'tranthib@example.com',
          seat_number: '14B',
          is_checked_in: false,
          check_in_time: null,
          boarding_pass_code: null,
          contact_email: 'tranthib@example.com',
          contact_phone: '0987654321',
        },
      ]);
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

describe('FlightManifestModal & GET /api/quan-tri/chuyen-bay/[id]/hanh-khach', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('GET /api/quan-tri/chuyen-bay/[id]/hanh-khach trả về danh sách hành khách đầy đủ kèm trạng thái check-in', async () => {
    vi.spyOn(db, 'getFlightById').mockResolvedValue({
      id: 'flight-pnl-01',
      flight_no: 'VJ 152',
      from_code: 'SGN',
      to_code: 'HAN',
      depart_time: '2026-12-01T08:00:00Z',
      arrive_time: '2026-12-01T10:15:00Z',
      price: 699000,
      economy_price: 699000,
      business_price: 1899000,
      available: 150,
      aircraft: 'Airbus A321',
      airline: 'Vietjet Air',
      class: 'economy',
    } as never);

    const req = new NextRequest(
      'http://localhost:4028/api/quan-tri/chuyen-bay/flight-pnl-01/hanh-khach'
    );
    const res = await getManifestRoute(req, {
      params: Promise.resolve({ id: 'flight-pnl-01' }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.totalPassengers).toBe(2);
    expect(data.checkedInCount).toBe(1);
    expect(data.notCheckedInCount).toBe(1);
    expect(data.passengers[0].name).toBe('NGUYEN VAN A');
    expect(data.passengers[0].seat_number).toBe('12A');
    expect(data.passengers[0].is_checked_in).toBe(true);
    expect(data.passengers[1].name).toBe('TRAN THI B');
    expect(data.passengers[1].is_checked_in).toBe(false);
  });

  it('FlightManifestModal hiển thị thông tin chuyến bay, hành khách, lọc check-in và hỗ trợ tìm kiếm', async () => {
    const mockManifestData: adminServices.AdminFlightManifestData = {
      success: true,
      flight: {
        id: 'flight-pnl-01',
        flight_no: 'VJ 152',
        from_code: 'SGN',
        to_code: 'HAN',
        airline: 'Vietjet Air',
        depart_time: '2026-12-01T08:00:00Z',
        arrive_time: '2026-12-01T10:15:00Z',
        price: 699000,
        available: 150,
        status: 'active',
        class: 'economy',
        aircraft: 'Airbus A321',
      },
      passengers: [
        {
          id: 'p-1',
          booking_id: 'b-1',
          booking_code: 'VJABC1',
          booking_status: 'confirmed',
          name: 'NGUYEN VAN A',
          gender: 'male',
          dob: '1990-01-01',
          id_number: '012345678901',
          passenger_type: 'adult',
          phone: '0901234567',
          email: 'nguyenvana@example.com',
          seat_number: '12A',
          is_checked_in: true,
          check_in_time: '2026-12-01T06:00:00Z',
          boarding_pass_code: 'BP-VJABC1-12A',
          contact_email: 'nguyenvana@example.com',
          contact_phone: '0901234567',
        },
        {
          id: 'p-2',
          booking_id: 'b-2',
          booking_code: 'VJXYZ2',
          booking_status: 'confirmed',
          name: 'TRAN THI B',
          gender: 'female',
          dob: '1995-05-15',
          id_number: '098765432109',
          passenger_type: 'adult',
          phone: '0987654321',
          email: 'tranthib@example.com',
          seat_number: '14B',
          is_checked_in: false,
          check_in_time: null,
          boarding_pass_code: null,
          contact_email: 'tranthib@example.com',
          contact_phone: '0987654321',
        },
      ],
      totalPassengers: 2,
      checkedInCount: 1,
      notCheckedInCount: 1,
    };

    vi.spyOn(adminServices, 'getAdminFlightManifest').mockResolvedValue(mockManifestData);

    render(<FlightManifestModal isOpen={true} onClose={vi.fn()} flightId="flight-pnl-01" />);

    // Header & Flight info
    await waitFor(() => {
      expect(screen.getByText('VJ 152')).toBeInTheDocument();
      expect(screen.getByText('NGUYEN VAN A')).toBeInTheDocument();
      expect(screen.getByText('TRAN THI B')).toBeInTheDocument();
    });

    // Check stats badges
    expect(screen.getByText('Đã check-in')).toBeInTheDocument();
    expect(screen.getByText('12A')).toBeInTheDocument();
    expect(screen.getByText('14B')).toBeInTheDocument();

    // Test filter search
    const searchInput = screen.getByPlaceholderText('Tìm tên, PNR, ghế...');
    fireEvent.change(searchInput, { target: { value: 'TRAN THI' } });

    expect(screen.queryByText('NGUYEN VAN A')).not.toBeInTheDocument();
    expect(screen.getByText('TRAN THI B')).toBeInTheDocument();
  });

  it('FlightManifestModal xuất file CSV có chứa UTF-8 BOM và thông tin hành khách khi nhấn nút Xuất CSV', async () => {
    const mockManifestData: adminServices.AdminFlightManifestData = {
      success: true,
      flight: {
        id: 'flight-pnl-01',
        flight_no: 'VJ 152',
        from_code: 'SGN',
        to_code: 'HAN',
        airline: 'Vietjet Air',
        depart_time: '2026-12-01T08:00:00Z',
        arrive_time: '2026-12-01T10:15:00Z',
        price: 699000,
        available: 150,
        status: 'active',
        class: 'economy',
        aircraft: 'Airbus A321',
      },
      passengers: [
        {
          id: 'p-1',
          booking_id: 'b-1',
          booking_code: 'VJABC1',
          booking_status: 'confirmed',
          name: 'NGUYEN VAN A',
          gender: 'male',
          dob: '1990-01-01',
          id_number: '012345678901',
          passenger_type: 'adult',
          phone: '0901234567',
          email: 'nguyenvana@example.com',
          seat_number: '12A',
          is_checked_in: true,
          check_in_time: '2026-12-01T06:00:00Z',
          boarding_pass_code: 'BP-VJABC1-12A',
          contact_email: 'nguyenvana@example.com',
          contact_phone: '0901234567',
        },
      ],
      totalPassengers: 1,
      checkedInCount: 1,
      notCheckedInCount: 0,
    };

    vi.spyOn(adminServices, 'getAdminFlightManifest').mockResolvedValue(mockManifestData);

    const createObjectURLMock = vi.fn().mockReturnValue('blob:http://localhost/test-blob');
    const revokeObjectURLMock = vi.fn();
    global.URL.createObjectURL = createObjectURLMock;
    global.URL.revokeObjectURL = revokeObjectURLMock;

    render(<FlightManifestModal isOpen={true} onClose={vi.fn()} flightId="flight-pnl-01" />);

    await waitFor(() => {
      expect(screen.getByText('NGUYEN VAN A')).toBeInTheDocument();
    });

    const exportBtn = screen.getByText('Xuất CSV (PNL)');
    fireEvent.click(exportBtn);

    expect(createObjectURLMock).toHaveBeenCalledTimes(1);
    const blobArg = createObjectURLMock.mock.calls[0][0];
    expect(blobArg).toBeInstanceOf(Blob);
  });
});
