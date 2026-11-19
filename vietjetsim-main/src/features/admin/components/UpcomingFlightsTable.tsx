'use client';

import React from 'react';
import { Icon } from '@/shared/components/ui';
import type { DashboardFlightSummary } from '../types/dashboard';

interface UpcomingFlightsTableProps {
  data?: DashboardFlightSummary[];
  onViewAll?: () => void;
  className?: string;
}

const FLIGHT_STATUS_MAP: Record<string, { label: string; cls: string }> = {
  scheduled: { label: 'Đúng giờ', cls: 'bg-emerald-400/10 text-vj-pay-green-text border-emerald-400/30' },
  on_time: { label: 'Đúng giờ', cls: 'bg-emerald-400/10 text-vj-pay-green-text border-emerald-400/30' },
  boarding: { label: 'Đang lên máy bay', cls: 'bg-sky-500/10 text-sky-400 border-sky-500/20' },
  delayed: { label: 'Chậm giờ', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  cancelled: { label: 'Đã huỷ', cls: 'bg-red-400/10 text-red-400 border-red-400/30' },
  departed: { label: 'Đã cất cánh', cls: 'bg-sky-400/10 text-vj-bank-blue-text border-sky-400/30' },
  active: { label: 'Hoạt động', cls: 'bg-emerald-400/10 text-vj-pay-green-text border-emerald-400/30' },
};

function formatDepartTime(isoString: string): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${hours}:${minutes} - ${day}/${month}`;
  } catch {
    return isoString;
  }
}

export default function UpcomingFlightsTable({
  data = [],
  onViewAll,
  className = '',
}: UpcomingFlightsTableProps) {
  const hasData = Array.isArray(data) && data.length > 0;

  return (
    <div
      className={`rounded-2xl border overflow-hidden ${className}`}
      style={{
        background: 'rgba(30, 41, 59, 0.4)',
        backdropFilter: 'blur(12px)',
        borderColor: 'rgba(255, 255, 255, 0.05)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
      }}
    >
      <div className="flex items-center justify-between p-5 border-b border-white/5">
        <div className="flex items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-sky-400 animate-pulse" />
          <div>
            <h3 className="font-bold text-white text-base tracking-tight">
              Chuyến bay sắp cất cánh
            </h3>
            <p className="text-xs text-vj-admin-muted mt-0.5">5 chuyến bay khởi hành tiếp theo</p>
          </div>
        </div>
        {onViewAll && (
          <button
            type="button"
            onClick={onViewAll}
            className="text-xs font-bold text-vj-bank-blue-text hover:text-vj-bank-blue-text flex items-center gap-1.5 transition-all hover:gap-2 px-3 py-1.5 rounded-vj bg-vj-blue border border-vj-blue"
          >
            Xem tất cả
            <Icon name="ArrowRightIcon" size={12} />
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-white/5 border-b border-white/5">
              <th className="text-left text-2xs font-bold text-vj-admin-muted uppercase tracking-widest px-5 py-3.5">
                Chuyến bay
              </th>
              <th className="text-left text-2xs font-bold text-vj-admin-muted uppercase tracking-widest px-5 py-3.5">
                Tuyến bay
              </th>
              <th className="text-left text-2xs font-bold text-vj-admin-muted uppercase tracking-widest px-5 py-3.5">
                Khởi hành
              </th>
              <th className="text-center text-2xs font-bold text-vj-admin-muted uppercase tracking-widest px-5 py-3.5">
                Ghế trống
              </th>
              <th className="text-right text-2xs font-bold text-vj-admin-muted uppercase tracking-widest px-5 py-3.5">
                Trạng thái
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {!hasData ? (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-sm text-vj-admin-muted">
                  Không có chuyến bay sắp cất cánh
                </td>
              </tr>
            ) : (
              data.map((flight) => {
                const statusMeta = FLIGHT_STATUS_MAP[flight.status.toLowerCase()] || {
                  label: flight.status,
                  cls: 'bg-slate-500 text-vj-admin-muted border-vj-border-light',
                };

                const seatsColor =
                  flight.availableSeats > 20
                    ? 'text-vj-pay-green-text'
                    : flight.availableSeats > 0
                      ? 'text-amber-400'
                      : 'text-red-400';

                return (
                  <tr
                    key={flight.id || flight.flightNo}
                    className="hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Icon
                          name="AirplaneIcon"
                          size={14}
                          className="text-primary transform rotate-45"
                        />
                        <span className="font-mono font-bold text-sm text-white">
                          {flight.flightNo}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <span className="text-sm font-semibold text-vj-admin-muted">
                        {flight.route || '—'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <span className="text-xs font-medium text-vj-admin-muted">
                        {formatDepartTime(flight.departTime)}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap text-center">
                      <span className={`font-bold text-sm ${seatsColor}`}>
                        {flight.availableSeats}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap text-right">
                      <span
                        className={`inline-block text-2xs font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider border ${statusMeta.cls}`}
                      >
                        {statusMeta.label}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
