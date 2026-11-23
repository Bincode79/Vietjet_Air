'use client';

import React, { useState, useId } from 'react';
import { Icon } from '@/shared/components/ui';
import { addAdminBookingAncillaries } from '../services';

export interface AncillaryBookingTarget {
  id: string;
  realId?: string;
  userName: string;
  flightNo: string;
  route: string;
  date: string;
  amount: number;
  status: string;
}

interface AncillaryUpsellModalProps {
  isOpen: boolean;
  onClose: () => void;
  booking: AncillaryBookingTarget | null;
  onSuccess?: (message: string) => void;
}

const BAGGAGE_OPTIONS = [
  {
    id: 'bg-20',
    label: 'Gói 20kg',
    weight: '20kg',
    price: 200000,
    desc: 'Hành lý ký gửi tiêu chuẩn',
  },
  {
    id: 'bg-30',
    label: 'Gói 30kg',
    weight: '30kg',
    price: 300000,
    desc: 'Thoải mái mua sắm và quà lưu niệm',
  },
  {
    id: 'bg-40',
    label: 'Gói 40kg',
    weight: '40kg',
    price: 400000,
    desc: 'Phù hợp chuyến đi gia đình / dài ngày',
  },
  { id: 'bg-50', label: 'Gói 50kg', weight: '50kg', price: 550000, desc: 'Dành cho hành lý lớn' },
  {
    id: 'hlqk-20',
    label: 'HLQK 20kg',
    weight: '20kg',
    price: 450000,
    desc: 'Kiện hành lý quá khổ (thể thao, nhạc cụ)',
  },
];

const MEAL_OPTIONS = [
  { id: 'meal-my-y', name: 'Combo Mỳ Ý bò bằm, Nước suối & Hạt điều', price: 119000 },
  { id: 'meal-com-chien-thai', name: 'Combo Cơm chiên Thái, Nước suối & Hạt điều', price: 119000 },
  {
    id: 'meal-mien-xao-tom-cua',
    name: 'Combo Miến xào Tôm cua, Nước suối & Hạt điều',
    price: 119000,
  },
  {
    id: 'meal-bun-xao-singapore',
    name: 'Combo Bún xào Singapore, Nước suối & Hạt điều',
    price: 119000,
  },
  { id: 'meal-xoi-khuc-gio', name: 'Combo Xôi khúc giò, Hạt điều & Nước suối', price: 119000 },
];

const INSURANCE_PRICE = 72000;
const TAXI_PRICE = 150000;

