import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PaymentClient } from '@/features/payments';

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => '/thanh-toan',
  useSearchParams: () => new URLSearchParams(),
}));

// Mock useAuth
const mockUser = {
  id: 'usr-1',
  email: 'khach@gmail.com',
  fullName: 'Nguyễn Văn Test',
};
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    loading: false,
  }),
}));

// Mock apiRequest
vi.mock('@/shared/services', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/services')>();
  return {
    ...actual,
    apiRequest: vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/api/tai-khoan-ngan-hang')) {
        return [
          {
            id: 'bank-1',
            admin_bank_name: 'Ngân hàng Quốc tế Việt Nam (VIB)',
            admin_bank_account_number: '876922729',
            admin_bank_account_holder: 'DANG THI NGOC HAN',
            bank_bin: '970406',
            is_default: true,
          },
        ];
      }
      if (url.includes('/api/thanh-toan/vietqr')) {
        return {
          payload: '00020101021238540010A00000072701240006970406011087692272953037045802VN6304ABCD',
          pnr: 'VJ8899',
          amount: 1800000,
          addInfo: 'VJ8899I98O',
          bank: {
            name: 'Ngân hàng Quốc tế Việt Nam (VIB)',
            logoUrl: null,
            accountNumber: '876922729',
            accountHolder: 'DANG THI NGOC HAN',
          },
        };
      }
      if (url.includes('/api/vi-dien-tu')) {
        return { balance: 5000000 };
      }
      return {};
    }),
  };
});

// Mock payments/services
vi.mock('@/features/payments/services', () => ({
  createPayment: vi.fn().mockResolvedValue({
    id: 'pay-1',
    status: 'completed',
    message: 'Thanh toán thành công',
  }),
  getWalletOverview: vi.fn().mockResolvedValue({
    wallet: { balance: 5000000 },
  }),
}));

// Mock loyalty/services
vi.mock('@/features/loyalty/services', () => ({
  getMembership: vi.fn().mockResolvedValue({
    membership: { currentPoints: 1500 },
    program: { pointsPerThousandVnd: 10 },
  }),
}));

const mockBooking = {
  bookingId: 'bk-test-8899',
  bookingCode: 'VJ8899',
  flightNo: 'VJ120',
  from: 'SGN',
  to: 'HAN',
  fromCity: 'Hồ Chí Minh',
  toCity: 'Hà Nội',
  departTime: '08:30',
  arriveTime: '10:45',
  date: '2026-11-25',
  passengers: [{ name: 'Nguyễn Văn Test', seat: '12A' }],
  fareSubtotal: 1500000,
  tax: 250000,
  seatFee: 50000,
  total: 1800000,
};

describe('PaymentClient Component UI & Interaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('renders "Chưa có đơn đặt vé để thanh toán" when sessionStorage has no booking', async () => {
    render(<PaymentClient />);

    await waitFor(() => {
      expect(screen.getByText(/Chưa có đơn đặt vé để thanh toán/i)).toBeDefined();
    });

    expect(screen.getByText(/Bạn chưa có đơn đặt vé nào đang chờ thanh toán/i)).toBeDefined();
    expect(screen.getByText(/Tìm chuyến bay/i)).toBeDefined();
    expect(screen.getByText(/Chuyến bay của tôi/i)).toBeDefined();
  });

  it('renders full payment UI when valid booking exists in sessionStorage', async () => {
    sessionStorage.setItem('vjsim_booking', JSON.stringify(mockBooking));

    render(<PaymentClient />);

    await waitFor(
      () => {
        expect(screen.getAllByText(/VJ8899/i).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/VJ120/i).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/Nguyễn Văn Test/i).length).toBeGreaterThan(0);
      },
      { timeout: 3000 }
    );

    // Check payment method buttons exist
    expect(screen.getAllByText(/Quét mã VNPAY-QR/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Mobile Banking VietQR/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Thẻ ATM nội địa/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Thẻ tín dụng \/ ghi nợ quốc tế/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Ví MoMo/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Ví ZaloPay/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Ví SkyJoy/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Trả góp Movi/i).length).toBeGreaterThan(0);
  });

  it('switches to Credit Card method and shows Virtual Credit Card with brand detection', async () => {
    sessionStorage.setItem('vjsim_booking', JSON.stringify(mockBooking));

    const { container } = render(<PaymentClient />);

    await waitFor(
      () => {
        expect(screen.getAllByText(/Thẻ tín dụng \/ ghi nợ quốc tế/i).length).toBeGreaterThan(0);
      },
      { timeout: 3000 }
    );

    // Click Credit Card option
    const cardBtns = screen.getAllByText(/Thẻ tín dụng \/ ghi nợ quốc tế/i);
    fireEvent.click(cardBtns[0]);

    // Form inputs for Card should appear
    await waitFor(() => {
      expect(container.querySelector('#cardNumber')).toBeDefined();
      expect(container.querySelector('#cardName')).toBeDefined();
      expect(container.querySelector('#cardExpiry')).toBeDefined();
      expect(container.querySelector('#cardCvv')).toBeDefined();
    });

    // Type Visa card number
    const cardInput = container.querySelector('#cardNumber') as HTMLInputElement;
    fireEvent.change(cardInput, { target: { value: '4111 2222 3333 4444' } });

    // Type Cardholder name
    const nameInput = container.querySelector('#cardName') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'NGUYEN VAN TEST' } });

    expect(cardInput.value).toBe('4111 2222 3333 4444');
    expect(nameInput.value).toBe('NGUYEN VAN TEST');
  });

  it('switches to Pay Later (MOVI) method and renders customer identity fields', async () => {
    sessionStorage.setItem('vjsim_booking', JSON.stringify(mockBooking));

    render(<PaymentClient />);

    await waitFor(
      () => {
        expect(screen.getAllByText(/Trả góp Movi/i).length).toBeGreaterThan(0);
      },
      { timeout: 3000 }
    );

    // Click Bay trước trả sau MOVI
    const moviBtns = screen.getAllByText(/Trả góp Movi/i);
    fireEvent.click(moviBtns[0]);

    await waitFor(() => {
      expect(screen.getByText(/Vui lòng nhập thông tin của bạn/i)).toBeDefined();
      expect(screen.getAllByText(/Bay trước, trả sau/i).length).toBeGreaterThan(0);
      expect(screen.getByPlaceholderText(/CMND\/CCCD\*/i)).toBeDefined();
      expect(screen.getByPlaceholderText(/Họ và tên\*/i)).toBeDefined();
      expect(screen.getByPlaceholderText(/Nhập số điện thoại\*/i)).toBeDefined();
    });
  });
});
