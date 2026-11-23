import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SmartCannedResponsesModal from '@/features/admin/components/SmartCannedResponsesModal';

describe('SmartCannedResponsesModal', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('render danh sách câu trả lời mẫu mặc định và hỗ trợ tìm kiếm theo shortcut', () => {
    render(
      <SmartCannedResponsesModal
        isOpen={true}
        onClose={vi.fn()}
        onSelect={vi.fn()}
        contextVariables={{ name: 'Nguyen Van A', pnr: 'VJ12345' }}
      />
    );

    expect(screen.getByText('Kho Câu Trả Lời Mẫu Thông Minh')).toBeInTheDocument();
    expect(screen.getByText('/chao')).toBeInTheDocument();
    expect(screen.getByText('/doi-ve')).toBeInTheDocument();

    // Interpolation check: {{name}} replaced with 'Nguyen Van A'
    expect(screen.getByText(/Kính chào Quý khách Nguyen Van A/i)).toBeInTheDocument();

    // Filter by search
    const searchInput = screen.getByPlaceholderText(/Tìm theo nội dung hoặc gõ phím tắt/i);
    fireEvent.change(searchInput, { target: { value: 'hoan-ve' } });

    expect(screen.getByText('/hoan-ve')).toBeInTheDocument();
    expect(screen.queryByText('/chao')).not.toBeInTheDocument();
  });

  it('chọn một mẫu câu trả lời sẽ gọi onSelect với nội dung đã được điền biến và đóng modal', () => {
    const onSelectMock = vi.fn();
    const onCloseMock = vi.fn();

    render(
      <SmartCannedResponsesModal
        isOpen={true}
        onClose={onCloseMock}
        onSelect={onSelectMock}
        contextVariables={{ name: 'Tran B', pnr: 'VJ999' }}
      />
    );

    const greetingItem = screen.getByText('Lời chào chuẩn Vietjet CSKH');
    fireEvent.click(greetingItem);

    expect(onSelectMock).toHaveBeenCalledWith(
      expect.stringContaining('Kính chào Quý khách Tran B, em là Chuyên viên Hỗ trợ Vietjet')
    );
    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });

  it('lọc danh sách theo danh mục (category pills)', () => {
    render(<SmartCannedResponsesModal isOpen={true} onClose={vi.fn()} onSelect={vi.fn()} />);

    const paymentPill = screen.getByRole('button', { name: 'Thanh toán' });
    fireEvent.click(paymentPill);

    expect(screen.getByText('/pay-vietqr')).toBeInTheDocument();
    expect(screen.queryByText('/chao')).not.toBeInTheDocument();
  });

  it('cho phép thêm mẫu câu trả lời tùy chỉnh và lưu vào localStorage', () => {
    render(<SmartCannedResponsesModal isOpen={true} onClose={vi.fn()} onSelect={vi.fn()} />);

    // Click "Tạo mẫu mới"
    const createBtn = screen.getByRole('button', { name: /Tạo mẫu mới/i });
    fireEvent.click(createBtn);

    // Form inputs
    const titleInput = screen.getByPlaceholderText(/VD: Hướng dẫn check-in trực tuyến/i);
    const shortcutInput = screen.getByPlaceholderText('/checkin');
    const templateInput = screen.getByPlaceholderText(/Dạ chào Quý khách {{name}}/i);

    fireEvent.change(titleInput, { target: { value: 'Mẫu hỗ trợ thẻ lên tàu' } });
    fireEvent.change(shortcutInput, { target: { value: '/the-len-tau' } });
    fireEvent.change(templateInput, {
      target: { value: 'Chào {{name}}, mã thẻ của bạn cho chuyến bay {{pnr}} đã sẵn sàng.' },
    });

    const submitBtn = screen.getByRole('button', { name: /Lưu mẫu câu/i });
    fireEvent.click(submitBtn);

    // Should return to list and show the new custom template
    expect(screen.getByText('Mẫu hỗ trợ thẻ lên tàu')).toBeInTheDocument();
    expect(screen.getByText('/the-len-tau')).toBeInTheDocument();
  });
});
