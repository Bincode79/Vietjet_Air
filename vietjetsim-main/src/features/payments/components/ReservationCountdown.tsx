'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

interface ReservationCountdownProps {
  initialMinutes?: number;
  onExpire?: () => void;
  bookingCode?: string | null;
  /**
   * Gia hạn lượt giữ chỗ.
   *
   * Với lượt giữ chỗ do server quyết định (MOVI), "gia hạn" phải gọi API —
   * nếu chỉ ghi `sessionStorage` thì đồng hồ của trình duyệt lệch với mốc
   * thật trên server, và vé vẫn bị hủy đúng lúc server nói hết hạn.
   */
  onRenew?: () => void;

  /**
   * Mốc hết hạn do SERVER quyết định (ISO-8601).
   *
   * Khi có giá trị này, đồng hồ đếm theo mốc của server và `sessionStorage`
   * bị bỏ qua. Lý do: `sessionStorage` là đồng hồ của RIÊNG một trình
   * duyệt — mở tab thứ hai, xoá dữ liệu trình duyệt, hoặc chỉnh ngày giờ máy
   * là đồng hồ đó lệch với đồng hồ thật của lượt giữ chỗ. Mốc thời gian
   * giữ chỗ phải nằm ở server (migration 055) để mọi thiết bị thấy cùng
   * một mốc.
   */
  expiresAt?: string | null;
  /**
   * Khoá lưu mốc hết hạn phía client.
   *
   * Mỗi phương thức có một lượt giữ chỗ riêng, nên mỗi phương thức phải có
   * một khoá riêng — nếu không, chuyển từ 15 phút sang 30 phút sẽ đọc lại
   * mốc cũ của phương thức trước.
   */
  storageKey?: string;
}

const STORAGE_KEY = 'vj_reservation_expire_time';

