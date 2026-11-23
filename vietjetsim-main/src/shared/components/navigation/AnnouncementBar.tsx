'use client';

import { useEffect, useRef, useState } from 'react';
import { HiOutlineX } from 'react-icons/hi';
import { RiArrowLeftSLine, RiArrowRightSLine, RiNotification3Line } from 'react-icons/ri';
import { apiRequest } from '@/shared/services';

/**
 * Thanh thông báo nằm ngay trên `<Header>` (nền trắng, cao 58–60px trên
 * desktop). Chuông đỏ ở bên trái, nội dung căn giữa theo chiều dọc, và cụm điều
 * hướng ngay bên phải: lùi / tiến giữa các thông báo rồi nút đóng X.
 *
 * Nội dung dài luôn nằm gọn trong một dòng (`truncate`) với `min-w-0 flex-1`,
 * nên một thông báo dài không thể đẩy cụm nút ra khỏi khung hay làm vỡ bố cục;
 * nội dung đầy đủ đọc được khi chạm vào dòng tin hoặc rê chuột xem `title`.
 *
 * Nguồn nội dung là `/api/cong-khai/thong-bao` — các thông báo quản trị viên đã
 * phát hành cho mọi khách (`announcements`, lọc `is_active`, khoảng hiệu lực và
 * `target_role = 'all'`). Thanh này render ngay từ HTML đầu tiên nên trước khi
 * request xong (và khi database chưa có thông báo nào được phát hành) nó dùng
 * `FALLBACK_ANNOUNCEMENTS` bên dưới. Lỗi mạng cũng rơi vào đó: mất một thông báo
 * mới không phải lý do để thanh trống.
 */
const FALLBACK_ANNOUNCEMENTS: readonly string[] = [
  'TIN MỚI Ưu đãi 50% cho vé khứ hồi nội địa — đặt ngay hôm nay!',
  '[THÔNG BÁO] Từ ngày 17/8/2026 (GMT+7), các chuyến bay Vietjet đến và đi từ Jakarta sẽ được chuyển về nhà ga T3 Ultimate của Sân bay Quốc tế Soekarno-Hatta (CGK).',
  'Thành viên SkyJoy tích điểm gấp đôi khi đặt vé trên website và ứng dụng Vietjet.',
  'Vietjet mở bán đường bay mới TP. Hồ Chí Minh – Western Sydney (WSI), giá chỉ từ 299.000đ.',
];

/** Thông báo như `/api/cong-khai/thong-bao` trả về. */
interface PublicAnnouncement {
  id: string;
  title: string;
  content: string;
}

/**
 * Một dòng của thanh. Quản trị viên điền cả `title` (nhãn ngắn) lẫn `content`
 * (nội dung), nên ghép hai phần thay vì bỏ mất một phần; khi hai phần trùng nhau
 * hoặc thiếu một phần thì in phần còn lại.
 */
function toBarLine(announcement: PublicAnnouncement): string {
  const title = announcement.title?.trim();
  const content = announcement.content?.trim();
  if (title && content && title !== content) return `${title} — ${content}`;
  return title || content || '';
}

