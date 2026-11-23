'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Icon } from '@/shared/components/ui';
import { getAdminFlightManifest, AdminFlightManifestData } from '../services';

export interface FlightManifestModalProps {
  isOpen: boolean;
  onClose: () => void;
  flightId: string;
}

export default function FlightManifestModal({
  isOpen,
  onClose,
  flightId,
}: FlightManifestModalProps) {
  const [data, setData] = useState<AdminFlightManifestData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'checked_in' | 'not_checked_in'>('all');

  useEffect(() => {
    if (!isOpen || !flightId) {
      setData(null);
      setError(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    getAdminFlightManifest(flightId)
      .then((res) => {
        if (isMounted) {
          setData(res);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error('[FlightManifestModal] Error loading manifest:', err);
          setError(err?.message || 'Không thể tải danh sách hành khách chuyến bay.');
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, flightId]);

  const filteredPassengers = useMemo(() => {
    if (!data?.passengers) return [];
    return data.passengers.filter((p) => {
      // Search term
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase().trim();
        const matchName = (p.name || '').toLowerCase().includes(query);
        const matchPnr = (p.booking_code || '').toLowerCase().includes(query);
        const matchSeat = (p.seat_number || '').toLowerCase().includes(query);
        const matchId = (p.id_number || '').toLowerCase().includes(query);
        const matchPhone = (p.phone || p.contact_phone || '').toLowerCase().includes(query);
        if (!matchName && !matchPnr && !matchSeat && !matchId && !matchPhone) {
          return false;
        }
      }

      // Status
      if (statusFilter === 'checked_in' && !p.is_checked_in) return false;
      if (statusFilter === 'not_checked_in' && p.is_checked_in) return false;

      return true;
    });
  }, [data?.passengers, searchTerm, statusFilter]);

  // Handle Export CSV (PNL)
  const handleExportCsv = () => {
    if (!data || !data.flight) return;
    const flight = data.flight;
    const passengersToExport = filteredPassengers;

    const headers = [
      'STT',
      'Mã Đặt Chỗ (PNR)',
      'Họ Tên Hành Khách',
      'Giới Tính',
      'Loại Khách',
      'Số Ghế',
      'Trạng Thái Check-in',
      'Giờ Check-in',
      'Mã Boarding Pass',
      'CMND / CCCD',
      'Số Điện Thoại',
      'Email',
      'Email Liên Hệ',
      'Trạng Thái Vé',
    ];

    const escapeCsvCell = (val: unknown) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = passengersToExport.map((p, idx) => [
      escapeCsvCell(idx + 1),
      escapeCsvCell(p.booking_code),
      escapeCsvCell(p.name),
      escapeCsvCell(p.gender === 'male' ? 'Nam' : p.gender === 'female' ? 'Nữ' : p.gender || '—'),
      escapeCsvCell(
        p.passenger_type === 'adult'
          ? 'Người lớn'
          : p.passenger_type === 'child'
            ? 'Trẻ em'
            : p.passenger_type === 'infant'
              ? 'Em bé'
              : p.passenger_type || 'Người lớn'
      ),
      escapeCsvCell(p.seat_number || '—'),
      escapeCsvCell(p.is_checked_in ? 'Đã check-in' : 'Chưa check-in'),
      escapeCsvCell(p.check_in_time ? new Date(p.check_in_time).toLocaleString('vi-VN') : '—'),
      escapeCsvCell(p.boarding_pass_code || '—'),
      escapeCsvCell(p.id_number || '—'),
      escapeCsvCell(p.phone || p.contact_phone || '—'),
      escapeCsvCell(p.email || '—'),
      escapeCsvCell(p.contact_email || '—'),
      escapeCsvCell(p.booking_status),
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const depDateStr = flight.depart_time
      ? new Date(flight.depart_time).toISOString().split('T')[0]
      : '';
    const cleanDate = depDateStr.replace(/[^0-9]/g, '');
    link.download = `PNL_${flight.flight_no || 'FLIGHT'}_${cleanDate || 'MANIFEST'}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  if (!isOpen) return null;

  const flight = data?.flight;
  const depDateFormatted = flight?.depart_time
    ? new Date(flight.depart_time).toLocaleDateString('vi-VN')
    : '—';
  const depTimeFormatted = flight?.depart_time
    ? new Date(flight.depart_time).toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';
  const arrTimeFormatted = flight?.arrive_time
    ? new Date(flight.arrive_time).toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="flight-manifest-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-fade-in"
    >
      <div className="bg-slate-900 border border-white/10 rounded-3xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-slate-100">
        {/* Header */}
        <div className="p-6 border-b border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <Icon name="UsersIcon" size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3
                  id="flight-manifest-modal-title"
                  className="text-lg font-black tracking-wide text-white"
                >
                  Danh Sách Hành Khách Chuyến Bay (PNL)
                </h3>
                {flight && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-black uppercase bg-red-500/20 text-red-400 border border-red-500/30">
                    {flight.flight_no}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {flight
                  ? `${flight.from_code} → ${flight.to_code} • Ngày: ${depDateFormatted} • Giờ: ${depTimeFormatted} - ${arrTimeFormatted} • Tàu bay: ${flight.aircraft || 'A321'}`
                  : 'Đang tải dữ liệu chuyến bay...'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              disabled={loading || !data || data.passengers.length === 0}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 rounded-xl text-xs font-bold transition-all flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              title="In danh sách hành khách"
            >
              <Icon name="PrinterIcon" size={16} />
              <span className="hidden sm:inline">In danh sách</span>
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={loading || !data || data.passengers.length === 0}
              className="px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 rounded-xl text-xs font-bold transition-all flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Xuất file CSV danh sách hành khách"
            >
              <Icon name="ArrowDownTrayIcon" size={16} />
              <span>Xuất CSV (PNL)</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-all ml-1"
            >
              <Icon name="XMarkIcon" size={20} />
            </button>
          </div>
        </div>

        {/* Stats & Search Toolbar */}
        <div className="p-4 sm:p-6 border-b border-white/5 bg-slate-900/60 flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
          {/* Quick Stats */}
          <div className="flex items-center gap-3 overflow-x-auto pb-1 md:pb-0">
            <div className="px-3.5 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs flex items-center gap-2 shrink-0">
              <span className="text-slate-400">Tổng khách:</span>
              <span className="font-bold text-white text-sm">{data?.totalPassengers ?? 0}</span>
            </div>
            <div className="px-3.5 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-xs flex items-center gap-2 shrink-0">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-emerald-300">Đã Check-in:</span>
              <span className="font-bold text-emerald-400 text-sm">
                {data?.checkedInCount ?? 0}
              </span>
            </div>
            <div className="px-3.5 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs flex items-center gap-2 shrink-0">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span className="text-amber-300">Chưa Check-in:</span>
              <span className="font-bold text-amber-400 text-sm">
                {data?.notCheckedInCount ?? 0}
              </span>
            </div>
          </div>

          {/* Filter & Search */}
          <div className="flex flex-col sm:flex-row gap-2.5 items-center">
            {/* Filter buttons */}
            <div className="inline-flex rounded-xl bg-white/5 p-1 border border-white/5 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  statusFilter === 'all'
                    ? 'bg-sky-500/30 text-sky-200 shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Tất cả ({data?.totalPassengers ?? 0})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('checked_in')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  statusFilter === 'checked_in'
                    ? 'bg-emerald-500/30 text-emerald-200 shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Đã Check-in ({data?.checkedInCount ?? 0})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('not_checked_in')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  statusFilter === 'not_checked_in'
                    ? 'bg-amber-500/30 text-amber-200 shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Chưa ({data?.notCheckedInCount ?? 0})
              </button>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <Icon
                name="MagnifyingGlassIcon"
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm tên, PNR, ghế..."
                className="w-full pl-9 pr-3 py-1.5 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <Icon name="XMarkIcon" size={14} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Content Table */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 space-y-3">
              <div className="w-8 h-8 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-medium">Đang tải danh sách hành khách...</p>
            </div>
          ) : error ? (
            <div className="p-6 rounded-2xl bg-red-500/10 border border-red-500/20 text-center my-8">
              <p className="text-sm font-semibold text-red-400">{error}</p>
            </div>
          ) : filteredPassengers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 space-y-2">
              <Icon name="UserGroupIcon" size={40} className="text-slate-600 mb-2" />
              <p className="text-sm font-semibold text-slate-300">
                {searchTerm || statusFilter !== 'all'
                  ? 'Không tìm thấy hành khách nào phù hợp bộ lọc.'
                  : 'Chưa có hành khách nào trên chuyến bay này.'}
              </p>
              <p className="text-xs text-slate-500">
                Khi có đơn đặt chỗ và vé được xác nhận, hành khách sẽ hiển thị tại đây.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-white/5">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-white/5 text-slate-400 font-bold uppercase tracking-wider text-xs2 border-b border-white/10">
                    <th className="py-3.5 px-4 w-12 text-center">STT</th>
                    <th className="py-3.5 px-4">Mã Đặt Chỗ</th>
                    <th className="py-3.5 px-4">Họ Tên Hành Khách</th>
                    <th className="py-3.5 px-3 text-center">Giới Tính</th>
                    <th className="py-3.5 px-3 text-center">Loại Khách</th>
                    <th className="py-3.5 px-3 text-center">Số Ghế</th>
                    <th className="py-3.5 px-4 text-center">Check-in</th>
                    <th className="py-3.5 px-4">CMND / CCCD</th>
                    <th className="py-3.5 px-4">Liên Hệ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredPassengers.map((p, idx) => (
                    <tr key={p.id || idx} className="hover:bg-white/[0.03] transition-colors group">
                      <td className="py-3 px-4 text-center text-slate-500 font-mono">{idx + 1}</td>
                      <td className="py-3 px-4">
                        <span className="font-mono font-bold text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/20">
                          {p.booking_code}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold text-white group-hover:text-sky-300 transition-colors">
                          {p.name}
                        </div>
                        {p.dob && <div className="text-2xs text-slate-400">Sinh: {p.dob}</div>}
                      </td>
                      <td className="py-3 px-3 text-center text-slate-300">
                        {p.gender === 'male'
                          ? 'Nam'
                          : p.gender === 'female'
                            ? 'Nữ'
                            : p.gender || '—'}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="px-2 py-0.5 rounded-full text-2xs font-bold bg-white/5 text-slate-300 border border-white/5">
                          {p.passenger_type === 'child'
                            ? 'Trẻ em'
                            : p.passenger_type === 'infant'
                              ? 'Em bé'
                              : 'Người lớn'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        {p.seat_number && p.seat_number !== '—' ? (
                          <span className="font-mono font-black text-xs px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                            {p.seat_number}
                          </span>
                        ) : (
                          <span className="text-slate-500 italic">Chưa chọn</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {p.is_checked_in ? (
                          <div className="inline-flex flex-col items-center">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                              Đã check-in
                            </span>
                            {p.check_in_time && (
                              <span className="text-3xs text-slate-500 mt-0.5">
                                {new Date(p.check_in_time).toLocaleTimeString('vi-VN', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-medium bg-white/5 text-slate-400 border border-white/5">
                            Chưa
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-300">{p.id_number || '—'}</td>
                      <td className="py-3 px-4 text-slate-300">
                        <div className="text-xs">{p.phone || p.contact_phone || '—'}</div>
                        {(p.email || p.contact_email) && (
                          <div className="text-2xs text-slate-400 truncate max-w-[150px]">
                            {p.email || p.contact_email}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 px-6 border-t border-white/10 bg-white/[0.01] flex items-center justify-between text-xs text-slate-400">
          <div>
            Hiển thị <span className="font-bold text-white">{filteredPassengers.length}</span> /{' '}
            <span>{data?.totalPassengers ?? 0}</span> hành khách
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white rounded-xl font-bold transition-all"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
