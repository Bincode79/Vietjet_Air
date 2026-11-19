'use client';
import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/shared/components/ui';
import { getMembership } from '@/features/loyalty/services';
import { getApiErrorMessage } from '@/shared/services';
import { skypointPointsForAmount, skypointValueOfPoints } from '@/lib/skypoint';

export interface SkyPointGatewayPayload {
  skypoint: { cashDue: number };
}

interface Props {
  bookingId: string;
  bookingCode?: string;
  /** Số tiền vé sau khuyến mãi — server tính SkyPoint trên chính con số này. */
  amount: number;
  onSuccess: (payload: SkyPointGatewayPayload) => void;
}

type LoadState = 'loading' | 'ready' | 'error';

export default function SkyPointGatewayContent({
  bookingId: _bookingId,
  bookingCode: _bookingCode,
  amount,
  onSuccess,
}: Props) {
  const [points, setPoints] = useState<number | null>(null);
  const [rate, setRate] = useState<number>(10);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadError, setLoadError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getMembership()
      .then((data) => {
        if (cancelled) return;
        if (data?.membership && data?.program) {
          setPoints(data.membership.currentPoints ?? 0);
          setRate(data.program.pointsPerThousandVnd ?? 10);
          setLoadState('ready');
        } else {
          setLoadError('Tài khoản chưa tham gia chương trình SkyJoy Rewards.');
          setLoadState('error');
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(
          getApiErrorMessage(err, 'Không tải được số dư SkyPoint. Vui lòng đăng nhập để tiếp tục.')
        );
        setLoadState('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Server tự đổi toàn bộ điểm cần thiết cho hóa đơn này (`points_to_redeem`
  // không gửi ⇒ server lấy pointsForAmount(discountedTotal)). CashDue ở đây
  // phải khớp đúng phép tính đó, nếu không server trả 400 "số tiền không khớp".
  const pointsNeeded = useMemo(
    () => (loadState === 'ready' ? skypointPointsForAmount(amount, rate) : 0),
    [loadState, amount, rate]
  );
  const pointsValue = useMemo(
    () => skypointValueOfPoints(pointsNeeded, rate),
    [pointsNeeded, rate]
  );
  const cashDue = useMemo(() => Math.max(0, amount - pointsValue), [amount, pointsValue]);
  const isEnough = loadState === 'ready' && points !== null && points >= pointsNeeded;

  const handlePay = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEnough) return;
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      onSuccess({ skypoint: { cashDue } });
    }, 800);
  };

  if (loadState === 'loading') {
    return <div className="py-16 text-center text-sm text-vj-gray">Đang tải số dư SkyPoint…</div>;
  }

  if (loadState === 'error') {
    return (
      <div className="max-w-xl mx-auto my-8 px-4">
        <div
          role="alert"
          className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-center text-sm text-amber-900 space-y-2"
        >
          <Icon name="ExclamationTriangleIcon" size={28} className="mx-auto" />
          <div className="font-bold">Chưa dùng được SkyPoint</div>
          <div>{loadError}</div>
          <Link href="/dang-nhap" className="inline-block font-bold underline">
            Đăng nhập
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto py-6 px-4">
      <div className="bg-white rounded-3xl border border-vj-border-light/90 p-5 sm:p-8 shadow-vj-sm space-y-6 font-koho">
        <div className="text-center space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-bold uppercase tracking-wider">
            <Icon name="StarIcon" size={16} variant="solid" />
            SKYJOY REWARDS • SKYPOINT
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-vj-text">
            Thanh toán bằng điểm SkyPoint
          </h2>
          <p className="text-xs sm:text-sm text-vj-gray">
            Dùng điểm tích lũy để thanh toán vé — phần còn lại thanh toán bằng tiền mặt.
          </p>
        </div>

        <div className="bg-gradient-to-br from-amber-400 to-amber-500 rounded-2xl p-5 text-white shadow-vj-md space-y-2">
          <div className="flex justify-between items-center text-xs opacity-90 uppercase tracking-wider">
            <span>Số dư SkyPoint</span>
            <span>SkyJoy Rewards</span>
          </div>
          <div className="text-2xl sm:text-3xl font-black tracking-tight">
            {(points ?? 0).toLocaleString('vi-VN')} điểm
          </div>
          <div className="text-3xs opacity-80">
            ≈ {skypointValueOfPoints(points ?? 0, rate).toLocaleString('vi-VN')} ₫
          </div>
        </div>

        <div className="bg-vj-surface-2 rounded-vj p-4 border border-vj-border-light space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-vj-text-dim">Tổng tiền vé:</span>
            <span className="font-bold">{amount.toLocaleString('vi-VN')} ₫</span>
          </div>
          <div className="flex justify-between">
            <span className="text-vj-text-dim">Điểm cần dùng:</span>
            <span className="font-bold">
              {pointsNeeded.toLocaleString('vi-VN')} SkyPoint
              {pointsValue > 0 && (
                <span className="text-vj-gray font-semibold">
                  {' '}
                  (−{pointsValue.toLocaleString('vi-VN')} ₫)
                </span>
              )}
            </span>
          </div>
          <div className="border-t border-vj-border-light pt-2 flex justify-between font-black">
            <span>Tiền mặt còn lại:</span>
            <span className="text-primary text-lg">{cashDue.toLocaleString('vi-VN')} ₫</span>
          </div>
        </div>

        {!isEnough && (
          <div
            role="alert"
            className="rounded-vj border border-red-200 bg-red-50 p-3.5 text-xs text-red-800 space-y-1"
          >
            <div className="font-bold">Không đủ SkyPoint</div>
            <div>
              Bạn cần {pointsNeeded.toLocaleString('vi-VN')} điểm nhưng chỉ có{' '}
              {(points ?? 0).toLocaleString('vi-VN')} điểm. Vui lòng chọn phương thức khác hoặc tích
              thêm điểm.
            </div>
          </div>
        )}

        <form onSubmit={handlePay} className="space-y-3">
          <button
            type="submit"
            disabled={isProcessing || !isEnough}
            className="w-full py-3.5 rounded-vj bg-amber-500 hover:bg-amber-600 text-white font-black text-sm uppercase tracking-wide transition-all shadow-vj-md disabled:opacity-50 cursor-pointer"
          >
            {isProcessing
              ? 'Đang trừ điểm…'
              : isEnough
                ? `Dùng ${pointsNeeded.toLocaleString('vi-VN')} điểm & thanh toán`
                : 'Không đủ điểm SkyPoint'}
          </button>
          <p className="text-3xs text-vj-muted text-center">
            Phần tiền mặt còn lại sẽ được thanh toán qua cổng an toàn sau khi xác nhận điểm.
          </p>
        </form>
      </div>
    </div>
  );
}
