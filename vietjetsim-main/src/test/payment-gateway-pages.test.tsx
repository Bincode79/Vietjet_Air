import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/* ──────────────────────────────────────────────────────────────
   Cổng thanh toán & trang kết quả: kiểm tra rằng hai màn hình này
   chỉ hiển thị dữ liệu thật của đơn đặt vé. Bản trước hard-code
   PNR "VJ8899", chuyến "VJ3018" và 1.980.000₫, nên một đơn không
   tồn tại vẫn hiện "Thanh toán thành công".
   ────────────────────────────────────────────────────────────── */

const nav = vi.hoisted(() => ({
  params: { method: 'card' } as Record<string, string>,
  search: new URLSearchParams('bookingId=bk-1'),
  push: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useParams: () => nav.params,
  useSearchParams: () => nav.search,
  useRouter: () => ({
    push: nav.push,
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
}));

const services = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  getApiErrorMessage: vi.fn((_err: unknown, fallback: string) => fallback),
}));

vi.mock('@/shared/services', () => services);

const payments = vi.hoisted(() => ({ createPayment: vi.fn() }));
vi.mock('@/features/payments/services', () => payments);

// Cổng thẻ thật chạy OTP bằng setTimeout; ở đây chỉ cần nút gọi onSuccess
// để kiểm tra trang có ghi nhận thanh toán qua API trước khi chuyển trang.
vi.mock('@/features/payments/components/gateway/CardGatewayContent', () => ({
  default: ({ onSuccess }: { onSuccess: () => void }) => (
    <button type="button" onClick={() => void onSuccess()}>
      Xác nhận thanh toán thử
    </button>
  ),
}));

vi.mock('@/shared/components/navigation', () => ({
  Header: () => <header data-testid="site-header" />,
  Footer: () => <footer data-testid="site-footer" />,
}));

vi.mock('@/features/payments/components/gateway/PaymentGatewayHeader', () => ({
  default: ({ amount }: { amount: number }) => (
    <div data-testid="gateway-header">{amount.toLocaleString('vi-VN')}₫</div>
  ),
}));

import PaymentGatewayPage from '@/app/thanh-toan/gateway/[method]/page';
import PaymentSuccessPage from '@/app/thanh-toan/thanh-cong/page';

const pendingBooking = {
  booking: {
    id: 'bk-1',
    booking_code: 'AB12CD',
    status: 'pending',
    total_price: 1250000,
    flight: {
      flight_no: 'VJ 123',
      from_code: 'HAN',
      to_code: 'SGN',
    },
  },
};

const confirmedBooking = {
  booking: {
    ...pendingBooking.booking,
    status: 'confirmed',
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  nav.params = { method: 'card' };
  nav.search = new URLSearchParams('bookingId=bk-1');
  services.getApiErrorMessage.mockImplementation((_err: unknown, fallback: string) => fallback);
});

