'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { useSeatMapSSE } from '@/hooks/useSeatMapSSE';
import { SeatMap, Seat } from '@/features/bookings/components/SeatMap';
import { Icon } from '@/shared/components/ui';

interface CheckInSeatModalProps {
  flightId: string;
  flightNo?: string;
  currentSeat: string;
  onSelectSeat: (seatNumber: string) => void;
  onClose: () => void;
}

export default function CheckInSeatModal({
  flightId,
  flightNo = 'Chuyến bay',
  currentSeat,
  onSelectSeat,
  onClose,
}: CheckInSeatModalProps) {
  const { data: liveSeatData } = useSeatMapSSE(flightId);
  const [selectedSeat, setSelectedSeat] = useState<string>(currentSeat);
  const [saving, setSaving] = useState(false);

  // Set of occupied seats from SSE (including booked + locked by other users)
  const occupiedSet = useMemo(() => {
    const set = new Set<string>();
    if (liveSeatData?.occupied) {
      liveSeatData.occupied.forEach((s) => set.add(s));
    }
    if (liveSeatData?.locked) {
      liveSeatData.locked.forEach((l) => {
        if (!l.mine) set.add(l.seatId);
      });
    }
    // Allow the user to keep their current seat if they already had it
    if (currentSeat) {
      set.delete(currentSeat);
    }
    return set;
  }, [liveSeatData, currentSeat]);

  // Generate 30 rows (A-F) for SeatMap
  const seats: Seat[] = useMemo(() => {
    const list: Seat[] = [];
    const cols = ['A', 'B', 'C', 'D', 'E', 'F'];
    for (let row = 1; row <= 30; row++) {
      for (const col of cols) {
        const id = `${row}${col}`;
        const isOccupied = occupiedSet.has(id);
        const isExtraLegroom = row === 11 || row === 30;
        const isEmergencyExit = row === 10 || row === 11;
        const seatClass = row <= 3 ? 'business' : 'economy';

        list.push({
          id,
          number: id,
          row,
          column: col,
          class: seatClass,
          price: 0,
          isOccupied,
          isSelected: selectedSeat === id,
          isExtraLegroom,
          isEmergencyExit,
        });
      }
    }
    return list;
  }, [occupiedSet, selectedSeat]);

  const handleSeatToggle = useCallback(
    async (seatId: string) => {
      if (occupiedSet.has(seatId)) return;
      const prevSeat = selectedSeat;
      setSelectedSeat(seatId);

      // Lock new seat & unlock previous seat.
      //
      // Không gửi mã phiên nào: lock được chứng minh bằng cookie
      // `vj_seat_session` do server cấp (httpOnly), nên client không cần — và
      // không nên — tự sinh.
      try {
        if (flightId) {
          if (prevSeat && prevSeat !== seatId) {
            void fetch('/api/ghe/khoa', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ flightId, seatIds: [prevSeat] }),
            }).catch(() => {});
          }

          void fetch('/api/ghe/khoa', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ flightId, seatIds: [seatId] }),
          }).catch(() => {});
        }
      } catch {
        // Best effort lock
      }
    },
    [occupiedSet, selectedSeat, flightId]
  );

  const handleConfirm = () => {
    if (!selectedSeat) return;
    setSaving(true);
    onSelectSeat(selectedSeat);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4">
      <div className="relative w-full max-w-2xl bg-white rounded-vj shadow-2xl overflow-hidden flex flex-col max-h-[90dvh] sm:max-h-[90vh] animate-fadeIn">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-primary via-red-600 to-primary text-white flex items-center justify-between shadow-vj-md">
          <div className="flex items-center gap-2">
            <Icon name="CheckCircleIcon" size={22} className="text-vjyellow" />
            <div>
              <h3 className="text-base sm:text-lg font-black uppercase tracking-wide font-koho">
                Chọn chỗ ngồi trực tuyến • {flightNo}
              </h3>
              <div className="flex items-center gap-2 text-3xs text-white/80">
                <span>
                  Ghế hiện tại:{' '}
                  <strong className="text-white">{selectedSeat || 'Chưa chọn'}</strong>
                </span>
                {liveSeatData && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.2 rounded-full bg-vj-pay-green text-white border border-vj-pay-green">
                    <span className="w-1.5 h-1.5 rounded-full bg-vj-pay-green animate-pulse" />
                    Đồng bộ thời gian thực
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full text-white/80 hover:text-white hover:bg-white/20 transition-colors"
          >
            <Icon name="XMarkIcon" size={20} />
          </button>
        </div>

        {/* SeatMap Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50">
          <p className="text-xs text-vj-text-strong mb-4 text-center">
            Nhấp vào một ghế còn trống trên sơ đồ bên dưới để chọn vị trí ngồi ưa thích trên chuyến
            bay của bạn.
          </p>

          <SeatMap
            seats={seats}
            selectedSeats={[selectedSeat]}
            onSeatToggle={handleSeatToggle}
            aircraftType="A321"
            className="border border-vj-border-light rounded-vj shadow-xs"
          />
        </div>

        {/* Footer actions */}
        <div className="p-3 sm:p-4 bg-white border-t border-vj-border-light flex items-center justify-between gap-2">
          <div className="text-xs">
            <span className="text-vj-gray">Đã chọn: </span>
            <strong className="text-primary font-black text-sm">
              {selectedSeat || 'Chưa chọn'}
            </strong>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-vj-text-dim bg-vj-pill hover:bg-vj-surface-3 rounded-vj transition-all"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={!selectedSeat || saving}
              onClick={handleConfirm}
              className="px-5 py-2 text-xs font-black text-white bg-primary hover:bg-primary-dark rounded-vj shadow-vj-md transition-all disabled:opacity-50"
            >
              Xác nhận chỗ ngồi
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
