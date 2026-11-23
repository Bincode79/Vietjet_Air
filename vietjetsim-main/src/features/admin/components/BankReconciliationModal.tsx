'use client';

import React, { useState } from 'react';
import { Icon } from '@/shared/components/ui';
import { reconcileBankTransactions, type BankReconciliationResponse } from '../services';

interface BankReconciliationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (message: string) => void;
}

const DEMO_SAMPLE_TEXT = `FT241124001, 2026-11-24, 899000, VJ644052 NGUYEN VAN A THANH TOAN VE
FT241124002, 2026-11-24, 1500000, VJSMOKE CHUYEN KHOAN VE MAY BAY VJ 120
FT241124003, 2026-11-24, 500000, VJ644052 CHUYEN THIEU TIEN
FT241124004, 2026-11-24, 2100000, GD CHUYEN TIEN KHONG CO MA VE PNR
FT241124005, 2026-11-24, 1250000, VJ999ABC LE THI B THANH TOAN`;

export default function BankReconciliationModal({
  isOpen,
  onClose,
  onSuccess,
}: BankReconciliationModalProps) {
  const [inputText, setInputText] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [reconcileData, setReconcileData] = useState<BankReconciliationResponse | null>(null);
  const [filterTab, setFilterTab] = useState<
    'all' | 'matched' | 'mismatch' | 'already_settled' | 'unmatched'
  >('all');
  const [selectedPnrs, setSelectedPnrs] = useState<Set<string>>(new Set());
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSettling, setIsSettling] = useState<boolean>(false);

  if (!isOpen) return null;

  /**
   * Parser chuyển văn bản thô (CSV, Tab-delimited, copy từ Excel/Internet Banking)
   * thành danh sách các dòng giao dịch có cấu trúc.
   */
  const parseRawStatementText = (raw: string) => {
    const lines = raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const parsed: Array<{ refId?: string; date?: string; amount: number; description: string }> =
      [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Bỏ qua header nếu có
      if (
        line.toLowerCase().includes('mã gd') ||
        (line.toLowerCase().includes('ref') && line.toLowerCase().includes('số tiền'))
      ) {
        continue;
      }

      // Phân tách bởi tab hoặc dấu phẩy hoặc chấm phẩy
      let parts = line.includes('\t') ? line.split('\t') : line.split(/[,;]/);
      parts = parts.map((p) => p.trim());

      if (parts.length >= 3) {
        // Cột 1: Ref ID, Cột 2: Ngày, Cột 3: Số tiền, Cột 4: Nội dung
        const refId = parts[0];
        const date = parts.length >= 4 ? parts[1] : undefined;
        const amountStr = (parts.length >= 4 ? parts[2] : parts[1]).replace(/[^0-9]/g, '');
        const amount = Number(amountStr) || 0;
        const description = parts.length >= 4 ? parts.slice(3).join(' ') : parts.slice(2).join(' ');

        if (amount > 0 || description) {
          parsed.push({ refId, date, amount, description });
        }
      } else if (parts.length === 2) {
        // Cột 1: Số tiền, Cột 2: Nội dung (hoặc ngược lại)
        const part0Num = Number(parts[0].replace(/[^0-9]/g, ''));
        const part1Num = Number(parts[1].replace(/[^0-9]/g, ''));

        if (part0Num > 0 && isNaN(part1Num)) {
          parsed.push({ amount: part0Num, description: parts[1] });
        } else {
          parsed.push({ amount: part1Num, description: parts[0] });
        }
      }
    }

    return parsed;
  };

  const handlePreview = async () => {
    setErrorMsg(null);
    const parsedItems = parseRawStatementText(inputText);

    if (parsedItems.length === 0) {
      setErrorMsg('Vui lòng dán dữ liệu sao kê hợp lệ (chứa số tiền và nội dung chuyển khoản).');
      return;
    }

    setLoading(true);
    try {
      const res = await reconcileBankTransactions({
        action: 'preview',
        items: parsedItems,
      });
      setReconcileData(res);

      // Mặc định chọn tất cả đơn matched để sẵn sàng duyệt
      const initialSelected = new Set<string>();
      res.results.forEach((item) => {
        if (item.status === 'matched' && item.extractedPnr) {
          initialSelected.add(item.extractedPnr.toUpperCase());
        }
      });
      setSelectedPnrs(initialSelected);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi khi đối soát dữ liệu sao kê.';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSettle = async () => {
    if (!reconcileData) return;
    if (selectedPnrs.size === 0) {
      setErrorMsg('Vui lòng chọn ít nhất một đơn vé khớp để tiến hành duyệt.');
      return;
    }

    setIsSettling(true);
    setErrorMsg(null);

    const parsedItems = parseRawStatementText(inputText);

    try {
      const res = await reconcileBankTransactions({
        action: 'settle',
        items: parsedItems,
        settleBookingCodes: Array.from(selectedPnrs),
      });

      setReconcileData(res);
      if (onSuccess) {
        onSuccess(res.message);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Lỗi khi duyệt thanh toán hàng loạt.';
      setErrorMsg(msg);
    } finally {
      setIsSettling(false);
    }
  };

  const handleExportCsv = () => {
    if (!reconcileData || reconcileData.results.length === 0) return;

    const headers = [
      'STT',
      'Mã GD Ngân hàng',
      'Ngày',
      'Số tiền CK (VND)',
      'Nội dung CK',
      'Mã PNR trích xuất',
      'Hành khách',
      'Chuyến bay',
      'Tiền vé thực tế (VND)',
      'Chênh lệch (VND)',
      'Trạng thái đối soát',
      'Đã duyệt xuất vé',
    ];

    const rows = reconcileData.results.map((r, idx) => [
      idx + 1,
      r.refId,
      r.date,
      r.amount,
      `"${r.description.replace(/"/g, '""')}"`,
      r.extractedPnr || '—',
      `"${(r.passengerName || '—').replace(/"/g, '""')}"`,
      r.flightNo || '—',
      r.expectedAmount ?? '—',
      r.difference ?? 0,
      r.status,
      r.settled ? 'Đã duyệt' : 'Chưa',
    ]);

    const csvContent =
      '\uFEFF' + [headers.join(','), ...rows.map((row) => row.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `Bao_Cao_Doi_Soat_VietQR_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const filteredResults = reconcileData
    ? reconcileData.results.filter((item) => {
        if (filterTab === 'all') return true;
        return item.status === filterTab;
      })
    : [];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'matched':
        return {
          label: 'Khớp hoàn hảo',
          cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
        };
      case 'mismatch':
        return { label: 'Lệch số tiền', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' };
      case 'already_settled':
        return { label: 'Đã thanh toán', cls: 'bg-sky-500/15 text-sky-400 border-sky-500/30' };
      case 'unmatched':
        return {
          label: 'Không tìm thấy PNR',
          cls: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
        };
      case 'invalid_booking':
        return { label: 'Vé đã hủy/hoàn', cls: 'bg-rose-500/15 text-rose-400 border-rose-500/30' };
      default:
        return { label: status, cls: 'bg-slate-500/15 text-slate-400 border-slate-500/30' };
    }
  };

  const toggleSelectPnr = (pnr: string) => {
    setSelectedPnrs((prev) => {
      const next = new Set(prev);
      if (next.has(pnr)) {
        next.delete(pnr);
      } else {
        next.add(pnr);
      }
      return next;
    });
  };

  const toggleSelectAllMatched = () => {
    if (!reconcileData) return;
    const allMatched = reconcileData.results
      .filter((r) => r.status === 'matched' && r.extractedPnr && !r.settled)
      .map((r) => r.extractedPnr!.toUpperCase());

    const isAllSelected = allMatched.every((code) => selectedPnrs.has(code));

    setSelectedPnrs((prev) => {
      const next = new Set(prev);
      if (isAllSelected) {
        allMatched.forEach((code) => next.delete(code));
      } else {
        allMatched.forEach((code) => next.add(code));
      }
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        style={{ background: 'linear-gradient(145deg, #1e293b 0%, #0f172a 100%)' }}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center">
              <Icon name="CurrencyDollarIcon" size={22} />
            </div>
            <div>
              <h3 className="font-black text-sm uppercase tracking-wider text-white flex items-center gap-2">
                Công cụ Đối Soát VietQR & Sao Kê Ngân Hàng Tự Động
                <span className="px-2 py-0.5 rounded-full text-3xs font-black uppercase tracking-widest bg-teal-500/20 text-teal-300 border border-teal-500/30">
                  Auto-Reconcile
                </span>
              </h3>
              <p className="text-2xs font-bold text-vj-admin-muted mt-0.5">
                Bóc tách mã đặt chỗ (PNR), tự động so khớp số tiền và kích hoạt xuất vé hàng loạt
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

        {/* Body Container */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {errorMsg && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs flex items-center gap-2">
              <Icon name="ExclamationTriangleIcon" size={16} />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Input Section */}
          <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <Icon name="DocumentTextIcon" size={16} className="text-teal-400" />
                <span>Dán dữ liệu sao kê ngân hàng (CSV / Text / Tab-delimited)</span>
              </label>
              <button
                type="button"
                onClick={() => setInputText(DEMO_SAMPLE_TEXT)}
                className="text-2xs font-bold text-teal-400 hover:text-teal-300 transition-colors flex items-center gap-1.5 self-start sm:self-auto"
              >
                <Icon name="SparklesIcon" size={14} />
                <span>Nạp dữ liệu mẫu thử nghiệm</span>
              </button>
            </div>

            <textarea
              rows={4}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Dán các dòng sao kê từ ngân hàng vào đây...&#10;Định dạng: [Mã GD], [Ngày], [Số tiền], [Nội dung chuyển khoản chứa mã PNR]&#10;Ví dụ: FT241124001, 2026-11-24, 899000, VJ644052 NGUYEN VAN A THANH TOAN"
              className="w-full bg-slate-800/80 border border-white/10 rounded-lg p-3 text-xs font-mono text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500"
            />

            <div className="flex items-center justify-between pt-1">
              <span className="text-3xs text-vj-admin-muted font-medium">
                Hệ thống tự động nhận diện mã đặt chỗ Vietjet (VD: VJ644052, VJSMOKE) trong nội dung
                chuyển khoản.
              </span>
              <button
                type="button"
                onClick={handlePreview}
                disabled={loading || !inputText.trim()}
                className="px-5 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 active:scale-98 text-slate-950 text-xs font-black uppercase tracking-wider transition-all disabled:opacity-40 disabled:pointer-events-none flex items-center gap-2 shadow-lg shadow-teal-500/20"
              >
                {loading ? (
                  <>
                    <Icon name="ArrowPathIcon" size={14} className="animate-spin" />
                    <span>Đang so khớp...</span>
                  </>
                ) : (
                  <>
                    <Icon name="ArrowPathIcon" size={14} />
                    <span>Bắt đầu đối soát</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Results Section */}
          {reconcileData && (
            <div className="space-y-4">
              {/* Summary KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                  <span className="text-3xs font-black uppercase tracking-wider text-emerald-400 block">
                    Khớp hoàn hảo (Ready)
                  </span>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-xl font-black text-white font-mono">
                      {reconcileData.summary.matchedCount}
                    </span>
                    <span className="text-2xs font-mono font-bold text-emerald-400">
                      {reconcileData.summary.matchedAmount.toLocaleString('vi-VN')}₫
                    </span>
                  </div>
                </div>

                <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                  <span className="text-3xs font-black uppercase tracking-wider text-amber-400 block">
                    Lệch số tiền (Mismatch)
                  </span>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-xl font-black text-white font-mono">
                      {reconcileData.summary.mismatchCount}
                    </span>
                    <span className="text-2xs text-vj-admin-muted">Thừa / thiếu</span>
                  </div>
                </div>

                <div className="p-3.5 bg-sky-500/10 border border-sky-500/20 rounded-xl">
                  <span className="text-3xs font-black uppercase tracking-wider text-sky-400 block">
                    Đã thanh toán trước
                  </span>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-xl font-black text-white font-mono">
                      {reconcileData.summary.alreadySettledCount}
                    </span>
                    <span className="text-2xs text-vj-admin-muted">Tránh trùng</span>
                  </div>
                </div>

                <div className="p-3.5 bg-slate-500/10 border border-slate-500/20 rounded-xl">
                  <span className="text-3xs font-black uppercase tracking-wider text-slate-400 block">
                    Không tìm thấy PNR
                  </span>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-xl font-black text-white font-mono">
                      {reconcileData.summary.unmatchedCount}
                    </span>
                    <span className="text-2xs text-vj-admin-muted">Sai nội dung</span>
                  </div>
                </div>
              </div>

              {/* Filter Tabs & Batch Actions */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                <div className="flex items-center gap-1.5 overflow-x-auto">
                  <button
                    type="button"
                    onClick={() => setFilterTab('all')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      filterTab === 'all'
                        ? 'bg-white/10 text-white border border-white/20'
                        : 'text-vj-admin-muted hover:text-white'
                    }`}
                  >
                    Tất cả ({reconcileData.results.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterTab('matched')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      filterTab === 'matched'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'text-vj-admin-muted hover:text-emerald-400'
                    }`}
                  >
                    Khớp ({reconcileData.summary.matchedCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterTab('mismatch')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      filterTab === 'mismatch'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'text-vj-admin-muted hover:text-amber-400'
                    }`}
                  >
                    Lệch tiền ({reconcileData.summary.mismatchCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterTab('already_settled')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      filterTab === 'already_settled'
                        ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                        : 'text-vj-admin-muted hover:text-sky-400'
                    }`}
                  >
                    Đã thanh toán ({reconcileData.summary.alreadySettledCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterTab('unmatched')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      filterTab === 'unmatched'
                        ? 'bg-slate-500/20 text-slate-300 border border-slate-500/30'
                        : 'text-vj-admin-muted hover:text-slate-300'
                    }`}
                  >
                    Không khớp ({reconcileData.summary.unmatchedCount})
                  </button>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={handleExportCsv}
                    className="px-3.5 py-1.5 bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
                  >
                    <Icon name="ArrowDownTrayIcon" size={14} />
                    <span>Xuất CSV</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSettle}
                    disabled={isSettling || selectedPnrs.size === 0}
                    className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl transition-all active:scale-98 disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1.5 shadow-lg shadow-emerald-500/20"
                  >
                    {isSettling ? (
                      <>
                        <Icon name="ArrowPathIcon" size={14} className="animate-spin" />
                        <span>Đang duyệt...</span>
                      </>
                    ) : (
                      <>
                        <Icon name="CheckIcon" size={14} />
                        <span>Duyệt {selectedPnrs.size} đơn đã chọn</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Table */}
              <div className="border border-white/10 rounded-xl overflow-hidden bg-slate-950/40">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/[0.03] text-2xs font-black uppercase tracking-wider text-vj-admin-muted">
                      <th className="p-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={
                            reconcileData.results.filter(
                              (r) => r.status === 'matched' && !r.settled
                            ).length > 0 &&
                            reconcileData.results
                              .filter((r) => r.status === 'matched' && r.extractedPnr && !r.settled)
                              .every((r) => selectedPnrs.has(r.extractedPnr!.toUpperCase()))
                          }
                          onChange={toggleSelectAllMatched}
                          className="rounded bg-slate-800 border-white/20 text-emerald-500 focus:ring-emerald-500/50"
                        />
                      </th>
                      <th className="p-3">Mã GD / Ngày</th>
                      <th className="p-3">Nội dung chuyển khoản</th>
                      <th className="p-3">PNR trích xuất</th>
                      <th className="p-3 text-right">Số tiền CK</th>
                      <th className="p-3 text-right">Tiền vé</th>
                      <th className="p-3 text-center">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-medium">
                    {filteredResults.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-vj-admin-muted">
                          Không có dòng giao dịch nào trong bộ lọc này.
                        </td>
                      </tr>
                    ) : (
                      filteredResults.map((row) => {
                        const badge = getStatusBadge(row.status);
                        const isSelectable =
                          row.status === 'matched' && Boolean(row.extractedPnr) && !row.settled;
                        const isChecked = Boolean(
                          row.extractedPnr && selectedPnrs.has(row.extractedPnr.toUpperCase())
                        );

                        return (
                          <tr
                            key={row.id}
                            className={`hover:bg-white/[0.02] transition-colors ${
                              row.settled ? 'bg-emerald-500/[0.04]' : ''
                            }`}
                          >
                            <td className="p-3 text-center">
                              {isSelectable ? (
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() =>
                                    row.extractedPnr &&
                                    toggleSelectPnr(row.extractedPnr.toUpperCase())
                                  }
                                  className="rounded bg-slate-800 border-white/20 text-emerald-500 focus:ring-emerald-500/50"
                                />
                              ) : row.settled ? (
                                <span className="text-emerald-400 font-bold">✓</span>
                              ) : (
                                <span className="text-slate-600">—</span>
                              )}
                            </td>
                            <td className="p-3">
                              <span className="font-mono text-white font-bold block">
                                {row.refId}
                              </span>
                              <span className="text-3xs text-vj-admin-muted font-medium">
                                {row.date}
                              </span>
                            </td>
                            <td className="p-3 max-w-xs truncate" title={row.description}>
                              <span className="text-slate-300 text-2xs block truncate">
                                {row.description}
                              </span>
                              {row.passengerName && (
                                <span className="text-3xs text-vj-admin-muted block mt-0.5">
                                  Khách: {row.passengerName} • {row.flightNo}
                                </span>
                              )}
                            </td>
                            <td className="p-3">
                              {row.extractedPnr ? (
                                <span className="font-mono font-bold text-teal-300 bg-teal-500/10 px-2 py-0.5 rounded border border-teal-500/20">
                                  {row.extractedPnr}
                                </span>
                              ) : (
                                <span className="text-vj-admin-muted italic text-2xs">
                                  Không có
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-right font-mono font-bold text-white">
                              {row.amount.toLocaleString('vi-VN')}₫
                            </td>
                            <td className="p-3 text-right font-mono text-slate-300">
                              {row.expectedAmount !== undefined ? (
                                `${row.expectedAmount.toLocaleString('vi-VN')}₫`
                              ) : (
                                <span className="text-vj-admin-muted">—</span>
                              )}
                            </td>
                            <td className="p-3 text-center">
                              <span
                                className={`inline-block px-2.5 py-0.5 rounded-full text-3xs font-black uppercase tracking-wider border ${badge.cls}`}
                              >
                                {row.settled ? 'Đã duyệt ✓' : badge.label}
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
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-white/10 bg-white/[0.02] flex items-center justify-between">
          <span className="text-2xs text-vj-admin-muted font-bold">
            Trình đối soát tự động VietQR • Chuẩn kế toán hàng không Vietjet
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-bold transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
