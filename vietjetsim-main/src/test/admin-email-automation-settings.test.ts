import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { signAccessToken } from '@/lib/auth';
import {
  POST as sendTestEmailPost,
  GET as previewTestEmailGet,
} from '@/app/api/quan-tri/cai-dat/test-email/route';
import * as mail from '@/lib/mail';
import * as db from '@/lib/db';
import { sql } from '@/lib/neon';

vi.mock('@/lib/role-permissions', () => ({
  getRolePermissionsFromDb: vi.fn(async () => new Set<never>([])),
  bypassesPermissionTable: () => true,
}));

vi.mock('@/lib/csrf', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/csrf')>();
  return { ...actual, validateCsrfOrReject: vi.fn(async () => null) };
});

let customConfigRows: Array<{ key: string; value: string }> = [];

vi.mock('@/lib/neon', async () => {
  const { SYSTEM_ROLES } = await import('@/lib/rbac');
  const tagged = vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = Array.isArray(strings) ? strings.join('?') : String(strings);
    if (/from\s+role_permissions/i.test(text)) {
      const role = String(values[0]);
      return Promise.resolve(
        Array.from(SYSTEM_ROLES[role]?.permissions ?? []).map((permission) => ({ permission }))
      );
    }
    if (/from\s+system_config/i.test(text)) {
      return Promise.resolve(customConfigRows);
    }
    return Promise.resolve([]);
  });
  const sqlMock = Object.assign(tagged, {
    query: vi.fn(),
    begin: vi.fn(),
    transaction: vi.fn().mockResolvedValue([[]]),
  });
  return { sql: sqlMock };
});

const makeAdminToken = () =>
  signAccessToken({
    userId: 'test-admin-id',
    email: 'admin@vietjetsim.vn',
    role: 'admin',
    fullName: 'Test Admin',
  });

const makeCustomerToken = () =>
  signAccessToken({
    userId: 'test-user-id',
    email: 'khach@vietjetsim.vn',
    role: 'user',
    fullName: 'Test Customer',
  });

const CSRF_TOKEN = 'test-csrf-token';
const withCsrf = (accessToken: string) => ({
  cookie: `access_token=${accessToken}; csrf_token=${CSRF_TOKEN}; session_id=test-session`,
  'x-csrf-token': CSRF_TOKEN,
});

function postTestEmailRequest(body: Record<string, unknown>, token = makeAdminToken()) {
  return new NextRequest('http://localhost:4028/api/quan-tri/cai-dat/test-email', {
    method: 'POST',
    headers: withCsrf(token),
    body: JSON.stringify(body),
  });
}

function getPreviewEmailRequest(template: string, token = makeAdminToken()) {
  return new NextRequest(
    `http://localhost:4028/api/quan-tri/cai-dat/test-email?template=${template}`,
    {
      method: 'GET',
      headers: withCsrf(token),
    }
  );
}

