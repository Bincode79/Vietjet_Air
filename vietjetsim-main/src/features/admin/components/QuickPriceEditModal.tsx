'use client';
import React, { useState, useEffect } from 'react';
import { Icon } from '@/shared/components/ui';
import { updateAdminFlight } from '@/features/admin';
import { getApiErrorMessage } from '@/shared/services';

interface ToastAPI {
  success: (title: string, message?: string, options?: object) => void;
  error: (title: string, message?: string, options?: object) => void;
  warning?: (title: string, message?: string, options?: object) => void;
  info?: (title: string, message?: string, options?: object) => void;
}

export interface QuickPricingTargetFlight {
  id: string;
  flightNo: string;
  from: string;
  to: string;
  date?: string;
  departTime?: string;
  arriveTime?: string;
  economyPrice?: number;
  businessPrice?: number;
  price?: number;
}

interface QuickPriceEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  flight: QuickPricingTargetFlight | null;
  onSuccess?: (updated: { id: string; economy_price: number; business_price: number }) => void;
  onToast?: ToastAPI;
}

const FARE_LADDER_RATIO = 2.77;

const QUICK_ECO_PRESETS = [
  { label: '0đ (KM)', value: 0 },
  { label: '99k', value: 99000 },
  { label: '199k', value: 199000 },
  { label: '399k', value: 399000 },
  { label: '499k', value: 499000 },
  { label: '699k', value: 699000 },
  { label: '899k', value: 899000 },
  { label: '1.199k', value: 1199000 },
  { label: '1.499k', value: 1499000 },
  { label: '1.999k', value: 1999000 },
];

const DELTA_ADJUSTMENTS = [
  { label: '-100k', value: -100000 },
  { label: '-50k', value: -50000 },
  { label: '+50k', value: 50000 },
  { label: '+100k', value: 100000 },
  { label: '+200k', value: 200000 },
];