export default function AncillaryUpsellModal({
  isOpen,
  onClose,
  booking,
  onSuccess,
}: AncillaryUpsellModalProps) {
  const [selectedBaggage, setSelectedBaggage] = useState<string>('');
  const [selectedMeal, setSelectedMeal] = useState<string>('');
  const [hasInsurance, setHasInsurance] = useState<boolean>(false);
  const [hasTaxi, setHasTaxi] = useState<boolean>(false);
  const [isPaidNow, setIsPaidNow] = useState<boolean>(true);
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const notesId = useId();

  if (!isOpen || !booking) return null;

  // Tính toán tổng tiền dịch vụ phát sinh
  const baggagePrice = BAGGAGE_OPTIONS.find((b) => b.id === selectedBaggage)?.price ?? 0;
  const mealPrice = MEAL_OPTIONS.find((m) => m.id === selectedMeal)?.price ?? 0;
  const insurancePrice = hasInsurance ? INSURANCE_PRICE : 0;
  const taxiPrice = hasTaxi ? TAXI_PRICE : 0;
  const extraTotal = baggagePrice + mealPrice + insurancePrice + taxiPrice;
  const newBookingTotal = booking.amount + (isPaidNow ? extraTotal : 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (extraTotal === 0) {
      setErrorMsg('Vui lòng chọn ít nhất một dịch vụ bổ sung để thêm.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    const bookingTargetId = booking.realId || booking.id;

    try {
      const res = await addAdminBookingAncillaries(bookingTargetId, {
        baggagePackageId: selectedBaggage || undefined,
        mealId: selectedMeal || undefined,
        hasInsurance: hasInsurance || undefined,
        hasTaxi: hasTaxi || undefined,
        isPaidNow,
        notes: notes.trim() || undefined,
      });

      if (onSuccess) {
        onSuccess(res.message || 'Bổ sung dịch vụ thành công!');
      }
      onClose();
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : (err as { message?: string })?.message || 'Không thể thêm dịch vụ bổ sung.';
      setErrorMsg(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        style={{ background: 'linear-gradient(145deg, #1e293b 0%, #0f172a 100%)' }}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
              <Icon name="BriefcaseIcon" size={20} />
            </div>
            <div>
              <h3 className="font-black text-sm uppercase tracking-wider text-white">
                Mua Bổ Sung Dịch Vụ & Hành Lý
              </h3>
              <p className="text-2xs font-bold text-vj-bank-blue-text mt-0.5">
                Mã đặt chỗ: <span className="font-mono text-amber-400">{booking.id}</span> • Khách
                hàng: <span className="text-white">{booking.userName}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-vj-admin-muted hover:text-white flex items-center justify-center transition-colors"
          >
            <Icon name="XMarkIcon" size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {errorMsg && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs flex items-center gap-2">
              <Icon name="ExclamationTriangleIcon" size={16} />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Booking Summary Card */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-white/[0.03] border border-white/5 rounded-xl text-xs">
            <div>
              <span className="text-2xs text-vj-admin-muted uppercase block font-bold">
                Chuyến bay
              </span>
              <span className="font-mono font-bold text-white">{booking.flightNo}</span>
            </div>
            <div>
              <span className="text-2xs text-vj-admin-muted uppercase block font-bold">
                Chặng bay
              </span>
              <span className="font-bold text-white">{booking.route}</span>
            </div>
            <div>
              <span className="text-2xs text-vj-admin-muted uppercase block font-bold">
                Ngày bay
              </span>
              <span className="font-bold text-white">{booking.date}</span>
            </div>
            <div>
              <span className="text-2xs text-vj-admin-muted uppercase block font-bold">
                Giá hiện tại
              </span>
              <span className="font-mono font-bold text-emerald-400">
                {booking.amount.toLocaleString('vi-VN')}₫
              </span>
            </div>
          </div>

          {/* Section 1: Hành lý ký gửi */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Icon name="BriefcaseIcon" size={16} className="text-amber-400" />
                <span>1. Gói Hành Lý Ký Gửi</span>
              </label>
              {selectedBaggage && (
                <button
                  type="button"
                  onClick={() => setSelectedBaggage('')}
                  className="text-2xs text-rose-400 hover:text-rose-300 transition-colors"
                >
                  Xoá chọn hành lý
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {BAGGAGE_OPTIONS.map((pkg) => {
                const isSelected = selectedBaggage === pkg.id;
                return (
                  <button
                    key={pkg.id}
                    type="button"
                    onClick={() => setSelectedBaggage(isSelected ? '' : pkg.id)}
                    className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${
                      isSelected
                        ? 'bg-amber-500/15 border-amber-500 text-white shadow-sm'
                        : 'bg-white/[0.02] border-white/10 hover:border-white/20 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs">{pkg.label}</span>
                      <span className="font-mono font-black text-amber-400 text-xs">
                        +{pkg.price.toLocaleString('vi-VN')}₫
                      </span>
                    </div>
                    <p className="text-2xs text-vj-admin-muted mt-1">{pkg.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 2: Suất ăn nóng Jet Café */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Icon name="SparklesIcon" size={16} className="text-orange-400" />
                <span>2. Suất Ăn Nóng (Jet Café)</span>
              </label>
              {selectedMeal && (
                <button
                  type="button"
                  onClick={() => setSelectedMeal('')}
                  className="text-2xs text-rose-400 hover:text-rose-300 transition-colors"
                >
                  Xoá chọn suất ăn
                </button>
              )}
            </div>

            <div className="space-y-2">
              {MEAL_OPTIONS.map((meal) => {
                const isSelected = selectedMeal === meal.id;
                return (
                  <button
                    key={meal.id}
                    type="button"
                    onClick={() => setSelectedMeal(isSelected ? '' : meal.id)}
                    className={`w-full p-2.5 rounded-xl border text-left transition-all flex items-center justify-between ${
                      isSelected
                        ? 'bg-orange-500/15 border-orange-500 text-white shadow-sm'
                        : 'bg-white/[0.02] border-white/10 hover:border-white/20 text-slate-300'
                    }`}
                  >
                    <span className="text-xs font-medium">{meal.name}</span>
                    <span className="font-mono font-bold text-orange-400 text-xs whitespace-nowrap ml-3">
                      +{meal.price.toLocaleString('vi-VN')}₫
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 3: Bảo hiểm & Taxi */}
          <div className="space-y-3">
            <label className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Icon name="ShieldCheckIcon" size={16} className="text-sky-400" />
              <span>3. Dịch Vụ Tiện Ích Khác</span>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Bảo hiểm */}
              <button
                type="button"
                onClick={() => setHasInsurance(!hasInsurance)}
                className={`p-3 rounded-xl border text-left transition-all flex items-start justify-between ${
                  hasInsurance
                    ? 'bg-sky-500/15 border-sky-500 text-white shadow-sm'
                    : 'bg-white/[0.02] border-white/10 hover:border-white/20 text-slate-300'
                }`}
              >
                <div>
                  <span className="font-bold text-xs block">Bảo hiểm Travel Safe</span>
                  <span className="text-2xs text-vj-admin-muted block mt-0.5">
                    Bảo hiểm y tế & huỷ/hoãn chuyến bay
                  </span>
                </div>
                <span className="font-mono font-bold text-sky-400 text-xs whitespace-nowrap ml-2">
                  +{INSURANCE_PRICE.toLocaleString('vi-VN')}₫
                </span>
              </button>

              {/* Taxi */}
              <button
                type="button"
                onClick={() => setHasTaxi(!hasTaxi)}
                className={`p-3 rounded-xl border text-left transition-all flex items-start justify-between ${
                  hasTaxi
                    ? 'bg-emerald-500/15 border-emerald-500 text-white shadow-sm'
                    : 'bg-white/[0.02] border-white/10 hover:border-white/20 text-slate-300'
                }`}
              >
                <div>
                  <span className="font-bold text-xs block">Taxi sân bay đưa đón</span>
                  <span className="text-2xs text-vj-admin-muted block mt-0.5">
                    Xe riêng đưa đón tận nơi hai chiều
                  </span>
                </div>
                <span className="font-mono font-bold text-emerald-400 text-xs whitespace-nowrap ml-2">
                  +{TAXI_PRICE.toLocaleString('vi-VN')}₫
                </span>
              </button>
            </div>
          </div>

          {/* Section 4: Hình thức thu tiền & Ghi chú */}
          <div className="p-4 bg-white/[0.02] border border-white/10 rounded-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-xs font-bold text-white">Hình thức ghi nhận thu tiền:</span>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                  <input
                    type="radio"
                    name="paymentMode"
                    checked={isPaidNow}
                    onChange={() => setIsPaidNow(true)}
                    className="text-amber-500 focus:ring-amber-500/50 bg-slate-800"
                  />
                  <span>Đã thu tiền mặt/chuyển khoản (Đã thanh toán)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                  <input
                    type="radio"
                    name="paymentMode"
                    checked={!isPaidNow}
                    onChange={() => setIsPaidNow(false)}
                    className="text-amber-500 focus:ring-amber-500/50 bg-slate-800"
                  />
                  <span>Chờ thanh toán (Pending)</span>
                </label>
              </div>
            </div>

            <div>
              <label
                htmlFor={notesId}
                className="text-2xs font-bold text-vj-admin-muted uppercase block mb-1"
              >
                Ghi chú điều hành / nhân viên CSKH
              </label>
              <input
                id={notesId}
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="VD: Khách gọi tổng đài yêu cầu mua thêm 20kg ký gửi..."
                className="w-full bg-slate-800/80 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          {/* Financial Summary Breakdown */}
          <div className="p-4 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/20 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-2xs text-amber-300 uppercase font-black tracking-wider block">
                Tổng phí dịch vụ bổ sung
              </span>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-lg font-black text-amber-400 font-mono">
                  +{extraTotal.toLocaleString('vi-VN')}₫
                </span>
                <span className="text-2xs text-vj-admin-muted">
                  ({isPaidNow ? 'Cộng thẳng vào đơn vé' : 'Tạo khoản thu chờ'})
                </span>
              </div>
            </div>

            <div className="text-right">
              <span className="text-2xs text-vj-admin-muted uppercase font-bold block">
                Tổng giá trị đơn vé mới
              </span>
              <span className="text-base font-black text-white font-mono">
                {newBookingTotal.toLocaleString('vi-VN')}₫
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-5 py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-bold text-slate-300 transition-colors"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={submitting || extraTotal === 0}
              className="px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-98 text-slate-950 text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50 disabled:pointer-events-none flex items-center gap-2 shadow-lg shadow-amber-500/20"
            >
              {submitting ? (
                <>
                  <Icon name="ArrowPathIcon" size={16} className="animate-spin" />
                  <span>Đang xử lý...</span>
                </>
              ) : (
                <>
                  <Icon name="CheckIcon" size={16} />
                  <span>Xác nhận thêm dịch vụ</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