export default function AnnouncementBar() {
  const [messages, setMessages] = useState<readonly string[]>(FALLBACK_ANNOUNCEMENTS);
  const [index, setIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const barRef = useRef<HTMLDivElement>(null);

  /**
   * Chiều cao thanh thông báo được công bố ra ngoài qua biến CSS để lớp phủ
   * header của trang chủ neo ĐÚNG dưới thanh này — kể cả khi người dùng đóng
   * thanh (khi đó biến = 0px và header dịch lên đúng bằng phần đã đóng).
   *
   * KHÔNG gán cứng 35/50px: ở tablet (768–1023px) nội dung badge + text có thể
   * cao hơn `min-height`, khiến header tuyệt đối phủ lên phần đáy của thanh và
   * cắt logo trắng. Đo trực tiếp chiều cao render (ResizeObserver) và công bố
   * đúng px — hoạt động ở mọi viewport và khi nội dung đổi/wrap.
   */
  useEffect(() => {
    const root = document.documentElement;
    const visible = !dismissed && messages.length > 0;
    const setVars = (px: number) => {
      root.style.setProperty('--vj-announce-h', `${px}px`);
      root.style.setProperty('--vj-announce-h-lg', `${px}px`);
    };
    if (!visible || !barRef.current) {
      setVars(0);
      return undefined;
    }
    const el = barRef.current;
    setVars(el.offsetHeight);
    const observer = new ResizeObserver(() => setVars(el.offsetHeight));
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--vj-announce-h');
      root.style.removeProperty('--vj-announce-h-lg');
    };
  }, [dismissed, messages.length]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const data = await apiRequest<{ announcements?: PublicAnnouncement[] }>(
          '/api/cong-khai/thong-bao'
        );
        const lines = (data.announcements ?? []).map(toBarLine).filter((line) => line.length > 0);
        if (!cancelled && lines.length > 0) {
          setMessages(lines);
          setIndex(0);
        }
      } catch {
        // Giữ nội dung mẫu đang hiển thị.
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (dismissed) return null;

  const total = messages.length;
  if (total === 0) return null;

  const message = messages[index] ?? messages[0];
  const move = (step: number) => {
    setExpanded(false);
    setIndex((current) => (current + step + total) % total);
  };

  // Nút điều hướng thông báo: 25×25px (đo được trên site thật), bo tròn.
  const controlClass =
    'grid h-[25px] w-[25px] place-items-center rounded-full text-[var(--foreground-muted)] transition-colors hover:bg-vj-pill hover:text-[var(--foreground)] focus:outline-hidden focus:ring-1 focus:ring-gray-300';

  return (
    <div
      ref={barRef}
      role="region"
      aria-label="Thông báo"
      // Site thật: cao 50px trên desktop / 35px trên mobile, nền #FDFDFD,
      // container nội dung 1200px. Xem docs/qa/VIETJET_THAM_SO_GIAO_DIEN_2026-11-13.md §4.
      // Mobile: đo được 35px (đo lại trực tiếp site thật 13/11/2026, 390×844) —
      // hàng nội dung cao 26px, nên thanh không được cộng thêm `py-2` như desktop.
      className="w-full min-h-[35px] lg:min-h-[50px] bg-vj-announce-bg text-[var(--foreground)] border-b border-vj-border-light flex items-center"
    >
      <div
        className={`mx-auto flex w-full max-w-[1200px] gap-3.5 px-4 sm:px-6 text-lg2 lg:text-lg2 ${expanded ? 'items-start py-2' : 'items-center py-0 lg:py-2'}`}
      >
        {/* Icon chuông: 24×26px (đo được trên site thật). */}
        <RiNotification3Line aria-hidden="true" className="h-[26px] w-[24px] shrink-0 text-vjred" />

        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
          aria-label={expanded ? 'Thu gọn thông báo' : 'Xem toàn bộ thông báo'}
          aria-live="polite"
          title={message}
          className={`min-w-0 flex-1 text-left text-lg2 font-medium leading-[20px] text-[var(--foreground)] flex gap-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${expanded ? 'items-start' : 'items-center truncate'}`}
        >
          {message.startsWith('TIN MỚI') ? (
            <>
              <span className="shrink-0 bg-vjgold text-vjwine text-xs2 font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                TIN MỚI
              </span>
              <span className={expanded ? 'whitespace-normal break-words' : 'truncate'}>
                {message.replace(/^TIN MỚI\s*[:-]?\s*/, '')}
              </span>
            </>
          ) : (
            <span className={expanded ? 'whitespace-normal break-words' : 'truncate'}>
              {message}
            </span>
          )}
        </button>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => move(-1)}
            aria-label="Thông báo trước"
            className={controlClass}
          >
            <RiArrowLeftSLine aria-hidden="true" className="text-xl" />
          </button>
          <span className="min-w-[28px] text-center text-xs font-semibold tabular-nums text-vj-gray">
            {index + 1}/{total}
          </span>
          <button
            type="button"
            onClick={() => move(1)}
            aria-label="Thông báo tiếp theo"
            className={controlClass}
          >
            <RiArrowRightSLine aria-hidden="true" className="text-xl" />
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Đóng thông báo"
            className={`${controlClass} ml-1`}
          >
            <HiOutlineX aria-hidden="true" className="text-lg" />
          </button>
        </div>
      </div>
    </div>
  );
}