export default function ReservationCountdown({
  initialMinutes = 15,
  onExpire,
  expiresAt,
  storageKey = STORAGE_KEY,
  onRenew,
}: ReservationCountdownProps) {
  const router = useRouter();
  const [timeLeft, setTimeLeft] = useState<number>(initialMinutes * 60);
  const [showExpiredModal, setShowExpiredModal] = useState<boolean>(false);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    // Mốc hết hạn: ưu tiên mốc do server trả về, không thì mới dùng
    // `sessionStorage`, không thì mới tính từ `initialMinutes`.
    let expireTimestamp: number;
    const serverTimestamp = expiresAt ? Date.parse(expiresAt) : NaN;
    if (!Number.isNaN(serverTimestamp)) {
      expireTimestamp = serverTimestamp;
    } else {
      try {
        const stored = sessionStorage.getItem(storageKey);
        if (stored) {
          expireTimestamp = parseInt(stored, 10);
        } else {
          expireTimestamp = Date.now() + initialMinutes * 60 * 1000;
          sessionStorage.setItem(storageKey, expireTimestamp.toString());
        }
      } catch {
        expireTimestamp = Date.now() + initialMinutes * 60 * 1000;
      }
    }

    const updateTimer = () => {
      const now = Date.now();
      const diffSeconds = Math.max(0, Math.floor((expireTimestamp - now) / 1000));
      setTimeLeft(diffSeconds);

      if (diffSeconds <= 0) {
        setShowExpiredModal(true);
        onExpireRef.current?.();
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [initialMinutes, expiresAt, storageKey]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const isUrgent = timeLeft > 0 && timeLeft <= 180; // Dưới 3 phút là cảnh báo
  const percentLeft = Math.min(100, Math.max(0, (timeLeft / (initialMinutes * 60)) * 100));

  const handleRenewTime = () => {
    // Ưu tiên gia hạn qua server (MOVI). Chỉ khi không có `onRenew` thì mới
    // gia hạn bằng `sessionStorage` — nhưng lúc đó đồng hồ của trình duyệt
    // là nguồn duy nhất, và điều đó đúng với các phương thức cũ.
    if (onRenew) {
      onRenew();
      setShowExpiredModal(false);
      return;
    }
    const newExpire = Date.now() + 10 * 60 * 1000;
    try {
      sessionStorage.setItem(storageKey, newExpire.toString());
    } catch {
      // ignore
    }
    setTimeLeft(10 * 60);
    setShowExpiredModal(false);
  };

  return (
    <>
      <div
        className={`w-full transition-all duration-300 rounded-2xl border shadow-vj-sm overflow-hidden mb-4 sm:mb-5 ${
          isUrgent
            ? 'bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 border-red-300 text-white shadow-red-200/50'
            : 'bg-gradient-to-r from-red-700 via-red-600 to-amber-500 border-red-400/40 text-white shadow-amber-100/50'
        }`}
      >
        <div className="px-3 py-2.5 sm:px-6 sm:py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3">
          {/* Top row on mobile / Left group on desktop */}
          <div className="flex items-center justify-between sm:justify-start gap-2.5 sm:gap-3 w-full sm:w-auto">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={`w-8 h-8 sm:w-9 sm:h-9 rounded-vj flex items-center justify-center shrink-0 ${
                  isUrgent
                    ? 'bg-white text-vj-red-dark animate-bounce'
                    : 'bg-white/20 text-white backdrop-blur-xs'
                }`}
              >
                <svg
                  className={`w-4 h-4 sm:w-5 sm:h-5 ${timeLeft > 0 ? 'animate-spin' : ''}`}
                  style={{ animationDuration: '6s' }}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-2xs sm:text-xs font-black uppercase tracking-wider text-amber-200 whitespace-nowrap">
                    Thời gian giữ chỗ
                  </span>
                </div>
                <p className="text-3xs sm:text-xs text-white/90 font-medium hidden sm:block mt-0.5">
                  {isUrgent
                    ? 'Sắp hết hạn giữ vé! Vui lòng hoàn tất thanh toán để đảm bảo giá vé này.'
                    : 'Vé của bạn đang được Vietjet tạm giữ. Hoàn tất thanh toán trước khi hết giờ.'}
                </p>
              </div>
            </div>

            {/* Mobile-only Timer Badge placed next to title in header row */}
            <div className="sm:hidden shrink-0">
              <div className="flex items-center gap-1 bg-black/35 backdrop-blur-md px-2.5 py-1 rounded-vj border border-white/25 shadow-inner">
                <span className="text-4xs font-bold uppercase text-amber-300">Còn</span>
                <div className="font-mono font-black text-sm tracking-wider text-yellow-300 flex items-center">
                  <span>{String(minutes).padStart(2, '0')}</span>
                  <span className="animate-pulse mx-0.5">:</span>
                  <span>{String(seconds).padStart(2, '0')}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Mobile subtext underneath */}
          <p className="text-3xs text-white/90 font-medium sm:hidden leading-tight">
            {isUrgent
              ? '⚠️ Sắp hết hạn giữ vé! Hoàn tất thanh toán ngay để giữ giá vé.'
              : 'Vé đang được Vietjet tạm giữ. Vui lòng thanh toán trước khi hết hạn.'}
          </p>

          {/* Desktop Countdown Timer */}
          <div className="hidden sm:flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-1.5 bg-black/30 backdrop-blur-md px-3.5 py-1.5 rounded-vj border border-white/20 shadow-inner">
              <span className="text-3xs font-bold uppercase text-amber-300">Còn lại</span>
              <div className="font-mono font-black text-lg sm:text-xl tracking-wider text-yellow-300 flex items-center">
                <span>{String(minutes).padStart(2, '0')}</span>
                <span className="animate-pulse mx-0.5">:</span>
                <span>{String(seconds).padStart(2, '0')}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Progress bar line */}
        <div className="w-full h-1 bg-black/20">
          <div
            className={`h-full transition-all duration-1000 ${
              isUrgent ? 'bg-yellow-300' : 'bg-vj-pay-green'
            }`}
            style={{ width: `${percentLeft}%` }}
          />
        </div>
      </div>

      {/* Modal khi hết hạn giữ chỗ */}
      {showExpiredModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 text-center shadow-2xl animate-scale-in border border-vj-border-light">
            <div className="w-16 h-16 rounded-full bg-amber-50 text-amber-500 mx-auto flex items-center justify-center mb-4 border-2 border-amber-200">
              <svg
                className="w-8 h-8 text-amber-500"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <h3 className="text-xl font-black text-vj-text font-koho mb-2">
              Hết thời gian giữ chỗ
            </h3>
            <p className="text-sm text-vj-text-strong mb-6 leading-relaxed">
              Phiên giữ chỗ của chuyến bay đã hết thời gian tạm giữ {initialMinutes} phút. Giá vé
              hoặc tình trạng chỗ ngồi có thể đã thay đổi. Bạn có thể gia hạn thêm 10 phút hoặc quay
              lại chọn chuyến bay.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={handleRenewTime}
                className="flex-1 py-3 px-4 rounded-vj bg-amber-500 hover:bg-amber-600 text-black font-extrabold text-sm transition-colors shadow-vj-sm cursor-pointer"
              >
                Gia hạn thêm 10 phút
              </button>
              <button
                type="button"
                onClick={() => router.push('/tim-ve')}
                className="flex-1 py-3 px-4 rounded-vj bg-vj-pill hover:bg-vj-surface-3 text-vj-text-strong font-bold text-sm transition-colors cursor-pointer"
              >
                Tìm chuyến bay khác
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
