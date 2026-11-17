'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Icon, Pagination } from '@/shared/components/ui';
import { listAdminCheckins, cancelAdminCheckin } from '@/features/admin';
import type { AdminCheckin } from '@/features/admin/types';
import { getApiErrorMessage } from '@/shared/services';

interface ToastAPI {
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
}

const PAGE_SIZE = 10;

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Chờ', cls: 'badge-warning' },
  confirmed: { label: 'Đã xác nhận', cls: 'badge-success' },
  completed: { label: 'Hoàn thành', cls: 'badge-info' },
  cancelled: { label: 'Đã huỷ', cls: 'badge-error' },
};

function formatDateTime(v: string | null): string {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function CheckinsTab({ onToast }: { onToast?: ToastAPI }) {
  const [rows, setRows] = useState<AdminCheckin[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminCheckin | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
      setCurrentPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const fetchRows = useCallback(async (page = 1, search = '', status = 'all') => {
    setIsLoading(true);
    try {
      const data = await listAdminCheckins({
        page,
        limit: PAGE_SIZE,
        search,
        status: status === 'all' ? undefined : status,
      });
      setRows(data.checkins || []);
      setTotalCount(data.pagination?.total || 0);
      setTotalPages(data.pagination?.totalPages || 1);
      setCurrentPage(page);
    } catch {
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRows(currentPage, debouncedSearch, filterStatus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchRows, debouncedSearch, filterStatus]);

  const handleCancel = async (row: AdminCheckin) => {
    if (row.status === 'cancelled') return;
    if (
      !confirm(`Huỷ check-in ghế ${row.seat_number} của ${row.passenger_name}? Ghế sẽ được mở lại.`)
    )
      return;
    setCancellingId(row.id);
    try {
      await cancelAdminCheckin(row.id);
      onToast?.success('Đã huỷ check-in', `Ghế ${row.seat_number} đã được mở lại.`);
      fetchRows(currentPage, debouncedSearch, filterStatus);
      setDetail(null);
    } catch (err) {
      onToast?.error('Lỗi', getApiErrorMessage(err, 'Không huỷ được check-in.'));
    } finally {
      setCancellingId(null);
    }
  };

  const handleExportCsv = () => {
    const header = [
      'PNR',
      'Hanh khach',
      'Chuyen bay',
      'Tuyen',
      'Gio bay',
      'Ghe',
      'Ma check-in',
      'The len tau',
      'Cong',
      'Nha ga',
      'Trang thai',
      'Gio check-in',
    ];
    const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = rows.map((r) =>
      [
        r.booking_code || r.booking_id,
        r.passenger_name,
        r.flight_no,
        `${r.from_code}-${r.to_code}`,
        r.depart_time,
        r.seat_number,
        r.check_in_number,
        r.boarding_pass_number || '',
        r.gate || '',
        r.terminal || '',
        r.status,
        r.check_in_time,
      ]
        .map(escape)
        .join(',')
    );
    const csv = '\uFEFF' + [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `checkin-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    onToast?.success('Đã xuất CSV', `${rows.length} dòng check-in.`);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
            <Icon name="ClipboardDocumentCheckIcon" size={22} className="text-emerald-400" />
            Quản lý làm thủ tục
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {totalCount.toLocaleString('vi-VN')} lượt check-in · huỷ để mở lại ghế cho khách
          </p>
        </div>
        <button
          type="button"
          onClick={handleExportCsv}
          disabled={rows.length === 0}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-500/20 border border-emerald-500/30 hover:bg-emerald-500/30 transition-all active:scale-95 disabled:opacity-40"
        >
          <Icon name="ArrowDownTrayIcon" size={14} />
          Xuất CSV
        </button>
        <button
          type="button"
          onClick={() => fetchRows(currentPage, debouncedSearch, filterStatus)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-500/20 border border-indigo-500/30 hover:bg-indigo-500/30 transition-all active:scale-95"
        >
          <Icon name="ArrowPathIcon" size={14} className={isLoading ? 'animate-spin' : ''} />
          Làm mới
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Icon
            name="MagnifyingGlassIcon"
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
          />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm PNR, tên khách, số hiệu chuyến, mã check-in…"
            className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm text-white placeholder:text-slate-500 bg-white/5 border border-white/10 focus:outline-none focus:border-indigo-400"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => {
            setFilterStatus(e.target.value);
            setCurrentPage(1);
          }}
          className="px-3 py-2.5 rounded-xl text-sm text-white bg-white/5 border border-white/10 focus:outline-none"
        >
          <option value="all">Tất cả trạng thái</option>
          <option value="pending">Chờ</option>
          <option value="confirmed">Đã xác nhận</option>
          <option value="completed">Hoàn thành</option>
          <option value="cancelled">Đã huỷ</option>
        </select>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-white/10 overflow-hidden bg-white/[0.02]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="text-left text-2xs uppercase tracking-widest text-slate-500 border-b border-white/10">
                <th className="px-4 py-3 font-bold">Khách / PNR</th>
                <th className="px-4 py-3 font-bold">Chuyến bay</th>
                <th className="px-4 py-3 font-bold">Ghế</th>
                <th className="px-4 py-3 font-bold">Mã check-in</th>
                <th className="px-4 py-3 font-bold">Giờ check-in</th>
                <th className="px-4 py-3 font-bold">Trạng thái</th>
                <th className="px-4 py-3 font-bold text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                    Đang tải…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                    Chưa có lượt check-in nào.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const meta = STATUS_META[r.status] || { label: r.status, cls: 'badge-info' };
                  return (
                    <tr key={r.id} className="border-b border-white/5 hover:bg-white/[0.03]">
                      <td className="px-4 py-3">
                        <div className="font-bold text-white">{r.passenger_name}</div>
                        <div className="text-2xs text-slate-500 font-mono">
                          {r.booking_code || r.booking_id.slice(0, 8)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-bold text-sky-300 font-mono">{r.flight_no}</div>
                        <div className="text-2xs text-slate-500">
                          {r.from_code} → {r.to_code} · {formatDateTime(r.depart_time)}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-white">{r.seat_number}</td>
                      <td className="px-4 py-3 font-mono text-2xs text-slate-300">
                        {r.check_in_number}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-300">
                        {formatDateTime(r.check_in_time)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={meta.cls}>{meta.label}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setDetail(r)}
                            className="px-3 py-1.5 rounded-lg text-2xs font-bold text-indigo-300 bg-indigo-500/15 border border-indigo-500/30 hover:bg-indigo-500/25"
                          >
                            Chi tiết
                          </button>
                          {r.status !== 'cancelled' && (
                            <button
                              type="button"
                              disabled={cancellingId === r.id}
                              onClick={() => handleCancel(r)}
                              className="px-3 py-1.5 rounded-lg text-2xs font-bold text-rose-300 bg-rose-500/15 border border-rose-500/30 hover:bg-rose-500/25 disabled:opacity-50"
                            >
                              {cancellingId === r.id ? 'Đang huỷ…' : 'Huỷ'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-white/10">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={(p) => fetchRows(p, debouncedSearch, filterStatus)}
            />
          </div>
        )}
      </div>

      {/* Detail modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDetail(null)} />
          <div className="relative w-full max-w-md rounded-2xl bg-slate-900 border border-white/10 p-6 space-y-4">
            <h3 className="text-base font-black text-white">Chi tiết check-in</h3>
            <dl className="space-y-2 text-sm">
              {[
                ['Hành khách', detail.passenger_name],
                ['PNR', detail.booking_code || detail.booking_id],
                ['Chuyến bay', `${detail.flight_no} · ${detail.from_code} → ${detail.to_code}`],
                ['Giờ bay', formatDateTime(detail.depart_time)],
                ['Ghế', detail.seat_number],
                ['Mã check-in', detail.check_in_number],
                ['Thẻ lên tàu', detail.boarding_pass_number || '—'],
                ['Cổng / Nhà ga', `${detail.gate || '—'} / ${detail.terminal || '—'}`],
                ['Email tài khoản', detail.user_email || '—'],
                ['Giờ check-in', formatDateTime(detail.check_in_time)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="text-white font-semibold text-right font-mono text-xs">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-300 bg-white/5 border border-white/10 hover:bg-white/10"
              >
                Đóng
              </button>
              {detail.status !== 'cancelled' && (
                <button
                  type="button"
                  disabled={cancellingId === detail.id}
                  onClick={() => handleCancel(detail)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 disabled:opacity-50"
                >
                  Huỷ check-in
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
