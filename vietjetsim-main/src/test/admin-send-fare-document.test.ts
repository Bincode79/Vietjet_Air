import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { signAccessToken } from '@/lib/auth';
import { buildFareAnnouncementHtml } from '@/lib/mail';
import { POST as sendFareDocPost } from '@/app/api/quan-tri/chuyen-bay/van-ban-gia-ve/route';
import * as mail from '@/lib/mail';
import * as db from '@/lib/db';

vi.mock('@/lib/role-permissions', () => ({
  getRolePermissionsFromDb: vi.fn(async () => new Set<never>([])),
  bypassesPermissionTable: () => true,
}));

vi.mock('@/lib/csrf', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/csrf')>();
  return { ...actual, validateCsrfOrReject: vi.fn(async () => null) };
});

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

const CSRF_TOKEN = 'test-csrf-token';
const withCsrf = (accessToken: string) => ({
  cookie: `access_token=${accessToken}; csrf_token=${CSRF_TOKEN}; session_id=test-session`,
  'x-csrf-token': CSRF_TOKEN,
});

function postDocRequest(body: Record<string, unknown>, token = makeAdminToken()) {
  return new NextRequest('http://localhost:4028/api/quan-tri/chuyen-bay/van-ban-gia-ve', {
    method: 'POST',
    headers: withCsrf(token),
    body: JSON.stringify(body),
  });
}

describe('Tạo văn bản công văn giá vé tự động (buildFareAnnouncementHtml)', () => {
  it('sinh HTML công văn biểu giá vé có số công văn, logo, bảng giá và chữ ký', () => {
    const result = buildFareAnnouncementHtml({
      documentNo: 'CV-VJC/2026/GVE-1122',
      title: 'THÔNG BÁO ÁP DỤNG BIỂU GIÁ VÉ MÙA DU LỊCH',
      effectiveDate: 'Áp dụng từ 01/12/2026',
      recipientName: 'Quý Đại lý vé máy bay',
      routes: [
        {
          from: 'SGN',
          to: 'HAN',
          flightNo: 'VJ 120',
          ecoPrice: 699000,
          businessPrice: 1899000,
        },
      ],
      note: 'Áp dụng cho các chuyến bay khởi hành từ sáng sớm.',
    });

    expect(result.subject).toContain('CV-VJC/2026/GVE-1122');
    expect(result.subject).toContain('THÔNG BÁO ÁP DỤNG BIỂU GIÁ VÉ MÙA DU LỊCH');

    expect(result.html).toContain('CV-VJC/2026/GVE-1122');
    expect(result.html).toContain('SGN &rarr; HAN');
    expect(result.html).toContain('699.000 ₫');
    expect(result.html).toContain('1.899.000 ₫');
    expect(result.html).toContain('BAN THƯƠNG MẠI &amp; QUẢN LÝ GIÁ VÉ');
    expect(result.html).toContain('Quý Đại lý vé máy bay');

    expect(result.text).toContain('SGN -> HAN');
    expect(result.text).toContain('699.000 đ');
  });
});

describe('API Gửi văn bản giá vé tự động (/api/quan-tri/chuyen-bay/van-ban-gia-ve)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('từ chối khi routes trống (400)', async () => {
    const req = postDocRequest({ routes: [] });
    const res = await sendFareDocPost(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Bad Request');
  });

  it('tự động lấy danh sách email đại lý và gửi email thông báo', async () => {
    vi.spyOn(db, 'getAllAgencies').mockResolvedValueOnce({
      agencies: [
        {
          id: 'ag-1',
          code: 'AG01',
          name: 'Đại lý Én Việt',
          contact_email: 'enviet@agency.vn',
          status: 'active',
          tier: 'gold',
          discount_rate: 5,
        },
        {
          id: 'ag-2',
          code: 'AG02',
          name: 'Đại lý 247',
          contact_email: 'booking@ve247.vn',
          status: 'active',
          tier: 'silver',
          discount_rate: 3,
        },
      ],
      total: 2,
    } as never);

    const mockSendEmail = vi.spyOn(mail, 'sendFareAnnouncementEmail').mockResolvedValue(true);

    const req = postDocRequest({
      documentNo: 'CV-VJC/2026/GVE-TEST',
      title: 'BIỂU GIÁ VÉ MỚI',
      recipientsType: 'agencies',
      routes: [
        {
          from: 'SGN',
          to: 'DAD',
          flightNo: 'VJ 301',
          ecoPrice: 499000,
        },
      ],
    });

    const res = await sendFareDocPost(req);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.sentCount).toBe(2);
    expect(data.recipients).toContain('enviet@agency.vn');
    expect(data.recipients).toContain('booking@ve247.vn');
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
  });

  it('hỗ trợ gửi danh sách email tùy chỉnh (customEmails)', async () => {
    const mockSendEmail = vi.spyOn(mail, 'sendFareAnnouncementEmail').mockResolvedValue(true);

    const req = postDocRequest({
      documentNo: 'CV-VJC/2026/GVE-CUSTOM',
      recipientsType: 'custom',
      customEmails: ['partner1@domain.com', 'partner2@domain.com'],
      routes: [
        {
          from: 'HAN',
          to: 'PQC',
          flightNo: 'VJ 451',
          ecoPrice: 799000,
        },
      ],
    });

    const res = await sendFareDocPost(req);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.sentCount).toBe(2);
    expect(data.recipients).toEqual(['partner1@domain.com', 'partner2@domain.com']);
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
  });
});
