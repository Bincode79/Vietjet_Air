import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import UserDetailModal, { UserDetailUser } from '@/features/admin/components/UserDetailModal';

describe('Customer 360 Timeline View in UserDetailModal', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockUser: UserDetailUser = {
    id: 'user-360-test',
    email: 'khachhang360@vietjet.com',
    full_name: 'NGUYEN VAN TOAN',
    phone: '0912345678',
    skyjoy_id: 'SJ-998877',
    role: 'user',
    status: 'active',
    created_at: '2026-01-10T08:00:00Z',
    updated_at: '2026-11-20T10:00:00Z',
    bookings: [
      {
        id: 'b-01',
        booking_code: 'VJ8888',
        flight_id: 'fl-1',
        status: 'confirmed',
        total_price: 1590000,
        flight_no: 'VJ 120',
        route: 'SGN → HAN',
        created_at: '2026-11-15T09:30:00Z',
      },
    ],
    payments: [
      {
        id: 'pay-01',
        booking_id: 'b-01',
        amount: 1590000,
        payment_method: 'vietqr',
        status: 'success',
        created_at: '2026-11-15T09:35:00Z',
      },
    ],
    refund_requests: [
      {
        id: 'ref-01',
        booking_id: 'b-01',
        booking_code: 'VJ8888',
        refund_amount: 500000,
        status: 'approved',
        reason: 'Khách dời lịch công tác',
        created_at: '2026-11-18T14:00:00Z',
      },
    ],
    loyalty_transactions: [
      {
        id: 'loy-01',
        points: 159,
        type: 'earn',
        description: 'Tích điểm chuyến bay VJ 120',
        created_at: '2026-11-16T10:00:00Z',
      },
    ],
    chat_sessions: [
      {
        id: 'cs-01',
        customer_name: 'NGUYEN VAN TOAN',
        status: 'closed',
        last_message: 'Cảm ơn em đã tư vấn nhiệt tình.',
        created_at: '2026-11-17T11:00:00Z',
      },
    ],
  };

  it('renders tab Dòng thời gian 360° and aggregates chronological events', () => {
    render(
      <UserDetailModal isOpen={true} onClose={vi.fn()} user={mockUser} onUpdateUser={vi.fn()} />
    );

    // Check user info header
    expect(screen.getByText('NGUYEN VAN TOAN')).toBeInTheDocument();
    expect(screen.getByText('SJ-998877')).toBeInTheDocument();

    // Click on tab "Dòng thời gian 360°"
    const timelineTab = screen.getByRole('button', { name: /Dòng thời gian 360°/i });
    fireEvent.click(timelineTab);

    // Verify events appear in timeline
    expect(screen.getByText(/Đặt chỗ chuyến bay VJ 120/i)).toBeInTheDocument();
    expect(screen.getByText(/Thanh toán thành công qua vietqr/i)).toBeInTheDocument();
    expect(screen.getByText(/Cộng điểm SkyJoy/i)).toBeInTheDocument();
    expect(screen.getByText(/Hỗ trợ trực tuyến qua Chat CSKH/i)).toBeInTheDocument();
    expect(screen.getByText(/Yêu cầu hoàn vé: Đã duyệt/i)).toBeInTheDocument();
    expect(screen.getByText(/Đăng ký tài khoản thành viên/i)).toBeInTheDocument();
  });

  it('lọc sự kiện theo filter chips (Đặt vé, Thanh toán, CSKH)', () => {
    render(
      <UserDetailModal isOpen={true} onClose={vi.fn()} user={mockUser} onUpdateUser={vi.fn()} />
    );

    const timelineTab = screen.getByRole('button', { name: /Dòng thời gian 360°/i });
    fireEvent.click(timelineTab);

    // Click filter chip "CSKH"
    const cskhChip = screen.getByRole('button', { name: /CSKH/i });
    fireEvent.click(cskhChip);

    expect(screen.getByText(/Hỗ trợ trực tuyến qua Chat CSKH/i)).toBeInTheDocument();
    expect(screen.queryByText(/Đặt chỗ chuyến bay VJ 120/i)).not.toBeInTheDocument();
  });
});
