/**
 * Phiên giữ ghế — do SERVER cấp, không phải do client tự sinh.
 *
 * ─── Vì sao không dùng `sessionStorage` nữa ───────────────────────────────────
 *
 * Trước đây client tự sinh một chuỗi ngẫu nhiên, lưu vào `sessionStorage`
 * và gửi lên cùng mọi yêu cầu `/api/ghe/khoa`. Ba hệ quả, tất cả đều là
 * lỗ hổng thật:
 *
 * 1. **Ai cũng tự nhận được quyền sở hữu.** `session_id` không chứng minh
 *    điều gì — nó chỉ là một chuỗi client tự chọn. Không có bằng chứng nào
 *    ràng buộc nó với một phiên thật.
 * 2. **Endpoint SSE làm lộ nó.** `/api/sse/ghe-ngoi` trả `session_id` cho
 *    mọi người xem, nên chỉ cần đọc được giá trị đó là cướng được ghế của
 *    người khác — kể cả khi client không bao giờ tự dựng ra nó.
 * 3. **Lock không ràng buộc việc tạo booking.** Không chỗ nào trong luồng
 *    tạo booking đọc `seat_locks`, nên hai khách vẫn đặt được cùng một số
 *    ghế; lock chỉ mang tính thông báo.
 *
 * ─── Mô hình mới ─────────────────────────────────────────────────────────────
 *
 * * `vj_seat_session` là cookie **httpOnly** do server cấp. Client không đọc
 *   được, không tự dựng được, và không ai khác biết giá trị của nó.
 * * `ownerToken` là SHA-256 của cookie đó. Đây là thứ được lưu trong
 *   `seat_locks.owner_token`. Vì nó là hash một chiều nên đọc được bảng
 *   `seat_locks` cũng không dùng được làm cookie để giả mạo chủ sở hữu.
 * * Server tự tính cờ `mine` khi trả SSE, nên `ownerToken` **không bao giờ
 *   rời khỏi server**.
 *
 * ─── Cookie này có cần là bí mật không? ─────────────────────────────────────
 *
 * Không theo nghĩa "bí mật phải giấu tuyệt đối": nó là một *credential*
 * để chứng minh "tôi là phiên đã giữ ghế này", nên nó phải:
 *
 * * không đọc được bằng JavaScript (`httpOnly`) — chặn việc một trang khác
 *   đọc nó rồi dùng để cướp ghế;
 * * không gửi đi kèm request chéo (`sameSite: 'strict'`) — chặn việc một
 *   trang khác ép trình duyệt gửi yêu cầu mang cookie này;
 * * không đi theo kênh không mã hoá (`secure` ở production).
 *
 * Nó KHÔNG cần phải là thứ mà client tự chọn, và đó mới là điểm mấu chốt:
 * giá trị phải do server sinh ra thì mới chứng minh được điều gì.
 */
import { createHash, randomBytes } from 'crypto';
import { type NextResponse } from 'next/server';

export const SEAT_SESSION_COOKIE = 'vj_seat_session';

/**
 * Cookie sống lâu hơn lock (10 phút) một chút.
 *
 * Cookie tồn tại lâu hơn mức cần thiết là vô hại: nó không cấp quyền gì ngoài
 * việc "giữ ghế", mà mỗi lock tự hết hạn sau 10 phút (`seat_locks.expires_at`).
 * Ngược lại, cookie quá ngắn thì một khách đang chọn ghế sẽ bị mất phiên
 * giữa chừng và ghế của họ bị trả về cho người khác.
 */
const SEAT_SESSION_MAX_AGE = 60 * 60 * 12; // 12 giờ

const SEAT_SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  // `strict` (không phải `lax` như cookie đăng nhập): cookie này chỉ dùng
  // để chứng minh chủ sở hữu lock, và không cần đi theo bất kỳ điều hướng
  // nào. `strict` khiến một trang khác không thể khiến trình duyệt gửi nó.
  sameSite: 'strict' as const,
  path: '/',
  maxAge: SEAT_SESSION_MAX_AGE,
};

/** Độ dài cookie (byte) trước khi băm. */
const SESSION_BYTES = 32;

/**
 * Sinh giá trị cookie phiên ghế mới.
 *
 * 32 byte từ CSPRNG — không phải `Math.random()` của client cũ, và không
 * phải `Date.now()`: cả hai đều đoán được.
 */
export function generateSeatSession(): string {
  return randomBytes(SESSION_BYTES).toString('base64url');
}

/**
 * Băm giá trị cookie thành `owner_token` lưu trong database.
 *
 * SHA-256 chứ không phải HMAC: token này phải *đọc được từ database* mà
 * vẫn không cho phép giả mạo — băm một chiều đạt đúng điều đó. HMAC với
 * một secret ở phía server sẽ thêm một bí mật nữa phải luồn qua mọi lần
 * đọc, mà không tăng thêm tính bất khả xâm phạm.
 */
export function deriveOwnerToken(session: string): string {
  return createHash('sha256').update(session, 'utf8').digest('hex');
}

/**
 * Đọc cookie phiên ghế từ request.
 *
 * Ưu tiên `Cookie` header của chính request (như `readCsrfCookie` trong
 * `@/lib/csrf` làm) để route handler, test và runtime không phải Next đều
 * thấy đúng một giá trị — nếu không, `cookies()` có thể trả về cookie của một
 * request khác trong cùng một render.
 */
export function readSeatSession(request: Request): string | null {
  const header = request.headers.get('cookie');
  if (header) {
    const match = header.match(new RegExp(`(?:^|;\\s*)${SEAT_SESSION_COOKIE}=([^;]*)`));
    if (match) return decodeURIComponent(match[1]);
  }
  return null;
}

/**
 * `owner_token` của request hiện tại, hoặc `null` khi trình duyệt chưa có
 * cookie phiên ghế.
 *
 * `null` nghĩa là "chưa xác lập được chủ sở hữu" — KHÔNG phải "ai đó khác".
 * Call site phải fail-closed: không có token thì không được giữ ghế và
 * không được đặt vé với ghế đã giữ.
 */
export function ownerTokenFromRequest(request: Request): string | null {
  const session = readSeatSession(request);
  if (!session) return null;
  return deriveOwnerToken(session);
}

/**
 * Chuẩn bị phiên giữ ghế cho một request: trả về `owner_token` dùng được
 * ngay, kèm giá trị cookie cần gắn vào response khi request chưa có cookie.
 *
 * Hầu hết request ĐÃ có cookie (proxy cấp ở mọi lượt tải trang), nên nhánh
 * "cần cấp mới" hiếm gặp — nó xảy ra với request đầu tiên tới thẳng API mà
 * chưa đi qua proxy, ví dụ trong test.
 *
 * `cookieValue` là `null` khi không cần gắn cookie (request đã có sẵn).
 */
export function resolveSeatSession(request: Request): {
  ownerToken: string;
  cookieValue: string | null;
} {
  const existing = readSeatSession(request);
  if (existing) {
    return { ownerToken: deriveOwnerToken(existing), cookieValue: null };
  }

  const session = generateSeatSession();
  return { ownerToken: deriveOwnerToken(session), cookieValue: session };
}

/**
 * Gắn cookie phiên ghế vào response.
 *
 * Chỉ cần gọi khi `resolveSeatSession` trả `cookieValue` khác `null`.
 */
export function setSeatSessionCookie(response: NextResponse, session: string): void {
  response.cookies.set(SEAT_SESSION_COOKIE, session, SEAT_SESSION_COOKIE_OPTIONS);
}
