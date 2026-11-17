/**
 * Neon Serverless PostgreSQL Client
 *
 * This module provides the sql template tag for database queries.
 * In production, uses @neondatabase/serverless with connection pooling.
 * In development mode (DATABASE_URL trống), uses a mock implementation.
 */

import { neon, neonConfig } from '@neondatabase/serverless';

import { SYSTEM_ROLES } from '@/lib/rbac';

// Check if we have a real database connection
const hasRealDb = !!process.env.DATABASE_URL;

function isNetworkOfflineError(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: string })?.code;
  return (
    msg.includes('fetch failed') ||
    msg.includes('network') ||
    msg.includes('ENOTFOUND') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('socket hang up') ||
    code === 'ENOTFOUND' ||
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT'
  );
}

/**
 * Hình dạng của `sql` mà codebase này dùng.
 *
 * `@neondatabase/serverless` có type riêng (`NeonQueryFunction`), nhưng hàm đó
 * gắn chặt với HTTP client và các generic của package. Ở đây ta chỉ cần
 * ba cách gọi — tagged template, `query()` thô có tham số, và `transaction()`
 * — nên khai báo một interface nhỏ, có tài liệu, thay vì để `any`.
 *
 * `transaction()` nhận `unknown` vì mảng truy vấn có thể là callback hoặc
 * chuỗi SQL tuỳ phiên bản Neon; kiểm tra runtime trong `createMockSql`.
 */
/**
 * Một hàng kết quả truy vấn.
 *
 * Cột cụ thể chưa biết được lúc biên dịch (SQL động), nên hàng được mô tả
 * bằng chỉ số ký tự. Call site nào biết cấu trúc hàng thì truyền generic:
 * `await sql<BookingRow>\`SELECT ...\`` — đó là cách thay cho `as any[]`.
 *
 * Vì sao `any` ở đây chứ không phải `unknown`: giá trị của một hàng SQL là
 * động theo bảng, và hàng đó được ép sang interface cụ thể ở call site
 * (`as UserRecord[]`). Với `unknown`, mọi ép như vậy sẽ thành lỗi biên dịch
 * vì hai kiểu không "đủ giao nhau" — buộc phải thêm `as unknown as` ở hàng
 * chục chỗ, tức là đẩy việc xác nhận kiểu ra khỏi nơi nó được kiểm soát.
 *
 * Đây là THOẠI NGOẠI LỄ DUY NHẤT của `any` trong module này, và nó được
 * khai báo đúng một chỗ thay vì rải khắp 29 dòng `as any[]`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SqlRow = Record<string, any>;

/**
 * Hình dạng của `sql` mà codebase này dùng.
 *
 * `@neondatabase/serverless` có type riêng (`NeonQueryFunction`), nhưng hàm đó
 * gắn chặt với HTTP client và các generic của package. Ở đây ta chỉ cần
 * bốn cách gọi — tagged template, `query()` thô có tham số, `transaction()`,
 * và `unsafe()` — nên khai báo một interface nhỏ, có tài liệu, thay vì để
 * `any`.
 *
 * `transaction()` nhận `unknown` vì mảng truy vấn có thể là callback hoặc
 * chuỗi SQL tuỳ phiên bản Neon; kiểm tra runtime trong `createMockSql`.
 */
export interface SqlClient {
  <T = SqlRow>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>;
  query<T = SqlRow>(text: string, values?: unknown[]): Promise<T[]>;
  transaction(queries: unknown): Promise<unknown>;
  /**
   * Chèn SQL thô vào một tagged template — dùng để ghép `SET a = $1, b = $2`
   * với số thứ tự placeholder đã tự dựng (xem route cập nhật thông báo).
   *
   * `unsafe` là tên của Neon, không phải lựa chọn của ta: chuỗi truyền vào
   * phải do server tự dựng từ allow-list, KHÔNG bao giờ lấy từ người dùng.
   */
  unsafe(query: string, params?: unknown[]): unknown;
}

/**
 * Client Neon thật, đã bỏ các phần mà ta không gọi tới.
 *
 * `neon()` trả về `NeonQueryFunction` có `query`, `transaction`, `unsafe`.
 * Ta chỉ cần `query` và `transaction` — `unsafe` không dùng ở đây.
 */
type RawNeonClient = {
  <T = SqlRow>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>;
  query?: <T = SqlRow>(text: string, values?: unknown[]) => Promise<T[]>;
  transaction?: (queries: unknown) => Promise<unknown>;
  unsafe?: (query: string, params?: unknown[]) => unknown;
};

function createResilientSql(rawNeon: RawNeonClient | null, mock: SqlClient): SqlClient {
  const resilientFn = async <T = SqlRow>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]> => {
    if (!hasRealDb || !rawNeon) {
      return mock<T>(strings, ...values);
    }
    try {
      return await rawNeon<T>(strings, ...values);
    } catch (err) {
      if (isNetworkOfflineError(err) && process.env.NODE_ENV !== 'production') {
        console.warn(
          '⚠️ [NEON NETWORK OFFLINE] Mất kết nối tới Neon Serverless DB (' +
            (err instanceof Error ? err.message : String(err)) +
            '). Tự động chuyển sang fallback mock in-memory thông minh.'
        );
        return mock<T>(strings, ...values);
      }
      throw err;
    }
  };

  resilientFn.query = async <T = SqlRow>(text: string, values: unknown[] = []): Promise<T[]> => {
    if (!hasRealDb || !rawNeon) return mock.query<T>(text, values);
    try {
      if (rawNeon.query) return await rawNeon.query<T>(text, values);
      // `rawNeon.query` vắng mặt (bản Neon cũ) — gọi thẳng hàm tagged.
      return await rawNeon<T>(text as unknown as TemplateStringsArray, ...values);
    } catch (err) {
      if (isNetworkOfflineError(err) && process.env.NODE_ENV !== 'production') {
        console.warn('⚠️ [NEON QUERY OFFLINE] Fallback mock in-memory.');
        return mock.query<T>(text, values);
      }
      throw err;
    }
  };

  resilientFn.transaction = async (queries: unknown) => {
    if (!hasRealDb || !rawNeon) return mock.transaction(queries);
    try {
      if (rawNeon.transaction) return await rawNeon.transaction(queries);
      return await mock.transaction(queries);
    } catch (err) {
      if (isNetworkOfflineError(err) && process.env.NODE_ENV !== 'production') {
        console.warn('⚠️ [NEON TRANSACTION OFFLINE] Fallback mock transaction in-memory.');
        return mock.transaction(queries);
      }
      throw err;
    }
  };

  resilientFn.unsafe = (query: string, params?: unknown[]) => {
    if (!hasRealDb || !rawNeon?.unsafe) {
      // Mock: trả về chuỗi SQL để ghép vào template — mock không có
      // parser nên không thể "chạy" một mảnh SQL thô.
      return { __unsafeSql: query, __unsafeParams: params ?? [] };
    }
    return rawNeon.unsafe(query, params);
  };

  return resilientFn;
}

let sqlFn: SqlClient;

if (hasRealDb) {
  // Real Neon connection
  const rawNeon = neon(process.env.DATABASE_URL!) as unknown as RawNeonClient;
  // Local dev/database-behind-proxy setups (NEON_FETCH_ENDPOINT in .env.local):
  if (process.env.NEON_FETCH_ENDPOINT) {
    neonConfig.fetchEndpoint = process.env.NEON_FETCH_ENDPOINT;
  }
  const mock = createMockSql();
  sqlFn = createResilientSql(rawNeon, mock);
} else if (process.env.NODE_ENV === 'production' && process.env.ALLOW_MOCK_DB !== '1') {
  // Never fall back to the mock database in production: that would silently
  // serve in-memory data instead of the real store.
  //
  // `ALLOW_MOCK_DB=1` is the single exception, and it exists for one caller:
  // `scripts/run-ui-check.sh` runs `next start` (the UI gate must measure a
  // production build — see AGENTS.md) with no database, and the whole point of
  // that gate is the rendered markup. Without the flag every API on every screen
  // answered 500 "DATABASE_URL is required in production" and 42 of 68 captures
  // were flagged, which reads as a UI regression rather than a missing database.
  // The flag is only ever exported by that script; never set it on a server.
  console.warn('⚠️  ALLOW_MOCK_DB=1 in production: serving the in-memory mock. QA gate only.');
  const mock = createMockSql();
  sqlFn = createResilientSql(null, mock);
} else {
  // Mock implementation for development without DB
  console.warn('⚠️  DATABASE_URL not set. Using mock database. Do not use in production.');
  const mock = createMockSql();
  sqlFn = createResilientSql(null, mock);
}

