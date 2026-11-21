'use client';
import React, { useState } from 'react';
import { Icon } from '@/shared/components/ui';
import { MOVI_TENOR_OPTIONS } from '@/lib/movi';
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
}

export default function MoviGatewayContent({
  bookingId: _bookingId,
  bookingCode,
  amount,
  onSuccess,
}: Props) {
  const [tenor, setTenor] = useState<number>(3);
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
    <div className="max-w-xl mx-auto py-6 px-4 font-koho text-vj-text">
      <div className="bg-white rounded-3xl border border-vj-border-light shadow-vj-sm p-5 sm:p-8 space-y-6">
        {/* Top Header with Brand Logo & Stepper */}
        <div className="text-center space-y-3">
          <div className="flex items-center justify-center gap-2">
            <MoviLogo className="h-7 w-auto" />
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold uppercase tracking-wider">
              <Icon name="DocumentTextIcon" size={14} />
              {step === 'info' ? 'Cổng Bay Trước Trả Sau • MOVI' : 'Xác Nhận Hợp Đồng • MOVI'}
            </span>
          </div>

          <div>
            <h2 className="text-xl sm:text-2xl font-black text-vj-text">
              {step === 'info' ? 'Trả chậm linh hoạt với MOVI' : 'Xác nhận khoản vay & Đặt chỗ'}
            </h2>
            <p className="text-xs sm:text-sm text-vj-gray mt-1">
              {step === 'info'
                ? 'Duyệt hồ sơ nhanh chóng chỉ trong 3 phút, không cần chứng minh thu nhập'
                : 'Vui lòng kiểm tra lại thông tin hồ sơ trả góp trước khi hoàn tất đặt vé'}
            </p>
          </div>

          {/* Stepper Progress */}
          <div className="flex items-center justify-center gap-2 pt-1">
            <div
              className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full transition-all ${
                step === 'info'
                  ? 'bg-primary text-white shadow-xs'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              }`}
            >
              <span>{step === 'info' ? '1' : '✓'}</span>
              <span>1. Điền hồ sơ</span>
            </div>
            <div className="w-6 h-0.5 bg-gray-200" />
            <div
              className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full transition-all ${
                step === 'otp'
                  ? 'bg-primary text-white shadow-xs'
                  : 'bg-gray-100 text-gray-400'
              }`}
            >
              <span>2</span>
              <span>2. Xác nhận khoản vay</span>
            </div>
          </div>
        </div>

        {step === 'info' && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Tenor Selection */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-vj-text uppercase tracking-wide">
                  Chọn kỳ hạn thanh toán:
                </label>
                <span className="text-3xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Lãi suất 0% ưu đãi
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {MOVI_TENOR_OPTIONS.map((m) => {
                  const isSelected = tenor === m;
                  const perMonth = Math.round(amount / m);
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setTenor(m)}
                      className={`p-3 rounded-2xl border text-center transition-all cursor-pointer ${
                        isSelected
                          ? 'border-primary bg-red-50/60 text-primary shadow-xs ring-1 ring-primary'
                          : 'border-vj-border-light bg-white hover:bg-slate-50 text-vj-text'
                      }`}
                    >
                      <div className="text-sm font-black">{m} tháng</div>
                      <div className="text-3xs font-semibold mt-0.5 text-vj-gray">
                        {perMonth.toLocaleString('vi-VN')} đ/tháng
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Financial Calculation Breakdown */}
            <div className="bg-amber-50/70 rounded-2xl p-4 border border-amber-200/80 text-xs space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-vj-gray font-medium">Tổng tiền vé:</span>
                <span className="font-bold text-vj-text">{amount.toLocaleString('vi-VN')} VND</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-vj-gray font-medium">Thanh toán mỗi tháng:</span>
                <span className="font-black text-primary text-sm">
                  {monthlyAmount.toLocaleString('vi-VN')} VND
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-vj-gray font-medium">Lãi suất:</span>
                <span className="font-bold text-emerald-700">0% (Chương trình ưu đãi Vietjet)</span>
              </div>
            </div>

            {/* Form Fields */}
            <div className="space-y-3.5 pt-1">
              <div>
                <label className="block text-xs font-bold text-vj-text uppercase tracking-wide mb-1">
                  Họ và tên người đăng ký trả góp <span className="text-vj-red">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="NGUYEN VAN A"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value.toUpperCase())}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-vj-line text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all bg-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-vj-text uppercase tracking-wide mb-1">
                    Ngày sinh <span className="text-vj-red">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="DD/MM/YYYY"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-vj-line font-mono text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-vj-text uppercase tracking-wide mb-1">
                    Số điện thoại xét duyệt <span className="text-vj-red">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="0912345678"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-vj-line font-mono text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-vj-text uppercase tracking-wide mb-1">
                  Số CCCD / Hộ chiếu <span className="text-vj-red">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="001200000000"
                  value={nationalId}
                  onChange={(e) => setNationalId(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-vj-line font-mono text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all bg-white"
                />
              </div>
            </div>

            {/* Trust highlights */}
            <div className="grid grid-cols-3 gap-2 py-1 text-center text-3xs text-vj-gray">
              <div className="flex flex-col items-center gap-1 p-2 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-base">⚡</span>
                <span className="font-semibold text-vj-text">Duyệt 3 phút</span>
                <span>Tự động 24/7</span>
              </div>
              <div className="flex flex-col items-center gap-1 p-2 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-base">🛡️</span>
                <span className="font-semibold text-vj-text">Bảo mật</span>
                <span>Chuẩn PCI-DSS</span>
              </div>
              <div className="flex flex-col items-center gap-1 p-2 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-base">0️⃣</span>
                <span className="font-semibold text-vj-text">Lãi suất 0%</span>
                <span>Không phí ẩn</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={isProcessing || !nationalId || !phone || !fullName || !birthDate}
              className="w-full mt-2 py-3.5 rounded-xl bg-primary hover:bg-primary-dark text-white font-black text-sm uppercase tracking-wide transition-all shadow-vj-md disabled:opacity-50 cursor-pointer"
            >
              {isProcessing ? 'Đang gửi hồ sơ duyệt...' : 'Tiếp tục: Xác nhận hồ sơ khoản vay'}
            </button>
          </form>
        )}

        {step === 'otp' && (
          <div className="space-y-4">
            {/* Booking & Loan Summary Card */}
            <div className="bg-slate-50/90 rounded-2xl p-5 space-y-3.5 border border-vj-border-light text-sm">
              <div className="flex justify-between items-center pb-2 border-b border-vj-border-light">
                <div className="flex items-center gap-2">
                  <span className="text-vj-gray font-semibold text-xs">Mã đặt chỗ:</span>
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
                  <span className="text-vj-gray">Tổng tiền vé:</span>
                  <span className="font-bold text-vj-text">{amount.toLocaleString('vi-VN')} VND</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-vj-gray">Kỳ hạn trả chậm:</span>
                  <span className="font-bold text-vj-text">{tenor} tháng</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-vj-gray">Thanh toán mỗi tháng:</span>
                  <span className="font-black text-primary text-base">
                    {monthlyAmount.toLocaleString('vi-VN')} VND
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-vj-gray">Lãi suất áp dụng:</span>
                  <span className="font-bold text-emerald-700">0% (Ưu đãi đặc biệt)</span>
                </div>
              </div>

              <div className="border-t border-dashed border-vj-border-light pt-2.5 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-vj-gray">Người đứng tên khoản vay:</span>
                  <span className="font-bold text-vj-text">{fullName || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-vj-gray">Số CCCD / Hộ chiếu:</span>
                  <span className="font-mono font-bold text-vj-text">{nationalId || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-vj-gray">Số điện thoại:</span>
                  <span className="font-mono font-bold text-vj-text">{phone || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-vj-gray">Ngày sinh:</span>
                  <span className="font-mono font-bold text-vj-text">{birthDate || '—'}</span>
                </div>
              </div>
            </div>

            {/* Hold & Security Notice */}
            <div className="bg-amber-50/70 rounded-2xl p-3.5 border border-amber-200/80 text-xs text-amber-900 flex items-start gap-2.5">
              <Icon name="ClockIcon" size={18} className="shrink-0 text-amber-600 mt-0.5" />
              <div className="leading-relaxed">
                Vé của bạn được giữ chỗ an toàn trong vòng <strong>30 phút</strong>. Vui lòng bấm xác nhận để hoàn tất thủ tục cấp tín dụng và xuất vé điện tử cùng Bay trước - Trả sau MOVI!
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isProcessing}
                className="w-full py-3.5 bg-primary hover:bg-primary-dark text-white rounded-xl font-black text-sm uppercase tracking-wide transition-all shadow-vj-md cursor-pointer disabled:opacity-50"
              >
                {isProcessing ? 'Đang hoàn tất thanh toán...' : 'Xác nhận & Hoàn tất'}
              </button>

              <button
                type="button"
                onClick={() => setStep('info')}
                disabled={isProcessing}
                className="w-full py-2 text-center text-xs font-semibold text-vj-gray hover:text-primary transition-colors cursor-pointer"
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
