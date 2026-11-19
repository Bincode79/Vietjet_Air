/**
 * "Bay trước trả sau" (MOVI) — hợp đồng dữ liệu và luật kiểm tra hồ sơ.
 *
 * Một module duy nhất cho cả server lẫn client, vì luật này là luật NGHIỆP
 * VỤ: một hồ sơ hợp lệ ở form inline phải là hồ sơ hợp lệ ở cổng gateway,
 * và cả hai phải là hồ sơ mà server chấp nhận. Ba bản sao của luật này
 * (client inline, client gateway, route) là ba bản sao có thể trôi lệch —
 * và trôi lệch ở đây nghĩa là một hồ sơ bị server từ chối sau khi khách
 * đã điền xong.
 *
 * Hồ sơ MOVI gồm:
 *   - họ tên người đăng ký trả góp;
 *   - ngày sinh (bắt buộc về nghiệp vụ tín dụng — dùng để chấm điểm rủi ro);
 *   - số CMND/CCCD (9 số cho CMND, 12 số cho CCCD);
 *   - số điện thoại (chuẩn hoá về `0XXXXXXXXX`);
 *   - kỳ hạn trả góp (1, 2 hoặc 3 tháng).
 *
 * Vì sao có `parseLegacyMoviNote`: trước khi hồ sơ có cấu trúc, client gửi
 * hồ sơ bằng cách nhét vào `payments.transfer_note` theo định dạng
 * `MOVI: {Tên} - CCCD {số} - SĐT {số}`. Server phải đọc được định dạng đó
 * để một client cũ (đã cache, đang mở tab) không bị từ chối giữa chừng —
 * nhưng client MỚI luôn gửi payload có cấu trúc.
 */

import { normalizePhone } from '@/lib/utils';

/** Thời gian giữ mã đặt chỗ khi khách chọn MOVI (phút). */
export const MOVI_HOLD_MINUTES = 30;

/** Các kỳ hạn trả góp MOVI hỗ trợ (tháng). */
export const MOVI_TENOR_OPTIONS = [1, 2, 3] as const;

/** Kỳ hạn mặc định khi khách không chọn. */
export const MOVI_DEFAULT_TENOR = 3;

/** Phương thức thanh toán (giá trị trong `payments.method`). */
export const MOVI_PAYMENT_METHOD = 'movi';

export type MoviTenorMonths = (typeof MOVI_TENOR_OPTIONS)[number];

/** Hồ sơ tín dụng MOVI sau khi đã chuẩn hoá. */
export interface MoviApplication {
  fullName: string;
  /** Ngày sinh ở dạng `YYYY-MM-DD`. */
  birthDate: string;
  /** CCCD/CMND đã bỏ khoảng trắng, chỉ còn chữ số. */
  nationalId: string;
  /** Số điện thoại chuẩn hoá `0XXXXXXXXX`. */
  phone: string;
  tenorMonths: number;
}

/** Hồ sơ thô, đúng những gì client gửi lên. */
export interface MoviApplicationInput {
  fullName?: unknown;
  birthDate?: unknown;
  nationalId?: unknown;
  phone?: unknown;
  tenor?: unknown;
}

export type MoviValidationResult =
  | { valid: true; data: MoviApplication }
  | { valid: false; message: string; field?: string };

const NAME_MIN_LENGTH = 2;
const NAME_MAX_LENGTH = 120;
const MIN_AGE = 18;
const MAX_AGE = 120;

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Chuẩn hoá ngày sinh về `YYYY-MM-DD`.
 *
 * Nhận `DD/MM/YYYY` (định dạng người Việt gõ) và `YYYY-MM-DD` (định dạng
 * `<input type="date">` gửi lên). Trả `null` khi không phải một ngày có
 * thật — `31/02/1990` là ngày không tồn tại, và một hồ sơ tín dụng ghi
 * ngày không tồn tại là hồ sơ sai.
 */
