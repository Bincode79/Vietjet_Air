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

  const nowIso = () => new Date().toISOString();
  let chatSeq = 0;
  const nextChatId = (prefix: string) => `${prefix}-mock-${++chatSeq}`;

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

  const normalizeSql = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase();

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
    if (q.includes('from user_profiles where email = ?')) {
      return userProfiles.filter((u) => u.email === values[0]);
    }
    if (q.includes('from user_profiles where id = ?')) {
      return userProfiles.filter((u) => u.id === values[0]);
    }
    if (q.includes('from user_profiles where phone = ?')) {
      return userProfiles.filter((u) => u.phone === values[0]);
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

    if (q.includes('from system_config')) {
      return [
        { key: 'auto_send_invoice_email', value: 'true' },
        { key: 'refund_feature_enabled', value: 'true' },
      ];
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
