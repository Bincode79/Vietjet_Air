/**
 * The UI check gate was green without ever testing a logged-in screen.
 *
 * `scripts/ui-check.cjs` captures 68 screens. Four of them — `/tai-khoan`,
 * `/thanh-toan`, `/quan-tri`, `/dat-ve/[id]` — only render their real content
 * for a signed-in visitor. The gate logged in first, but its `login()` helper
 * reported success for ANY response that did not throw:
 *
 *   return { ok: true, status: res.status, role: body.user && body.user.role };
 *
 * A 401 (wrong password, or an account the database does not know) was
 * reported as `ok: true`. The gate therefore announced "logged in" while the
 * pages were being captured as an anonymous visitor, and every downstream
 * assertion about those pages was vacuous.
 *
 * The second half of the defect was in the mock database: `user_profiles`
 * was seeded empty, so no credential could ever succeed. Both the check that
 * reports failure and the data that lets it pass are pinned here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const UI_CHECK = 'scripts/ui-check.cjs';
const NEON = 'src/lib/neon.ts';

function read(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('cổng ui-check không được báo xanh khi đăng nhập hỏng', () => {
  it('cờ ok của login phải theo HTTP status, không phải "fetch không ném lỗi"', () => {
    const code = read(UI_CHECK);
    // `res.ok` is HTTP-level truth; `ok: true` on every response is the bug.
    expect(code).toMatch(/const ok = res\.ok;/);
    expect(code).toMatch(/ok,\s*\n\s*status: res\.status/);
  });

  it('không còn trả ok: true cho mọi response', () => {
    const code = read(UI_CHECK);
    expect(code).not.toMatch(/return \{ ok: true, status: res\.status/);
  });

  it('gate phải tính đăng nhập hỏng là một lỗi của cổng', () => {
    const code = read(UI_CHECK);
    expect(code).toMatch(/if \(!res \|\| !res\.ok\)/);
    expect(code).toMatch(/Đăng nhập \$\{who\} thất bại/);
  });
});

describe('mock database phải có tài khoản demo cho cổng đăng nhập', () => {
  it('seed hai tài khoản demo: quản trị và khách', () => {
    const code = read(NEON);
    expect(code).toMatch(/mock-user-admin/);
    expect(code).toMatch(/mock-user-support/);
    expect(code).toMatch(/admin@vietjetair\.vn/);
    expect(code).toMatch(/user@vietjetair\.vn/);
  });

  it('tài khoản demo có hash bcrypt để đăng nhập thật sự qua được', () => {
    const code = read(NEON);
    // bcrypt hash sinh sẵn cho "admin123" / "user123" — mock không import
    // bcrypt nên hash phải nằm sẵn trong seed.
    expect(code).toMatch(/\$2b\$12\$/);
    expect(code).toMatch(/password_hash:/);
  });

  it('truy vấn user_profiles so khớp email không phân biệt hoa thường', () => {
    const code = read(NEON);
    // `findAccountByIdentifier` dùng `LOWER(email) = LOWER(?)`; mock phải
    // theo, nếu không thì đăng nhập bằng email viết hoa sẽ hỏng ở dev
    // nhưng chạy đúng trên database thật.
    expect(code).toMatch(/toLowerCase\(\) === wanted/);
  });
});
