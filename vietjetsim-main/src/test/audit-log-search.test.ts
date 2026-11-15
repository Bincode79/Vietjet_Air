import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * The audit-log search box filtered nothing.
 *
 * The tab sends `q` (see `listAuditLogs` in `src/features/admin/services`),
 * but the endpoint only ever read `action`, `user_id`, `resource` and the
 * two dates. `q` was read by nobody, so an operator searching for a log
 * entry by actor, target type or id got the unfiltered list back — with the
 * search box still showing their query, which reads as "no matches" rather
 * than "the filter was never applied".
 *
 * The endpoint also carried six near-identical branches, one per
 * combination of filters, each repeating the same projection and the same
 * `WHERE` fragments. The `q` search existed in none of them. That is the
 * shape of defect that only shows up once a filter is added to the client
 * but not to every branch.
 *
 * These drive the real handler and assert on the SQL it emits, because the
 * defect is that a filter is missing from the statement — a mocked response
 * body would pass either way.
 */
vi.mock('@/lib/admin-auth', () => ({
  verifyAdminRequest: vi.fn().mockResolvedValue({
    payload: { userId: 'admin-1', email: 'admin@vietjet.shop', role: 'admin' },
    error: undefined,
    response: undefined,
  }),
}));

/** Every statement the handler issued, with its bound values. */
const statements: { text: string; values: unknown[] }[] = [];

vi.mock('@/lib/neon', () => {
  const record = (text: string, values: unknown[] = []) => {
    statements.push({ text, values });
  };

  const sqlMock = vi
    .fn()
    .mockImplementation(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join('?');
      record(text, values);
      if (text.includes('SELECT DISTINCT action')) return [{ action: 'booking.create' }];
      if (text.includes('SELECT DISTINCT target_type')) return [{ target_type: 'booking' }];
      return [];
    });

  return {
    sql: Object.assign(sqlMock, {
      query: vi.fn(async (text: string, values: unknown[] = []) => {
        record(text, values);
        return [];
      }),
    }),
  };
});

async function loadRoute() {
  const mod = await import('@/app/api/quan-tri/nhat-ky-kiem-toan/route');
  return mod.GET;
}

function makeRequest(query: string) {
  return new NextRequest(`http://localhost/api/quan-tri/nhat-ky-kiem-toan${query}`);
}

describe('nhật ký kiểm toán: ô tìm kiếm phải thực sự lọc', () => {
  beforeEach(() => {
    statements.length = 0;
  });

  it('đọc tham số tìm kiếm `q` mà client gửi lên', async () => {
    const GET = await loadRoute();
    await GET(makeRequest('?q=Nguyen'));

    // The statement has to mention the search term, and the term has to be
    // bound as a parameter — never interpolated into the SQL text.
    const list = statements.find((s) => s.text.includes('ORDER BY al.created_at DESC'));
    expect(list).toBeDefined();
    expect(list!.text).toMatch(/ILIKE/);
    expect(list!.values).toContain('%Nguyen%');
  });

  it('tìm kiếm được trên hành động, loại tài nguyên, id mục tiêu và người thực hiện', async () => {
    const GET = await loadRoute();
    await GET(makeRequest('?q=abc'));

    const list = statements.find((s) => s.text.includes('ORDER BY al.created_at DESC'));
    expect(list).not.toBeUndefined();
    for (const column of [
      'al.action',
      'al.target_type',
      'al.target_id',
      'u.email',
      'u.full_name',
    ]) {
      expect(list!.text).toContain(column);
    }
  });

  it('không gắn điều kiện tìm kiếm khi không có từ khoá', async () => {
    const GET = await loadRoute();
    await GET(makeRequest(''));

    const list = statements.find((s) => s.text.includes('ORDER BY al.created_at DESC'));
    expect(list).not.toBeUndefined();
    expect(list!.text).not.toMatch(/ILIKE/);
  });

  it('các bộ lọc khác vẫn hoạt động và được gắn tham số', async () => {
    const GET = await loadRoute();
    await GET(makeRequest('?action=booking&user_id=admin-1&resource=booking&date_from=2026-01-01'));

    const list = statements.find((s) => s.text.includes('ORDER BY al.created_at DESC'));
    expect(list).not.toBeUndefined();
    expect(list!.text).toMatch(/al\.action ILIKE/);
    expect(list!.text).toMatch(/al\.admin_id =/);
    expect(list!.text).toMatch(/al\.target_type ILIKE/);
    expect(list!.text).toMatch(/al\.created_at >=/);
  });

  it('đếm tổng số bản ghi với cùng bộ lọc, không phải đếm toàn bảng', async () => {
    const GET = await loadRoute();
    await GET(makeRequest('?q=Nguyen'));

    const count = statements.find((s) => s.text.includes('COUNT(*)'));
    expect(count).toBeDefined();
    // The count has to carry the same WHERE clause, otherwise the pagination
    // total counts every log ever written.
    expect(count!.text).toMatch(/ILIKE/);
    expect(count!.values).toContain('%Nguyen%');
  });

  it('chỉ có một câu truy vấn danh sách, không phải sáu nhánh lặp lại', async () => {
    const GET = await loadRoute();
    await GET(makeRequest('?action=booking&date_from=2026-01-01'));

    const lists = statements.filter((s) => s.text.includes('ORDER BY al.created_at DESC'));
    expect(lists).toHaveLength(1);
  });
});