describe('Admin Automated Email Settings & Test Email Route', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    customConfigRows = [];
  });

  describe('getEmailAutomationSettings() reader', () => {
    it('returns default settings when system_config table has no custom values', async () => {
      customConfigRows = [];

      const settings = await db.getEmailAutomationSettings();
      expect(settings).toEqual({
        autoSendInvoice: true,
        autoSendBookingConfirmation: true,
        autoSendFareChange: true,
        autoSendFlightDelay: true,
        emailNotifications: true,
      });
    });

    it('reads custom values configured in system_config', async () => {
      customConfigRows = [
        { key: 'auto_send_payment_invoice_email', value: 'false' },
        { key: 'auto_send_booking_confirmation_email', value: 'false' },
        { key: 'auto_send_fare_change_email', value: 'true' },
        { key: 'auto_send_flight_delay_email', value: 'false' },
        { key: 'email_notifications', value: 'false' },
      ];

      const settings = await db.getEmailAutomationSettings();
      expect(settings).toEqual({
        autoSendInvoice: false,
        autoSendBookingConfirmation: false,
        autoSendFareChange: true,
        autoSendFlightDelay: false,
        emailNotifications: false,
      });
    });
  });

  describe('POST /api/quan-tri/cai-dat/test-email', () => {
    it('rejects unauthenticated or unauthorized non-admin users', async () => {
      const res = await sendTestEmailPost(
        postTestEmailRequest({ to: 'admin@test.com' }, makeCustomerToken())
      );
      expect(res.status).toBe(403);
    });

    it('rejects invalid email address with 400', async () => {
      const res = await sendTestEmailPost(postTestEmailRequest({ to: 'invalid-email-address' }));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.message).toContain('email');
    });

    it('sends default test connection email template successfully', async () => {
      const sendMailSpy = vi.spyOn(mail, 'sendMail').mockResolvedValue(true);

      const res = await sendTestEmailPost(
        postTestEmailRequest({ to: 'ops@vietjetair.com', template: 'test' })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);

      expect(sendMailSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'ops@vietjetair.com',
          subject: expect.stringContaining('Kiểm tra kết nối dịch vụ Email tự động'),
        })
      );
    });

    it('dispatches booking confirmation email template', async () => {
      const sendMailSpy = vi.spyOn(mail, 'sendMail').mockResolvedValue(true);

      const res = await sendTestEmailPost(
        postTestEmailRequest({ to: 'khachhang@gmail.com', template: 'booking' })
      );
      expect(res.status).toBe(200);

      expect(sendMailSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'khachhang@gmail.com',
          subject: expect.stringMatching(/thanh toán|VJ9876/i),
        })
      );
    });

    it('dispatches invoice payment success email template', async () => {
      const sendMailSpy = vi.spyOn(mail, 'sendMail').mockResolvedValue(true);

      const res = await sendTestEmailPost(
        postTestEmailRequest({ to: 'khachhang@gmail.com', template: 'invoice' })
      );
      expect(res.status).toBe(200);

      expect(sendMailSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'khachhang@gmail.com',
          subject: expect.stringMatching(/thanh toán thành công|xác nhận vé/i),
        })
      );
    });

    it('dispatches fare notice announcement email template', async () => {
      const sendMailSpy = vi.spyOn(mail, 'sendMail').mockResolvedValue(true);

      const res = await sendTestEmailPost(
        postTestEmailRequest({ to: 'daily@vietjet-agency.vn', template: 'fare' })
      );
      expect(res.status).toBe(200);

      expect(sendMailSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'daily@vietjet-agency.vn',
          subject: expect.stringMatching(/CV-VJC|THÔNG BÁO|BIỂU GIÁ/i),
        })
      );
    });

    it('dispatches flight delay notice email template', async () => {
      const sendMailSpy = vi.spyOn(mail, 'sendMail').mockResolvedValue(true);

      const res = await sendTestEmailPost(
        postTestEmailRequest({ to: 'passenger@gmail.com', template: 'delay' })
      );
      expect(res.status).toBe(200);

      expect(sendMailSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'passenger@gmail.com',
          subject: expect.stringContaining('Thông báo thay đổi giờ bay'),
        })
      );
    });
  });

  describe('GET /api/quan-tri/cai-dat/test-email (Live Preview)', () => {
    it('rejects unauthenticated or non-admin requests with 403', async () => {
      const res = await previewTestEmailGet(getPreviewEmailRequest('booking', makeCustomerToken()));
      expect(res.status).toBe(403);
    });

    it('returns structured preview data with HTML and subject for booking', async () => {
      const res = await previewTestEmailGet(getPreviewEmailRequest('booking'));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.template).toBe('booking');
      expect(json.subject).toContain('thanh toán đặt chỗ');
      expect(json.html).toContain('VJ9876');
      expect(json.html).toContain('VietQR');
    });

    it('returns structured preview data for invoice', async () => {
      const res = await previewTestEmailGet(getPreviewEmailRequest('invoice'));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.template).toBe('invoice');
      expect(json.html).toContain('ĐÃ THANH TOÁN');
      expect(json.html).toContain('Xem vé điện tử');
    });

    it('returns structured preview data for fare announcement', async () => {
      const res = await previewTestEmailGet(getPreviewEmailRequest('fare'));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.template).toBe('fare');
      expect(json.html).toContain('CV-VJC/2026/GVE-01');
      expect(json.html).toContain('Eco');
      expect(json.html).toContain('SkyBoss');
    });

    it('returns structured preview data for flight delay notice', async () => {
      const res = await previewTestEmailGet(getPreviewEmailRequest('delay'));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.template).toBe('delay');
      expect(json.subject).toContain('Thông báo thay đổi giờ bay');
      expect(json.html).toContain('Giờ khởi hành mới (dự kiến)');
    });

    it('returns structured preview data for ping test email', async () => {
      const res = await previewTestEmailGet(getPreviewEmailRequest('test'));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.template).toBe('test');
      expect(json.html).toContain('DỊCH VỤ EMAIL HOẠT ĐỘNG BÌNH THƯỜNG');
    });
  });
});
