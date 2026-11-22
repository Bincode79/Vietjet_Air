import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LoginPage from '@/app/dang-nhap/page';

const mockToast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
  promo: vi.fn(),
  dismiss: vi.fn(),
  dismissAll: vi.fn(),
}));

vi.mock('@/shared/components/navigation', () => ({
  Header: () => <header data-testid="login-header">Header đỏ</header>,
}));

vi.mock('@/hooks/useToast', () => ({
  useToast: vi.fn(() => ({
    toasts: [],
    ...mockToast,
  })),
}));

// `SkyIdAuthFlow` dùng `useAuth()` để gọi `/api/xac-thuc/*`. Ở test này ta
// chỉ kiểm tra hình dạng form và luồng bấm, nên context được stub.
const mockAuth = vi.hoisted(() => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  requestOtp: vi.fn(),
  signInWithOtp: vi.fn(),
  getCaptcha: vi.fn(),
  getSocialProviders: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockAuth,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.signIn.mockResolvedValue({ user: { fullName: 'Nguyễn Văn A' } });
  mockAuth.signUp.mockResolvedValue({});
  mockAuth.requestOtp.mockResolvedValue({ success: true });
  mockAuth.signInWithOtp.mockResolvedValue({ user: { fullName: 'Nguyễn Văn A' } });
  mockAuth.getCaptcha.mockResolvedValue({ token: 'x.y', question: '1 + 1 = ?' });
  mockAuth.getSocialProviders.mockResolvedValue([]);
});

describe('LoginPage — trang đăng nhập hai cột', () => {
  it('hiển thị banner, nhãn điện thoại và nút Tiếp tục vô hiệu hóa khi trống', () => {
    render(<LoginPage />);

    expect(screen.getByTestId('login-header')).toBeInTheDocument();
    expect(screen.getByAltText('Tích điểm SkyJoy - Đổi vé bay thỏa thích')).toBeInTheDocument();

    // Heading có aria-label "Đăng nhập" và nội dung "Nhập số điện thoại"
    expect(screen.getByRole('heading', { name: 'Đăng nhập' })).toBeInTheDocument();
    expect(screen.getByText('Nhập số điện thoại')).toBeInTheDocument();

    // Ô điện thoại có nhãn "Số điện thoại" và placeholder đúng component thực tế.
    expect(screen.getByLabelText('Số điện thoại')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Nhập số điện thoại của bạn')).toBeInTheDocument();

    // Nút "Tiếp tục" bị disable khi ô trống.
    const continueBtn = screen.getByRole('button', { name: 'Tiếp tục' });
    expect(continueBtn).toBeDisabled();

    // Nút social hiển thị trong SkyIdRealAuthPage
    expect(screen.getByRole('button', { name: 'Apple' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Google' })).toBeInTheDocument();
  });

  it('bấm "Tiếp tục" chuyển sang bước nhập mật khẩu và đăng nhập qua API', async () => {
    render(<LoginPage />);

    const phone = screen.getByPlaceholderText('Nhập số điện thoại của bạn');
    fireEvent.change(phone, { target: { value: '0912345678' } });
    expect((phone as HTMLInputElement).value).toBe('0912345678');

    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục' }));

    const passwordInput = await screen.findByPlaceholderText('Nhập mật khẩu');
    expect(passwordInput).toBeInTheDocument();

    fireEvent.change(passwordInput, { target: { value: 'Secret123!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    await waitFor(() => {
      expect(mockAuth.signIn).toHaveBeenCalledWith('0912345678', 'Secret123!');
      expect(mockToast.success).toHaveBeenCalledWith(
        'Đăng nhập thành công',
        expect.stringContaining('Nguyễn Văn A')
      );
    });
  });

  it('nút Tiếp tục bị vô hiệu hóa khi bỏ trống số điện thoại', () => {
    render(<LoginPage />);

    // Nút "Tiếp tục" disabled khi ô trống
    expect(screen.getByRole('button', { name: 'Tiếp tục' })).toBeDisabled();
  });
});
