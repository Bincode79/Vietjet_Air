'use client';
import React, { useState } from 'react';
import { Icon } from '@/shared/components/ui';

interface Props {
  bookingId: string;
  bookingCode?: string;
  amount: number;
  onSuccess: () => void;
}

const WALLETS = [
  { id: 'momo', name: 'Ví MoMo', color: 'bg-pink-600', badge: 'Khuyên dùng' },
  { id: 'zalopay', name: 'ZaloPay', color: 'bg-blue-600', badge: 'Ưu đãi 20k' },
  { id: 'shopeepay', name: 'ShopeePay', color: 'bg-orange-600', badge: 'Miễn phí' },
];

export default function EWalletGatewayContent({
  bookingId: _bookingId,
  bookingCode: _bookingCode,
  amount,
  onSuccess,
}: Props) {
  const [selectedWallet, setSelectedWallet] = useState('momo');
  const [isProcessing, setIsProcessing] = useState(false);

  const wallet = WALLETS.find((w) => w.id === selectedWallet) || WALLETS[0];

  const handleSimulateAppPay = () => {
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      onSuccess();
    }, 1200);
  };

  return (
    <div className="max-w-xl mx-auto py-6 px-4">
      <div className="bg-white rounded-3xl border border-vj-border-light/90 p-5 sm:p-8 shadow-vj-sm space-y-6">
        <div className="text-center space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-pink-50 border border-pink-200 text-pink-700 text-xs font-bold font-koho uppercase tracking-wider">
            <Icon name="DevicePhoneMobileIcon" size={16} />
            CỔNG THANH TOÁN VÍ ĐIỆN TỬ
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-vj-text font-koho">
            Thanh toán qua Ví điện tử
          </h2>
          <p className="text-xs sm:text-sm text-vj-gray">
            Quét mã QR hoặc mở trực tiếp trên App điện thoại
          </p>
        </div>

        {/* Wallet Picker */}
        <div className="grid grid-cols-3 gap-3">
          {WALLETS.map((w) => {
            const isSelected = selectedWallet === w.id;
            return (
              <button
                key={w.id}
                type="button"
                onClick={() => setSelectedWallet(w.id)}
                className={`p-3.5 rounded-2xl border text-center transition-all cursor-pointer font-koho relative ${
                  isSelected
                    ? 'border-primary bg-red-50 text-primary shadow-xs ring-1 ring-primary'
                    : 'border-vj-border-light hover:border-vj-line bg-white text-vj-text-strong'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-full ${w.color} text-white font-black text-xs flex items-center justify-center mx-auto mb-1.5 shadow-xs`}
                >
                  {w.name[0]}
                </div>
                <div className="text-xs font-bold">{w.name}</div>
                {w.badge && (
                  <span className="text-4xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-extrabold block mt-1">
                    {w.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Simulation Scan Box */}
        <div className="bg-vj-surface-2 border border-vj-border-light rounded-2xl p-6 text-center space-y-4">
          <div className="w-48 h-48 bg-white border border-vj-line rounded-vj p-3 mx-auto shadow-vj-sm flex flex-col items-center justify-center">
            <div className="w-full h-full border-2 border-dashed border-vj-line rounded-vj flex flex-col items-center justify-center text-vj-muted">
              <Icon name="QrCodeIcon" size={80} className="text-vj-text-dim" />
              <span className="text-3xs font-bold mt-2 uppercase text-vj-text-strong font-koho">
                QR {wallet.name}
              </span>
            </div>
          </div>
          <div className="text-xs font-bold text-vj-text-dim font-koho">
            Số tiền:{' '}
            <span className="text-primary font-black text-sm">
              {amount.toLocaleString('vi-VN')} VND
            </span>
          </div>

          <button
            type="button"
            onClick={handleSimulateAppPay}
            disabled={isProcessing}
            className="w-full py-3 bg-gradient-to-r from-red-600 to-primary hover:from-red-700 hover:to-primary-dark text-white rounded-vj font-bold text-sm cursor-pointer shadow-vj-md"
          >
            {isProcessing ? 'Đang xác thực ví...' : `Mở ứng dụng ${wallet.name} để thanh toán`}
          </button>
        </div>
      </div>
    </div>
  );
}
