import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const admin = vi.hoisted(() => ({ verifyAdminRequest: vi.fn() }));
const report = vi.hoisted(() => ({ buildRevenueReportPdf: vi.fn() }));

vi.mock('@/lib/admin-auth', () => admin);
vi.mock('@/lib/report-service', () => report);

import { GET } from '@/app/api/quan-tri/bao-cao/doanh-thu/route';

function request(query = '') {
  return new NextRequest(`http://localhost/api/quan-tri/bao-cao/doanh-thu${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  admin.verifyAdminRequest.mockResolvedValue({
    payload: { userId: 'admin-1', role: 'admin' },
    error: null,
    response: null,
  });
  report.buildRevenueReportPdf.mockResolvedValue(Buffer.from('%PDF-1.7 test'));
});

describe('GET /api/quan-tri/bao-cao/doanh-thu', () => {
  it('trả thẳng file PDF khi thiếu from/to (không redirect hỏng URL)', async () => {
    const res = await GET(request());

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Cache-Control')).toBe('no-store');

    const call = report.buildRevenueReportPdf.mock.calls[0][0] as {
      from: string;
      to: string;
    };
    expect(call.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(call.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(call.from <= call.to).toBe(true);

    const from = new Date(`${call.from}T00:00:00Z`).getTime();
    const to = new Date(`${call.to}T00:00:00Z`).getTime();
    expect(Math.round((to - from) / 86_400_000)).toBe(6);
  });

  it('dùng đúng khoảng ngày do người dùng chọn', async () => {
    const res = await GET(request('?from=2026-11-01&to=2026-11-15'));

    expect(res.status).toBe(200);
    expect(report.buildRevenueReportPdf).toHaveBeenCalledWith({
      from: '2026-11-01',
      to: '2026-11-15',
    });
    expect(res.headers.get('Content-Disposition')).toContain(
      'bao-cao-doanh-thu-2026-11-01_2026-11-15.pdf'
    );
  });

  it('báo 400 khi ngày sai định dạng', async () => {
    const res = await GET(request('?from=01/11/2026&to=2026-11-15'));

    expect(res.status).toBe(400);
    expect(report.buildRevenueReportPdf).not.toHaveBeenCalled();
  });

  it('báo 400 khi ngày đúng hình dạng nhưng không tồn tại', async () => {
    const res = await GET(request('?from=2026-02-31&to=2026-03-05'));

    expect(res.status).toBe(400);
    expect(report.buildRevenueReportPdf).not.toHaveBeenCalled();
  });

  it('báo 400 khi from sau to', async () => {
    const res = await GET(request('?from=2026-11-15&to=2026-11-01'));

    expect(res.status).toBe(400);
    expect(report.buildRevenueReportPdf).not.toHaveBeenCalled();
  });

  it('trả nguyên response 403 của verifyAdminRequest', async () => {
    const forbidden = NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    admin.verifyAdminRequest.mockResolvedValueOnce({
      payload: null,
      error: 'Forbidden',
      response: forbidden,
    });

    const res = await GET(request('?from=2026-11-01&to=2026-11-15'));

    expect(res.status).toBe(403);
    expect(report.buildRevenueReportPdf).not.toHaveBeenCalled();
  });
});
