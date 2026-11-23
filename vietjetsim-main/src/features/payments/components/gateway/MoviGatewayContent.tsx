'use client';
import React, { useState } from 'react';
import { Icon } from '@/shared/components/ui';
import { MoviLogo } from '@/features/payments/components/PaymentMethodLogos';

/** Hồ sơ tín dụng mà cổng MOVI thu thập rồi chuyển cho API thanh toán. */
export interface MoviGatewayApplication {
  fullName: string;
  birthDate: string;
  nationalId: string;
  phone: string;
  tenor: number;
}

interface Props {
  bookingId: string;
  bookingCode?: string;
  amount: number;
  onSuccess: (payload: { movi: MoviGatewayApplication }) => void;
  onBack?: () => void;
}

export default function MoviGatewayContent({
  bookingId: _bookingId,
  bookingCode,
  amount,
  onSuccess,
  onBack,
}: Props) {
  const tenor = 3;
  const [fullName, setFullName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [phone, setPhone] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [step, setStep] = useState<'info' | 'otp'>('info');

  const monthlyAmount = Math.round(amount / tenor);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      setStep('otp');
    }, 600);
  };

  const handleConfirm = () => {
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      onSuccess({
        movi: {
          fullName: fullName.trim(),
          birthDate: birthDate.trim(),
          nationalId: nationalId.replace(/\D/g, ''),
          phone: phone.trim(),
          tenor,
        },
      });
    }, 800);
  };

  return (
    <div className="max-w-lg mx-auto py-4 px-3 font-koho text-vj-text">
      <div className="bg-white rounded-2xl border border-vj-border-light shadow-vj-sm p-4 sm:p-6 space-y-4">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline transition-colors cursor-pointer"
          >
            <Icon name="ArrowLeftIcon" size={14} /> Quay lại chọn phương thức
          </button>
        )}

        {/* Top Header with Brand Logo & Stepper */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <MoviLogo className="h-6 w-auto" />
          </div>

          <div>
            <div className="text-3xs uppercase tracking-wider font-bold text-gray-500 mb-0.5">
              CỔNG BAY TRƯỚC TRẢ SAU
            </div>
            <h2 className="text-lg sm:text-xl font-black text-vj-text">
              {step === 'info' ? 'Trả chậm linh hoạt với MOVI' : 'Xác nhận khoản vay & Đặt chỗ'}
            </h2>
            <p className="text-xs sm:text-sm text-vj-text mt-1">
              {step === 'info'
                ? 'Duyệt hồ sơ nhanh chóng chỉ trong 3 phút, không cần chứng minh thu nhập'
                : 'Vui lòng kiểm tra lại thông tin hồ sơ trả góp trước khi hoàn tất đặt vé'}
            </p>
          </div>
        </div>

        {step === 'info' && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Financial Calculation Breakdown */}
            <div className="bg-amber-50/70 rounded-2xl p-4 border border-amber-200/80 text-xs space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-vj-text font-medium">Tổng tiền vé:</span>
                <span className="font-bold text-vj-text">{amount.toLocaleString('vi-VN')} VND</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-vj-text font-medium">Thanh toán mỗi tháng:</span>
                <span className="font-black text-primary text-sm">
                  {monthlyAmount.toLocaleString('vi-VN')} VND
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-vj-text font-medium">Lãi suất:</span>
                <span className="font-bold text-emerald-700">0% (Chương trình ưu đãi Vietjet)</span>
              </div>
            </div>

            {/* Form Fields */}
            <div className="space-y-3.5 pt-1">
              <div>
                <label className="block text-xs font-bold text-vj-text tracking-wide mb-1">
                  Họ và tên người đăng ký trả góp <span className="text-vj-red">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Nhập họ và tên"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-vj-line font-koho font-bold text-sm text-gray-900 placeholder:text-gray-400 placeholder:font-normal focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all bg-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-vj-text tracking-wide mb-1">
                    Ngày sinh <span className="text-vj-red">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="dd/mm/yyyy"
                    value={birthDate}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, '').slice(0, 8);
                      let formatted = digits;
                      if (digits.length > 4)
                        formatted =
                          digits.slice(0, 2) + '/' + digits.slice(2, 4) + '/' + digits.slice(4);
                      else if (digits.length > 2)
                        formatted = digits.slice(0, 2) + '/' + digits.slice(2);
                      setBirthDate(formatted);
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-vj-line font-koho font-bold text-sm text-gray-900 placeholder:text-gray-400 placeholder:font-normal focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-vj-text tracking-wide mb-1">
                    Số điện thoại xét duyệt <span className="text-vj-red">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="Nhập số điện thoại"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value.replace(/\D/g, '').slice(0, 10));
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-vj-line font-koho font-bold text-sm text-gray-900 placeholder:text-gray-400 placeholder:font-normal focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-vj-text tracking-wide mb-1">
                  Số CCCD / Hộ chiếu <span className="text-vj-red">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Nhập số CCCD / hộ chiếu"
                  value={nationalId}
                  onChange={(e) => {
                    setNationalId(e.target.value.replace(/\D/g, '').slice(0, 12));
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-vj-line font-koho font-bold text-sm text-gray-900 placeholder:text-gray-400 placeholder:font-normal focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all bg-white"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isProcessing || !nationalId || !phone || !fullName || !birthDate}
              className="w-full mt-2 py-2.5 rounded-xl bg-gradient-to-b from-amber-300 via-yellow-400 to-amber-500 hover:from-amber-200 hover:via-yellow-300 hover:to-amber-400 text-black font-bold text-xs uppercase tracking-wide transition-all shadow-sm border border-amber-600/30 cursor-pointer disabled:opacity-50"
            >
              {isProcessing ? 'Đang gửi hồ sơ duyệt...' : 'Tiếp Tục'}
            </button>
          </form>
        )}

        {step === 'otp' && (
          <div className="space-y-4">
            {/* Booking & Loan Summary Card */}
            <div className="bg-slate-50/90 rounded-2xl p-4 space-y-3 border border-vj-border-light text-sm">
              <div className="flex justify-between items-center pb-2 border-b border-vj-border-light">
                <div className="flex items-center gap-2">
                  <span className="text-vj-text font-semibold text-xs">Mã đặt chỗ:</span>
                  <span className="font-mono font-black text-primary bg-red-100/70 border border-red-200 px-2 py-0.5 rounded text-xs">
                    {bookingCode || '—'}
                  </span>
                </div>
                <div className="text-xs font-bold text-vj-text flex items-center gap-1">
                  <span>Hãng bay:</span>
                  <span className="text-primary font-black">Vietjet Air</span>
                </div>
              </div>

              {/* Installment Plan Breakdown */}
              <div className="space-y-2 py-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-vj-text">Tổng tiền vé:</span>
                  <span className="font-bold text-vj-text">
                    {amount.toLocaleString('vi-VN')} VND
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-vj-text">Kỳ hạn trả chậm:</span>
                  <span className="font-bold text-vj-text">{tenor} tháng</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-vj-text">Thanh toán mỗi tháng:</span>
                  <span className="font-black text-primary text-base">
                    {monthlyAmount.toLocaleString('vi-VN')} VND
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-vj-text">Lãi suất áp dụng:</span>
                  <span className="font-bold text-emerald-700">0% (Ưu đãi đặc biệt)</span>
                </div>
              </div>

              <div className="border-t border-dashed border-vj-border-light pt-2.5 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-vj-text">Người đứng tên khoản vay:</span>
                  <span className="font-bold text-vj-text">{fullName || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-vj-text">Số CCCD / Hộ chiếu:</span>
                  <span className="font-mono font-bold text-vj-text">{nationalId || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-vj-text">Số điện thoại:</span>
                  <span className="font-mono font-bold text-vj-text">{phone || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-vj-text">Ngày sinh:</span>
                  <span className="font-mono font-bold text-vj-text">{birthDate || '—'}</span>
                </div>
              </div>
            </div>

            {/* Hold & Security Notice */}
            <div className="bg-primary/10 rounded-2xl p-3 border border-primary/20 text-xs text-primary flex items-start gap-2">
              <Icon name="ClockIcon" size={18} className="shrink-0 text-primary mt-0.5" />
              <div className="leading-relaxed">
                Vé của bạn được giữ chỗ an toàn trong vòng <strong>30 phút</strong>. Vui lòng bấm
                xác nhận để hoàn tất thủ tục cấp tín dụng và xuất vé điện tử cùng Bay trước - Trả
                sau MOVI!
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isProcessing}
                className="w-full py-2.5 bg-primary hover:bg-primary-dark text-white rounded-xl font-bold text-xs uppercase tracking-wide transition-all shadow-sm cursor-pointer disabled:opacity-50"
              >
                {isProcessing ? 'Đang hoàn tất thanh toán...' : 'Xác nhận & Hoàn tất'}
              </button>

              <button
                type="button"
                onClick={() => setStep('info')}
                disabled={isProcessing}
                className="w-full py-2 text-center text-xs font-semibold text-vj-text hover:text-primary transition-colors cursor-pointer"
              >
                ← Quay lại chỉnh sửa thông tin hồ sơ
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
