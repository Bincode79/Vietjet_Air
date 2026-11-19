'use client';
import React, { useState } from 'react';
import { Icon } from '@/shared/components/ui';
import { MOVI_TENOR_OPTIONS } from '@/lib/movi';

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
  bookingCode: _bookingCode,
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
  const [otp, setOtp] = useState('');

  const monthlyAmount = Math.round(amount / tenor);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      setStep('otp');
    }, 800);
  };

  const handleOtp = (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      // Hồ sơ đi kèm lệnh ghi nhận thanh toán — trước đây cổng này gửi
      // `method: 'movi'` mà không kèm hồ sơ, nên server không lưu được CCCD,
      // ngày sinh, số điện thoại và kỳ hạn (xem `movi_credit_applications`).
      onSuccess({
        movi: {
          fullName: fullName.trim(),
          birthDate: birthDate.trim(),
          nationalId: nationalId.replace(/\D/g, ''),
          phone: phone.trim(),
          tenor,
        },
      });
    }, 1000);
  };

  return (
    <div className="max-w-xl mx-auto py-6 px-4">
      <div className="bg-white rounded-3xl border border-vj-border-light/90 p-5 sm:p-8 shadow-vj-sm space-y-6">
        <div className="text-center space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold font-koho uppercase tracking-wider">
            <Icon name="DocumentTextIcon" size={16} />
            CỔNG BAY TRƯỚC TRẢ SAU • MOVI
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-vj-text font-koho">
            Trả chậm linh hoạt với MOVI
          </h2>
          <p className="text-xs sm:text-sm text-vj-gray">
            Duyệt hồ sơ nhanh chóng chỉ trong 3 phút, không cần chứng minh thu nhập
          </p>
        </div>

        {step === 'info' && (
          <form onSubmit={handleSubmit} className="space-y-4 font-koho">
            <div>
              <label className="block text-xs font-bold text-vj-text-dim uppercase mb-1">
                Chọn kỳ hạn thanh toán:
              </label>
              <div className="grid grid-cols-3 gap-3">
                {MOVI_TENOR_OPTIONS.map((m) => {
                  const isSelected = tenor === m;
                  const perMonth = Math.round(amount / m);
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setTenor(m)}
                      className={`p-3 rounded-vj border text-center transition-all cursor-pointer ${
                        isSelected
                          ? 'border-primary bg-red-50 text-primary shadow-xs ring-1 ring-primary'
                          : 'border-vj-border-light bg-white text-vj-text-strong'
                      }`}
                    >
                      <div className="text-sm font-black">{m} tháng</div>
                      <div className="text-3xs font-semibold mt-0.5">
                        {perMonth.toLocaleString('vi-VN')} đ/tháng
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="bg-amber-50/60 rounded-vj p-3.5 border border-amber-200 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-vj-text-strong">Tổng tiền vé:</span>
                <span className="font-bold">{amount.toLocaleString('vi-VN')} VND</span>
              </div>
              <div className="flex justify-between">
                <span className="text-vj-text-strong">Thanh toán mỗi tháng:</span>
                <span className="font-bold text-primary">
                  {monthlyAmount.toLocaleString('vi-VN')} VND
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-vj-text-strong">Lãi suất:</span>
                <span className="font-bold text-green-700">0% (Ưu đãi)</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-vj-text-dim uppercase mb-1">
                Họ và tên người đăng ký trả góp <span className="text-vj-red">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="NGUYEN VAN A"
                value={fullName}
                onChange={(e) => setFullName(e.target.value.toUpperCase())}
                className="w-full px-3.5 py-2.5 rounded-vj border border-vj-line text-sm focus:border-primary outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-vj-text-dim uppercase mb-1">
                Ngày sinh <span className="text-vj-red">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="DD/MM/YYYY"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-vj border border-vj-line font-mono text-sm focus:border-primary outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-vj-text-dim uppercase mb-1">
                Số CCCD / Hộ chiếu <span className="text-vj-red">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="001200000000"
                value={nationalId}
                onChange={(e) => setNationalId(e.target.value.replace(/\D/g, ''))}
                className="w-full px-3.5 py-2.5 rounded-vj border border-vj-line font-mono text-sm focus:border-primary outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-vj-text-dim uppercase mb-1">
                Số điện thoại đăng ký xét duyệt <span className="text-vj-red">*</span>
              </label>
              <input
                type="tel"
                required
                placeholder="0912345678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-vj border border-vj-line font-mono text-sm focus:border-primary outline-hidden"
              />
            </div>

            <button
              type="submit"
              disabled={isProcessing || !nationalId || !phone || !fullName || !birthDate}
              className="w-full mt-4 py-3.5 rounded-vj bg-primary hover:bg-primary-dark text-white font-black text-sm uppercase tracking-wide transition-all shadow-vj-md disabled:opacity-50 cursor-pointer"
            >
              {isProcessing ? 'Đang gửi hồ sơ duyệt...' : 'Xác nhận đăng ký trả góp'}
            </button>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={handleOtp} className="space-y-4 text-center font-koho">
            <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-700 flex items-center justify-center mx-auto">
              <Icon name="ChatBubbleBottomCenterTextIcon" size={28} />
            </div>
            <h3 className="font-bold text-vj-text text-base">Xác nhận hợp đồng điện tử MOVI</h3>
            <p className="text-xs text-vj-gray">
              Mã OTP xác thực ký hợp đồng đã được gửi đến số điện thoại {phone}.
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
              {isProcessing ? 'Đang kích hoạt vé...' : 'Ký hợp đồng & Hoàn tất'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
