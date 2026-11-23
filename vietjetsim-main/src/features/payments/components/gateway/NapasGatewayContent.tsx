'use client';
import React, { useState } from 'react';
import { Icon } from '@/shared/components/ui';

interface Props {
  bookingId: string;
  bookingCode?: string;
  amount: number;
  onSuccess: () => void;
}

const DOMESTIC_BANKS = [
  { id: 'VCB', name: 'Vietcombank', code: '970436' },
  { id: 'CTG', name: 'VietinBank', code: '970415' },
  { id: 'BIDV', name: 'BIDV', code: '970418' },
  { id: 'TCB', name: 'Techcombank', code: '970407' },
  { id: 'MB', name: 'MBBank', code: '970422' },
  { id: 'ACB', name: 'ACB', code: '970416' },
  { id: 'VPB', name: 'VPBank', code: '970432' },
  { id: 'VIB', name: 'VIB', code: '970406' },
  { id: 'HDB', name: 'HDBank', code: '970437' },
  { id: 'TPB', name: 'TPBank', code: '970423' },
  { id: 'STB', name: 'Sacombank', code: '970403' },
  { id: 'SHB', name: 'SHB', code: '970443' },
];

export default function NapasGatewayContent({
  bookingId: _bookingId,
  bookingCode: _bookingCode,
  amount,
  onSuccess,
}: Props) {
  const [selectedBank, setSelectedBank] = useState<string>('VCB');
  const [cardNumber, setCardNumber] = useState('');
  const [cardHolder, setCardHolder] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [step, setStep] = useState<'bank' | 'card' | 'otp'>('bank');
  const [otp, setOtp] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const bankInfo = DOMESTIC_BANKS.find((b) => b.id === selectedBank) || DOMESTIC_BANKS[0];

  const handleCardSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      setStep('otp');
    }, 800);
  };

  const handleOtpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      onSuccess();
    }, 1000);
  };

  return (
    <div className="max-w-xl mx-auto py-6 px-4">
      <div className="bg-white rounded-3xl border border-vj-border-light/90 p-5 sm:p-8 shadow-vj-sm space-y-6">
        <div className="text-center space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold font-koho uppercase tracking-wider">
            <Icon name="BuildingLibraryIcon" size={16} />
            CỔNG THANH TOÁN THẺ NỘI ĐỊA • NAPAS
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-vj-text font-koho">
            Thẻ ATM / Internet Banking nội địa
          </h2>
          <p className="text-xs sm:text-sm text-vj-gray">
            Hỗ trợ 40+ ngân hàng Việt Nam qua liên minh thanh toán Napas
          </p>
        </div>

        {step === 'bank' && (
          <div className="space-y-4">
            <label className="block text-xs font-bold text-vj-text-dim font-koho">
              1. Chọn ngân hàng phát hành thẻ:
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
              {DOMESTIC_BANKS.map((b) => {
                const isSelected = selectedBank === b.id;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setSelectedBank(b.id)}
                    className={`p-3 rounded-vj border text-center transition-all cursor-pointer font-bold text-xs font-koho ${
                      isSelected
                        ? 'border-primary bg-red-50 text-primary shadow-xs'
                        : 'border-vj-border-light hover:border-vj-line bg-white text-vj-text-strong'
                    }`}
                  >
                    <div className="text-sm font-black">{b.id}</div>
                    <div className="text-3xs text-vj-gray truncate mt-0.5">{b.name}</div>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setStep('card')}
              className="w-full mt-4 py-3.5 rounded-vj bg-primary hover:bg-primary-dark text-white font-black text-sm uppercase tracking-wide transition-all shadow-vj-md cursor-pointer"
            >
              Tiếp tục với {bankInfo.name}
            </button>
          </div>
        )}

        {step === 'card' && (
          <form onSubmit={handleCardSubmit} className="space-y-4 font-koho">
            <div className="flex items-center justify-between pb-2 border-b">
              <span className="text-xs font-bold text-vj-text-dim">Ngân hàng đã chọn:</span>
              <button
                type="button"
                onClick={() => setStep('bank')}
                className="text-xs text-primary font-bold hover:underline cursor-pointer"
              >
                {bankInfo.name} (Đổi)
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-vj-text-dim mb-1">
                Số thẻ ATM (in trên mặt trước thẻ) <span className="text-vj-red">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="9704 ...."
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-vj border border-vj-line font-mono text-sm focus:border-primary outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-vj-text-dim mb-1">
                Tên chủ thẻ (không dấu) <span className="text-vj-red">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="NGUYEN VAN A"
                value={cardHolder}
                onChange={(e) => setCardHolder(e.target.value.toUpperCase())}
                className="w-full px-3.5 py-2.5 rounded-vj border border-vj-line uppercase text-sm focus:border-primary outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-vj-text-dim mb-1">
                Ngày phát hành / Ngày hết hạn (MM/YY) <span className="text-vj-red">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="MM/YY"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-vj border border-vj-line font-mono text-sm focus:border-primary outline-hidden"
              />
            </div>

            <button
              type="submit"
              disabled={isProcessing || !cardNumber || !cardHolder}
              className="w-full mt-4 py-3.5 rounded-vj bg-primary hover:bg-primary-dark text-white font-black text-sm uppercase tracking-wide transition-all shadow-vj-md disabled:opacity-50 cursor-pointer"
            >
              {isProcessing
                ? 'Đang xác thực thông tin...'
                : `Thanh toán ${amount.toLocaleString('vi-VN')} VND`}
            </button>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={handleOtpSubmit} className="space-y-4 text-center font-koho">
            <div className="w-12 h-12 rounded-full bg-blue-50 text-vj-blue flex items-center justify-center mx-auto">
              <Icon name="DevicePhoneMobileIcon" size={28} />
            </div>
            <h3 className="font-bold text-vj-text text-base">Xác nhận mã OTP từ {bankInfo.id}</h3>
            <p className="text-xs text-vj-gray">
              Nhập mã OTP đã được gửi về số điện thoại đăng ký Smart OTP / SMS OTP của bạn.
            </p>
            <input
              type="text"
              maxLength={6}
              required
              placeholder="123456"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              className="w-full text-center text-xl font-mono font-black tracking-widest px-3 py-2 border rounded-vj"
            />
            <button
              type="submit"
              disabled={isProcessing}
              className="w-full py-3 bg-primary hover:bg-primary-dark text-white rounded-vj font-bold text-sm cursor-pointer"
            >
              {isProcessing ? 'Đang quyết toán...' : 'Xác thực & Hoàn tất'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
