'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Icon } from '@/shared/components/ui';

interface Props {
  bookingId?: string | null;
  bookingCode?: string | null;
  amount?: number;
  methodTitle: string;
  initialMinutes?: number;
  /** Mốc hết hạn do server quyết định (ISO string). Dùng cho MOVI hold 30 phút. */
  expiresAt?: string | null;
}

export default function PaymentGatewayHeader({
  bookingId,
  bookingCode,
  amount,
  methodTitle,
  initialMinutes = 15,
  expiresAt,
}: Props) {
  const [secondsLeft, setSecondsLeft] = useState(() => {
    if (expiresAt) {
      const diff = new Date(expiresAt).getTime() - Date.now();
      return Math.max(0, Math.ceil(diff / 1000));
    }
    return initialMinutes * 60;
  });

  useEffect(() => {
    if (expiresAt) {
      // Server-side countdown: sync with expiresAt on mount
      const diff = new Date(expiresAt).getTime() - Date.now();
      setSecondsLeft(Math.max(0, Math.ceil(diff / 1000)));
    }
    const timer = setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const timeFormatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const backUrl = bookingId
    ? `/thanh-toan?bookingId=${encodeURIComponent(bookingId)}`
    : '/thanh-toan';

  return (
    <div className="bg-white border-b border-vj-border-light sticky top-0 z-30 shadow-xs">
      <div className="max-w-4xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        {/* Back Link */}
        <Link
          href={backUrl}
          className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-vj-text-strong hover:text-primary transition-colors font-koho"
        >
          <span className="text-base leading-none">←</span>
          <span>Đổi phương thức</span>
        </Link>

        {/* Method & PNR Badge */}
        <div className="flex items-center gap-2">
          <span className="text-xs sm:text-sm font-bold text-vj-text font-koho">{methodTitle}</span>
          {bookingCode && (
            <span className="text-2xs sm:text-xs font-black uppercase px-2 py-0.5 rounded bg-red-50 text-primary border border-red-200 tracking-wider">
              Mã đặt chỗ: {bookingCode}
            </span>
          )}
        </div>

        {/* Amount & Countdown */}
        <div className="flex items-center gap-3">
          {amount !== undefined && amount > 0 && (
            <div className="text-right">
              <span className="text-3xs text-vj-muted block uppercase font-bold">
                Cần thanh toán
              </span>
              <span className="text-sm sm:text-base font-black text-primary font-koho">
                {amount.toLocaleString('vi-VN')} VND
              </span>
            </div>
          )}

          {/* Countdown Clock */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-vj border font-mono text-xs sm:text-sm font-bold ${
              secondsLeft < 300
                ? 'bg-red-50 text-vj-red-dark border-red-300 animate-pulse'
                : 'bg-amber-50 text-amber-800 border-amber-200'
            }`}
            title="Thời gian giữ vé"
          >
            <Icon name="ClockIcon" size={14} className="shrink-0" />
            <span>{timeFormatted}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
