'use client';
import React from 'react';

interface Props {
  /** Running booking total, rendered with vi-VN grouping and a "VND" suffix. */
  total: number;
  /** CTA caption — "Đi tiếp" on the picker steps, a payment label on the last one. */
  ctaLabel?: string;
  continueLabel?: string;
  /**
   * CTA action. Ignored when `formId` is set: the button then submits that
   * form (native constraint validation included) instead.
   */
  onCta?: () => void;
  onContinue?: () => void;
  /** Id of the form to submit when the CTA lives outside the `<form>`. */
  formId?: string;
  disabled?: boolean;
  canContinue?: boolean;
  /** Probe hook — lets Playwright find the bar per step. */
  testId?: string;
  /** Optional back button handler */
  onBack?: () => void;
}

/**
 * Sticky "Tổng tiền" bar pinned to the bottom of the viewport — vietjetair.com
 * keeps this bar on every step of the booking wizard (running total on the
 * left, accent CTA on the right), so every step shares this one component
 * instead of re-implementing the markup. Amount always comes from
 * `getBookingTotals` so the bar can never disagree with the step's sidebar.
 */
export default function BookingBottomBar({
  total,
  ctaLabel,
  continueLabel,
  onCta,
  onContinue,
  formId,
  disabled = false,
  canContinue = true,
  testId,
  onBack,
}: Props) {
  const isSubmit = Boolean(formId);
  const action = onContinue ?? onCta;
  const label = ctaLabel ?? continueLabel ?? 'Đi tiếp';
  const isDisabled = disabled || !canContinue;
  // `.vj-cta--booking` đo trên site thật là 127×39. Nhãn dài ở bước chọn ghế
  // ("Tiếp tục nhập hành khách") không vừa khung đó, nên chỉ nhãn ngắn mới
  // giữ đúng số đo; nhãn dài nới theo nội dung.
  const fitsBookingWidth = label.length <= 12;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] bg-[var(--surface)] shadow-vj-up-xs"
      data-testid={testId}
    >
      {/* Container 1200px — khớp số đo site thật (13/11/2026).
       *
       * Tổng tiền được căn tuyệt đối vào giữa thanh từ `sm` trở lên: dùng
       * `justify-between` thuần thì con số lệch tâm vì nút "Quay lại" và CTA
       * rộng khác nhau — và ở bước chọn ghế (không có nút Quay lại) thì lệch
       * hẳn về trái. Dưới `sm`, nó nằm trong luồng để ba phần tử tự co lại,
       * không đè lên nhau. */}
      <div className="relative mx-auto flex max-w-[1200px] items-center justify-between gap-2 px-3 py-2 sm:gap-3 sm:px-4 md:px-6">
        {/* Left: Optional Back button, hoặc spacer cùng bề rộng để tổng tiền
         * vẫn cân bằng trên mobile ở bước không có nút Quay lại. */}
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="h-9.75 shrink-0 rounded-5xs border border-[var(--vj-border-back)] bg-white px-3 text-sm font-bold text-vj-text transition-colors hover:bg-gray-50 active:scale-95 sm:px-4"
          >
            Quay lại
          </button>
        ) : (
          <span aria-hidden="true" className="h-9.75 w-20 shrink-0" />
        )}

        {/* Center: Total price — nhỏ hơn ở mobile để không chạm hai nút bên cạnh */}
        <div className="flex min-w-0 flex-col items-center leading-tight sm:absolute sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2">
          <span className="text-sm font-bold text-black font-koho sm:text-2xl3">Tổng tiền</span>
          <span className="w-full truncate text-center text-base font-bold text-black font-jambono sm:text-xl4">
            {total.toLocaleString('vi-VN')} VND
          </span>
        </div>

        {/* Right: primary CTA — `.vj-cta--booking` là biến thể dành riêng cho
         * luồng đặt vé (39px, chữ thường, font KoHo 14px). Trước đây chỉ dùng
         * `.vj-cta` nên nút cao 44px và in hoa "ĐI TIẾP", lệch với nút "Đi
         * tiếp" ở các bước khác. */}
        <button
          type={isSubmit ? 'submit' : 'button'}
          form={formId}
          onClick={isSubmit ? undefined : action}
          disabled={isDisabled}
          data-testid="booking-continue-btn"
          className={`vj-cta vj-cta--booking shrink-0 transition-all disabled:cursor-not-allowed disabled:opacity-50 active:scale-95 ${
            fitsBookingWidth ? 'px-3 sm:px-0' : 'w-auto min-w-0 max-w-none px-3 sm:px-6'
          }`}
        >
          {label}
        </button>
      </div>
    </div>
  );
}