export function normalizeMoviBirthDate(raw: unknown): string | null {
  const value = asTrimmedString(raw);
  if (!value) return null;

  let day: number;
  let month: number;
  let year: number;

  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  const viMatch = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(value);

  if (isoMatch) {
    year = Number(isoMatch[1]);
    month = Number(isoMatch[2]);
    day = Number(isoMatch[3]);
  } else if (viMatch) {
    day = Number(viMatch[1]);
    month = Number(viMatch[2]);
    year = Number(viMatch[3]);
  } else {
    return null;
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  // `Date.UTC` lăn sang năm kế tiếp khi ngày vượt biên tháng (31/02 → 03/03),
  // nên phải so lại các thành phần để biết ngày có thật không.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  const iso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return iso;
}

/**
 * Kiểm tra một hồ sơ MOVI.
 *
 * `birthDate` là BẮT BUỘC khi client gửi payload có cấu trúc: đó là hồ sơ
 * mới. Khi client cũ gửi `transfer_note`, `parseLegacyMoviNote` gọi hàm này
 * với `birthDate` rỗng — xem `validateMoviApplication` để biết quy tắc
 * (ngày sinh rỗng được chấp nhận kèm cảnh báo, vì hồ sơ cũ không có nó).
 */
export function validateMoviApplication(input: MoviApplicationInput): MoviValidationResult {
  const fullName = asTrimmedString(input.fullName);
  if (fullName.length < NAME_MIN_LENGTH) {
    return {
      valid: false,
      message: 'Vui lòng nhập họ và tên người đăng ký trả góp.',
      field: 'fullName',
    };
  }
  if (fullName.length > NAME_MAX_LENGTH) {
    return {
      valid: false,
      message: 'Họ và tên không hợp lệ (tối đa 120 ký tự).',
      field: 'fullName',
    };
  }

  const nationalId = asTrimmedString(input.nationalId).replace(/\D/g, '');
  if (nationalId.length !== 9 && nationalId.length !== 12) {
    return {
      valid: false,
      message: 'Số CMND/CCCD không hợp lệ (CMND 9 số hoặc CCCD 12 số).',
      field: 'nationalId',
    };
  }

  const phone = normalizePhone(asTrimmedString(input.phone));
  if (!phone || !/^0\d{9}$/.test(phone)) {
    return {
      valid: false,
      message: 'Số điện thoại không hợp lệ (10 số, bắt đầu bằng 0).',
      field: 'phone',
    };
  }

  const rawBirthDate = asTrimmedString(input.birthDate);
  let birthDate = '';
  if (rawBirthDate) {
    const normalized = normalizeMoviBirthDate(rawBirthDate);
    if (!normalized) {
      return {
        valid: false,
        message: 'Ngày sinh không hợp lệ (định dạng DD/MM/YYYY).',
        field: 'birthDate',
      };
    }
    const age = ageInYears(normalized);
    if (age < MIN_AGE) {
      return {
        valid: false,
        message: `Người đăng ký trả góp phải đủ ${MIN_AGE} tuổi.`,
        field: 'birthDate',
      };
    }
    if (age > MAX_AGE) {
      return {
        valid: false,
        message: 'Ngày sinh không hợp lệ.',
        field: 'birthDate',
      };
    }
    birthDate = normalized;
  }

  const rawTenor = input.tenor;
  let tenorMonths = MOVI_DEFAULT_TENOR;
  if (rawTenor !== undefined && rawTenor !== null && rawTenor !== '') {
    const tenor = Number(rawTenor);
    if (!MOVI_TENOR_OPTIONS.includes(tenor as MoviTenorMonths)) {
      return {
        valid: false,
        message: 'Kỳ hạn trả góp không hợp lệ (1, 2 hoặc 3 tháng).',
        field: 'tenor',
      };
    }
    tenorMonths = tenor;
  }

  return {
    valid: true,
    data: { fullName, birthDate, nationalId, phone, tenorMonths },
  };
}

function ageInYears(isoBirthDate: string): number {
  const [year, month, day] = isoBirthDate.split('-').map(Number);
  const today = new Date();
  let age = today.getUTCFullYear() - year;
  const monthDiff = today.getUTCMonth() + 1 - month;
  if (monthDiff < 0 || (monthDiff === 0 && today.getUTCDate() < day)) age -= 1;
  return age;
}

/**
 * Đọc hồ sơ MOVI từ `transfer_note` theo định dạng cũ.
 *
 * Trả `null` khi chuỗi không phải hồ sơ MOVI, để caller biết phải yêu cầu
 * payload có cấu trúc thay vì báo "hồ sơ sai" cho một `transfer_note` của
 * phương thức khác.
 */
export function parseLegacyMoviNote(note: unknown): MoviApplicationInput | null {
  const value = asTrimmedString(note);
  if (!value.toUpperCase().startsWith('MOVI:')) return null;

  const body = value.slice('MOVI:'.length);
  const nameMatch = /^(.*?)\s*-\s*CCCD\s+([0-9\s]+?)(?:\s*-\s*SĐT\s+([0-9\s]+))?$/i.exec(body);
  if (!nameMatch) return null;

  return {
    fullName: nameMatch[1]?.trim() ?? '',
    nationalId: (nameMatch[2] ?? '').replace(/\D/g, ''),
    phone: (nameMatch[3] ?? '').replace(/\D/g, ''),
  };
}

/**
 * Dựng `transfer_note` hiển thị cho admin, theo đúng định dạng cũ.
 *
 * `payments.transfer_note` là cột TEXT không có cấu trúc, và bảng giao dịch
 * của admin đọc chính cột đó — nên nó vẫn phải mang hồ sơ dưới dạng đọc
 * được. Hồ sơ CÓ CẤU TRÚC nằm ở `movi_credit_applications`; cột này chỉ là
 * bản tóm tắt cho người vận hành.
 */
export function buildMoviTransferNote(application: {
  fullName: string;
  nationalId: string;
  phone: string;
  birthDate?: string;
  tenorMonths?: number;
}): string {
  const parts = [`MOVI: ${application.fullName}`, `CCCD ${application.nationalId}`];
  if (application.birthDate) parts.push(`Sinh ${application.birthDate}`);
  parts.push(`SĐT ${application.phone}`);
  if (application.tenorMonths) parts.push(`${application.tenorMonths} tháng`);
  return parts.join(' - ');
}