describe('Cổng thanh toán (/thanh-toan/gateway/[method])', () => {
  it('không hiển thị đơn giả khi thiếu bookingId', async () => {
    nav.search = new URLSearchParams();
    render(<PaymentGatewayPage />);

    expect(await screen.findByText('Chưa có đơn đặt vé để thanh toán')).toBeInTheDocument();
    expect(screen.queryByText(/1\.980\.000/)).not.toBeInTheDocument();
    expect(screen.queryByText(/VJ8899/)).not.toBeInTheDocument();
    expect(services.apiRequest).not.toHaveBeenCalled();
  });

  it('báo lỗi thay vì dùng đơn demo khi không tải được đơn', async () => {
    services.apiRequest.mockRejectedValueOnce(new Error('403'));
    render(<PaymentGatewayPage />);

    expect(await screen.findByText('Không mở được cổng thanh toán')).toBeInTheDocument();
    expect(screen.queryByText(/1\.980\.000/)).not.toBeInTheDocument();
  });

  it('không mở lại cổng cho đơn đã thanh toán', async () => {
    services.apiRequest.mockResolvedValueOnce(confirmedBooking);
    render(<PaymentGatewayPage />);

    expect(await screen.findByText('Đơn đặt vé đã được thanh toán')).toBeInTheDocument();
    expect(screen.getByText(/AB12CD/)).toBeInTheDocument();
  });

  it('ghi nhận thanh toán qua API rồi mới chuyển sang trang kết quả', async () => {
    services.apiRequest.mockResolvedValueOnce(pendingBooking);
    payments.createPayment.mockResolvedValueOnce({ success: true });
    render(<PaymentGatewayPage />);

    const payButton = await screen.findByRole('button', {
      name: 'Xác nhận thanh toán thử',
    });
    fireEvent.click(payButton);

    await waitFor(() => {
      expect(payments.createPayment).toHaveBeenCalledWith({
        booking_id: 'bk-1',
        method: 'card',
        amount: 1250000,
      });
    });
    expect(nav.push).toHaveBeenCalledWith(
      '/thanh-toan/thanh-cong?bookingId=bk-1&bookingCode=AB12CD'
    );
  });

  it('giữ nguyên trang và hiện lỗi khi API thanh toán thất bại', async () => {
    services.apiRequest.mockResolvedValueOnce(pendingBooking);
    payments.createPayment.mockRejectedValueOnce(new Error('Số tiền không hợp lệ'));
    services.getApiErrorMessage.mockReturnValueOnce('Số tiền không hợp lệ');
    render(<PaymentGatewayPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Xác nhận thanh toán thử' }));

    expect(await screen.findByText('Số tiền không hợp lệ')).toBeInTheDocument();
    expect(nav.push).not.toHaveBeenCalled();
  });

  it('chuyển sang trang kết quả khi API báo đơn đã thanh toán (409)', async () => {
    services.apiRequest.mockResolvedValueOnce(pendingBooking);
    payments.createPayment.mockRejectedValueOnce(
      Object.assign(new Error('Đặt chỗ này đã được thanh toán rồi.'), { status: 409 })
    );
    render(<PaymentGatewayPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Xác nhận thanh toán thử' }));

    await waitFor(() => {
      expect(nav.push).toHaveBeenCalledWith(
        '/thanh-toan/thanh-cong?bookingId=bk-1&bookingCode=AB12CD'
      );
    });
  });
});

describe('Trang kết quả (/thanh-toan/thanh-cong)', () => {
  it('hiển thị PNR và số tiền thật của đơn đã xác nhận', async () => {
    services.apiRequest.mockResolvedValueOnce(confirmedBooking);
    render(<PaymentSuccessPage />);

    expect(await screen.findByText('Thanh toán thành công!')).toBeInTheDocument();
    expect(screen.getByText('AB12CD')).toBeInTheDocument();
    expect(screen.getByText('VJ 123')).toBeInTheDocument();
    expect(screen.getByText('1.250.000 VND')).toBeInTheDocument();
    expect(screen.queryByText(/VJ8899/)).not.toBeInTheDocument();
  });

  it('không tuyên bố thành công khi đơn còn chờ thanh toán', async () => {
    services.apiRequest.mockResolvedValueOnce(pendingBooking);
    render(<PaymentSuccessPage />);

    expect(await screen.findByText('Đơn đặt vé đang chờ thanh toán')).toBeInTheDocument();
    expect(screen.queryByText('Thanh toán thành công!')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Thanh toán ngay/i })).toHaveAttribute(
      'href',
      '/thanh-toan?bookingId=bk-1'
    );
  });

  it('không tuyên bố thành công khi không có bookingId', async () => {
    nav.search = new URLSearchParams();
    render(<PaymentSuccessPage />);

    expect(await screen.findByText('Không tìm thấy đơn đặt vé')).toBeInTheDocument();
    expect(screen.queryByText('Thanh toán thành công!')).not.toBeInTheDocument();
    expect(services.apiRequest).not.toHaveBeenCalled();
  });

  it('không tuyên bố thành công khi không tải được đơn', async () => {
    services.apiRequest.mockRejectedValueOnce(new Error('404'));
    render(<PaymentSuccessPage />);

    expect(await screen.findByText('Không tìm thấy đơn đặt vé')).toBeInTheDocument();
    expect(screen.queryByText('Thanh toán thành công!')).not.toBeInTheDocument();
  });
});