export { sqlFn as sql };

// ─── Mock Implementation ─────────────────────────────────────────────────────

interface MockResult {
  [key: string]: unknown;
}

function createMockSql(): SqlClient {
  const mockData: Record<string, MockResult[]> = {
    'SELECT * FROM airports ORDER BY city': [
      {
        id: '1',
        code: 'SGN',
        name: 'Tân Sơn Nhất',
        city: 'TP Hồ Chí Minh',
        country: 'Vietnam',
        created_at: new Date().toISOString(),
      },
      {
        id: '2',
        code: 'HAN',
        name: 'Nội Bài',
        city: 'Hà Nội',
        country: 'Vietnam',
        created_at: new Date().toISOString(),
      },
      {
        id: '3',
        code: 'DAD',
        name: 'Đà Nẵng',
        city: 'Đà Nẵng',
        country: 'Vietnam',
        created_at: new Date().toISOString(),
      },
    ],
  };

  // ─── role_permissions ──────────────────────────────────────────────────────
  // `verifyAdminRequest` is fail-closed, so a role with no rows can call no
  // guarded route. Without this handler every admin-route test would 403 purely
  // because the in-memory database had no grants — the mock has to mirror the
  // seed in migrations/019_role_permissions.sql, or tests would assert against
  // a database no real deployment ever has.
  const runRolePermissionQuery = (query: string, values: unknown[]): MockResult[] | null => {
    if (!/from\s+role_permissions/i.test(query)) return null;
    const role = values[0];
    const grants = Array.from(SYSTEM_ROLES[String(role)]?.permissions ?? []);
    return grants.map((permission) => ({ permission }));
  };

  // ─── In-memory chat store ────────────────────────────────────────────────────
  // Chat is entirely query-driven, so without a real database every read would
  // return `[]` (and `getAllConversations` would crash on `countResult[0]`),
  // leaving the UI looking broken. Keep a minimal in-memory store so chat is
  // exercisable in dev/CI, seeded with one thread so the admin console is not
  // empty on a fresh start.
  const chatConversations: MockResult[] = [];
  const chatMessages: MockResult[] = [];
  const chatPresence: MockResult[] = [];
  const chatCalls: MockResult[] = [];
  const userProfiles: MockResult[] = [];

  /**
   * Ví và loyalty.
   *
   * `/api/vi` và `/api/thanh-vien` chỉ được gọi khi đã đăng nhập, nên trước
   * khi cổng ui-check thật sự đăng nhập được, hai route này chưa từng được
   * kiểm tra lần nào — và chúng đang trả 500:
   *
   *   - `getOrCreateWallet` INSERT rồi đọc `result[0]`; mock không có
   *     handler cho `user_wallets` nên `result` rỗng ⇒ `wallet` là
   *     `undefined` ⇒ `wallet.balance` ném TypeError ⇒ 500.
   *   - `getOrEnrollLoyalty` ném "No active loyalty program found" khi bảng
   *     `loyalty_programs` rỗng ⇒ 500.
   *
   * Hai điều trên không phải lỗi của UI mà là lỗi của mock DB, nhưng chúng
   * che mất trạng thái thật của màn `/thanh-toan`, nên mock phải trả lời
   * được chứ không trả 500.
   */
  const userWallets: MockResult[] = [];
  const walletTransactions: MockResult[] = [];
  const savedPaymentMethods: MockResult[] = [];
  const loyaltyPrograms: MockResult[] = [];
  const userLoyalty: MockResult[] = [];
  const loyaltyTiers: MockResult[] = [];

  const nowIso = () => new Date().toISOString();
  let chatSeq = 0;
  const nextChatId = (prefix: string) => `${prefix}-mock-${++chatSeq}`;

  /**
   * Bảng `system_config` trong bộ nhớ.
   *
   * Được seed với đúng các key trong `SYSTEM_CONFIG_SCHEMA` (`lib/system-config.ts`)
   * và giá trị mặc định của chúng — nhờ vậy mock mode và production hành xử
   * giống nhau khi admin chưa lưu cài đặt nào.
   */
  const mockSystemConfig: MockResult[] = [
    {
      id: 'mock-config-auto-send',
      key: 'auto_send_payment_invoice_email',
      value: 'true',
      type: 'boolean',
      description: 'Tự động gửi hoá đơn qua email khi thanh toán',
      category: 'notification',
      updated_by: null,
      created_at: nowIso(),
      updated_at: nowIso(),
    },
    {
      id: 'mock-config-email-notifications',
      key: 'email_notifications',
      value: 'true',
      type: 'boolean',
      description: 'Thông báo qua email',
      category: 'notification',
      updated_by: null,
      created_at: nowIso(),
      updated_at: nowIso(),
    },
    {
      id: 'mock-config-max-passengers',
      key: 'max_passengers_per_booking',
      value: '9',
      type: 'number',
      description: 'Số khách tối đa/đơn',
      category: 'booking',
      updated_by: null,
      created_at: nowIso(),
      updated_at: nowIso(),
    },
  ];

  const getMockSystemConfigStore = () => mockSystemConfig;

  /**
   * Đại lý và mã giảm giá.
   *
   * Tab "Quản lý đại lý" và "Quản lý mã giảm giá" đọc/ghi hai bảng này. Không
   * có store thì mọi câu hỏi trả `[]` ⇒ danh sách rỗng và mọi thao tác thêm
   * / sửa / xoá trả về `undefined` ⇒ UI báo lỗi 500 trong khi code chạy đúng.
   */
  const mockAgencies: MockResult[] = [
    {
      id: 'mock-agency-1',
      code: 'AGENCY01',
      name: 'Đại lý Hà Nội',
      contact_name: 'Nguyễn Văn A',
      contact_email: 'lienhe@agency01.vn',
      contact_phone: '0900000001',
      address: '1 Hàng Bạc, Hà Nội',
      commission_rate: 8,
      notes: null,
      is_active: true,
      created_at: nowIso(),
      updated_at: nowIso(),
    },
  ];

  const mockDiscountCodes: MockResult[] = [
    {
      id: 'mock-discount-1',
      code: 'VJ10',
      type: 'percentage',
      value: 10,
      min_booking_amount: 0,
      max_discount_amount: 200000,
      agency_id: null,
      usage_limit: 1000,
      usage_per_user_limit: 1,
      used_count: 0,
      is_active: true,
      valid_from: nowIso(),
      valid_to: null,
      created_at: nowIso(),
      updated_at: nowIso(),
    },
  ];

  /**
   * Tài khoản demo cho UI check.
   *
   * Không có tài khoản này thì `scripts/ui-check.cjs` đăng nhập luôn nhận 401,
   * và 3 màn hình phía sau (`/tai-khoan`, `/thanh-toan`, `/quan-tri`) bị chụp
   * ở trạng thái khách vô danh — tức là cổng nghiệm thu "xanh" trong khi
   * thực tế chưa hề kiểm tra được bất kỳ màn nào cần đăng nhập nào.
   *
   * Hash bcrypt sinh sẵn (salt 12) cho `admin123` / `user123` — không import
   * bcrypt ở đây để `neon.ts` không kéo thêm phụ thuộc nặng vào môi trường
   * mock. Hash tĩnh là an toàn vì tài khoản này chỉ tồn tại trong bộ nhớ
   * của tiến trình dev/CI, không bao giờ chạm vào database thật.
   */
  userProfiles.push(
    {
      id: 'mock-user-admin',
      email: 'admin@vietjetair.vn',
      password_hash: '$2b$12$vmah6wetUddJaC2aWrEfCuwP5cZ6Y0wBmihKmLPobqez3dxkGfUDq',
      full_name: 'Quản trị viên',
      role: 'admin',
      phone: null,
      avatar_url: null,
      created_at: nowIso(),
      updated_at: nowIso(),
    },
    {
      id: 'mock-user-support',
      email: 'user@vietjetair.vn',
      password_hash: '$2b$12$PK98dPc58uzUvxnVoaUbweE7HSkvZzVr3UTtrwy7d8JD68cZpPh6e',
      full_name: 'Khách hàng',
      role: 'user',
      phone: null,
      avatar_url: null,
      created_at: nowIso(),
      updated_at: nowIso(),
    }
  );

  const seedConversationId = 'conv-mock-support';
  chatConversations.push({
    id: seedConversationId,
    user_id: 'mock-user-support',
    user_email: 'user@vietjetair.vn',
    user_name: 'Khách hàng',
    status: 'active',
    last_message: 'Tôi cần hỗ trợ đổi ngày bay',
    unread_by_user: 0,
    unread_by_admin: 1,
    created_at: nowIso(),
    updated_at: nowIso(),
  });
  chatMessages.push(
    {
      id: nextChatId('msg'),
      conversation_id: seedConversationId,
      sender_id: 'mock-user-support',
      sender_role: 'user',
      content: 'Xin chào, tôi cần hỗ trợ.',
      read_at: null,
      created_at: nowIso(),
    },
    {
      id: nextChatId('msg'),
      conversation_id: seedConversationId,
      sender_id: 'mock-user-support',
      sender_role: 'user',
      content: 'Tôi cần hỗ trợ đổi ngày bay',
      read_at: null,
      created_at: nowIso(),
    }
  );

  // Chương trình loyalty và các bậc điểm — `getOrEnrollLoyalty` ném lỗi nếu
  // không có chương trình nào đang hoạt động.
  loyaltyPrograms.push({
    id: 'mock-loyalty-program',
    name: 'Vietjet SkyJoy',
    description: 'Chương trình thành viên Vietjet Air',
    points_per_1000_vnd: 1,
    min_points_to_redeem: 10000,
    points_expiry_months: 24,
    start_date: '2020-01-01',
    end_date: null,
    is_active: true,
  });
  loyaltyTiers.push(
    {
      id: 'mock-tier-red',
      program_id: 'mock-loyalty-program',
      name: 'Red',
      min_lifetime_points: 0,
      points_multiplier: 1,
      benefits: null,
      tier_order: 1,
    },
    {
      id: 'mock-tier-silver',
      program_id: 'mock-loyalty-program',
      name: 'Silver',
      min_lifetime_points: 50000,
      points_multiplier: 1.2,
      benefits: null,
      tier_order: 2,
    },
    {
      id: 'mock-tier-gold',
      program_id: 'mock-loyalty-program',
      name: 'Gold',
      min_lifetime_points: 100000,
      points_multiplier: 1.5,
      benefits: null,
      tier_order: 3,
    },
    {
      id: 'mock-tier-platinum',
      program_id: 'mock-loyalty-program',
      name: 'Platinum',
      min_lifetime_points: 250000,
      points_multiplier: 2,
      benefits: null,
      tier_order: 4,
    }
  );

  const normalizeSql = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase();

  /**
   * Trích danh sách cột trong mệnh đề `SET` của một câu `UPDATE`, theo đúng
   * thứ tự xuất hiện.
   *
   * Câu SQL có hai dạng trong codebase: raw `sql.query` dùng `$1, $2, …`, còn
   * template `sql` biến mỗi `${…}` thành `?`. Giá trị của các cột luôn đi
   * trước trong mảng `values` (tham số của mệnh đề `WHERE` nằm ở cuối), nên
   * thứ tự cột trong `SET` chính là thứ tự chỉ số cần đọc.
   *
   * Chỉ phần sau `SET` được xét: `SET a = $1, b = $2` phải ra `['a', 'b']`, và
   * `updated_at = NOW()` không có tham số nên không được tính.
   */
  const extractSetColumns = (text: string): string[] => {
    const setIndex = text.search(/\bset\b/i);
    if (setIndex < 0) return [];
    const setClause = text.slice(setIndex);
    const whereIndex = setClause.search(/\bwhere\b/i);
    const assignments = whereIndex >= 0 ? setClause.slice(0, whereIndex) : setClause;

    return [...assignments.matchAll(/([a-z_][a-z0-9_]*)\s*=\s*(?:\$\d+|\?)/gi)]
      .map((m) => m[1].toLowerCase())
      .filter((column) => column !== 'set');
  };

  /**
   * Đại lý (`agencies`) và mã giảm giá (`discount_codes`).
   *
   * `getAllAgencies` dùng `sql.query` với câu có `LEFT JOIN discount_codes`
   * và `COUNT(d.id)::int AS discount_count`, còn các route ghi dùng `sql` với
   * template. Cả hai đều phải được trả lời, nếu không tab "Quản lý đại lý" và
   * "Quản lý mã giảm giá" rỗng/lỗi trong mock mode.
   */
  function runAgencyAndDiscountQuery(text: string, values: unknown[]): MockResult[] | null {
    const q = normalizeSql(text);

    // ── agencies ───────────────────────────────────────────────────────────
    // Các nhánh ghi (INSERT/UPDATE/DELETE) phải được kiểm tra TRƯỚC nhánh
    // đọc: câu `INSERT INTO agencies` không có mệnh đề `FROM agencies`, nên
    // nếu bọc tất cả trong `if (q.includes('from agencies'))` thì chúng không
    // bao giờ vào được.
    if (q.includes('insert into agencies')) {
      const row: MockResult = {
        id: nextChatId('agc'),
        code: String(values[0] ?? '').toUpperCase(),
        name: String(values[1] ?? ''),
        contact_name: values[2] ?? null,
        contact_email: values[3] ?? null,
        contact_phone: values[4] ?? null,
        address: values[5] ?? null,
        commission_rate: values[6] ?? 0,
        notes: values[7] ?? null,
        is_active: values[8] ?? true,
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      mockAgencies.push(row);
      return [row];
    }

    if (q.includes('update agencies')) {
      const id = String(values[values.length - 1]);
      const row = mockAgencies.find((a) => a.id === id);
      if (!row) return [];
      // `updateAgency` dựng câu `SET col = $1, ...` (raw `sql.query`) và đẩy
      // id xuống cuối; câu `SET col = ?` (template `sql`) đánh số theo thứ tự
      // xuất hiện. Cả hai dạng đều phải map đúng cột.
      const columns = extractSetColumns(text);
      columns.forEach((column, index) => {
        if (column && column !== 'updated_at') row[column] = values[index];
      });
      row.updated_at = nowIso();
      return [row];
    }

    if (q.includes('delete from agencies')) {
      const id = String(values[0]);
      const index = mockAgencies.findIndex((a) => a.id === id);
      if (index >= 0) mockAgencies.splice(index, 1);
      return [];
    }

    if (q.includes('from agencies')) {
      if (q.includes('count(*)')) {
        return [{ total: mockAgencies.length }];
      }

      // Lọc theo `WHERE id = ?` / `WHERE code = ?` khi câu có điều kiện.
      let rows: MockResult[] = mockAgencies.map((a) => ({
        ...a,
        discount_count: mockDiscountCodes.filter((d) => d.agency_id === a.id).length,
      }));

      const idMatch = q.match(/where\s+(?:a\.)?id\s*=\s*(?:\?|\$\d+)/);
      if (idMatch) {
        const wanted = String(values[0]);
        rows = rows.filter((a) => a.id === wanted);
      } else {
        const codeMatch = q.match(/where\s+(?:a\.)?code\s*=\s*(?:\?|\$\d+)/);
        if (codeMatch) {
          const wanted = String(values[0]).toUpperCase();
          rows = rows.filter((a) => String(a.code).toUpperCase() === wanted);
        }
      }

      // `getAllAgencies` truyền `LIMIT $n OFFSET $m` — hai giá trị cuối.
      const limit = Number(values[values.length - 2]);
      const offset = Number(values[values.length - 1]);
      if (Number.isFinite(limit) && Number.isFinite(offset)) {
        return rows.slice(offset, offset + limit);
      }
      return rows;
    }

    // ── discount_codes ─────────────────────────────────────────────────────
    // Cùng lý do như `agencies`: nhánh ghi phải kiểm tra trước nhánh đọc.
    if (q.includes('insert into discount_codes')) {
      const row: MockResult = {
        id: nextChatId('dsc'),
        code: String(values[0] ?? '').toUpperCase(),
        type: values[1] ?? 'percentage',
        value: values[2] ?? 0,
        min_booking_amount: values[3] ?? 0,
        max_discount_amount: values[4] ?? null,
        agency_id: values[5] ?? null,
        usage_limit: values[6] ?? null,
        usage_per_user_limit: values[7] ?? 1,
        used_count: 0,
        is_active: values[8] ?? true,
        valid_from: values[9] ?? null,
        valid_to: values[10] ?? null,
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      mockDiscountCodes.push(row);
      return [row];
    }

    if (q.includes('update discount_codes')) {
      const id = String(values[values.length - 1]);
      const row = mockDiscountCodes.find((d) => d.id === id);
      if (!row) return [];
      const columns = extractSetColumns(text);
      columns.forEach((column, index) => {
        if (column && column !== 'updated_at') row[column] = values[index];
      });
      row.updated_at = nowIso();
      return [row];
    }

    if (q.includes('delete from discount_codes')) {
      const id = String(values[0]);
      const index = mockDiscountCodes.findIndex((d) => d.id === id);
      if (index >= 0) mockDiscountCodes.splice(index, 1);
      return [];
    }

    if (q.includes('from discount_codes')) {
      if (q.includes('count(*)')) {
        return [{ total: mockDiscountCodes.length }];
      }

      let rows = [...mockDiscountCodes];
      const idMatch = q.match(/where\s+(?:d\.)?id\s*=\s*(?:\?|\$\d+)/);
      if (idMatch) {
        const wanted = String(values[0]);
        rows = rows.filter((d) => d.id === wanted);
      } else {
        const codeMatch = q.match(/where\s+(?:d\.)?code\s*=\s*(?:\?|\$\d+)/);
        if (codeMatch) {
          const wanted = String(values[0]).toUpperCase();
          rows = rows.filter((d) => String(d.code).toUpperCase() === wanted);
        }
      }

      const limit = Number(values[values.length - 2]);
      const offset = Number(values[values.length - 1]);
      if (Number.isFinite(limit) && Number.isFinite(offset)) {
        return rows.slice(offset, offset + limit);
      }
      return rows;
    }

    return null;
  }

  /**
   * Handles the three chart-aggregate queries used by the admin revenue tab
   * (`getMonthlyRevenue`, `getRouteRevenue`, `getSeatClassSplit`).
   *
   * Without this the mock returns `[]` for them and the revenue tab renders
   * empty charts even though the mock holds bookings and flights — the UI gate
   * would then capture a page whose data layer never worked.
   */
  function runAnalyticsQuery(text: string, values: unknown[]): MockResult[] | null {
    const q = normalizeSql(text);

    // ── Recent activity (bookings) ──────────────────────────────────────────
    // `getRecentActivity` chạy hai câu: một câu lấy booking mới nhất, một
    // câu lấy refund mới nhất. Mock chưa có bảng refund nên chỉ trả bookings.
    if (q.includes("'booking' as type")) {
      const limit = Math.max(1, Number(values[0]) || 20);
      return [...mockBookings]
        .sort(
          (a, b) =>
            new Date(String(b.created_at ?? 0)).getTime() -
            new Date(String(a.created_at ?? 0)).getTime()
        )
        .slice(0, limit)
        .map((b) => ({
          type: 'booking',
          id: b.id,
          created_at: b.created_at,
          status: b.status,
          total_price: b.total_price,
          reason: null,
        }));
    }

    // ── Booking status distribution ─────────────────────────────────────────
    // `getBookingStatusDistribution` bị lọc bởi `get status` trước khi tới
    // `get revenue`, nên phải kiểm tra trước nhánh tổng doanh thu.
    if (q.includes('group by status')) {
      const counts = new Map<string, number>();
      for (const booking of mockBookings) {
        const status = String(booking.status ?? 'pending');
        counts.set(status, (counts.get(status) ?? 0) + 1);
      }
      return [...counts.entries()].map(([status, count]) => ({ status, count }));
    }

    // ── Total revenue stats ────────────────────────────────────────────────
    // `getRevenueStats` là nguồn của KPI trên tab doanh thu. Nếu mock trả
    // `[]` thì `parseFloat(undefined)` → NaN và mọi thẻ số liệu hiện "NaN₫".
    if (q.includes('total_revenue') && q.includes('avg_booking_value')) {
      const active = mockBookings.filter(
        (b) => !['cancelled', 'refunded'].includes(String(b.status ?? 'pending'))
      );
      const totalRevenue = active.reduce((sum, b) => sum + (Number(b.total_price) || 0), 0);
      const totalBookings = mockBookings.length;
      return [
        {
          total_revenue: totalRevenue,
          total_bookings: totalBookings,
          avg_booking_value: totalBookings > 0 ? totalRevenue / totalBookings : 0,
          completed_bookings: mockBookings.filter((b) => String(b.status ?? '') === 'completed')
            .length,
          pending_bookings: mockBookings.filter((b) => String(b.status ?? '') === 'pending').length,
        },
      ];
    }

    // ── Monthly revenue ─────────────────────────────────────────────────────
    if (q.includes("to_char(date_trunc('month'")) {
      // `values[0]` là số tháng LÙI (${months - 1}), nên cửa sổ là
      // `values[0] + 1` tháng tính cả tháng hiện tại — giống hệt
      // `date_trunc('month', NOW()) - CAST(${months - 1} || ' months' AS INTERVAL)`.
      const months = Math.max(1, (Number(values[0]) || 0) + 1);
      const now = new Date();
      const buckets = new Map<string, { revenue: number; tickets: number }>();
      for (let i = months - 1; i >= 0; i--) {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
        buckets.set(d.toISOString().slice(0, 7), { revenue: 0, tickets: 0 });
      }

      for (const booking of mockBookings) {
        const status = String(booking.status ?? 'pending');
        if (status === 'cancelled' || status === 'refunded') continue;
        const created = new Date(String(booking.created_at ?? nowIso()));
        if (Number.isNaN(created.getTime())) continue;
        const key = created.toISOString().slice(0, 7);
        const bucket = buckets.get(key);
        if (!bucket) continue;
        bucket.revenue += Number(booking.total_price) || 0;
        bucket.tickets += 1;
      }

      return [...buckets.entries()].map(([month, agg]) => ({
        month,
        revenue: agg.revenue,
        tickets: agg.tickets,
      }));
    }

    // ── Revenue by route ────────────────────────────────────────────────────
    if (q.includes('as route') && q.includes('from bookings') && q.includes('join flights')) {
      const limit = Math.max(1, Number(values[0]) || 10);
      const byRoute = new Map<string, { revenue: number; tickets: number }>();
      const flightById = new Map(mockFlights.map((f) => [String(f.id), f]));

      for (const booking of mockBookings) {
        const status = String(booking.status ?? 'pending');
        if (status === 'cancelled' || status === 'refunded') continue;
        const flight = flightById.get(String(booking.flight_id));
        if (!flight) continue;
        const route = `${flight.from_code} - ${flight.to_code}`;
        const agg = byRoute.get(route) ?? { revenue: 0, tickets: 0 };
        agg.revenue += Number(booking.total_price) || 0;
        agg.tickets += 1;
        byRoute.set(route, agg);
      }

      return [...byRoute.entries()]
        .map(([route, agg]) => ({ route, revenue: agg.revenue, tickets: agg.tickets }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, limit);
    }

    // ── Seat class split ────────────────────────────────────────────────────
    if (q.includes('f.class as class')) {
      const flightById = new Map(mockFlights.map((f) => [String(f.id), f]));
      const counts = new Map<string, number>();
      for (const booking of mockBookings) {
        const status = String(booking.status ?? 'pending');
        if (status === 'cancelled' || status === 'refunded') continue;
        const flight = flightById.get(String(booking.flight_id));
        if (!flight) continue;
        const seatClass = String(flight.class ?? 'economy');
        counts.set(seatClass, (counts.get(seatClass) ?? 0) + 1);
      }
      return [...counts.entries()]
        .map(([className, count]) => ({ class: className, count }))
        .sort((a, b) => b.count - a.count);
    }

    return null;
  }

  /** Handles user_profiles query for dev/test */
  function runUserProfileQuery(text: string, values: unknown[]): MockResult[] | null {
    const q = normalizeSql(text);
    if (q.includes('insert into user_profiles')) {
      const [email, password_hash, full_name, role, phone] = values as [
        string,
        string,
        string,
        string,
        string | null,
      ];
      const row: MockResult = {
        id: nextChatId('usr'),
        email,
        password_hash,
        full_name,
        role: role || 'user',
        phone: phone || null,
        avatar_url: null,
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      userProfiles.push(row);
      return [row];
    }
    if (q.includes('from user_profiles where')) {
      // `findAccountByIdentifier` dùng `LOWER(email) = LOWER(?)` nên email
      // phải so khớp không phân biệt hoa thường — nếu so chính xác thì việc
      // đăng nhập bằng email viết hoa sẽ trượt trong dev nhưng chạy đúng trên
      // DB thật (một loại lệch chỉ xuất hiện ở môi trường mock).
      const wanted = String(values[0] ?? '').toLowerCase();
      const matched = userProfiles.filter(
        (u) =>
          String(u.email ?? '').toLowerCase() === wanted ||
          String(u.phone ?? '') === wanted ||
          String(u.id ?? '') === wanted
      );
      if (matched.length) return matched;
    }
    return null;
  }

  /**
   * Handles the wallet and loyalty queries, or returns null when the text is
   * not one of them.
   *
   * `getOrCreateWallet` does an INSERT and then reads `result[0]` — so the
   * INSERT branch has to return the created row, not an empty array. Without
   * it the wallet is `undefined` and the caller dereferences `wallet.balance`,
   * which is a 500 rather than the empty wallet the screen expects.
   */
  function runWalletAndLoyaltyQuery(text: string, values: unknown[]): MockResult[] | null {
    const q = normalizeSql(text);

    // ── Wallets ─────────────────────────────────────────────────────────────
    if (q.includes('insert into user_wallets')) {
      const [userId, accountNumber] = values as [string, string];
      const row: MockResult = {
        id: nextChatId('wlt'),
        user_id: userId,
        balance: 0,
        currency: 'VND',
        account_number: accountNumber,
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      userWallets.push(row);
      return [row];
    }
    if (q.includes('from user_wallets where user_id = ?')) {
      return userWallets.filter((w) => w.user_id === values[0]);
    }
    if (q.includes('from user_wallets where id = ?')) {
      return userWallets.filter((w) => w.id === values[0]);
    }
    if (q.includes('update user_wallets')) {
      // `applyWalletDelta` dùng `SET balance = balance + $delta` — delta là
      // SỐ TƯƠNG ĐỐI, không phải số dư tuyệt đối. Thứ tự bound values là
      // [delta, userId] vì `delta` xuất hiện trong `SET` trước `WHERE`, nên
      // handler phải đọc theo vị trí đó chứ không theo tên.
      const [delta, userId] = values as [number, string];
      const wallet = userWallets.find((w) => w.user_id === userId);
      if (!wallet) return [];
      const next = Number(wallet.balance ?? 0) + Number(delta ?? 0);
      if (next < 0) return []; // không đủ tiền — `WHERE balance + delta >= 0` không match
      wallet.balance = next;
      wallet.updated_at = nowIso();
      return [wallet];
    }

    // ── Saved payment methods ──────────────────────────────────────────────
    if (q.includes('from saved_payment_methods where user_id = ?')) {
      return savedPaymentMethods.filter((m) => m.user_id === values[0]);
    }

    // ── Wallet transactions ────────────────────────────────────────────────
    // `getWalletTransactions` lọc theo `wallet_id` (không phải `user_id`).
    if (q.includes('count(*) as total from wallet_transactions')) {
      return [{ total: walletTransactions.filter((t) => t.wallet_id === values[0]).length }];
    }
    if (q.includes('from wallet_transactions where wallet_id = ?')) {
      const rows = walletTransactions.filter((t) => t.wallet_id === values[0]);
      // The query carries LIMIT/OFFSET as bound values.
      const limit = Number(values[1]);
      const offset = Number(values[2]);
      if (Number.isFinite(limit) && Number.isFinite(offset)) {
        return rows.slice(offset, offset + limit);
      }
      return rows;
    }
    if (q.includes('insert into wallet_transactions')) {
      const row: MockResult = {
        id: nextChatId('wtx'),
        wallet_id: values[0],
        type: values[1],
        amount: values[2],
        balance_before: values[3] ?? null,
        balance_after: values[4] ?? null,
        description: values[5] ?? null,
        payment_method_id: values[6] ?? null,
        reference_id: values[7] ?? null,
        status: 'completed',
        created_at: nowIso(),
      };
      walletTransactions.push(row);
      return [row];
    }

    // ── Loyalty ─────────────────────────────────────────────────────────────
    if (q.includes('from loyalty_programs where is_active = true')) {
      return loyaltyPrograms.filter((p) => p.is_active);
    }
    if (q.includes('from loyalty_programs where id = ?')) {
      return loyaltyPrograms.filter((p) => p.id === values[0]);
    }
    if (q.includes('from loyalty_tiers where program_id = ?')) {
      return loyaltyTiers.filter((t) => t.program_id === values[0]);
    }
    if (q.includes('insert into user_loyalty')) {
      const [userId, programId] = values as [string, string];
      const row: MockResult = {
        id: nextChatId('loy'),
        user_id: userId,
        program_id: programId,
        total_points: 0,
        available_points: 0,
        lifetime_points: 0,
        tier: 'Red',
        tier_qualified_at: null,
        joined_at: nowIso(),
      };
      userLoyalty.push(row);
      return [row];
    }
    if (q.includes('from user_loyalty where user_id = ?')) {
      return userLoyalty.filter((l) => l.user_id === values[0]);
    }

    return null;
  }

  /** Handles a chat query, or returns null when the text is not chat-related. */
  function runChatQuery(text: string, values: unknown[]): MockResult[] | null {
    const q = normalizeSql(text);

    if (q.includes('insert into chat_conversations')) {
      const [userId, userEmail, userName] = values as [string, string, string];
      const row: MockResult = {
        id: nextChatId('conv'),
        user_id: userId,
        user_email: userEmail,
        user_name: userName,
        status: 'active',
        last_message: null,
        unread_by_user: 0,
        unread_by_admin: 0,
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      chatConversations.push(row);
      return [row];
    }

    if (q.includes('count(*) as total from chat_conversations')) {
      return [{ total: chatConversations.length }];
    }

    if (q.includes("from chat_conversations where user_id = ? and status = 'active'")) {
      return chatConversations.filter((c) => c.user_id === values[0] && c.status === 'active');
    }

    if (q.includes('from chat_conversations where id = ? and user_id = ?')) {
      const owned = chatConversations.some((c) => c.id === values[0] && c.user_id === values[1]);
      return owned ? [{ owned: 1 }] : [];
    }

    if (q.includes('from chat_conversations')) {
      const limit = typeof values[0] === 'number' ? values[0] : chatConversations.length;
      const offset = typeof values[1] === 'number' ? values[1] : 0;
      const sorted = [...chatConversations].sort(
        (a, b) =>
          new Date(b.updated_at as string).getTime() - new Date(a.updated_at as string).getTime()
      );
      return sorted.slice(offset, offset + limit);
    }

    if (q.includes('insert into chat_messages')) {
      const [conversationId, senderId, senderRole, content] = values as [
        string,
        string,
        'user' | 'admin',
        string,
      ];
      const row: MockResult = {
        id: nextChatId('msg'),
        conversation_id: conversationId,
        sender_id: senderId,
        sender_role: senderRole,
        content,
        read_at: null,
        created_at: nowIso(),
      };
      chatMessages.push(row);
      return [row];
    }

    if (q.includes('update chat_messages set read_at = now()')) {
      const [conversationId, senderRole] = values as [string, string];
      const flipped = chatMessages.filter(
        (m) => m.conversation_id === conversationId && m.sender_role === senderRole && !m.read_at
      );
      for (const m of flipped) m.read_at = nowIso();
      return flipped.map((m) => ({ id: m.id }));
    }

    if (q.includes('from chat_messages where conversation_id = ?')) {
      const [conversationId, limit, offset] = values as [
        string,
        number | undefined,
        number | undefined,
      ];
      const rows = chatMessages
        .filter((m) => m.conversation_id === conversationId)
        .sort(
          (a, b) =>
            new Date(a.created_at as string).getTime() - new Date(b.created_at as string).getTime()
        );
      const start = typeof offset === 'number' ? offset : 0;
      return rows.slice(start, typeof limit === 'number' ? start + limit : undefined);
    }

    if (q.includes('insert into chat_calls')) {
      const [convId, callerId, callerRole, callerName, status] = values as [
        string,
        string,
        'user' | 'admin',
        string,
        string,
      ];
      const row: MockResult = {
        id: nextChatId('call'),
        conversation_id: convId,
        caller_id: callerId,
        caller_role: callerRole,
        caller_name: callerName || (callerRole === 'admin' ? 'Tổng đài Vietjet Air' : 'Khách hàng'),
        status: status || 'ringing',
        started_at: nowIso(),
        connected_at: null,
        ended_at: null,
        duration_seconds: 0,
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      chatCalls.push(row);
      return [row];
    }

    if (q.includes('from chat_calls')) {
      if (q.includes('where id = ?')) {
        const found = chatCalls.find((c) => c.id === values[0]);
        return found ? [found] : [];
      }
      if (q.includes("status = 'ringing'")) {
        return chatCalls
          .filter((c) => c.status === 'ringing')
          .sort(
            (a, b) =>
              new Date(b.created_at as string).getTime() -
              new Date(a.created_at as string).getTime()
          )
          .slice(0, 1);
      }
      if (q.includes('conversation_id = ?')) {
        let list = chatCalls.filter((c) => c.conversation_id === values[0]);
        if (q.includes("status in ('ringing', 'connected')")) {
          list = list.filter((c) => c.status === 'ringing' || c.status === 'connected');
        }
        return list
          .sort(
            (a, b) =>
              new Date(b.created_at as string).getTime() -
              new Date(a.created_at as string).getTime()
          )
          .slice(0, 1);
      }
      return chatCalls;
    }

    if (q.includes('update chat_calls set')) {
      // Find row by call id (usually values[values.length - 1] or first arg)
      const callId = values[values.length - 1];
      const row = chatCalls.find((c) => c.id === callId);
      if (!row) return [];
      if (q.includes('status = ?')) {
        row.status = values[0] as string;
      }
      if (q.includes('connected_at = now()')) {
        row.connected_at = nowIso();
      }
      if (q.includes('ended_at = now()')) {
        row.ended_at = nowIso();
      }
      if (q.includes('duration_seconds = ?')) {
        const duration = values.find((v) => typeof v === 'number');
        if (typeof duration === 'number') row.duration_seconds = duration;
      }
      row.updated_at = nowIso();
      return [row];
    }

    if (q.includes('insert into chat_presence')) {
      const [userId, conversationId, role, isOnline, isTyping] = values as [
        string,
        string,
        'user' | 'admin',
        boolean,
        boolean,
      ];
      const row: MockResult = {
        id: nextChatId('presence'),
        user_id: userId,
        conversation_id: conversationId,
        role,
        is_online: isOnline,
        is_typing: isTyping,
        last_seen: nowIso(),
        updated_at: nowIso(),
      };
      chatPresence.push(row);
      return [row];
    }

    if (q.includes('update chat_presence set')) {
      const [isOnline, isTyping, conversationId, role] = values as [
        boolean | undefined,
        boolean | undefined,
        string,
        string,
      ];
      const row = chatPresence.find((p) => p.conversation_id === conversationId && p.role === role);
      if (!row) return [];
      if (isOnline !== undefined && isOnline !== null) row.is_online = isOnline;
      if (isTyping !== undefined && isTyping !== null) row.is_typing = isTyping;
      row.last_seen = nowIso();
      row.updated_at = nowIso();
      return [row];
    }

    if (q.includes('from chat_presence where conversation_id = ? and role = ?')) {
      return chatPresence.filter((p) => p.conversation_id === values[0] && p.role === values[1]);
    }

    // Tool SSTK "Reset chat bị treo" xoá presence cũ. Không có handler này thì
    // mock trả `[]` và tool luôn báo "Đã xóa 0 presence record".
    if (q.includes('delete from chat_presence')) {
      const cutoff = Date.now() - 60 * 60 * 1000;
      const stale = chatPresence.filter((p) => {
        const lastSeen = new Date(String(p.last_seen)).getTime();
        return Number.isFinite(lastSeen) && lastSeen < cutoff;
      });
      for (const row of stale) {
        const index = chatPresence.indexOf(row);
        if (index >= 0) chatPresence.splice(index, 1);
      }
      return stale;
    }

    // Conversation counters, issued through `sql.query` by sendChatMessage and
    // markConversationRead. The last bound value is always the conversation id.
    if (q.includes('update chat_conversations set')) {
      const row = chatConversations.find((c) => c.id === values[values.length - 1]);
      if (!row) return [];
      if (q.includes('last_message')) {
        row.last_message = values[0] as string;
        if (q.includes('unread_by_admin = unread_by_admin + 1')) {
          row.unread_by_admin = ((row.unread_by_admin as number) || 0) + 1;
        }
        if (q.includes('unread_by_user = unread_by_user + 1')) {
          row.unread_by_user = ((row.unread_by_user as number) || 0) + 1;
        }
      }
      if (q.includes('unread_by_user = 0')) row.unread_by_user = 0;
      if (q.includes('unread_by_admin = 0')) row.unread_by_admin = 0;
      if (q.includes('set status = ?')) row.status = values[0] as string;
      row.updated_at = nowIso();
      return [row];
    }

    return null;
  }

  // ─── Flights & Seats & System Mock Store ─────────────────────────────────────
  const mockFlights: MockResult[] = [
    {
      id: '8865cc0c-d4a6-4a1e-8c4d-165e627a726e',
      flight_no: 'VJ121',
      from_code: 'HAN',
      to_code: 'SGN',
      depart_time: new Date(Date.now() + 86400000).toISOString(),
      arrive_time: new Date(Date.now() + 86400000 + 7200000).toISOString(),
      price: 899000,
      economy_price: 899000,
      business_price: 2490000,
      status: 'active',
      aircraft: 'Airbus A321',
      available: 150,
      class: 'economy',
      created_at: nowIso(),
      updated_at: nowIso(),
    },
    {
      id: '9fffaa9c-928f-4f52-b865-bd3833eee833',
      flight_no: 'VJ141',
      from_code: 'HAN',
      to_code: 'SGN',
      depart_time: new Date(Date.now() + 172800000).toISOString(),
      arrive_time: new Date(Date.now() + 172800000 + 7200000).toISOString(),
      price: 1199000,
      economy_price: 1199000,
      business_price: 2990000,
      status: 'active',
      aircraft: 'Airbus A321',
      available: 180,
      class: 'economy',
      created_at: nowIso(),
      updated_at: nowIso(),
    },
  ];

  const mockSeatLocks: MockResult[] = [];

  // ─── Bookings (mô hình trip/chặng) ──────────────────────────────────────────
  // `bookings` là bảng trung tâm của luồng đặt vé và của mô hình trip/chặng
  // (migration 045): một trip khứ hồi = 2 dòng `bookings` cùng `trip_id`, mỗi
  // dòng có `leg_role` ('outbound' | 'inbound').
  //
  // Không có store này thì mọi truy vấn `bookings` trả `[]` — nên trong dev/CI
  // (không DATABASE_URL) check-in theo trip, tra cứu chuyến bay của tôi và
  // trang đặt vé đều rỗng, dù code chạy đúng.
  const mockBookings: MockResult[] = [];
  const mockPassengers: MockResult[] = [];
  const mockCheckIns: MockResult[] = [];
  /**
   * Giao dịch thanh toán và ghế đã bán.
   *
   * Hai store này không có thì luồng "đặt vé → thanh toán VietQR → nhận vé"
   * và "check-in đổi ghế" không thể chạy trong mock mode: `getBookingById`
   * gộp `payments`/`seats` vào dòng booking, và `createPaymentAndConfirmBooking`
   * ghi cả hai. Thiếu store ⇒ trang thanh toán không thấy giao dịch nào và
   * check-in không đổi được ghế, dù code chạy đúng.
   */
  const mockPayments: MockResult[] = [];
  const mockSeats: MockResult[] = [];
  /** Lịch sử đổi ghế (migration 046) — bảng `booking_seat_changes`. */
  const mockSeatChanges: MockResult[] = [];

  /** Sinh id giả cho dòng mock — đủ duy nhất trong phạm vi một phiên test. */
  let mockSeq = 0;
  const nextMockId = (prefix: string) => `${prefix}-mock-${++mockSeq}`;
  const mockUuid = () => '00000000-0000-4000-8000-' + String(++mockSeq).padStart(12, '0');

  // ─── Seed: các đặt chỗ mẫu, đủ hành khách để sinh được vé điện tử ───
  //
  // Endpoint tải vé (`/api/dat-ve/[id]/ve-dien-tu`) đọc booking + trip +
  // hành khách rồi dựng PDF. Không có dòng mẫu nào thì mọi truy vấn
  // `bookings`/`passengers` trả `[]` ⇒ endpoint luôn trả 404 ⇒ smoke test
  // HTTP không bao giờ chạm tới đường sinh file, và lỗi "pdfkit không tìm
  // thấy font" (một lỗi chỉ xuất hiện trong bản build) sẽ lọt qua CI.
  //
  // Dữ liệu mẫu này chỉ tồn tại trong bộ nhớ, chỉ khi KHÔNG có DATABASE_URL —
  // nên nó không bao giờ chạm dữ liệu thật.
  const SEED_BOOKING_ID = '00000000-0000-4000-8000-000000000001';
  const SEED_TRIP_ID = '00000000-0000-4000-8000-000000000002';
  const SEED_BOOKING_CODE = 'VJSMOKE';
  const SEED_PASSENGER_ID = '00000000-0000-4000-8000-000000000003';

  // PNR thứ hai, dùng bởi `scripts/ui-check.cjs` để mở màn hình chi tiết
  // đặt vé. Mã này là booking legacy trong DB thật (migration 034 thay bộ
  // sinh mã, nhưng các dòng cũ vẫn giữ `VJ644052`) — nên UI check chạy với
  // DB thật thấy màn hình này, còn chạy với mock thì không. Seed cả hai để
  // kết quả kiểm tra giao diện GIỐNG NHAU dù có DB hay không.
  const UI_SEED_BOOKING_ID = '00000000-0000-4000-8000-000000000004';
  const UI_SEED_TRIP_ID = '00000000-0000-4000-8000-000000000005';
  const UI_SEED_PASSENGER_ID = '00000000-0000-4000-8000-000000000006';
  const UI_SEED_BOOKING_CODE = 'VJ644052';

  mockBookings.push({
    id: SEED_BOOKING_ID,
    user_id: '00000000-0000-4000-8000-0000000000ff',
    flight_id: mockFlights[0].id,
    booking_code: SEED_BOOKING_CODE,
    trip_id: SEED_TRIP_ID,
    leg_role: 'outbound',
    status: 'confirmed',
    total_price: 899000,
    created_at: nowIso(),
    updated_at: nowIso(),
  });

  mockBookings.push({
    id: UI_SEED_BOOKING_ID,
    user_id: '00000000-0000-4000-8000-0000000000ff',
    flight_id: mockFlights[0].id,
    booking_code: UI_SEED_BOOKING_CODE,
    trip_id: UI_SEED_TRIP_ID,
    leg_role: 'outbound',
    status: 'confirmed',
    total_price: 1250000,
    created_at: nowIso(),
    updated_at: nowIso(),
  });

  mockPassengers.push({
    id: SEED_PASSENGER_ID,
    booking_id: SEED_BOOKING_ID,
    name: 'Nguyễn Văn Anh',
    dob: '1990-01-01',
    id_number: 'C1234567',
    gender: 'male',
    country_code: 'VN',
    phone: '0900000001',
    email: 'khach@vietjetsim.vn',
    residence: null,
    skyjoy_member_id: null,
    passenger_type: 'adult',
    seat_number: '12A',
    created_at: nowIso(),
  });

  mockPassengers.push({
    id: UI_SEED_PASSENGER_ID,
    booking_id: UI_SEED_BOOKING_ID,
    name: 'Trần Thị Bình',
    dob: '1988-05-20',
    id_number: 'C7654321',
    gender: 'female',
    country_code: 'VN',
    phone: '0900000002',
    email: 'khach2@vietjetsim.vn',
    residence: null,
    skyjoy_member_id: null,
    passenger_type: 'adult',
    seat_number: '14C',
    created_at: nowIso(),
  });

  const runBookingQuery = (query: string, values: unknown[]): MockResult[] | null => {
    const q = query.toLowerCase();

    // ── Tra cứu trip theo PNR: `SELECT b.trip_id FROM bookings b WHERE ...` ──
    if (q.includes('from bookings') && q.includes('select b.trip_id')) {
      const codeOrId = String(values[0] ?? '');
      const upper = codeOrId.toUpperCase();
      const match = mockBookings.find(
        (b) => String(b.id) === codeOrId || String(b.booking_code ?? '').toUpperCase() === upper
      );
      return match ? [{ trip_id: match.trip_id ?? null }] : [];
    }

    // ── Tra cứu trip theo `trip_id` (2 chặng của cùng một trip) ──
    if (q.includes('from bookings') && q.includes('b.trip_id =')) {
      const tripId = values[0];
      const legs = mockBookings.filter((b) => b.trip_id === tripId);
      return legs.map((b) => {
        const flight = mockFlights.find((f) => f.id === b.flight_id);
        return {
          id: b.id,
          booking_code: b.booking_code ?? null,
          leg_role: b.leg_role ?? 'outbound',
          status: b.status,
          total_price: b.total_price,
          flight_id: b.flight_id,
          flight_no: flight?.flight_no ?? null,
          from_code: flight?.from_code ?? null,
          to_code: flight?.to_code ?? null,
          depart_time: flight?.depart_time ?? null,
          arrive_time: flight?.arrive_time ?? null,
          flight_status: flight?.status ?? null,
          gate: flight?.gate ?? null,
          terminal: flight?.terminal ?? null,
          from_city: null,
          to_city: null,
        };
      });
    }

    // ── Đọc booking theo id / PNR ──
    if (q.includes('from bookings')) {
      // `SELECT * FROM bookings WHERE UPPER(booking_code) = UPPER(?)` — đây là
      // dạng `confirmVietQrPayment` dùng (không có prefix `b.`). Nếu mock
      // không lọc theo PNR mà trả về mọi dòng, webhook sẽ đối soát nhầm
      // đặt chỗ đầu tiên trong bộ nhớ thay vì đặt chỗ của mã PNR.
      if (q.includes('upper(booking_code) = upper(')) {
        const code = String(values[0] ?? '').toUpperCase();
        return mockBookings.filter((b) => String(b.booking_code ?? '').toUpperCase() === code);
      }
      if (q.includes('upper(b.booking_code) = upper(') || q.includes('booking_code =')) {
        const code = String(values[0] ?? '').toUpperCase();
        // `getBookingByCodeOrId` tra bằng PNR *hoặc* id (`b.id::text = ?`),
        // nên phải khớp cả hai — nếu không thì khách dán mã đặt chỗ vào ô
        // tra cứu sẽ không tìm thấy vé của mình.
        const byId = mockBookings.find((b) => String(b.id) === String(values[0]));
        if (byId) return [byId];
        return mockBookings.filter((b) => String(b.booking_code ?? '').toUpperCase() === code);
      }
      if (q.includes('where b.id =') || q.includes('where id =')) {
        const id = values[0];
        const match = mockBookings.find((b) => b.id === id);
        if (!match) return [];
        // `getBookingById` chọn `b.*` cùng `json_agg` hành khách/giao dịch/ghế
        // trong một câu, nên dòng mock phải có sẵn các mảng đó — nếu không,
        // mapper nhận `undefined` và mọi thứ liên quan tới hành khách rỗng.
        const flight = mockFlights.find((f) => f.id === match.flight_id);
        return [
          {
            ...match,
            flight_no: flight?.flight_no ?? null,
            from_code: flight?.from_code ?? null,
            to_code: flight?.to_code ?? null,
            depart_time: flight?.depart_time ?? null,
            arrive_time: flight?.arrive_time ?? null,
            price: flight?.price ?? null,
            class: flight?.class ?? null,
            passengers: mockPassengers.filter((p) => p.booking_id === match.id),
            payments: [],
            seats: [],
          },
        ];
      }
      if (q.includes('where b.user_id =')) {
        const userId = values[0];
        return mockBookings.filter((b) => b.user_id === userId);
      }
      return mockBookings;
    }

    // ── Tạo booking (CTE `new_booking`) ──
    if (q.includes('insert into bookings')) {
      // `createBooking` chèn qua một CTE, nên mock chỉ cần trả về dòng vừa
      // tạo với đủ trường mà các mapper đọc.
      const row: MockResult = {
        id: nextMockId('booking'),
        booking_code: `MK${String(mockSeq).padStart(4, '0')}`,
        trip_id: mockUuid(),
        leg_role: 'outbound',
        status: 'pending',
        total_price: 0,
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      mockBookings.push(row);
      return [row];
    }

    // ── Hành khách của booking ──
    if (q.includes('from passengers')) {
      if (q.includes('where booking_id =')) {
        // `getTripById` đọc hành khách bằng `WHERE booking_id = ANY($1::uuid[])`
        // — tham số là một mảng id, không phải một id. Cả hai dạng phải trả
        // đúng, nếu không thì trip luôn rỗng và không in được vé.
        const raw = values[0];
        const ids = Array.isArray(raw) ? raw.map(String) : [String(raw)];
        return mockPassengers.filter((p) => ids.includes(String(p.booking_id)));
      }
      if (q.includes('where id =')) {
        const id = values[0];
        const match = mockPassengers.find((p) => p.id === id);
        return match ? [match] : [];
      }
      return mockPassengers;
    }

    // ── Check-in ──
    if (q.includes('from check_in')) {
      if (q.includes('where booking_id =')) {
        const raw = values[0];
        const ids = Array.isArray(raw) ? raw.map(String) : [String(raw)];
        return mockCheckIns.filter((c) => ids.includes(String(c.booking_id)));
      }
      return mockCheckIns;
    }

    return null;
  };

  const runFlightAndSeatQuery = (query: string, values: unknown[]): MockResult[] | null => {
    const q = query.toLowerCase();

    if (q.includes('from flights')) {
      if (q.includes('where id =')) {
        const id = values[0];
        const match = mockFlights.find((f) => f.id === id);
        return match ? [match] : [];
      }
      if (q.includes('where upper(flight_no) =') || q.includes('where flight_no =')) {
        const no = String(values[0] || '').toUpperCase();
        const match = mockFlights.find((f) => String(f.flight_no).toUpperCase() === no);
        return match ? [match] : [];
      }
      return mockFlights;
    }

    if (q.includes('from seat_locks')) {
      const flightId = values[0];
      const valid = mockSeatLocks.filter((l) => l.flight_id === flightId);
      return valid;
    }

    if (q.includes('insert into seat_locks')) {
      const [flightId, seatNumber, sessionId, expiresAt] = values as [
        string,
        string,
        string,
        string,
      ];
      const existing = mockSeatLocks.findIndex(
        (l) => l.flight_id === flightId && l.seat_number === seatNumber
      );
      const row = {
        id: nextChatId('lock'),
        flight_id: flightId,
        seat_number: seatNumber,
        session_id: sessionId,
        expires_at: expiresAt || new Date(Date.now() + 600000).toISOString(),
        created_at: nowIso(),
      };
      if (existing >= 0) {
        // Mirror the real `ON CONFLICT DO UPDATE … WHERE` clause: a live lock
        // held by another session is *not* taken over, and the statement
        // returns no rows. Without this the mock would let every session steal
        // every seat, and the guard would look like it worked in tests while
        // doing nothing in dev.
        const current = mockSeatLocks[existing];
        const expired = new Date(String(current.expires_at)).getTime() <= Date.now();
        if (current.session_id !== sessionId && !expired) {
          return [];
        }
        mockSeatLocks[existing] = row;
      } else {
        mockSeatLocks.push(row);
      }
      return [row];
    }

    if (q.includes('delete from seat_locks')) {
      return [];
    }

    if (q.includes('from bank_accounts')) {
      return [
        {
          id: 'bank-default-1',
          admin_bank_name: 'VIB',
          admin_bank_account_number: '002704060049968',
          admin_bank_account_holder: 'CONG TY CP HANG KHONG VIETJET',
          bank_bin: '970406',
          is_active: true,
          is_default: true,
          transfer_note_template: '{code}I98O',
          created_at: nowIso(),
        },
      ];
    }

    // ── `system_config` ─────────────────────────────────────────────────────
    //
    // Bảng cấu hình hệ thống: `GET/PATCH /api/quan-tri/cai-dat` đọc và ghi
    // vào đây, còn `POST /api/quan-tri/phan-quyen?action=set_config` upsert
    // theo cặp (key, value). Trước đây mock chỉ trả về một danh sách cố định
    // với key sai (`auto_send_invoice_email` thay vì
    // `auto_send_payment_invoice_email`), nên trong mock mode cài đặt tắt
    // thông báo email vẫn không có tác dụng.
    if (q.includes('system_config')) {
      const configStore = getMockSystemConfigStore();

      if (q.includes('insert into system_config')) {
        // `INSERT INTO system_config (key, value, ...) VALUES (?, ?, ...)`
        const key = String(values[0]);
        const value = String(values[1]);
        const existing = configStore.find((row) => row.key === key);
        if (existing) {
          existing.value = value;
          existing.updated_at = nowIso();
        } else {
          configStore.push({
            id: `mock-config-${key}`,
            key,
            value,
            type: String(values[2] ?? 'string'),
            description: String(values[3] ?? ''),
            category: String(values[4] ?? 'general'),
            updated_by: null,
            created_at: nowIso(),
            updated_at: nowIso(),
          });
        }
        const saved = configStore.find((row) => row.key === key)!;
        return [saved] as MockResult[];
      }

      if (q.includes('update system_config')) {
        const key = String(values[0]);
        const value = String(values[1]);
        const existing = configStore.find((row) => row.key === key);
        if (existing) {
          existing.value = value;
          existing.updated_at = nowIso();
        }
        return existing ? [existing] : [];
      }

      if (q.includes('delete from system_config')) {
        const key = String(values[0]);
        const index = configStore.findIndex((row) => row.key === key);
        if (index >= 0) configStore.splice(index, 1);
        return [];
      }

      // SELECT: lọc theo `key = ?` hoặc `key IN (?, ?, ...)` khi có, nếu không
      // thì trả về toàn bộ bảng.
      //
      // Cả hai dạng đều phải hỗ trợ: production dùng placeholder (`IN ($1, $2)`)
      // còn test/script có thể viết literal (`IN ('a', 'b')`).
      const literalInMatch = q.match(/key\s+in\s*\(([^)]*)\)/);
      const literalInKeys =
        literalInMatch && !literalInMatch[1].includes('?')
          ? literalInMatch[1]
              .split(',')
              .map((part) => part.trim().replace(/^['"]|['"]$/g, ''))
              .filter(Boolean)
          : null;

      const selectRows = configStore.filter((row) => {
        const rowKey = String(row.key);
        if (literalInKeys) return literalInKeys.includes(rowKey);
        if (q.includes(' in (')) {
          const wanted = values.map((v) => String(v));
          return wanted.includes(rowKey);
        }
        if (q.includes(' where key =') || q.includes('where key =')) {
          return rowKey === String(values[0]);
        }
        return true;
      });

      // Chỉ trả về các cột mà câu truy vấn thực sự chọn, để shape của hàng
      // khớp với kiểu mà route khai báo.
      if (q.includes('select key, value')) {
        return selectRows.map((row) => ({ key: row.key, value: row.value })) as MockResult[];
      }
      if (q.includes('select *')) {
        return selectRows as MockResult[];
      }
      return selectRows as MockResult[];
    }

    return null;
  };

  return Object.assign(
    async <T = SqlRow>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]> => {
      // Mirror the real Neon client, which rejects a non-template invocation:
      // it requires `Array.isArray(strings) && Array.isArray(strings.raw)`.
      // Without this guard a call like `sql(dynamicString, ...values)` silently
      // "worked" in dev/test and then threw a 500 against a real database.
      if (!(Array.isArray(strings) && Array.isArray((strings as TemplateStringsArray).raw))) {
        throw new Error(
          'This function can now be called only as a tagged-template function: ' +
            'sql`SELECT ${value}`, not sql("SELECT $1", [value], options). ' +
            'For a conventional function call with value placeholders ' +
            '($1, $2, etc.), use sql.query("SELECT $1", [value], options).'
        );
      }

      const query = strings.join('?');
      console.info('[MOCK SQL]', query, values);

      const userProfileResult = runUserProfileQuery(query, values);
      if (userProfileResult) return userProfileResult as T[];

      const chatResult = runChatQuery(query, values);
      if (chatResult) return chatResult as T[];

      const rolePermissionResult = runRolePermissionQuery(query, values);
      if (rolePermissionResult) return rolePermissionResult as T[];

      const walletLoyaltyResult = runWalletAndLoyaltyQuery(query, values);
      if (walletLoyaltyResult) return walletLoyaltyResult as T[];

      const agencyDiscountResult = runAgencyAndDiscountQuery(query, values);
      if (agencyDiscountResult) return agencyDiscountResult as T[];

      const analyticsResult = runAnalyticsQuery(query, values);
      if (analyticsResult) return analyticsResult as T[];

      const flightSeatResult = runFlightAndSeatQuery(query, values);
      if (flightSeatResult) return flightSeatResult as T[];

      const bookingResult = runBookingQuery(query, values);
      if (bookingResult) return bookingResult as T[];

      // Find matching mock data
      for (const [key, data] of Object.entries(mockData)) {
        if (query.toLowerCase().includes(key.toLowerCase().split('?')[0].trim())) {
          return data as T[];
        }
      }

      // Return empty array for unhandled queries
      return [] as T[];
    },
    {
      // Raw parameterized form (`sql.query(text, values)`), which the chat
      // helpers use for counter updates and which `getTripById` uses to read
      // passengers and check-ins. Non-chat statements stay unhandled and
      // return an empty result set rather than throwing.
      query: async <T = SqlRow>(text: string, values: unknown[] = []): Promise<T[]> => {
        console.info('[MOCK SQL:query]', text, values);
        return (runChatQuery(text, values) ??
          runBookingQuery(text, values) ??
          runAgencyAndDiscountQuery(text, values) ??
          runAnalyticsQuery(text, values) ??
          ([] as MockResult[])) as T[];
      },
      transaction: async (queries: unknown) => {
        if (Array.isArray(queries)) {
          const results = [];
          for (const q of queries) {
            if (typeof q === 'function') {
              results.push(await q());
            } else {
              results.push([]);
            }
          }
          return results;
        }
        return [];
      },
      // `unsafe` trong mock không có parser SQL, nên nó chỉ đóng vai trò
      // "chèn chuỗi thô" — trả về đối tượng đánh dấu để template ghép được.
      unsafe: (query: string, params?: unknown[]) => ({
        __unsafeSql: query,
        __unsafeParams: params ?? [],
      }),
    }
  );
}
