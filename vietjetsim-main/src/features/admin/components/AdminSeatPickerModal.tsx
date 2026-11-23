'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from '@/shared/components/ui';
import { getAdminFlightSeatMap, AdminFlightSeatMapData } from '../services';

export interface AdminSeatPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  flightId: string;
  initialSelectedSeats?: string[];
  maxSelectable?: number;
  onConfirm?: (seats: string[]) => void;
  mode?: 'pick' | 'view';
}

const ROWS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28,
  29, 30, 31,
];
const COLS_LEFT = ['A', 'B', 'C'];
const COLS_RIGHT = ['D', 'E', 'F'];

export default function AdminSeatPickerModal({
  isOpen,
  onClose,
  flightId,
  initialSelectedSeats = [],
  maxSelectable = 1,
  onConfirm,
  mode = 'pick',
}: AdminSeatPickerModalProps) {
  const [seatData, setSeatData] = useState<AdminFlightSeatMapData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);

  const initialSeatsKey = useMemo(
    () => (initialSelectedSeats || []).join(','),
    [initialSelectedSeats]
  );

  useEffect(() => {
    if (!isOpen || !flightId) {
      setSeatData(null);
      setError(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);
    setSelectedSeats(initialSeatsKey ? initialSeatsKey.split(',') : []);

    getAdminFlightSeatMap(flightId)
      .then((data) => {
        if (isMounted) setSeatData(data);
      })
      .catch((err) => {
        if (isMounted) {
          console.error('[AdminSeatPickerModal] Error fetching seat map:', err);
          setError('Không thể tải sơ đồ ghế ngồi của chuyến bay.');
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, flightId, initialSeatsKey]);

  const occupiedSet = useMemo(() => new Set(seatData?.occupiedSeats || []), [seatData]);
  const lockedSet = useMemo(() => new Set(seatData?.lockedSeats || []), [seatData]);

  const handleSeatClick = (seatCode: string) => {
    if (mode === 'view') return;
    if (occupiedSet.has(seatCode) || lockedSet.has(seatCode)) return;

    if (selectedSeats.includes(seatCode)) {
      setSelectedSeats(selectedSeats.filter((s) => s !== seatCode));
    } else {
      if (maxSelectable === 1) {
        setSelectedSeats([seatCode]);
      } else if (selectedSeats.length < maxSelectable) {
        setSelectedSeats([...selectedSeats, seatCode]);
      }
    }
  };

  const handleConfirm = () => {
    if (onConfirm) onConfirm(selectedSeats);
    onClose();
  };

  if (!isOpen) return null;

  const flight = seatData?.flight;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-seat-picker-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-fade-in"
    >
      <div className="bg-slate-900 border border-white/10 rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-slate-100">
        {/* Header */}
        <div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Icon name="TicketIcon" size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3
                  id="admin-seat-picker-title"
                  className="text-lg font-black tracking-wide text-white"
                >
                  {mode === 'view' ? 'Sơ Đồ Ghế Ngồi Chuyến Bay' : 'Chọn Ghế Cho Hành Khách'}
                </h3>
                {flight && (
                  <span className="px-2 py-0.5 rounded text-xs font-bold uppercase bg-red-500/20 text-red-400 border border-red-500/30">
                    {flight.flight_no}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {flight
                  ? `${flight.from_code} → ${flight.to_code} • ${flight.aircraft || 'Airbus A321'} • Tỷ lệ lấp đầy: ${seatData?.occupancyRate || 0}% (${seatData?.occupiedCount || 0}/${seatData?.totalSeats || 0} ghế)`
                  : 'Đang tải dữ liệu sơ đồ ghế...'}
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

        {/* Legend */}
        <div className="px-6 py-3 border-b border-white/5 bg-slate-900/50 flex flex-wrap items-center justify-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-lg border border-white/20 bg-white/5" />
            <span className="text-slate-300">Ghế trống</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-lg border border-amber-500/40 bg-amber-500/20 text-amber-300 flex items-center justify-center text-2xs font-bold">
              ★
            </div>
            <span className="text-slate-300">SkyBoss (Hàng 1-3)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-lg border border-rose-500/40 bg-rose-500/30 text-rose-300 flex items-center justify-center text-2xs">
              ✕
            </div>
            <span className="text-slate-300">Đã bán</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-lg border border-amber-500/30 bg-amber-500/20" />
            <span className="text-slate-300">Đang giữ chỗ</span>
          </div>
          {mode === 'pick' && (
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-lg border border-emerald-500 bg-emerald-500 text-white flex items-center justify-center text-2xs font-bold">
                ✓
              </div>
              <span className="text-emerald-400 font-semibold">Đang chọn</span>
            </div>
          )}
        </div>

        {/* Fuselage / Seat Grid */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center">
          {loading ? (
            <div className="py-20 flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-slate-400">Đang tải sơ đồ ghế...</p>
            </div>
          ) : error ? (
            <div className="py-16 text-center text-xs text-red-400">{error}</div>
          ) : (
            <div className="w-full max-w-md bg-slate-900/60 border border-white/10 rounded-3xl p-5 shadow-inner">
              {/* Cockpit Front */}
              <div className="w-32 h-10 mx-auto mb-6 bg-gradient-to-b from-white/10 to-transparent rounded-t-full border-t border-x border-white/20 flex items-center justify-center text-2xs uppercase tracking-widest text-slate-400">
                Mũi tàu bay
              </div>

              {/* Column Labels */}
              <div className="grid grid-cols-7 gap-2 mb-3 text-center text-xs font-bold text-slate-400">
                <span>A</span>
                <span>B</span>
                <span>C</span>
                <span className="text-2xs text-slate-600 font-normal">Lối đi</span>
                <span>D</span>
                <span>E</span>
                <span>F</span>
              </div>

              {/* Seat Rows */}
              <div className="space-y-2">
                {ROWS.map((row) => {
                  const isSkyBoss = row <= 3;
                  const isEmergencyExit = row === 12 || row === 14;

                  return (
                    <React.Fragment key={row}>
                      {isEmergencyExit && row === 12 && (
                        <div className="py-1 text-center text-2xs uppercase font-bold tracking-wider text-amber-400 bg-amber-500/10 rounded-lg border border-amber-500/20 my-2">
                          Cửa thoát hiểm khẩn cấp (Hàng 12 - 14)
                        </div>
                      )}
                      <div className="grid grid-cols-7 gap-2 items-center">
                        {/* Left Trio (A, B, C) */}
                        {COLS_LEFT.map((col) => {
                          const seatCode = `${row}${col}`;
                          const isOccupied = occupiedSet.has(seatCode);
                          const isLocked = lockedSet.has(seatCode);
                          const isSelected = selectedSeats.includes(seatCode);

                          let seatStyle =
                            'bg-white/5 border-white/15 text-slate-300 hover:border-emerald-400 hover:bg-emerald-500/10 cursor-pointer';
                          if (isSkyBoss) {
                            seatStyle =
                              'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:border-amber-400 cursor-pointer';
                          }
                          if (isOccupied) {
                            seatStyle =
                              'bg-rose-500/20 border-rose-500/30 text-rose-400 cursor-not-allowed opacity-80';
                          } else if (isLocked) {
                            seatStyle =
                              'bg-amber-500/15 border-amber-500/25 text-amber-300 cursor-not-allowed opacity-80';
                          } else if (isSelected) {
                            seatStyle =
                              'bg-emerald-500 border-emerald-400 text-white font-bold shadow-lg shadow-emerald-500/30 scale-105';
                          }

                          if (mode === 'view') {
                            seatStyle += ' cursor-default hover:border-transparent';
                          }

                          return (
                            <button
                              key={seatCode}
                              type="button"
                              onClick={() => handleSeatClick(seatCode)}
                              disabled={mode === 'view' || isOccupied || isLocked}
                              title={`Ghế ${seatCode}${isOccupied ? ' (Đã bán)' : isLocked ? ' (Đang giữ chỗ)' : isSkyBoss ? ' (SkyBoss)' : ''}`}
                              className={`h-9 rounded-xl border text-xs2 font-medium flex items-center justify-center transition-all ${seatStyle}`}
                            >
                              {isOccupied ? '✕' : isSelected ? '✓' : seatCode}
                            </button>
                          );
                        })}

                        {/* Aisle Row Number */}
                        <div className="text-center text-xs font-mono font-bold text-slate-400">
                          {row}
                        </div>

                        {/* Right Trio (D, E, F) */}
                        {COLS_RIGHT.map((col) => {
                          const seatCode = `${row}${col}`;
                          const isOccupied = occupiedSet.has(seatCode);
                          const isLocked = lockedSet.has(seatCode);
                          const isSelected = selectedSeats.includes(seatCode);

                          let seatStyle =
                            'bg-white/5 border-white/15 text-slate-300 hover:border-emerald-400 hover:bg-emerald-500/10 cursor-pointer';
                          if (isSkyBoss) {
                            seatStyle =
                              'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:border-amber-400 cursor-pointer';
                          }
                          if (isOccupied) {
                            seatStyle =
                              'bg-rose-500/20 border-rose-500/30 text-rose-400 cursor-not-allowed opacity-80';
                          } else if (isLocked) {
                            seatStyle =
                              'bg-amber-500/15 border-amber-500/25 text-amber-300 cursor-not-allowed opacity-80';
                          } else if (isSelected) {
                            seatStyle =
                              'bg-emerald-500 border-emerald-400 text-white font-bold shadow-lg shadow-emerald-500/30 scale-105';
                          }

                          if (mode === 'view') {
                            seatStyle += ' cursor-default hover:border-transparent';
                          }

                          return (
                            <button
                              key={seatCode}
                              type="button"
                              onClick={() => handleSeatClick(seatCode)}
                              disabled={mode === 'view' || isOccupied || isLocked}
                              title={`Ghế ${seatCode}${isOccupied ? ' (Đã bán)' : isLocked ? ' (Đang giữ chỗ)' : isSkyBoss ? ' (SkyBoss)' : ''}`}
                              className={`h-9 rounded-xl border text-xs2 font-medium flex items-center justify-center transition-all ${seatStyle}`}
                            >
                              {isOccupied ? '✕' : isSelected ? '✓' : seatCode}
                            </button>
                          );
                        })}
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>

              {/* Rear */}
              <div className="w-32 h-6 mx-auto mt-6 bg-white/5 rounded-b-2xl border-b border-x border-white/10 flex items-center justify-center text-2xs uppercase tracking-widest text-slate-400">
                Đuôi tàu bay
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 px-6 border-t border-white/10 bg-white/[0.01] flex items-center justify-between">
          <div className="text-xs text-slate-400">
            {mode === 'pick' ? (
              selectedSeats.length > 0 ? (
                <span>
                  Đã chọn:{' '}
                  <strong className="text-emerald-400 font-mono text-sm">
                    {selectedSeats.join(', ')}
                  </strong>{' '}
                  (Tối đa {maxSelectable} ghế)
                </span>
              ) : (
                <span>Vui lòng click vào ghế màu xanh để chọn</span>
              )
            ) : (
              <span>
                Tổng số ghế: {seatData?.totalSeats || 0} • Đã đặt: {seatData?.occupiedCount || 0}
              </span>
            )}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white rounded-xl text-xs font-bold transition-all"
            >
              Đóng
            </button>
            {mode === 'pick' && (
              <button
                type="button"
                onClick={handleConfirm}
                disabled={selectedSeats.length === 0}
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-emerald-600/30"
              >
                Xác nhận gán ghế ({selectedSeats.length})
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
