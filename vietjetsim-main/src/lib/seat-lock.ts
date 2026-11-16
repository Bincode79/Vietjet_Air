/**
 * Kiểm tra quyền sở hữu một khoá ghế (`seat_locks`).
 *
 * ─── Vì sao cần một module riêng ────────────────────────────────────────────
 *
 * `seat_locks` trước đây CHỈ mang tính thông báo: route `/api/ghe/khoa` ghi
 * lock, route SSE đọc lock để vẽ ghế "đã có người giữ" — và không nơi nào
 * trong luồng tạo booking đọc lại bảng này. Hệ quả: một ghế đang được
 * khách A giữ vẫn bị khách B đặt mất, và lock chỉ làm UI trông như đã có
 * người giữ.
 *
 * Bản vá này cho lock một vai trò thật: **một ghế đang có người giữ thì chỉ
 * chính người giữ mới đặt được**. Để luật đó không bị lách ở từng route, nó
 * được viết ở MỘT chỗ — đây — và mọi call site dùng chung.
 *
 * ─── Vì sao phải fail-closed ───────────────────────────────────────────────
 *
 * `ownerToken` là SHA-256 của cookie `vj_seat_session` do server cấp. Nếu
 * request KHÔNG có token (khách chưa từng nhận cookie — ví dụ gọi API thẳng
 * bằng `curl`), thì KHÔNG THỂ chứng minh mình sở hữu lock nào. Trong trường
 * hợp đó câu trả lời là "không" chứ không phải "được phép".
 *
 * Nhưng có một ngoại lệ quan trọng: **khách không chọn ghế**. Luồng đặt vé
 * cho phép bỏ qua bước chọn ghế (ghế được gán lúc check-in) — xem
 * `src/app/api/dat-ve/route.ts`. Trường hợp đó không có lock nào để kiểm tra,
 * và từ chối nó sẽ làm hỏng một luồng hợp lệ. Vì vậy hàm trả về ba trạng
 * thái, không phải hai:
 *
 *   - `held`     — ghế CÓ lock và lock đó thuộc về phiên này. Được đặt.
 *   - `foreign`  — ghế CÓ lock của phiên KHÁC. Bị từ chối (409).
 *   - `none`     — ghế KHÔNG có lock nào (hoặc lock đã hết hạn, hoặc lock mồ
 *                  côi không ai chứng minh được sở hữu). Được đặt.
 *
 * `none` là trạng thái mặc định của một ghế chưa ai giữ — nó KHÔNG phải
 * "bằng chứng rằng phiên này sở hữu ghế", và code gọi phải hiểu điều đó.
 *
 * Module này KHÔNG import database: nó chỉ phân loại. Truy vấn `seat_locks`
 * nằm ở `@/lib/db` (xem `getSeatLocksForSeats`) để lớp DB giữ hết SQL, và
 * để không tạo vòng import giữa `db.ts` và file này.
 */

/**
 * Số ghế mà lock có hiệu lực tại thời điểm kiểm tra. */
export interface SeatLockRow {
  seat_number: string;
  owner_token: string | null;
  expires_at: string;
}

export type SeatLockVerdict = 'held' | 'foreign' | 'none';

/**
 * Một ghế mà khách đã chọn, kèm kết luận về lock của nó.
 */
export interface SeatLockCheck {
  seatNumber: string;
  verdict: SeatLockVerdict;
}

/**
 * Lỗi: đơn đặt vé yêu cầu một ghế đang được phiên khác giữ.
 *
 * Ném ra từ `createBooking` khi ràng buộc nguyên tử trong SQL phát hiện
 * ghế bị khoá bởi người khác. Route `/api/dat-ve` bắt lỗi này và trả 409.
 */
export class SeatLockConflictError extends Error {
  readonly seats: string[];

  constructor(seats: string[]) {
    super('Seat held by another customer');
    this.name = 'SeatLockConflictError';
    this.seats = seats;
  }
}

/**
 * Phân loại lock của từng ghế.
 *
 * @param rows  các dòng `seat_locks` còn hiệu lực, đã lọc theo chuyến bay và
 *              theo danh sách ghế (xem `getSeatLocksForSeats`).
 * @param seatNumbers  các ghế cần phán quyết — kết quả luôn có đúng một
 *                     mục cho mỗi ghế, kể cả ghế không có lock.
 * @param ownerToken  `owner_token` của phiên hiện tại, hoặc `null` khi request
 *                    không có cookie phiên ghế.
 */
export function classifySeatLocks(
  rows: SeatLockRow[],
  seatNumbers: string[],
  ownerToken: string | null
): SeatLockCheck[] {
  const lockedBySeat = new Map(rows.map((row) => [row.seat_number, row]));

  return seatNumbers.map((seatNumber) => {
    const lock = lockedBySeat.get(seatNumber);
    if (!lock) return { seatNumber, verdict: 'none' as const };

    // Lock đã hết hạn thì không còn giá trị chặn.
    if (lock.expires_at && new Date(lock.expires_at).getTime() <= Date.now()) {
      return { seatNumber, verdict: 'none' as const };
    }

    // Lock có `owner_token` NULL là lock mồ côi — tạo bởi client cũ, trước khi
    // `owner_token` ra đời, nên không ai chứng minh được sở hữu chúng. Chúng
    // không chặn ai (tự hết hạn sau 10 phút), và người đang giữ phiên này cũng
    // không "sở hữu" được chúng. Đây cũng là lý do route `/api/ghe/khoa`
    // cho phép chiếm lock mồ côi: hai nơi phải nói cùng một điều.
    if (!lock.owner_token) return { seatNumber, verdict: 'none' as const };

    if (!ownerToken) return { seatNumber, verdict: 'foreign' as const };

    return {
      seatNumber,
      verdict: lock.owner_token === ownerToken ? ('held' as const) : ('foreign' as const),
    };
  });
}

/**
 * Tóm tắt kết quả kiểm tra thành hai danh sách: ghế bị chặn và ghế được phép.
 */
export function partitionSeatLocks(checks: SeatLockCheck[]): {
  blocked: string[];
  allowed: string[];
} {
  const blocked: string[] = [];
  const allowed: string[] = [];

  for (const check of checks) {
    if (check.verdict === 'foreign') blocked.push(check.seatNumber);
    else allowed.push(check.seatNumber);
  }

  return { blocked, allowed };
}
