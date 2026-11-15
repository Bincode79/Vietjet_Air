/**
 * Form "Chỉnh sửa người dùng" trong tab Quản lý người dùng có ba trường:
 * họ tên, email, số điện thoại.
 *
 * Trước đây `handleSaveEdit` chỉ cập nhật state cục bộ trong `setTimeout`
 * rồi báo "Cập nhật thành công" — không có request nào được gửi, nên mọi chỉnh
 * sửa biến mất khi tải lại trang. `PATCH /api/quan-tri/nguoi-dung/:id` cũng chỉ
 * nhận `role` / `status` / `operator_notes`, tức là không có write path cho
 * hồ sơ.
 *
 * Bộ test này chốt lại: form phải gọi API, và API phải ghi được hồ sơ thật
 * (kèm kiểm tra dữ liệu rác và email trùng).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const updateUserMock = vi.fn();
const listUsersMock = vi.fn();

vi.mock('@/features/admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/admin')>();
  return {
    ...actual,
    updateUser: (id: string, input: Record<string, unknown>) => updateUserMock(id, input),
    listUsers: (query: Record<string, unknown>) => listUsersMock(query),
    deleteUser: vi.fn().mockResolvedValue({ success: true }),
  };
});

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ currentUser: { id: 'admin-1', role: 'admin' } }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import UsersTab from '@/features/admin/components/UsersTab';

describe('form chỉnh sửa người dùng ghi thật vào API', () => {
  beforeEach(() => {
    updateUserMock.mockReset();
    updateUserMock.mockResolvedValue({ success: true });
    listUsersMock.mockReset();
    listUsersMock.mockResolvedValue({
      users: [
        {
          id: 'user-2',
          full_name: 'Tên Cũ',
          email: 'old@vietjetair.vn',
          phone: '0900000000',
          role: 'user',
          status: 'active',
          bookings_count: 0,
          total_spent: 0,
          created_at: '2026-01-01T00:00:00.000Z',
        },
      ],
      pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
    });
  });

  it('handleSaveEdit gọi updateUser với tên/email/điện thoại đã chuẩn hoá', async () => {
    const { render, screen, fireEvent, waitFor } = await import('@testing-library/react');
    const { default: React } = await import('react');

    const toast = {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
    };
    render(React.createElement(UsersTab, { onToast: toast }));

    // Danh sách người dùng tải bất đồng bộ, nên phải chờ render bảng.
    const editButtons = await screen.findAllByTitle('Chỉnh sửa');
    fireEvent.click(editButtons[0]);

    // Ô họ tên nằm trong modal chỉnh sửa, không phải ô tìm kiếm ở đầu
    // trang (cũng là `input[type="text"]`). Email là `type="email"` và điện
    // thoại là `type="tel"`, nên trong modal chỉ còn đúng một ô text.
    //
    // Modal được định vị bằng tiêu đề của nó: có hai overlay `fixed` trên
    // trang (drawer chi tiết + modal chỉnh sửa), nên `div.fixed` đầu tiên
    // không phải modal.
    const modalHeading = await screen.findByText('Chỉnh sửa người dùng');
    const modal = modalHeading.closest('div.fixed');
    expect(modal).toBeTruthy();
    const nameInput = modal!.querySelector<HTMLInputElement>('input[type="text"]');
    expect(nameInput).toBeTruthy();
    fireEvent.change(nameInput!, { target: { value: '  Nguyễn Văn B  ' } });

    // Lưu.
    const saveButton = screen.getByRole('button', { name: /lưu thay đổi/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(updateUserMock).toHaveBeenCalled();
    });

    // Tên được trim trước khi ghi.
    const [, payload] = updateUserMock.mock.calls[0];
    expect(payload).toMatchObject({ full_name: 'Nguyễn Văn B' });
    expect(payload.email).toBeTruthy();
    expect('phone' in payload).toBe(true);
  });

  it('UsersTab không dùng setTimeout để giả lập lưu', async () => {
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync('src/features/admin/components/UsersTab.tsx', 'utf8')
    );

    // `handleSaveEdit` cũ gọi `setTimeout(...)` rồi báo thành công.
    const saveHandler = source.slice(
      source.indexOf('const handleSaveEdit'),
      source.indexOf('const totalPages')
    );

    expect(saveHandler).toContain('updateUser(');
    // `setTimeout` chỉ được phép xuất hiện trong comment giải thích, không
    // được dùng để giả lập độ trễ lưu.
    const code = saveHandler
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');
    expect(code).not.toContain('setTimeout');
  });
});

describe('PATCH /api/quan-tri/nguoi-dung/:id ghi được hồ sơ', () => {
  it('trả về user đã cập nhật khi chỉ gửi full_name/email/phone', async () => {
    vi.resetModules();

    const written: { column: string; value: unknown }[] = [];

    /**
     * `updateUserProfile` dựng câu SQL bằng chuỗi rồi gọi `sql.query(text,
     * values)` — khác với các helper khác dùng tagged template. Vì vậy mock
     * phải đọc câu `UPDATE` từ tham số `query` và ánh xạ `$n` theo đúng thứ
     * tự `SET`.
     */
    const parseSetColumns = (text: string): string[] => {
      const setPart = text.split(/\bSET\b/i)[1]?.split(/\bWHERE\b/i)[0] ?? '';
      return setPart
        .split(',')
        .map((c) => c.trim().split(/\s*=\s*/)[0])
        .map((c) => c.replace(/^\$\d+$/, '').trim())
        .filter((c) => c && c.toLowerCase() !== 'updated_at');
    };

    const queryMock = vi.fn(async (text: string, values: unknown[] = []) => {
      if (text.includes('UPDATE user_profiles')) {
        const columns = parseSetColumns(text);
        columns.forEach((column, index) => {
          written.push({ column, value: values[index] });
        });
        const row: Record<string, unknown> = {
          id: 'user-2',
          email: 'old@vietjetair.vn',
          full_name: 'Tên Cũ',
          phone: '0900000000',
          role: 'user',
        };
        columns.forEach((column, index) => {
          row[column] = values[index];
        });
        return [row];
      }
      return [];
    });

    vi.doMock('@/lib/neon', () => ({
      sql: Object.assign(
        vi.fn(async (strings: TemplateStringsArray) => {
          const text = strings.join('?');
          if (text.includes('SELECT id FROM user_profiles')) return [];
          if (text.includes('SELECT * FROM user_profiles')) {
            return [
              {
                id: 'user-2',
                email: 'old@vietjetair.vn',
                full_name: 'Tên Cũ',
                phone: '0900000000',
                role: 'user',
              },
            ];
          }
          return [];
        }),
        { query: queryMock }
      ),
    }));

    vi.doMock('@/lib/admin-auth', () => ({
      verifyAdminRequest: vi.fn().mockResolvedValue({
        payload: { userId: 'admin-1', email: 'admin@vietjetair.vn', role: 'admin' },
        error: undefined,
        response: undefined,
      }),
    }));

    vi.doMock('@/lib/db', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/lib/db')>();
      return {
        ...actual,
        writeAuditLog: vi.fn().mockResolvedValue(true),
      };
    });

    const { PATCH } = await import('@/app/api/quan-tri/nguoi-dung/[id]/route');
    const res = await PATCH(
      new Request('http://localhost/api/quan-tri/nguoi-dung/user-2', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          full_name: 'Tên Mới',
          email: 'new@vietjetair.vn',
          phone: '0901234567',
        }),
      }) as never,
      { params: Promise.resolve({ id: 'user-2' }) } as never
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.user).toMatchObject({ full_name: 'Tên Mới', email: 'new@vietjetair.vn' });

    const columns = written.map((w) => w.column);
    expect(columns).toContain('full_name');
    expect(columns).toContain('email');
    expect(columns).toContain('phone');
  });

  it('từ chối email không hợp lệ với 400', async () => {
    vi.resetModules();

    vi.doMock('@/lib/neon', () => ({
      sql: Object.assign(
        vi.fn(async (strings: TemplateStringsArray) => {
          const text = strings.join('?');
          if (text.includes('SELECT * FROM user_profiles')) {
            return [{ id: 'user-2', email: 'a@b.vn', full_name: 'X', phone: null, role: 'user' }];
          }
          return [];
        }),
        { query: vi.fn(async () => []) }
      ),
    }));

    vi.doMock('@/lib/admin-auth', () => ({
      verifyAdminRequest: vi.fn().mockResolvedValue({
        payload: { userId: 'admin-1', email: 'admin@vietjetair.vn', role: 'admin' },
        error: undefined,
        response: undefined,
      }),
    }));

    vi.doMock('@/lib/db', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/lib/db')>();
      return { ...actual, writeAuditLog: vi.fn().mockResolvedValue(true) };
    });

    const { PATCH } = await import('@/app/api/quan-tri/nguoi-dung/[id]/route');
    const res = await PATCH(
      new Request('http://localhost/api/quan-tri/nguoi-dung/user-2', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'khong-phai-email' }),
      }) as never,
      { params: Promise.resolve({ id: 'user-2' }) } as never
    );

    expect(res.status).toBe(400);
  });

  /**
   * `user_profiles.phone` có UNIQUE index, nhưng UNIQUE so trên CHUỖI THÔ.
   * Đăng ký luôn ghi số ở dạng chuẩn hoá (`normalizePhone`), còn route admin
   * trước đây ghi bản thô ⇒ `+84 986 349 061` và `0986349061` là hai chuỗi
   * khác nhau, lọt qua UNIQUE, và tạo ra hai tài khoản cho cùng một người —
   * đúng lỗi mà migration 016 dọn dẹp.
   */
  it('ghi số điện thoại ở dạng chuẩn hoá', async () => {
    vi.resetModules();

    const written: { column: string; value: unknown }[] = [];
    const queryMock = vi.fn(async (text: string, values: unknown[] = []) => {
      if (text.includes('UPDATE user_profiles')) {
        const setPart = text.split(/\bSET\b/i)[1]?.split(/\bWHERE\b/i)[0] ?? '';
        const columns = setPart
          .split(',')
          .map((c) => c.trim().split(/\s*=\s*/)[0])
          .map((c) => c.replace(/^\$\d+$/, '').trim())
          .filter((c) => c && c.toLowerCase() !== 'updated_at');
        columns.forEach((column, index) => written.push({ column, value: values[index] }));
        return [{ id: 'user-2', email: 'old@vietjetair.vn', full_name: 'X', role: 'user' }];
      }
      return [];
    });

    vi.doMock('@/lib/neon', () => ({
      sql: Object.assign(
        vi.fn(async (strings: TemplateStringsArray) => {
          const text = strings.join('?');
          if (text.includes('SELECT * FROM user_profiles')) {
            return [
              {
                id: 'user-2',
                email: 'old@vietjetair.vn',
                full_name: 'X',
                phone: null,
                role: 'user',
              },
            ];
          }
          return [];
        }),
        { query: queryMock }
      ),
    }));

    vi.doMock('@/lib/admin-auth', () => ({
      verifyAdminRequest: vi.fn().mockResolvedValue({
        payload: { userId: 'admin-1', email: 'admin@vietjetair.vn', role: 'admin' },
        error: undefined,
        response: undefined,
      }),
    }));

    vi.doMock('@/lib/db', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/lib/db')>();
      return { ...actual, writeAuditLog: vi.fn().mockResolvedValue(true) };
    });

    const { PATCH } = await import('@/app/api/quan-tri/nguoi-dung/[id]/route');
    const res = await PATCH(
      new Request('http://localhost/api/quan-tri/nguoi-dung/user-2', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone: '+84 986 349 061' }),
      }) as never,
      { params: Promise.resolve({ id: 'user-2' }) } as never
    );

    expect(res.status).toBe(200);
    const phoneWrite = written.find((w) => w.column === 'phone');
    expect(phoneWrite?.value).toBe('0986349061');
  });

  it('trả 409 khi số điện thoại đã thuộc tài khoản khác', async () => {
    vi.resetModules();

    vi.doMock('@/lib/neon', () => ({
      sql: Object.assign(
        vi.fn(async (strings: TemplateStringsArray) => {
          const text = strings.join('?');
          if (text.includes('SELECT * FROM user_profiles')) {
            return [
              {
                id: 'user-2',
                email: 'old@vietjetair.vn',
                full_name: 'X',
                phone: null,
                role: 'user',
              },
            ];
          }
          // Số đã bị tài khoản khác dùng.
          if (text.includes('SELECT id FROM user_profiles WHERE phone')) {
            return [{ id: 'user-9' }];
          }
          return [];
        }),
        { query: vi.fn(async () => []) }
      ),
    }));

    vi.doMock('@/lib/admin-auth', () => ({
      verifyAdminRequest: vi.fn().mockResolvedValue({
        payload: { userId: 'admin-1', email: 'admin@vietjetair.vn', role: 'admin' },
        error: undefined,
        response: undefined,
      }),
    }));

    vi.doMock('@/lib/db', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/lib/db')>();
      return { ...actual, writeAuditLog: vi.fn().mockResolvedValue(true) };
    });

    const { PATCH } = await import('@/app/api/quan-tri/nguoi-dung/[id]/route');
    const res = await PATCH(
      new Request('http://localhost/api/quan-tri/nguoi-dung/user-2', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone: '0986349061' }),
      }) as never,
      { params: Promise.resolve({ id: 'user-2' }) } as never
    );

    expect(res.status).toBe(409);
  });
});
