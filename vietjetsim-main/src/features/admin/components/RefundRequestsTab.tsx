'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Icon } from '@/shared/components/ui';
import { Pagination } from '@/shared/components/ui';
import {
  listRefunds,
  updateRefund,
  setRefundVisibility,
  updateRefundDetails,
  setRefundFeatureLock,
} from '@/features/admin';
import type { AdminRefund } from '@/features/admin/types';
import { ADMIN_CARD_STYLE } from './AdminSection';
import { getApiErrorMessage } from '@/shared/services';

interface ToastAPI {
  success: (title: string, message?: string, options?: object) => void;
  error: (title: string, message?: string, options?: object) => void;
  warning: (title: string, message?: string, options?: object) => void;
  info: (title: string, message?: string, options?: object) => void;
}

/**
 * All six states the column's CHECK (migration 037) allows, not just the three
 * an operator can set. `completed`, `processed` and `archived` all reach this
 * table: `completed` through the same approve/reject modal, and the other two
 * through SQL. Rendering fell back to the raw English key for them, so a ticket
 * the operator could see in the queue read "archived" in the status pill.
 */
type RefundStatus = 'pending' | 'approved' | 'rejected' | 'completed' | 'processed' | 'archived';

interface RefundRequest {
  id: string;
  bookingId: string;
  userId: string;
  userName: string;
  userEmail: string;
  flightNo: string;
  route: string;
  flightDate: string;
  amount: number;
  reason: string;
  note: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  status: RefundStatus;
  adminNote: string;
  createdAt: string;
  processedAt?: string;
  bookingCode: string;
  phone: string;
  visibleToUser: boolean;
}

const STATUS_MAP: Partial<Record<RefundStatus, { label: string; cls: string; icon: string }>> = {
  pending: {
    label: 'Chờ duyệt',
    cls: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
    icon: 'ClockIcon',
  },
  approved: {
    label: 'Đã duyệt',
    cls: 'bg-emerald-400/10 text-vj-pay-green-text border border-emerald-400/30',
    icon: 'CheckCircleIcon',
  },
  rejected: {
    label: 'Từ chối',
    cls: 'bg-red-400/10 text-red-400 border border-red-400/30',
    icon: 'XCircleIcon',
  },
  // Reachable through the same approve modal as `approved` — the route treats
  // both as "settle the booking", and an operator told a customer the money was
  // sent should see that on the ticket.
  completed: {
    label: 'Đã hoàn tiền',
    cls: 'bg-teal-500/10 text-teal-300 border border-teal-500/20',
    icon: 'BanknotesIcon',
  },
  // `processed` and `archived` have no writer in the app; they exist in the
  // column's CHECK so an archived row renders properly if one is ever restored.
  processed: {
    label: 'Đã xử lý',
    cls: 'bg-slate-500 text-vj-admin-muted border border-vj-border-light',
    icon: 'InboxIcon',
  },
  archived: {
    label: 'Đã lưu trữ',
    cls: 'bg-slate-500 text-vj-admin-muted border border-vj-border-light',
    icon: 'ArchiveBoxIcon',
  },
};

const PAGE_SIZE = 5;