export default function QuickPriceEditModal({
  isOpen,
  onClose,
  flight,
  onSuccess,
  onToast,
}: QuickPriceEditModalProps) {
  const [economyPrice, setEconomyPrice] = useState<number>(499000);
  const [businessPrice, setBusinessPrice] = useState<number>(1382000);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (flight) {
      const eco = Number(flight.economyPrice || flight.price || 499000);
      const biz = Number(flight.businessPrice || Math.round(eco * FARE_LADDER_RATIO));
      setEconomyPrice(eco);
      setBusinessPrice(biz);
    }
  }, [flight]);

  if (!isOpen || !flight) return null;

  const handleEcoChange = (newEco: number) => {
    const validEco = Math.max(0, newEco);
    setEconomyPrice(validEco);
    setBusinessPrice(Math.round(validEco * FARE_LADDER_RATIO));
  };

  const handleDelta = (delta: number) => {
    handleEcoChange(economyPrice + delta);
  };

  const handleSave = async () => {
    if (economyPrice < 0 || businessPrice < 0) {
      onToast?.error('Lỗi nhập giá', 'Giá vé không được nhỏ hơn 0đ.');
      return;
    }
    if (businessPrice < economyPrice) {
      onToast?.error('Lỗi thang giá', 'Giá vé Thương gia phải cao hơn hoặc bằng vé Phổ thông.');
      return;
    }

    setIsSubmitting(true);
    try {
      await updateAdminFlight(flight.id, {
        economy_price: economyPrice,
        business_price: businessPrice,
        price: economyPrice,
      });

      onToast?.success(
        'Cập nhật giá vé nhanh thành công',
        `${flight.flightNo}: Eco ${economyPrice.toLocaleString('vi-VN')}₫ | Biz ${businessPrice.toLocaleString('vi-VN')}₫`
      );

      onSuccess?.({
        id: flight.id,
        economy_price: economyPrice,
        business_price: businessPrice,
      });
      onClose();
    } catch (err) {
      onToast?.error('Lỗi cập nhật giá vé', getApiErrorMessage(err, 'Vui lòng thử lại sau.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg text-white flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <Icon name="CurrencyDollarIcon" size={22} />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">Nhập giá vé nhanh ⚡</h3>
              <p className="text-xs text-vj-admin-muted mt-0.5">
                Chuyến bay <span className="text-amber-400 font-bold">{flight.flightNo}</span> ·{' '}
                {flight.from} ➔ {flight.to}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-white flex items-center justify-center transition-colors"
          >
            <Icon name="XMarkIcon" size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5 overflow-y-auto">
          {/* Flight Summary Badge */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-3.5 flex items-center justify-between text-xs">
            <div>
              <span className="text-vj-admin-muted">Hành trình:</span>{' '}
              <span className="font-bold text-white">
                {flight.from} ➔ {flight.to}
              </span>
            </div>
            {flight.date && (
              <div>
                <span className="text-vj-admin-muted">Ngày bay:</span>{' '}
                <span className="font-bold text-white">{flight.date}</span>
              </div>
            )}
            {flight.departTime && (
              <div>
                <span className="text-vj-admin-muted">Giờ bay:</span>{' '}
                <span className="font-bold text-white">{flight.departTime}</span>
              </div>
            )}
          </div>

          {/* Giá vé Eco (Phổ thông) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black text-amber-400 uppercase tracking-wider">
                Giá vé Phổ thông (Eco)
              </label>
              <span className="text-sm font-bold text-white">
                {economyPrice.toLocaleString('vi-VN')} ₫
              </span>
            </div>
            <div className="relative">
              <input
                type="number"
                min={0}
                step={1000}
                value={economyPrice}
                onChange={(e) => handleEcoChange(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-white/15 rounded-xl text-base font-bold text-white focus:outline-none focus:border-amber-400 transition-colors"
                placeholder="Nhập giá vé Phổ thông (VND)"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-vj-admin-muted">
                VND
              </span>
            </div>

            {/* Mức giá chọn nhanh */}
            <div>
              <div className="text-3xs text-vj-admin-muted font-bold uppercase tracking-wider mb-1.5">
                Mức giá chọn nhanh:
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {QUICK_ECO_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => handleEcoChange(preset.value)}
                    className={`px-2 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      economyPrice === preset.value
                        ? 'bg-amber-500 text-slate-950 shadow-vj-sm'
                        : 'bg-white/5 hover:bg-white/10 text-white/90 border border-white/10'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tăng / giảm nhanh */}
            <div>
              <div className="text-3xs text-vj-admin-muted font-bold uppercase tracking-wider mb-1.5">
                Tăng / Giảm nhanh:
              </div>
              <div className="flex items-center gap-1.5">
                {DELTA_ADJUSTMENTS.map((adj) => (
                  <button
                    key={adj.label}
                    type="button"
                    onClick={() => handleDelta(adj.value)}
                    className="flex-1 py-1 rounded-lg text-2xs font-semibold bg-white/5 hover:bg-white/15 text-white/80 border border-white/10 transition-colors"
                  >
                    {adj.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Giá vé Thương gia (Business / SkyBoss) */}
          <div className="space-y-2 pt-2 border-t border-white/10">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black text-rose-400 uppercase tracking-wider">
                Giá vé Thương gia (Business / SkyBoss)
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setBusinessPrice(Math.round(economyPrice * FARE_LADDER_RATIO))}
                  className="text-3xs text-rose-300 bg-rose-500/20 hover:bg-rose-500/30 px-2 py-0.5 rounded-full font-bold transition-colors"
                >
                  Tự động (×2,77)
                </button>
                <span className="text-sm font-bold text-white">
                  {businessPrice.toLocaleString('vi-VN')} ₫
                </span>
              </div>
            </div>
            <div className="relative">
              <input
                type="number"
                min={0}
                step={1000}
                value={businessPrice}
                onChange={(e) => setBusinessPrice(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-white/15 rounded-xl text-base font-bold text-white focus:outline-none focus:border-rose-400 transition-colors"
                placeholder="Nhập giá vé Thương gia (VND)"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-vj-admin-muted">
                VND
              </span>
            </div>
          </div>

          {/* Bảng thang giá 4 hạng vé tham chiếu */}
          <div className="bg-slate-950/80 border border-white/10 rounded-xl p-3 space-y-2">
            <div className="text-2xs font-bold text-vj-admin-muted uppercase tracking-wider">
              Thang giá hiển thị khi khách đặt vé:
            </div>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="bg-white/5 rounded-lg p-2">
                <div className="text-3xs text-vj-admin-muted font-bold">ECO</div>
                <div className="text-xs font-black text-amber-400 mt-0.5">
                  {economyPrice.toLocaleString('vi-VN')}₫
                </div>
              </div>
              <div className="bg-white/5 rounded-lg p-2">
                <div className="text-3xs text-vj-admin-muted font-bold">DELUXE</div>
                <div className="text-xs font-black text-emerald-400 mt-0.5">
                  {(economyPrice + 250000).toLocaleString('vi-VN')}₫
                </div>
              </div>
              <div className="bg-white/5 rounded-lg p-2">
                <div className="text-3xs text-vj-admin-muted font-bold">SKYBOSS</div>
                <div className="text-xs font-black text-rose-400 mt-0.5">
                  {businessPrice.toLocaleString('vi-VN')}₫
                </div>
              </div>
              <div className="bg-white/5 rounded-lg p-2">
                <div className="text-3xs text-vj-admin-muted font-bold">BUSINESS</div>
                <div className="text-xs font-black text-indigo-400 mt-0.5">
                  {Math.round(businessPrice * 1.15).toLocaleString('vi-VN')}₫
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-5 border-t border-white/10 bg-slate-950/50">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-bold text-white transition-colors disabled:opacity-50"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSubmitting}
            className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black tracking-wider uppercase flex items-center gap-2 shadow-vj-sm transition-all disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span>Đang lưu...</span>
              </>
            ) : (
              <>
                <Icon name="CheckIcon" size={14} />
                <span>Lưu giá vé ⚡</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
