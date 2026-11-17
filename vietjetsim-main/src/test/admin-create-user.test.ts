import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const sqlMock = vi.fn();
const auditMock = vi.fn();

vi.mock('@/lib/neon', () => ({
  sql: Object.assign((...args: unknown[]) => sqlMock(...args), {
    query: vi.fn().mockResolvedValue([]),
    begin: vi.fn(),
    transaction: vi.fn().mockResolvedValue([[]]),
  }),
}));

vi.mock('@/lib/admin-audit', () => ({
  auditAdmin: (...args: unknown[]) => auditMock(...args),
}));

vi.mock('@/lib/admin-auth', () => ({
  verifyAdminRequest: vi.fn().mockResolvedValue({
    payload: { id: 'admin-1', email: 'admin@vietjetair.com', role: 'admin' },
    error: false,
    response: null,
  }),
}));

import { POST as createUserRoute } from '@/app/api/quan-tri/nguoi-dung/route';

function createRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost:4028/api/quan-tri/nguoi-dung', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('Admin — Tạo tài khoản hội viên', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auditMock.mockResolvedValue(undefined);
  });

  it('tạo thành công tài khoản hội viên mới với mã SkyJoy', async () => {
    const mockUser = {
      id: 'user-new-1',
      email: 'hoivien@vietjetair.com',
      full_name: 'NGUYEN VAN B',
      role: 'user',
      phone: '0987654321',
      skyjoy_member_id: 'SJ88889999',
    };

    sqlMock.mockImplementation((strings: string[]) => {
      const text = strings.join('?');
      if (/SELECT id FROM user_profiles WHERE email = \?/.test(text)) {
        return Promise.resolve([]); // Email not taken
      }
      if (/INSERT INTO user_profiles/.test(text)) {
        return Promise.resolve([mockUser]);
      }
      return Promise.resolve([]);
    });

    const res = await createUserRoute(
      createRequest({
        email: 'hoivien@vietjetair.com',
        password: 'Password@2026!',
        full_name: 'NGUYEN VAN B',
        phone: '0987654321',
        role: 'user',
        skyjoy_member_id: 'SJ88889999',
      })
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.user.email).toBe('hoivien@vietjetair.com');
    expect(body.user.skyjoy_member_id).toBe('SJ88889999');
    expect(auditMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ email: 'admin@vietjetair.com' }),
      expect.objectContaining({
        action: 'create_user',
        targetType: 'user',
        targetId: 'user-new-1',
      })
    );
  });

  it('từ chối mật khẩu không đủ độ phức tạp', async () => {
    const res = await createUserRoute(
      createRequest({
        email: 'hoivien@vietjetair.com',
        password: '123',
        full_name: 'NGUYEN VAN B',
      })
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Bad Request');
  });

  it('báo lỗi 409 khi email đã tồn tại', async () => {
    sqlMock.mockImplementation((strings: string[]) => {
      const text = strings.join('?');
      if (/WHERE email = \?/.test(text)) {
        return Promise.resolve([{ id: 'existing-user-1', email: 'existing@vietjetair.com' }]);
      }
      return Promise.resolve([]);
    });

    const res = await createUserRoute(
      createRequest({
        email: 'existing@vietjetair.com',
        password: 'Password@2026!',
        full_name: 'NGUYEN VAN B',
      })
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.message).toContain('Email đã được sử dụng');
  });
});