export default function RefundRequestsTab({ onToast }: { onToast?: ToastAPI }) {
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [requests, setRequests] = useState<RefundRequest[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | RefundStatus>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<RefundRequest | null>(null);
  const [viewingRequest, setViewingRequest] = useState<RefundRequest | null>(null);
  const [modalAction, setModalAction] = useState<'approve' | 'reject' | null>(null);
  const [adminNote, setAdminNote] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [featureEnabled, setFeatureEnabled] = useState(true);
  const [togglingLock, setTogglingLock] = useState(false);
  const [editing, setEditing] = useState<RefundRequest | null>(null);
  const [editForm, setEditForm] = useState({
    bankName: '',
    accountNumber: '',
    accountHolder: '',
    phone: '',
    reason: '',
    adminNote: '',
  });
  const [_error, setError] = useState<string | null>(null);

  const mapRow = (row: AdminRefund): RefundRequest => ({
    id: row.id,
    bookingId: row.booking_id ?? '',
    userId: row.user_id ?? '',
    userName: row.user_name || row.user_email?.split('@')[0] || 'Khách hàng',
    userEmail: row.user_email || '',
    flightNo: row.flight_no || '',
    route: row.route || '',
    flightDate: row.flight_date || '',
    // `amount` is NUMERIC, which the driver returns as a *string*. Summing those
    // with `+` concatenates, so the header total rendered "01975873.00₫" and
    // `amount > 0` became a string comparison. Coerce once, here, so every
    // consumer below receives a number.
    amount: Number(row.amount) || 0,
    reason: row.reason || '',
    note: row.note || '',
    bankName: row.bank_name || '',
    accountNumber: row.account_number || '',
    accountHolder: row.account_holder || '',
    bookingCode: row.booking_code || '',
    phone: row.phone || '',
    visibleToUser: row.visible_to_user === true,
    // Migration 037 made this column NOT NULL with a CHECK over six values, so
    // the cast is now honest — this type used to claim three while the database
    // could hand back anything.
    status: (row.status as RefundStatus) ?? 'pending',
    adminNote: row.admin_note || '',
    createdAt: row.created_at
      ? new Date(row.created_at).toLocaleString('vi-VN', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '',
    processedAt: row.processed_at
      ? new Date(row.processed_at).toLocaleString('vi-VN', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : undefined,
  });

  const loadRequests = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await listRefunds();
      setRequests((result.refunds || []).map(mapRow));
      if (typeof result.refundFeatureEnabled === 'boolean') {
        setFeatureEnabled(result.refundFeatureEnabled);
      }
    } catch (e) {
      console.error('Load refund requests error:', e);
      setError('Không thể tải dữ liệu');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRequests();
    // Poll for changes every 10 seconds
    pollingRef.current = setInterval(loadRequests, 10000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [loadRequests]);

  const filtered = requests.filter((r) => {
    const matchSearch =
      r.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.bookingId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.route.toLowerCase().includes(searchQuery.toLowerCase());
    const matchStatus = filterStatus === 'all' || r.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const openModal = (request: RefundRequest, action: 'approve' | 'reject') => {
    setSelectedRequest(request);
    setModalAction(action);
    setAdminNote('');
  };

  const closeModal = () => {
    setSelectedRequest(null);
    setModalAction(null);
    setAdminNote('');
  };

  const handleConfirm = async () => {
    if (!selectedRequest || !modalAction) return;
    setProcessingId(selectedRequest.id);
    try {
      const newStatus = modalAction === 'approve' ? 'approved' : 'rejected';
      await updateRefund({
        refundId: selectedRequest.id,
        status: newStatus,
        admin_note: adminNote.trim() || undefined,
      });
      // Optimistic update
      setRequests((prev) =>
        prev.map((r) =>
          r.id === selectedRequest.id
            ? {
                ...r,
                status: newStatus as RefundStatus,
                processedAt: new Date().toLocaleString('vi-VN', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                }),
                adminNote: adminNote.trim(),
              }
            : r
        )
      );
      if (modalAction === 'approve') {
        onToast?.success(
          'Đã duyệt hoàn tiền',
          `Yêu cầu #${selectedRequest.bookingId} của ${selectedRequest.userName} đã được chấp thuận.`
        );
      } else {
        onToast?.warning(
          'Đã từ chối hoàn tiền',
          `Yêu cầu #${selectedRequest.bookingId} của ${selectedRequest.userName} đã bị từ chối.`
        );
      }
      closeModal();
    } catch (e) {
      console.error('Update refund error:', e);
      onToast?.error(
        'Lỗi hệ thống',
        getApiErrorMessage(e, 'Đã xảy ra lỗi không mong muốn. Vui lòng thử lại.')
      );
    } finally {
      setProcessingId(null);
    }
  };

  const pendingCount = requests.filter((r) => r.status === 'pending').length;
  const approvedCount = requests.filter((r) => r.status === 'approved').length;
  const handleToggleLock = async () => {
    const next = !featureEnabled;
    setTogglingLock(true);
    try {
      await setRefundFeatureLock(next);
      setFeatureEnabled(next);
      onToast?.success(
        next ? 'Đã mở khoá hoàn tiền' : 'Đã khoá hoàn tiền',
        next
          ? 'Khách hàng có thể gửi yêu cầu hoàn tiền trở lại.'
          : 'Khách hàng sẽ không thể gửi yêu cầu hoàn tiền mới.'
      );
    } catch (e) {
      onToast?.error(
        'Thao tác thất bại',
        getApiErrorMessage(e, 'Không thể thay đổi trạng thái khoá')
      );
    } finally {
      setTogglingLock(false);
    }
  };

  const handleToggleVisibility = async (req: RefundRequest) => {
    setProcessingId(req.id);
    const next = !req.visibleToUser;
    try {
      await setRefundVisibility({ refundId: req.id, visible: next });
      setRequests((prev) => prev.map((r) => (r.id === req.id ? { ...r, visibleToUser: next } : r)));
      onToast?.success(
        next ? 'Đã hiển thị phiếu cho khách' : 'Đã ẩn phiếu khỏi khách hàng',
        next
          ? 'Khách hàng sẽ thấy đầy đủ thông tin phiếu.'
          : 'Khách hàng sẽ không thấy phiếu này nữa.'
      );
    } catch (e) {
      onToast?.error('Thao tác thất bại', getApiErrorMessage(e, 'Không thể cập nhật'));
    } finally {
      setProcessingId(null);
    }
  };

  const openEditModal = (req: RefundRequest) => {
    setEditing(req);
    setEditForm({
      bankName: req.bankName,
      accountNumber: req.accountNumber,
      accountHolder: req.accountHolder,
      phone: req.phone,
      reason: req.reason,
      adminNote: req.adminNote,
    });
  };

  const handleSaveEdit = async () => {
    if (!editing) return;
    setProcessingId(editing.id);
    try {
      await updateRefundDetails({
        refundId: editing.id,
        bank_name: editForm.bankName.trim(),
        account_number: editForm.accountNumber.trim(),
        account_holder: editForm.accountHolder.trim(),
        phone: editForm.phone.trim(),
        reason: editForm.reason.trim(),
        admin_note: editForm.adminNote.trim(),
      });
      setRequests((prev) =>
        prev.map((r) =>
          r.id === editing.id
            ? {
                ...r,
                bankName: editForm.bankName.trim(),
                accountNumber: editForm.accountNumber.trim(),
                accountHolder: editForm.accountHolder.trim(),
                phone: editForm.phone.trim(),
                reason: editForm.reason.trim(),
                adminNote: editForm.adminNote.trim(),
              }
            : r
        )
      );
      setEditing(null);
      onToast?.success('Đã cập nhật phiếu hoàn tiền');
    } catch (e) {
      onToast?.error('Thao tác thất bại', getApiErrorMessage(e, 'Không thể lưu thay đổi'));
    } finally {
      setProcessingId(null);
    }
  };

  const totalRefundAmount = requests
    .filter((r) => r.status === 'approved')
    .reduce((s, r) => s + r.amount, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
            <Icon name="BanknotesIcon" size={24} className="text-red-400" />
            Duyệt phiếu hoàn tiền
          </h2>
          <p className="text-xs font-bold text-vj-admin-muted uppercase tracking-widest mt-1 opacity-70">
            {requests.length} yêu cầu hoàn tiền tổng cộng
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleLock}
            disabled={togglingLock}
            className={`flex items-center gap-2 text-2xs font-black uppercase tracking-widest px-4 py-2 rounded-2xl border transition-all disabled:opacity-50 ${
              featureEnabled
                ? 'bg-vj-pay-green border-vj-pay-green text-vj-pay-green-text'
                : 'bg-vj-red-dark border-vj-red-dark text-red-400'
            }`}
            title={featureEnabled ? 'Khoá tính năng hoàn tiền' : 'Mở khoá tính năng hoàn tiền'}
          >
            <Icon name={featureEnabled ? 'LockOpenIcon' : 'LockClosedIcon'} size={14} />
            {featureEnabled ? 'Đang mở' : 'Đang khoá'}
          </button>
          {pendingCount > 0 && (
            <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-2xs font-black uppercase tracking-widest px-4 py-2 rounded-2xl">
              <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
              {pendingCount} chờ xử lý
            </div>
          )}
          <button
            onClick={loadRequests}
            className="w-10 h-10 flex items-center justify-center text-vj-admin-muted hover:text-white bg-white/5 hover:bg-white/10 border border-white/5 rounded-2xl transition-all"
            title="Tải lại"
          >
            <Icon name="ArrowPathIcon" size={18} />
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-800 border border-white/5 rounded-3xl p-5 hover:border-white/10 transition-all group">
          <p className="text-2xs font-black text-vj-admin-muted uppercase tracking-widest mb-1 group-hover:text-vj-admin-muted transition-colors">
            Tổng yêu cầu
          </p>
          <p className="text-3xl font-black text-white tabular-nums tracking-tighter">
            {requests.length}
          </p>
        </div>
        <div className="bg-amber-500/5 border border-amber-500/10 rounded-3xl p-5 hover:border-amber-500/20 transition-all group">
          <p className="text-2xs font-black text-amber-500/70 uppercase tracking-widest mb-1">
            Đang chờ
          </p>
          <p className="text-3xl font-black text-amber-400 tabular-nums tracking-tighter">
            {pendingCount}
          </p>
        </div>
        <div className="bg-vj-pay-green border border-vj-pay-green rounded-3xl p-5 hover:border-vj-pay-green transition-all group">
          <p className="text-2xs font-black text-vj-pay-green-text uppercase tracking-widest mb-1">
            Đã duyệt
          </p>
          <p className="text-3xl font-black text-vj-pay-green-text tabular-nums tracking-tighter">
            {approvedCount}
          </p>
        </div>
        <div className="bg-vj-red-dark border border-vj-red-dark rounded-3xl p-5 hover:border-vj-red-dark transition-all group overflow-hidden relative">
          <div className="relative z-10">
            <p className="text-2xs font-black text-red-400 uppercase tracking-widest mb-1">
              Đã hoàn tiền
            </p>
            <p className="text-2xl font-black text-white tabular-nums tracking-tighter mt-1">
              {totalRefundAmount.toLocaleString('vi-VN')}₫
            </p>
          </div>
          <Icon
            name="CurrencyDollarIcon"
            size={64}
            className="absolute -right-4 -bottom-4 text-red-400 rotate-12"
          />
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        <div className="relative flex-1 group">
          <Icon
            name="MagnifyingGlassIcon"
            size={18}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-vj-admin-muted group-focus-within:text-red-400 transition-colors"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Tìm mã phiếu, mã đặt chỗ, tên khách hàng..."
            className="w-full pl-12 pr-4 py-3 bg-slate-800 border border-white/5 rounded-2xl text-sm font-semibold text-white placeholder-slate-600 focus:outline-none focus:border-vj-red-dark transition-all focus:bg-slate-800"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filterStatus}
            onChange={(e) => {
              setFilterStatus(e.target.value as 'all' | RefundStatus);
              setCurrentPage(1);
            }}
            className="px-4 py-3 bg-slate-800 border border-white/5 rounded-2xl text-sm font-bold text-vj-admin-muted focus:outline-none focus:border-vj-red-dark appearance-none cursor-pointer"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="pending">Chờ duyệt</option>
            <option value="approved">Đã duyệt</option>
            <option value="completed">Đã hoàn tiền</option>
            <option value="rejected">Từ chối</option>
            <option value="processed">Đã xử lý</option>
            <option value="archived">Đã lưu trữ</option>
          </select>
          {(searchQuery || filterStatus !== 'all') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setFilterStatus('all');
                setCurrentPage(1);
              }}
              className="flex items-center gap-2 text-2xs font-black uppercase tracking-widest text-vj-admin-muted hover:text-red-400 transition-all px-4 py-3 rounded-2xl border border-white/5 hover:border-vj-red-dark"
            >
              <Icon name="XMarkIcon" size={14} />
              Xoá bộ lọc
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div
        className="rounded-2xl border overflow-hidden"
        style={{ ...ADMIN_CARD_STYLE, padding: 0 }}
      >
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left text-2xs font-black text-vj-admin-muted uppercase tracking-widest px-5 py-4 whitespace-nowrap">
                  Mã phiếu
                </th>
                <th className="text-left text-2xs font-black text-vj-admin-muted uppercase tracking-widest px-5 py-4 whitespace-nowrap">
                  Khách hàng
                </th>
                <th className="text-left text-2xs font-black text-vj-admin-muted uppercase tracking-widest px-5 py-4 hidden sm:table-cell whitespace-nowrap">
                  Chuyến bay
                </th>
                <th className="text-left text-2xs font-black text-vj-admin-muted uppercase tracking-widest px-5 py-4 hidden md:table-cell">
                  Lý do
                </th>
                <th className="text-right text-2xs font-black text-vj-admin-muted uppercase tracking-widest px-5 py-4 whitespace-nowrap">
                  Số tiền
                </th>
                <th className="text-center text-2xs font-black text-vj-admin-muted uppercase tracking-widest px-5 py-4 whitespace-nowrap">
                  Trạng thái
                </th>
                <th className="text-center text-2xs font-black text-vj-admin-muted uppercase tracking-widest px-5 py-4 whitespace-nowrap">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [1, 2, 3, 4, 5].map((i) => (
                  <tr key={i} className="border-b border-white/5 animate-pulse">
                    <td className="px-5 py-3.5">
                      <div className="h-4 w-16 bg-slate-500 rounded-full" />
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="h-4 w-28 bg-slate-500 rounded-full mb-1.5" />
                      <div className="h-3 w-20 bg-slate-500 rounded-full" />
                    </td>
                    <td className="px-5 py-3.5 hidden sm:table-cell">
                      <div className="h-4 w-16 bg-slate-500 rounded-full mb-1.5" />
                      <div className="h-3 w-24 bg-slate-500 rounded-full" />
                    </td>
                    <td className="px-5 py-3.5 hidden md:table-cell">
                      <div className="h-4 w-40 bg-slate-500 rounded-full" />
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="h-4 w-20 bg-slate-500 rounded-full ml-auto" />
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <div className="h-6 w-20 bg-slate-500 rounded-full mx-auto" />
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <div className="h-6 w-28 bg-slate-500 rounded-full mx-auto" />
                    </td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center">
                    <div className="flex flex-col sm:flex-row items-center gap-6 max-w-md mx-auto text-left animate-[fadeInUp_0.35s_ease-out]">
                      {/* Illustrated empty state */}
                      <div className="shrink-0 w-32 h-32 flex items-center justify-center">
                        <img
                          src="/assets/empty-refund-requests.svg"
                          alt="Không có yêu cầu hoàn tiền"
                          className="w-full h-full object-contain"
                        />
                      </div>
                      <div className="text-center sm:text-left flex-1">
                        <p className="font-black text-base mb-1.5 text-white">
                          {searchQuery || filterStatus !== 'all'
                            ? 'Không tìm thấy phiếu hoàn tiền'
                            : 'Chưa có yêu cầu hoàn tiền'}
                        </p>
                        <p className="text-xs text-vj-admin-muted mb-4 leading-relaxed max-w-xs">
                          {searchQuery || filterStatus !== 'all'
                            ? 'Bộ lọc hiện tại không khớp với phiếu nào. Hãy thử thay đổi tiêu chí tìm kiếm.'
                            : 'Chưa có yêu cầu hoàn tiền nào từ khách hàng. Các phiếu mới sẽ xuất hiện tại đây khi được gửi.'}
                        </p>
                        <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                          {(searchQuery || filterStatus !== 'all') && (
                            <button
                              onClick={() => {
                                setSearchQuery('');
                                setFilterStatus('all');
                                setCurrentPage(1);
                              }}
                              className="flex items-center gap-1.5 text-xs font-bold text-white bg-primary hover:bg-primary-dark px-4 py-2 rounded-vj transition-all shadow-glow-red hover:shadow-none"
                            >
                              <Icon name="ArrowPathIcon" size={13} />
                              Đặt lại bộ lọc
                            </button>
                          )}
                          <button
                            onClick={loadRequests}
                            className="flex items-center gap-1.5 text-xs font-semibold text-vj-admin-muted border border-white/10 bg-white/5 hover:bg-white/10 px-4 py-2 rounded-vj transition-all"
                          >
                            <Icon name="ArrowPathIcon" size={13} />
                            Tải lại
                          </button>
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                paginated.map((req) => (
                  <tr
                    key={req.id}
                    className="border-b border-white/5 hover:bg-white/5 transition-colors"
                  >
                    <td className="px-5 py-3.5">
                      <div className="font-mono font-bold text-xs text-white">
                        {req.id.slice(0, 8).toUpperCase()}
                      </div>
                      <div className="text-xs text-vj-admin-muted mt-0.5">#{req.bookingId}</div>
                      <div className="text-xs text-vj-admin-muted mt-0.5">{req.createdAt}</div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="font-medium text-white text-sm">{req.userName}</div>
                      <div className="text-xs text-vj-admin-muted">{req.userEmail}</div>
                    </td>
                    <td className="px-5 py-3.5 hidden sm:table-cell">
                      <div className="font-semibold text-white text-sm">{req.flightNo || '—'}</div>
                      <div className="text-xs text-vj-admin-muted">
                        {req.route}
                        {req.flightDate ? ` · ${req.flightDate}` : ''}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 hidden md:table-cell max-w-[200px]">
                      <p className="text-xs text-vj-admin-muted line-clamp-2">{req.reason}</p>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span className="font-black text-sm text-white">
                        {req.amount > 0 ? req.amount.toLocaleString('vi-VN') + '₫' : '—'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full ${STATUS_MAP[req.status]?.cls ?? ''}`}
                      >
                        <Icon
                          name={STATUS_MAP[req.status]?.icon ?? 'QuestionMarkCircleIcon'}
                          size={10}
                        />
                        {STATUS_MAP[req.status]?.label ?? req.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <div className="flex items-center justify-center gap-1 mb-1.5">
                        <button
                          onClick={() => openEditModal(req)}
                          disabled={processingId === req.id}
                          className="flex items-center gap-1 text-xs font-bold text-vj-admin-muted bg-white/5 hover:bg-white/10 border border-white/10 px-2 py-1 rounded-vj transition-all disabled:opacity-50"
                          title="Chỉnh sửa thông tin phiếu"
                        >
                          <Icon name="PencilSquareIcon" size={11} />
                          Sửa
                        </button>
                        <button
                          onClick={() => handleToggleVisibility(req)}
                          disabled={processingId === req.id}
                          className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-vj border transition-all disabled:opacity-50 ${
                            req.visibleToUser
                              ? 'text-vj-admin-muted bg-white/5 hover:bg-white/10 border-white/10'
                              : 'text-vj-pay-green-text bg-vj-pay-green hover:bg-vj-pay-green border-vj-pay-green'
                          }`}
                          title={
                            req.visibleToUser
                              ? 'Ẩn phiếu khỏi khách hàng'
                              : 'Hiển thị phiếu cho khách hàng'
                          }
                        >
                          <Icon name={req.visibleToUser ? 'EyeSlashIcon' : 'EyeIcon'} size={11} />
                          {req.visibleToUser ? 'Ẩn' : 'Hiện'}
                        </button>
                      </div>
                      {req.status === 'pending' ? (
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => openModal(req, 'approve')}
                            disabled={processingId === req.id}
                            className="flex items-center gap-1 text-xs font-bold text-vj-pay-green-text bg-vj-pay-green hover:bg-vj-pay-green border border-vj-pay-green px-2 py-1 rounded-vj transition-all disabled:opacity-50"
                          >
                            <Icon name="CheckIcon" size={11} />
                            Duyệt
                          </button>
                          <button
                            onClick={() => openModal(req, 'reject')}
                            disabled={processingId === req.id}
                            className="flex items-center gap-1 text-xs font-bold text-red-400 bg-red-500/10 hover:bg-vj-surface-rose border border-red-500/20 px-2 py-1 rounded-vj transition-all disabled:opacity-50"
                          >
                            <Icon name="XMarkIcon" size={11} />
                            Từ chối
                          </button>
                        </div>
                      ) : (
                        <div className="text-center">
                          <div className="text-xs text-vj-admin-muted">{req.processedAt}</div>
                          {req.adminNote && (
                            <div
                              className="text-xs text-vj-admin-muted mt-0.5 max-w-[140px] mx-auto line-clamp-1"
                              title={req.adminNote}
                            >
                              {req.adminNote}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {filtered.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between px-5 py-3 border-t border-white/5 gap-3">
            <div className="flex items-center gap-3">
              <p className="text-xs text-vj-admin-muted font-medium">
                {filtered.length > pageSize
                  ? `Hiển thị ${(safePage - 1) * pageSize + 1}–${Math.min(safePage * pageSize, filtered.length)} / ${filtered.length} phiếu`
                  : `${filtered.length} phiếu`}
              </p>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-vj-admin-muted">Hiển thị:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="text-xs font-semibold border border-white/10 rounded-vj px-2 py-1 bg-slate-900 text-white focus:outline-none focus:border-primary cursor-pointer"
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                </select>
                <span className="text-xs text-vj-admin-muted">hàng</span>
              </div>
            </div>
            {totalPages > 1 && (
              <Pagination
                currentPage={safePage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                siblingCount={1}
              />
            )}
          </div>
        )}
      </div>

      {/* Approve / Reject Confirmation Modal */}
      {selectedRequest && modalAction && (
        <div className="fixed inset-0 bg-slate-950 backdrop-blur-md z-[110] flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="w-full max-w-md bg-slate-900 border border-white/10 rounded-vj-oval shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-300">
            {/* Header */}
            <div
              className={`px-8 py-8 border-b border-white/5 flex items-center gap-4 ${modalAction === 'approve' ? 'bg-vj-pay-green' : 'bg-vj-red-dark'}`}
            >
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center border shadow-vj-lg ${modalAction === 'approve' ? 'bg-vj-pay-green border-vj-pay-green text-vj-pay-green-text' : 'bg-vj-red-dark border-vj-red-dark text-red-400'}`}
              >
                <Icon
                  name={modalAction === 'approve' ? 'CheckCircleIcon' : 'XCircleIcon'}
                  size={24}
                />
              </div>
              <div>
                <h3 className="text-lg font-black text-white tracking-tight">
                  {modalAction === 'approve' ? 'Duyệt hoàn tiền' : 'Từ chối hoàn tiền'}
                </h3>
                <p className="text-2xs font-black text-vj-admin-muted uppercase tracking-widest mt-0.5">
                  #{selectedRequest.id.slice(0, 8)} • {selectedRequest.userName}
                </p>
              </div>
            </div>

            <div className="p-8 space-y-6">
              <div>
                <p className="text-2xs font-black text-vj-admin-muted uppercase tracking-widest opacity-60 mb-2">
                  Lời nhắn Hệ Thống
                </p>
                <textarea
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  placeholder={
                    modalAction === 'approve'
                      ? 'Ví dụ: Đã đủ điều kiện. Chấp thuận hoàn trả.'
                      : 'Ví dụ: Không đúng chính sách hoàn tiền.'
                  }
                  className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-sm font-bold text-white placeholder-slate-600 focus:outline-none focus:border-white/20 h-24 resize-none transition-all"
                />
              </div>

              <div className="p-4 bg-white/5 rounded-2xl border border-white/5 flex gap-3 items-center">
                <Icon
                  name="InformationCircleIcon"
                  size={18}
                  className="text-vj-admin-muted shrink-0"
                />
                <p className="text-xs2 font-bold text-vj-admin-muted leading-relaxed uppercase tracking-wider">
                  {modalAction === 'approve'
                    ? 'Số tiền sẽ được chuyển trả về tài khoản đã cung cấp.'
                    : 'Quyết định này sẽ được gửi tới khách hàng.'}
                </p>
              </div>
            </div>

            <div className="p-8 flex gap-3 border-t border-white/5">
              <button
                onClick={closeModal}
                className="flex-1 px-6 py-4 bg-white/5 hover:bg-white/10 text-vj-admin-muted hover:text-white rounded-2xl text-2xs font-black uppercase tracking-widest transition-all"
              >
                Huỷ bỏ
              </button>
              <button
                onClick={handleConfirm}
                disabled={processingId !== null}
                className={`flex-1 px-6 py-4 rounded-2xl text-2xs font-black uppercase tracking-widest transition-all shadow-vj-lg active:scale-98 text-white ${modalAction === 'approve' ? 'bg-vj-pay-green hover:bg-vj-pay-green shadow-vj-sm' : 'bg-vj-red-dark hover:bg-vj-red-dark shadow-vj-sm'}`}
              >
                {processingId ? 'Đang xử lý...' : 'Xác nhận ngay'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Comprehensive Detail View Modal */}
      {viewingRequest && (
        <div className="fixed inset-0 bg-slate-950 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div
            className="w-full max-w-2xl bg-slate-900 border border-white/10 rounded-vj-oval overflow-hidden shadow-2xl relative animate-in zoom-in-95 duration-300"
            style={{
              background:
                'linear-gradient(135deg, rgba(30, 41, 59, 0.98) 0%, rgba(15, 23, 42, 0.98) 100%)',
              boxShadow: '0 25px 70px -12px rgba(0, 0, 0, 0.5), 0 0 40px rgba(99, 102, 241, 0.1)',
            }}
          >
            {/* Modal Header */}
            <div className="px-8 py-8 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
              <div className="flex items-center gap-5">
                <div className="w-14 h-14 bg-vj-red-dark rounded-2xl flex items-center justify-center border border-vj-red-dark shadow-vj-lg shadow-vj-sm">
                  <Icon name="BanknotesIcon" size={28} className="text-red-400" />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-white tracking-tight">
                    Chi tiết yêu cầu
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-2xs font-black text-vj-admin-muted uppercase tracking-[0.2em]">
                      Phiếu:{' '}
                      <span className="text-red-400 font-mono tracking-normal">
                        #{viewingRequest.id.slice(0, 8)}
                      </span>
                    </span>
                    <span className="text-vj-admin-muted px-1">•</span>
                    <span
                      className={`text-3xs font-black px-2 py-0.5 rounded-vj uppercase tracking-wider ${STATUS_MAP[viewingRequest.status]?.cls ?? ''}`}
                    >
                      {STATUS_MAP[viewingRequest.status]?.label ?? viewingRequest.status}
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setViewingRequest(null)}
                className="w-12 h-12 bg-white/5 hover:bg-white/10 text-vj-admin-muted hover:text-white rounded-2xl flex items-center justify-center transition-all active:scale-90 border border-white/5"
              >
                <Icon name="XMarkIcon" size={24} />
              </button>
            </div>

            <div className="p-8 pb-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                {/* Left Column: Customer & Case */}
                <div className="space-y-8">
                  <section>
                    <label className="text-2xs font-black text-vj-admin-muted uppercase tracking-[0.2em] mb-4 block">
                      Thông tin khách hàng
                    </label>
                    <div className="bg-white/[0.02] border border-white/5 rounded-3xl p-5 flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-vj-admin-muted font-black text-lg border border-white/10">
                        {viewingRequest.userName.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-white">{viewingRequest.userName}</p>
                        <p className="text-2xs font-bold text-vj-admin-muted uppercase tracking-wider mt-0.5">
                          {viewingRequest.userEmail}
                        </p>
                      </div>
                    </div>
                  </section>

                  <section>
                    <label className="text-2xs font-black text-vj-admin-muted uppercase tracking-[0.2em] mb-4 block">
                      Nội dung hoàn tiền
                    </label>
                    <div className="space-y-4">
                      <div className="bg-slate-800 p-4 rounded-2xl border border-white/5">
                        <p className="text-2xs font-black text-vj-admin-muted uppercase tracking-widest mb-1.5">
                          Lý do chính thức
                        </p>
                        <p className="text-xs font-bold text-vj-admin-muted leading-relaxed italic">
                          &ldquo;{viewingRequest.reason}&rdquo;
                        </p>
                        {viewingRequest.note && (
                          <p className="text-xs2 text-vj-admin-muted mt-3 border-t border-white/5 pt-3 leading-relaxed">
                            {viewingRequest.note}
                          </p>
                        )}
                      </div>
                    </div>
                  </section>
                </div>

                {/* Right Column: Financial & Flight */}
                <div className="space-y-8">
                  <section>
                    <label className="text-2xs font-black text-vj-admin-muted uppercase tracking-[0.2em] mb-4 block">
                      Chuyến bay liên quan
                    </label>
                    <div className="bg-vj-blue border border-vj-blue rounded-3xl p-5 flex items-center gap-4">
                      <div className="w-10 h-10 rounded-vj bg-vj-blue flex items-center justify-center text-vj-bank-blue-text border border-vj-blue">
                        <Icon name="PaperAirplaneIcon" size={18} />
                      </div>
                      <div>
                        <p className="text-sm font-black text-vj-admin-muted">
                          #{viewingRequest.bookingId} · {viewingRequest.flightNo}
                        </p>
                        <p className="text-2xs font-black text-vj-bank-blue-text uppercase tracking-widest mt-0.5">
                          {viewingRequest.route}
                        </p>
                      </div>
                    </div>
                  </section>

                  <section>
                    <label className="text-2xs font-black text-vj-admin-muted uppercase tracking-[0.2em] mb-4 block">
                      Tài khoản nhận tiền
                    </label>
                    <div className="bg-slate-800 border border-white/5 rounded-3xl p-5 space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-2xs font-black text-vj-admin-muted uppercase tracking-widest">
                          Ngân hàng
                        </span>
                        <span className="text-xs font-bold text-white">
                          {viewingRequest.bankName}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-2xs font-black text-vj-admin-muted uppercase tracking-widest">
                          Số tài khoản
                        </span>
                        <span className="text-sm font-mono font-bold text-red-400 whitespace-nowrap">
                          {viewingRequest.accountNumber}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-2xs font-black text-vj-admin-muted uppercase tracking-widest">
                          Chủ tài khoản
                        </span>
                        <span className="text-xs font-bold text-white uppercase">
                          {viewingRequest.accountHolder}
                        </span>
                      </div>
                    </div>
                  </section>
                </div>
              </div>

              {/* Refund Value Section */}
              <div className="mt-8 bg-slate-950 border border-white/10 rounded-3xl p-6 flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-3xl group-hover:scale-150 transition-all duration-1000" />
                <div className="relative z-10">
                  <p className="text-2xs font-black text-vj-admin-muted uppercase tracking-[0.2em] mb-1 text-center md:text-left">
                    Giá trị hoàn trả
                  </p>
                  <p className="text-4xl font-black text-white tabular-nums tracking-tighter text-center md:text-left">
                    {viewingRequest.amount.toLocaleString('vi-VN')}₫
                  </p>
                </div>
                <div className="relative z-10 w-full md:w-auto h-[1px] md:h-12 md:w-[1px] bg-white/10" />
                <div className="relative z-10 flex flex-col items-center md:items-end">
                  <p className="text-2xs font-black text-vj-admin-muted uppercase tracking-[0.2em] mb-1">
                    Ngày yêu cầu
                  </p>
                  <p className="text-sm font-bold text-vj-admin-muted">
                    {viewingRequest.createdAt.split(',')[0]}
                  </p>
                  <p className="text-2xs font-bold text-vj-admin-muted mt-0.5">
                    {viewingRequest.createdAt.split(',')[1]}
                  </p>
                </div>
              </div>
            </div>

            {/* Admin Note if processed */}
            {viewingRequest.status !== 'pending' && viewingRequest.adminNote && (
              <div className="px-8 pt-4">
                <div className="p-4 bg-white/5 border border-white/5 rounded-2xl">
                  <p className="text-2xs font-black text-vj-admin-muted uppercase tracking-widest">
                    Ghi chú quản trị
                  </p>
                  <p className="text-xs font-bold text-vj-admin-muted mt-1">
                    &ldquo;{viewingRequest.adminNote}&rdquo;
                  </p>
                </div>
              </div>
            )}

            {/* Modal Actions */}
            <div className="p-8 flex flex-col sm:flex-row gap-4">
              {viewingRequest.status === 'pending' ? (
                <>
                  <button
                    onClick={() => openModal(viewingRequest, 'approve')}
                    className="flex-1 px-8 py-4 bg-vj-pay-green hover:bg-vj-pay-green text-white rounded-2xl text-2xs font-black uppercase tracking-[0.2em] transition-all shadow-vj-lg shadow-vj-sm active:scale-98"
                  >
                    Duyệt hoàn tiền
                  </button>
                  <button
                    onClick={() => openModal(viewingRequest, 'reject')}
                    className="flex-1 px-8 py-4 bg-vj-red-dark hover:bg-vj-red-dark text-white rounded-2xl text-2xs font-black uppercase tracking-[0.2em] transition-all shadow-vj-lg shadow-vj-sm active:scale-98"
                  >
                    Từ chối yêu cầu
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setViewingRequest(null)}
                  className="flex-1 px-8 py-4 bg-white/5 hover:bg-white/10 text-vj-admin-muted hover:text-white border border-white/5 rounded-2xl text-2xs font-black uppercase tracking-[0.2em] transition-all"
                >
                  Đóng cửa sổ
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Edit payout details */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-slate-900 border border-white/10 rounded-3xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-lg font-black text-white">Chỉnh sửa phiếu hoàn tiền</h3>
                <p className="text-xs text-vj-admin-muted mt-0.5">
                  Mã đặt chỗ: {editing.bookingCode || editing.bookingId || '—'}
                </p>
              </div>
              <button
                onClick={() => setEditing(null)}
                className="w-8 h-8 flex items-center justify-center text-vj-admin-muted hover:text-white transition-colors"
              >
                <Icon name="XMarkIcon" size={18} />
              </button>
            </div>

            <div className="space-y-3">
              {(
                [
                  ['bankName', 'Ngân hàng nhận tiền'],
                  ['accountNumber', 'Số tài khoản'],
                  ['accountHolder', 'Họ và tên chủ tài khoản'],
                  ['phone', 'Số điện thoại'],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <label className="block text-2xs font-black text-vj-admin-muted uppercase tracking-widest mb-1.5">
                    {label}
                  </label>
                  <input
                    type="text"
                    value={editForm[key]}
                    onChange={(e) => setEditForm((f) => ({ ...f, [key]: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-slate-800 border border-white/10 rounded-vj text-sm text-white focus:outline-none focus:border-vj-red-dark transition-colors"
                  />
                </div>
              ))}

              <div>
                <label className="block text-2xs font-black text-vj-admin-muted uppercase tracking-widest mb-1.5">
                  Lý do hoàn tiền
                </label>
                <textarea
                  value={editForm.reason}
                  onChange={(e) => setEditForm((f) => ({ ...f, reason: e.target.value }))}
                  rows={2}
                  className="w-full px-3 py-2.5 bg-slate-800 border border-white/10 rounded-vj text-sm text-white focus:outline-none focus:border-vj-red-dark transition-colors resize-none"
                />
              </div>

              <div>
                <label className="block text-2xs font-black text-vj-admin-muted uppercase tracking-widest mb-1.5">
                  Ghi chú nội bộ / hiển thị cho khách
                </label>
                <textarea
                  value={editForm.adminNote}
                  onChange={(e) => setEditForm((f) => ({ ...f, adminNote: e.target.value }))}
                  rows={2}
                  className="w-full px-3 py-2.5 bg-slate-800 border border-white/10 rounded-vj text-sm text-white focus:outline-none focus:border-vj-red-dark transition-colors resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleSaveEdit}
                disabled={processingId === editing.id}
                className="flex-1 px-6 py-3 bg-vj-red-dark hover:bg-vj-red-dark text-white rounded-2xl text-2xs font-black uppercase tracking-[0.2em] transition-all disabled:opacity-50"
              >
                Lưu thay đổi
              </button>
              <button
                onClick={() => setEditing(null)}
                className="px-6 py-3 bg-white/5 hover:bg-white/10 text-vj-admin-muted hover:text-white border border-white/5 rounded-2xl text-2xs font-black uppercase tracking-[0.2em] transition-all"
              >
                Huỷ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
