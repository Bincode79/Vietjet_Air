import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

/* ──────────────────────────────────────────────────────────────
   Cổng Ví Vietjet từng in cứng "Số dư ví khả dụng 5.000.000 VND"
   cho mọi khách, nên một ví 0₫ vẫn hiện đủ tiền và nút thanh toán
   bật lên — rồi server từ chối vì số dư thật không đủ. Test này
   khoá cổng ví vào số dư thật từ `/api/vi`.
   ────────────────────────────────────────────────────────────── */

const walletService = vi.hoisted(() => ({ getWalletOverview: vi.fn() }));
vi.mock('@/features/payments/services', () => walletService);

const sharedServices = vi.hoisted(() => ({
  getApiErrorMessage: vi.fn((_err: unknown, fallback: string) => fallback),
}));
vi.mock('@/shared/services', () => sharedServices);

import WalletGatewayContent from '@/features/payments/components/gateway/WalletGatewayContent';

function overview(balance: number) {
  return {
    success: true,
    wallet: { id: 'wallet-1', user_id: 'user-1', balance } as never,
    linkedBankAccounts: [],
    transactions: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  sharedServices.getApiErrorMessage.mockImplementation(
    (_err: unknown, fallback: string) => fallback
  );
});

describe('Cổng Ví Vietjet', () => {
  it('hiển thị số dư thật thay vì con số demo 5.000.000₫', async () => {
    walletService.getWalletOverview.mockResolvedValueOnce(overview(3_000_000));
    render(<WalletGatewayContent bookingId="bk-1" amount={1_250_000} onSuccess={vi.fn()} />);

    expect(await screen.findByText('3.000.000 VND')).toBeInTheDocument();
    expect(screen.queryByText('5.000.000 VND')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Xác nhận trừ ví/i })).toBeInTheDocument();
  });

  it('khoá nút thanh toán khi số dư thật không đủ', async () => {
    walletService.getWalletOverview.mockResolvedValueOnce(overview(100_000));
    render(<WalletGatewayContent bookingId="bk-1" amount={1_250_000} onSuccess={vi.fn()} />);

    const button = await screen.findByRole('button', { name: /Số dư không đủ/i });
    expect(button).toBeDisabled();
  });

  it('mời đăng nhập thay vì hiện số dư giả khi chưa có phiên', async () => {
    walletService.getWalletOverview.mockRejectedValueOnce(new Error('401'));
    render(<WalletGatewayContent bookingId="bk-1" amount={1_250_000} onSuccess={vi.fn()} />);

    expect(await screen.findByText('Chưa dùng được ví')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Đăng nhập' })).toHaveAttribute('href', '/dang-nhap');
    expect(screen.queryByText('5.000.000 VND')).not.toBeInTheDocument();
  });
});
