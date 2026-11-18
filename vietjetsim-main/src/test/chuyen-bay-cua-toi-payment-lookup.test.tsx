import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import TripCard, { Trip } from '@/features/bookings/components/TripCard';

vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({
    toasts: [],
    show: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

describe('Giao diện thanh toán trong Chuyến bay của tôi (TripCard)', () => {
  const pendingTrip: Trip = {
    tripId: 'trip-123',
    legs: [
      {
        id: 'leg-1',
        bookingCode: 'VJ9988',
        legRole: 'outbound',
        status: 'pending',
        totalPrice: 1850000,
        createdAt: '2026-03-25T08:00:00.000Z',
        flightId: 'flight-1',
        flight: {
          flight_no: 'VJ 123',
          from_code: 'SGN',
          to_code: 'HAN',
          depart_time: '2026-03-25T10:00:00.000Z',
          arrive_time: '2026-03-25T12:10:00.000Z',
        },
        passengers: [{ id: 'p1', name: 'NGUYEN VAN A', seat_number: null }],
        check_ins: [],
      },
    ],
  };

  const confirmedTrip: Trip = {
    tripId: 'trip-456',
    legs: [
      {
        id: 'leg-2',
        bookingCode: 'VJ7766',
        legRole: 'outbound',
        status: 'confirmed',
        totalPrice: 2100000,
        createdAt: '2026-03-25T08:00:00.000Z',
        flightId: 'flight-2',
        flight: {
          flight_no: 'VJ 456',
          from_code: 'HAN',
          to_code: 'DAD',
          depart_time: '2026-03-25T14:00:00.000Z',
          arrive_time: '2026-03-25T15:20:00.000Z',
        },
        passengers: [{ id: 'p2', name: 'TRAN THI B', seat_number: '12A' }],
        check_ins: [],
      },
    ],
  };

  it('hiển thị số tiền cần thanh toán và nút "Thanh toán ngay" khi trạng thái là pending', () => {
    render(<TripCard trip={pendingTrip} />);

    // Kiểm tra PNR
    expect(screen.getByText('VJ9988')).toBeInTheDocument();

    // Kiểm tra chip trạng thái chưa thanh toán
    expect(screen.getByText(/Chưa thanh toán/i)).toBeInTheDocument();

    // Kiểm tra hiển thị số tiền cần thanh toán
    expect(screen.getByText(/Cần thanh toán:/i)).toBeInTheDocument();
    expect(screen.getByText('1.850.000₫')).toBeInTheDocument();

    // Kiểm tra nút Thanh toán ngay và đường dẫn chính xác
    const payLink = screen.getByRole('link', { name: /Thanh toán ngay/i });
    expect(payLink).toBeInTheDocument();
    expect(payLink).toHaveAttribute('href', '/thanh-toan?bookingId=VJ9988');
  });

  it('không hiển thị nút "Thanh toán ngay" khi vé đã được xác nhận (confirmed)', () => {
    render(<TripCard trip={confirmedTrip} />);

    // Không có nút thanh toán ngay
    expect(screen.queryByRole('link', { name: /Thanh toán ngay/i })).not.toBeInTheDocument();

    // Có nút Check-in
    expect(screen.getByRole('link', { name: /Check-in/i })).toBeInTheDocument();

    // Hiển thị giá vé thông thường
    expect(screen.getByText(/2.100.000₫/i)).toBeInTheDocument();
  });
});
