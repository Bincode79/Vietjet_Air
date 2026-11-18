'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/shared/components/ui';
import { getWalletOverview } from '@/features/payments/services';
import { getApiErrorMessage } from '@/shared/services';

interface Props {
  bookingId: string;
  bookingCode?: string;
  amount: number;
  onSuccess: () => void;
}

type WalletState = 'loading' | 'ready' | 'error';

export default function WalletGatewayContent({
  bookingId: _bookingId,
  bookingCode: _bookingCode,
  amount,
  onSuccess,
}: Props) {
  const [isProcessing, setIsProcessing] = useState(false);
  // Số dư thật của ví, không phải một con số demo: cổng ví từng in cứng
  // 5.000.000₫ nên khách có ví 0₫ vẫn thấy "đủ tiền" rồi bị server từ chối.
  const [balance, setBalance] = useState<number | null>(null);
  const [walletState, setWalletState] = useState<WalletState>('loading');
  const [walletError, setWalletError] = useState('');
  const [usePin, setUsePin] = useState('');

  useEffect(() => {
    let cancelled = false;

    getWalletOverview()
      .then((res) => {
        if (cancelled) return;
        setBalance(Number(res.wallet?.balance ?? 0));
        setWalletState('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setWalletError(
          getApiErrorMessage(
            err,
            'Không tải được số dư ví. Vui lòng đăng nhập để thanh toán bằng ví.'
          )
        );
        setWalletState('error');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const isEnough = walletState === 'ready' && (balance ?? 0) >= amount;

  const handlePay = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEnough) return;
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      onSuccess();
    }, 1000);
  };

  return (
    <div className="max-w-xl mx-auto py-6 px-4">
      <div className="bg-white rounded-3xl border border-gray-200/90 p-5 sm:p-8 shadow-sm space-y-6">
        <div className="text-center space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold font-koho uppercase tracking-wider">
            <Icon name="WalletIcon" size={16} />
            VÍ TÀI KHOẢN • SKYJOY
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-gray-900 font-koho">
            Thanh toán bằng số dư Ví Vietjet
          </h2>
          <p className="text-xs sm:text-sm text-gray-500">
            Thanh toán tức thì không phí giao dịch, bảo mật bằng mã PIN
          </p>
        </div>

        <div className="bg-gradient-to-br from-emerald-600 to-teal-700 rounded-2xl p-5 text-white shadow-md space-y-3 font-koho">
          <div className="flex justify-between items-center text-xs opacity-80 uppercase tracking-wider">
            <span>Số dư ví khả dụng</span>
            <span>Vietjet Pay</span>
          </div>
          <div className="text-2xl sm:text-3xl font-black tracking-tight">
            {walletState === 'loading' && balance === null
              ? 'Đang tải…'
              : `${(balance ?? 0).toLocaleString('vi-VN')} VND`}
          </div>
          <div className="text-3xs opacity-75">
            Điểm tích lũy dự kiến: +{Math.round(amount / 1000)} SkyPoint
          </div>
        </div>

        {walletState === 'error' && (
          <div
            role="alert"
            className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900 space-y-1"
          >
            <div className="font-bold">Chưa dùng được ví</div>
            <div>{walletError}</div>
            <Link href="/dang-nhap" className="inline-block font-bold underline text-amber-900">
              Đăng nhập
            </Link>
          </div>
        )}

        <form onSubmit={handlePay} className="space-y-4 font-koho">
          <div className="bg-gray-50 rounded-xl p-3.5 border border-gray-200 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-600">Số tiền thanh toán:</span>
              <span className="font-bold text-primary text-sm">
                {amount.toLocaleString('vi-VN')} VND
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Số dư còn lại sau thanh toán:</span>
              <span className="font-bold text-gray-800">
                {balance === null
                  ? '—'
                  : `${Math.max(0, balance - amount).toLocaleString('vi-VN')} VND`}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
              Nhập mã PIN ví tài khoản (hoặc 123456) <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              maxLength={6}
              required
              placeholder="••••••"
              value={usePin}
              onChange={(e) => setUsePin(e.target.value)}
              className="w-full text-center text-xl font-mono tracking-widest px-3.5 py-2.5 rounded-xl border border-gray-300 focus:border-primary outline-hidden"
            />
          </div>

          <button
            type="submit"
            disabled={isProcessing || !isEnough || usePin.length < 4}
            className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm uppercase tracking-wide transition-all shadow-md disabled:opacity-50 cursor-pointer"
          >
            {isProcessing
              ? 'Đang trừ tiền ví...'
              : isEnough
                ? 'Xác nhận trừ ví & Xuất vé'
                : 'Số dư không đủ'}
          </button>
        </form>
      </div>
    </div>
  );
}
