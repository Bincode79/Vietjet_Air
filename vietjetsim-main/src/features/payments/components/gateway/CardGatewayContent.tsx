'use client';
import React, { useState } from 'react';
import { Icon } from '@/shared/components/ui';

interface Props {
  bookingId: string;
  bookingCode?: string;
  amount: number;
  onSuccess: () => void;
}

export default function CardGatewayContent({
  bookingId: _bookingId,
  bookingCode: _bookingCode,
  amount,
  onSuccess,
}: Props) {
  const [cardNumber, setCardNumber] = useState('');
  const [cardHolder, setCardHolder] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otp, setOtp] = useState('');
  const [cardBrand, setCardBrand] = useState<'visa' | 'mastercard' | 'jcb' | 'amex' | 'generic'>(
    'generic'
  );

  const handleCardNumberChange = (val: string) => {
    const raw = val.replace(/\D/g, '').slice(0, 16);
    const formatted = raw.replace(/(\d{4})(?=\d)/g, '$1 ');
    setCardNumber(formatted);

    if (raw.startsWith('4')) setCardBrand('visa');
    else if (/^(5[1-5]|2[2-7])/.test(raw)) setCardBrand('mastercard');
    else if (/^(352[89]|35[3-8][0-9])/.test(raw)) setCardBrand('jcb');
    else if (/^3[47]/.test(raw)) setCardBrand('amex');
    else setCardBrand('generic');
  };

  const handleExpiryChange = (val: string) => {
    const raw = val.replace(/\D/g, '').slice(0, 4);
    if (raw.length >= 2) {
      setExpiry(`${raw.slice(0, 2)}/${raw.slice(2)}`);
    } else {
      setExpiry(raw);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      setShowOtpModal(true);
    }, 800);
  };

  const handleVerifyOtp = () => {
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      setShowOtpModal(false);
      onSuccess();
    }, 1000);
  };

  return (
    <div className="max-w-xl mx-auto py-6 px-4">
      <div className="bg-white rounded-3xl border border-gray-200/90 p-5 sm:p-8 shadow-sm space-y-6">
        {/* Title */}
        <div className="text-center space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-50 border border-red-200 text-primary text-xs font-bold font-koho uppercase tracking-wider">
            <Icon name="CreditCardIcon" size={16} />
            CỔNG THANH TOÁN THẺ QUỐC TẾ • 3D SECURE
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-gray-900 font-koho">
            Thẻ tín dụng / Ghi nợ quốc tế
          </h2>
          <p className="text-xs sm:text-sm text-gray-500">
            Hỗ trợ Visa, MasterCard, JCB, American Express bảo mật cao
          </p>
        </div>

        {/* Card Mockup Visual */}
        <div className="rounded-2xl bg-gradient-to-tr from-gray-900 via-gray-800 to-gray-700 text-white p-5 shadow-lg relative overflow-hidden">
          <div className="flex justify-between items-start mb-6">
            <div className="w-10 h-7 rounded bg-amber-400/80 border border-amber-300 flex items-center justify-center text-3xs font-black text-amber-950">
              CHIP
            </div>
            <div className="text-right text-xs font-extrabold uppercase tracking-widest text-white/90">
              {cardBrand.toUpperCase()}
            </div>
          </div>
          <div className="font-mono text-lg sm:text-xl font-bold tracking-widest mb-4">
            {cardNumber || '•••• •••• •••• ••••'}
          </div>
          <div className="flex justify-between text-2xs uppercase text-gray-300 font-koho">
            <div>
              <span className="block text-3xs text-gray-400">Chủ thẻ</span>
              <span className="font-bold text-white text-xs">{cardHolder || 'TEN CHU THE'}</span>
            </div>
            <div className="text-right">
              <span className="block text-3xs text-gray-400">Hết hạn</span>
              <span className="font-bold text-white text-xs">{expiry || 'MM/YY'}</span>
            </div>
          </div>
        </div>

        {/* Card Form */}
        <form onSubmit={handleSubmit} className="space-y-4 font-koho">
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
              Số thẻ <span className="text-red-500">*</span>
            </label>
            <input
              id="cardNumber"
              type="text"
              required
              placeholder="4111 2222 3333 4444"
              value={cardNumber}
              onChange={(e) => handleCardNumberChange(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 font-mono text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
              Tên in trên thẻ (không dấu) <span className="text-red-500">*</span>
            </label>
            <input
              id="cardName"
              type="text"
              required
              placeholder="NGUYEN VAN A"
              value={cardHolder}
              onChange={(e) => setCardHolder(e.target.value.toUpperCase())}
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 font-sans uppercase text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-hidden"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                Ngày hết hạn (MM/YY) <span className="text-red-500">*</span>
              </label>
              <input
                id="cardExpiry"
                type="text"
                required
                placeholder="12/28"
                value={expiry}
                onChange={(e) => handleExpiryChange(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 font-mono text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-hidden"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                CVV / CVC <span className="text-red-500">*</span>
              </label>
              <input
                id="cardCvv"
                type="password"
                maxLength={4}
                required
                placeholder="•••"
                value={cvv}
                onChange={(e) => setCvv(e.target.value.replace(/\D/g, ''))}
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 font-mono text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-hidden"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isProcessing || cardNumber.length < 16}
            className="w-full mt-4 py-3.5 rounded-xl bg-gradient-to-r from-red-600 to-primary hover:from-red-700 hover:to-primary-dark text-white font-black text-sm uppercase tracking-wide transition-all shadow-md disabled:opacity-50 cursor-pointer"
          >
            {isProcessing
              ? 'Đang kết nối cổng thẻ...'
              : `Thanh toán ${amount.toLocaleString('vi-VN')} VND`}
          </button>
        </form>

        {/* 3D-Secure OTP Simulation Modal */}
        {showOtpModal && (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4 text-center animate-scaleIn">
              <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
                <Icon name="ShieldCheckIcon" size={28} />
              </div>
              <h3 className="font-bold text-gray-900 text-base font-koho">
                Xác thực 3D Secure OTP
              </h3>
              <p className="text-xs text-gray-500">
                Mã OTP xác nhận giao dịch đã được gửi đến số điện thoại đăng ký của chủ thẻ.
              </p>
              <input
                type="text"
                maxLength={6}
                placeholder="Nhập 6 số OTP (hoặc 123456)"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                className="w-full text-center text-lg tracking-widest font-mono font-bold px-3 py-2 border rounded-xl"
              />
              <button
                type="button"
                onClick={handleVerifyOtp}
                className="w-full py-2.5 bg-primary text-white rounded-xl font-bold text-sm cursor-pointer hover:bg-primary-dark"
              >
                Xác nhận thanh toán
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
