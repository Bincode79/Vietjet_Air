'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from '@/shared/components/ui';
import { AdminFlight, listAdminFlights, rebookAdminBooking, RebookResponse } from '../services';

export interface RebookingModalBooking {
  id: string;
  booking_code?: string;
  user_name?: string;
  user_email?: string;
  flight_id?: string;
  flight_no?: string;
  total_price?: number;
  route?: string;
  status?: string;
  created_at?: string;
}

export interface RebookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  booking: RebookingModalBooking | null;
  onSuccess?: () => void;
  onToast?: {
    success: (title: string, message?: string) => void;
    error: (title: string, message?: string) => void;
  };
}

export default function RebookingModal({
  isOpen,
  onClose,
  booking,
  onSuccess,
  onToast,
}: RebookingModalProps) {
  const [availableFlights, setAvailableFlights] = useState<AdminFlight[]>([]);
  const [loadingFlights, setLoadingFlights] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [selectedFlightId, setSelectedFlightId] = useState<string>('');
  const [searchDate, setSearchDate] = useState<string>('');
  const [newSeatNumber, setNewSeatNumber] = useState<string>('');
  const [waiveFee, setWaiveFee] = useState<boolean>(false);
  const [reason, setReason] = useState<string>('Khách yêu cầu đổi giờ bay');
  const [customFeeInput, setCustomFeeInput] = useState<string>('350000');
  const [result, setResult] = useState<RebookResponse | null>(null);

  // Parse origin and destination from booking route
  const { fromCode, toCode } = useMemo(() => {
    if (!booking) return { fromCode: '', toCode: '' };
    const route = (booking as { route?: string }).route || '';
    const parts = route.split(/[-–→>]/).map((s) => s.trim().toUpperCase());
    if (parts.length >= 2) {
      return { fromCode: parts[0], toCode: parts[1] };
    }
    return { fromCode: '', toCode: '' };
  }, [booking]);

  useEffect(() => {
    if (!isOpen || !booking) {
      setAvailableFlights([]);
      setSelectedFlightId('');
      setResult(null);
      setError(null);
      return;
    }

    // Default search date to tomorrow or today
    const today = new Date().toISOString().split('T')[0];
    setSearchDate(today);

    let isMounted = true;
    setLoadingFlights(true);
    setError(null);

    listAdminFlights({ limit: 100 })
      .then((res) => {
        if (!isMounted) return;
        const flights = Array.isArray(res.flights) ? res.flights : [];
        // Filter out the current flight
        const filtered = flights.filter((f) => f.id !== booking.flight_id);
        setAvailableFlights(filtered);
      })
      .catch((err) => {
        if (isMounted) {
          console.error('[RebookingModal] Error loading flights:', err);
          setError('Không thể tải danh sách chuyến bay thay thế.');
        }
      })
      .finally(() => {
        if (isMounted) setLoadingFlights(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, booking]);

  // Filter flights by search date and route
  const filteredFlights = useMemo(() => {
    return availableFlights.filter((f) => {
      // Filter by route if available
      if (fromCode && f.from_code && f.from_code !== fromCode) return false;
      if (toCode && f.to_code && f.to_code !== toCode) return false;
      // Filter by date if specified
      if (searchDate && f.depart_time) {
        const flightDate = f.depart_time.split('T')[0];
        if (flightDate !== searchDate) return false;
      }
      return true;
    });
  }, [availableFlights, fromCode, toCode, searchDate]);

  const selectedNewFlight = useMemo(() => {
    return availableFlights.find((f) => f.id === selectedFlightId) || null;
  }, [availableFlights, selectedFlightId]);

  // Calculation of fare difference and change fee
  const { fareDifference, changeFee, totalAmount } = useMemo(() => {
    if (!booking || !selectedNewFlight) {
      return { fareDifference: 0, changeFee: 0, totalAmount: 0 };
    }

    const oldPrice = Number(booking.total_price) || 0;
    const newPrice = Number(selectedNewFlight.price) || 0;
    const diff = Math.max(0, newPrice - oldPrice);

    let fee = 0;
    if (!waiveFee) {
      const parsedCustom = parseInt(customFeeInput.replace(/[^0-9]/g, ''), 10);
      fee = !isNaN(parsedCustom) ? parsedCustom : 350000;
    }

    return {
      fareDifference: diff,
      changeFee: fee,
      totalAmount: diff + fee,
    };
  }, [booking, selectedNewFlight, waiveFee, customFeeInput]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!booking) return;

    if (!selectedFlightId) {
      setError('Vui lòng chọn một chuyến bay thay thế.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await rebookAdminBooking(booking.id, {
        newFlightId: selectedFlightId,
        seatNumber: newSeatNumber.trim() ? newSeatNumber.trim().toUpperCase() : undefined,
        waiveFee,
        reason: reason.trim(),
        customChangeFee: waiveFee ? 0 : changeFee,
      });

      setResult(res);
      onToast?.success(
        'Đổi chuyến bay thành công',
        `Đã chuyển sang ${res.newFlight.flightNo}. Thu thêm: ${res.summary.totalAdditionalAmount.toLocaleString('vi-VN')}₫`
      );
      onSuccess?.();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Đã xảy ra lỗi khi đổi chuyến bay.';
      setError(message);
      onToast?.error('Lỗi đổi vé', message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || !booking) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="rebooking-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-fade-in"
    >
      <div className="bg-slate-900 border border-white/10 rounded-3xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-slate-100">
        {/* Header */}
        <div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Icon name="ArrowPathIcon" size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3
                  id="rebooking-modal-title"
                  className="text-lg font-black tracking-wide text-white"
                >
                  Đổi Chuyến Bay & Xử Lý Vé (Rebooking)
                </h3>
                <span className="font-mono px-2 py-0.5 rounded text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {booking.booking_code}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Khách hàng:{' '}
                <span className="font-semibold text-slate-200">{booking.user_name || 'Khách'}</span>{' '}
                • Chuyến hiện tại:{' '}
                <span className="font-bold text-red-400">{booking.flight_no || 'Chưa rõ'}</span>
                {fromCode && toCode && ` (${fromCode} → ${toCode})`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-all"
          >
            <Icon name="XMarkIcon" size={20} />
          </button>
        </div>

        {/* Success Result View */}
        {result ? (
          <div className="p-8 flex flex-col items-center justify-center text-center space-y-4 my-auto">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center">
              <Icon name="CheckIcon" size={32} />
            </div>
            <h4 className="text-xl font-black text-white">Đổi Chuyến Bay Thành Công!</h4>
            <p className="text-sm text-slate-300 max-w-md">
              Đã chuyển vé từ <strong className="text-red-400">{result.oldFlight.flightNo}</strong>{' '}
              sang chuyến bay mới{' '}
              <strong className="text-emerald-400">{result.newFlight.flightNo}</strong> (
              {result.newFlight.from} → {result.newFlight.to}).
            </p>

            {/* Financial summary receipt */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 w-full max-w-sm text-left text-xs space-y-2">
              <div className="flex justify-between text-slate-400">
                <span>Chênh lệch giá vé:</span>
                <span className="font-semibold text-slate-200">
                  {result.summary.totalFareDifference.toLocaleString('vi-VN')}₫
                </span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Phí đổi vé:</span>
                <span className="font-semibold text-slate-200">
                  {result.summary.waivedFee
                    ? '0₫ (Miễn phí)'
                    : `${result.summary.changeFee.toLocaleString('vi-VN')}₫`}
                </span>
              </div>
              <div className="border-t border-white/10 pt-2 flex justify-between font-bold text-sm">
                <span className="text-white">Tổng thu thêm:</span>
                <span className="text-emerald-400">
                  {result.summary.totalAdditionalAmount.toLocaleString('vi-VN')}₫
                </span>
              </div>
            </div>

            <div className="pt-4 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-600/30"
              >
                Hoàn tất & Đóng
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {error && (
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-xs font-medium text-red-400">
                  {error}
                </div>
              )}

              {/* Step 1: Chọn ngày & Tìm chuyến bay thay thế */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                  1. Chọn ngày bay mới & chuyến bay thay thế
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                  <div>
                    <span className="text-xs2 text-slate-400 mb-1 block">Chặng bay:</span>
                    <div className="px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs font-bold text-white flex items-center justify-between">
                      <span>{fromCode || 'Bất kỳ'}</span>
                      <Icon name="ArrowRightIcon" size={12} className="text-slate-500" />
                      <span>{toCode || 'Bất kỳ'}</span>
                    </div>
                  </div>
                  <div>
                    <span className="text-xs2 text-slate-400 mb-1 block">Ngày bay mới:</span>
                    <input
                      type="date"
                      value={searchDate}
                      onChange={(e) => setSearchDate(e.target.value)}
                      className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => setSearchDate('')}
                      className="w-full px-3 py-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl text-xs font-semibold border border-white/10 transition-colors"
                    >
                      Xem tất cả ngày
                    </button>
                  </div>
                </div>

                {/* Danh sách chuyến bay có sẵn */}
                <div className="border border-white/10 rounded-2xl bg-white/[0.01] max-h-48 overflow-y-auto divide-y divide-white/5">
                  {loadingFlights ? (
                    <div className="py-8 text-center text-xs text-slate-400">
                      Đang tìm các chuyến bay thay thế...
                    </div>
                  ) : filteredFlights.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-400">
                      Không tìm thấy chuyến bay phù hợp trên chặng {fromCode} → {toCode}. Vui lòng
                      thử ngày khác.
                    </div>
                  ) : (
                    filteredFlights.map((flight) => {
                      const isSelected = flight.id === selectedFlightId;
                      const depTime = flight.depart_time
                        ? new Date(flight.depart_time).toLocaleTimeString('vi-VN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '—';
                      const arrTime = flight.arrive_time
                        ? new Date(flight.arrive_time).toLocaleTimeString('vi-VN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '—';
                      const flightDate = flight.depart_time
                        ? new Date(flight.depart_time).toLocaleDateString('vi-VN')
                        : '—';

                      return (
                        <div
                          key={flight.id}
                          onClick={() => setSelectedFlightId(flight.id)}
                          className={`p-3.5 flex items-center justify-between cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-amber-500/15 border-l-4 border-amber-400'
                              : 'hover:bg-white/[0.03]'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="radio"
                              name="selectedFlight"
                              checked={isSelected}
                              onChange={() => setSelectedFlightId(flight.id)}
                              className="text-amber-500 focus:ring-0 cursor-pointer"
                            />
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-xs text-white">
                                  {flight.flight_no}
                                </span>
                                <span className="text-2xs text-slate-400">
                                  ({flight.from_code} → {flight.to_code})
                                </span>
                                <span className="text-2xs px-1.5 py-0.2 rounded bg-white/5 text-slate-300">
                                  {flight.aircraft || 'A321'}
                                </span>
                              </div>
                              <div className="text-xs2 text-slate-400 mt-0.5">
                                Ngày: <span className="text-slate-300">{flightDate}</span> • Giờ:{' '}
                                <span className="text-slate-200 font-semibold">
                                  {depTime} - {arrTime}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="text-xs font-black text-amber-400">
                              {flight.price.toLocaleString('vi-VN')}₫
                            </div>
                            <div className="text-2xs text-slate-500">
                              Còn {flight.available} ghế
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Step 2: Tính toán tài chính & Phí đổi */}
              {selectedNewFlight && (
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4.5 space-y-4">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                    2. Bảng tính tài chính & Phí thay đổi chuyến bay
                  </label>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                      <span className="text-slate-400 block mb-1">Giá vé ban đầu:</span>
                      <span className="font-bold text-white text-sm">
                        {Number(booking.total_price || 0).toLocaleString('vi-VN')}₫
                      </span>
                    </div>

                    <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                      <span className="text-slate-400 block mb-1">Giá chuyến bay mới:</span>
                      <span className="font-bold text-white text-sm">
                        {selectedNewFlight.price.toLocaleString('vi-VN')}₫
                      </span>
                    </div>

                    <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                      <span className="text-slate-400 block mb-1">Chênh lệch giá vé:</span>
                      <span className="font-bold text-sky-400 text-sm">
                        +{fareDifference.toLocaleString('vi-VN')}₫
                      </span>
                    </div>
                  </div>

                  {/* Fee policy toggle */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-white/5">
                    <label className="flex items-center gap-2 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={waiveFee}
                        onChange={(e) => setWaiveFee(e.target.checked)}
                        className="rounded bg-white/10 text-amber-500 focus:ring-0"
                      />
                      <span className="text-slate-300 font-medium">
                        Miễn phí đổi vé (Hãng đổi lịch / Khách VIP / Hạng SkyBoss, Deluxe)
                      </span>
                    </label>

                    {!waiveFee && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">Phí đổi vé:</span>
                        <input
                          type="text"
                          value={customFeeInput}
                          onChange={(e) => setCustomFeeInput(e.target.value)}
                          className="w-28 px-2.5 py-1 bg-white/5 border border-white/10 rounded-lg text-xs font-bold text-right text-white focus:outline-none focus:border-amber-500"
                        />
                        <span className="text-xs text-slate-400">₫</span>
                      </div>
                    )}
                  </div>

                  {/* Total calculation banner */}
                  <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-amber-300 block">
                        Tổng số tiền cần thu thêm:
                      </span>
                      <span className="text-2xs text-slate-400">
                        Chênh lệch vé: {fareDifference.toLocaleString('vi-VN')}₫ + Phí đổi:{' '}
                        {changeFee.toLocaleString('vi-VN')}₫
                      </span>
                    </div>
                    <div className="text-base font-black text-amber-400 font-mono">
                      {totalAmount.toLocaleString('vi-VN')}₫
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Ghế ngồi & Lý do đổi */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                    3. Số ghế mới (tuỳ chọn)
                  </label>
                  <input
                    type="text"
                    value={newSeatNumber}
                    onChange={(e) => setNewSeatNumber(e.target.value)}
                    placeholder="VD: 14A (để trống nếu xếp tự động)"
                    className="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                    4. Lý do đổi vé / Ghi chú
                  </label>
                  <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Lý do đổi vé..."
                    className="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 px-6 border-t border-white/10 bg-white/[0.01] flex items-center justify-between">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-5 py-2.5 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white rounded-xl text-xs font-bold transition-all disabled:opacity-40"
              >
                Huỷ bỏ
              </button>
              <button
                type="submit"
                disabled={submitting || !selectedFlightId}
                className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider transition-all flex items-center gap-2 shadow-lg shadow-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                    <span>Đang xử lý đổi chuyến...</span>
                  </>
                ) : (
                  <>
                    <Icon name="ArrowPathIcon" size={16} />
                    <span>Xác nhận đổi chuyến bay</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
