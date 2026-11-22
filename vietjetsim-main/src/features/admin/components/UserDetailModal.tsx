'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Icon } from '@/shared/components/ui';
import { useToast } from '@/hooks/useToast';
import { apiRequest, getApiErrorMessage } from '@/shared/services';

interface UserDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string | null;
}

interface UserDetail {
  id: string;
  email: string;
  full_name: string;
  role: string;
  phone: string | null;
  skyjoy_member_id: string | null;
  email_verified: boolean;
  phone_verified: boolean;
  created_at: string;
  updated_at: string;
  last_login: string | null;
  locked_until: string | null;
  operator_notes: string | null;
  bookings_count: number;
  total_spent: number;
  wallet_balance: number;
  loyalty_tier: string;
  loyalty_points: number;
  sessions: Array<{
    id: string;
    device_name: string;
    device_type: string;
    browser: string;
    os: string;
    ip_address: string;
    last_active: string;
    is_current: boolean;
  }>;
  recent_bookings: Array<{
    id: string;
    booking_code: string;
    status: string;
    total_price: number;
    created_at: string;
    flight_no: string;
    route: string;
  }>;
  recent_payments: Array<{
    id: string;
    amount: number;
    method: string;
    status: string;
    created_at: string;
  }>;
  chat_conversations: Array<{
    id: string;
    status: string;
    last_message: string | null;
    updated_at: string;
  }>;
}

export default function UserDetailModal({ isOpen, onClose, userId }: UserDetailModalProps) {
  const toast = useToast();
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<
    'overview' | 'bookings' | 'wallet' | 'loyalty' | 'sessions' | 'chat'
  >('overview');

  const fetchDetail = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    try {
      const data = await apiRequest<UserDetail>(`/api/quan-tri/nguoi-dung/${userId}`);
      setDetail(data);
    } catch (error) {
      toast.error('Lỗi', getApiErrorMessage(error, 'Không thể tải chi tiết người dùng.'));
    } finally {
      setIsLoading(false);
    }
  }, [userId, toast]);

  useEffect(() => {
    if (isOpen && userId) {
      fetchDetail();
    } else {
      setDetail(null);
    }
  }, [isOpen, userId, fetchDetail]);

  if (!isOpen || !userId) return null;

  const formatCurrency = (amount: number) => amount.toLocaleString('vi-VN') + '₫';
  const formatDate = (dateStr: string | null) =>
    dateStr ? new Date(dateStr).toLocaleString('vi-VN') : '—';
  const formatDateOnly = (dateStr: string | null) =>
    dateStr ? new Date(dateStr).toLocaleDateString('vi-VN') : '—';

  const tabs = [
    { id: 'overview', label: 'Tổng quan', icon: 'UserCircleIcon' },
    {
      id: 'bookings',
      label: `Đặt vé (${detail?.recent_bookings.length || 0})`,
      icon: 'TicketIcon',
    },
    {
      id: 'wallet',
      label: `Ví (${formatCurrency(detail?.wallet_balance || 0)})`,
      icon: 'WalletIcon',
    },
    {
      id: 'loyalty',
      label: `Thành viên (${detail?.loyalty_points || 0}đ)`,
      icon: 'BadgeCheckIcon',
    },
    { id: 'sessions', label: `Phiên (${detail?.sessions.length || 0})`, icon: 'DeviceMobileIcon' },
    {
      id: 'chat',
      label: `Chat (${detail?.chat_conversations.length || 0})`,
      icon: 'ChatBubbleLeftRightIcon',
    },
  ];

  const getRoleBadge = (role: string) => {
    const map: Record<string, { label: string; bg: string }> = {
      user: { label: 'Người dùng', bg: 'var(--vj-navy)' },
      admin: { label: 'Hệ Thống', bg: 'var(--primary)' },
      super_admin: { label: 'Hệ Thống Cấp Cao', bg: 'var(--primary-deep)' },
    };
    return map[role] || { label: role, bg: 'var(--foreground-muted)' };
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; bg: string; text: string }> = {
      confirmed: { label: 'Đã xác nhận', bg: 'bg-green-100', text: 'text-green-700' },
      pending: { label: 'Chờ xác nhận', bg: 'bg-yellow-100', text: 'text-yellow-700' },
      cancelled: { label: 'Đã huỷ', bg: 'bg-red-100', text: 'text-red-700' },
      completed: { label: 'Hoàn thành', bg: 'bg-blue-100', text: 'text-blue-700' },
      refunded: { label: 'Đã hoàn tiền', bg: 'bg-purple-100', text: 'text-purple-700' },
    };
    return map[status] || { label: status, bg: 'bg-gray-100', text: 'text-gray-700' };
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-[var(--surface)] rounded-2xl p-8 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-[var(--surface-2)] rounded w-1/4" />
            <div className="h-4 bg-[var(--surface-2)] rounded w-1/2" />
            <div className="h-4 bg-[var(--surface-2)] rounded w-1/3" />
            <div className="grid grid-cols-3 gap-4 mt-4">
              <div className="h-20 bg-[var(--surface-2)] rounded" />
              <div className="h-20 bg-[var(--surface-2)] rounded" />
              <div className="h-20 bg-[var(--surface-2)] rounded" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-[var(--surface)] rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[var(--border)]">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-[var(--primary)]/10 flex items-center justify-center">
              <span className="text-2xl font-bold text-[var(--primary)] font-[KoHo,sans-serif]">
                {detail?.full_name?.charAt(0).toUpperCase() || 'U'}
              </span>
            </div>
            <div>
              <h2 className="text-xl font-bold font-[KoHo,sans-serif] text-[var(--foreground)]">
                {detail?.full_name || 'Người dùng'}
              </h2>
              <p className="text-sm text-[var(--foreground-muted)] font-[Be_Vietnam_Pro,sans-serif]">
                {detail?.email}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`px-3 py-1 rounded-full text-xs font-semibold font-[KoHo,sans-serif] ${getRoleBadge(detail?.role || '').bg}`}
            >
              {getRoleBadge(detail?.role || '').label}
            </span>
            {detail?.locked_until && new Date(detail.locked_until) > new Date() && (
              <span className="px-3 py-1 rounded-full text-xs font-semibold font-[KoHo,sans-serif] bg-red-100 text-red-700">
                Đã khoá
              </span>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-lg bg-[var(--surface-2)] hover:bg-[var(--surface-3)] transition-colors"
            >
              <Icon name="XMarkIcon" size={20} className="text-[var(--foreground-muted)]" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-[var(--border)]">
          <nav className="flex overflow-x-auto px-6 -mb-px" role="tablist">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`flex items-center gap-2 px-4 py-3 font-medium text-sm font-[KoHo,sans-serif] border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-[var(--primary)] text-[var(--primary)]'
                    : 'border-transparent text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
                }`}
                role="tab"
                aria-selected={activeTab === tab.id}
              >
                <Icon name={tab.icon} size={18} />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Info Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <InfoCard label="ID" value={detail?.id || '—'} />
                <InfoCard label="Email" value={detail?.email || '—'} />
                <InfoCard label="Số điện thoại" value={detail?.phone || '—'} />
                <InfoCard label="Mã SkyJoy" value={detail?.skyjoy_member_id || '—'} />
                <InfoCard
                  label="Email xác thực"
                  value={detail?.email_verified ? '✅ Có' : '❌ Chưa'}
                />
                <InfoCard
                  label="SĐT xác thực"
                  value={detail?.phone_verified ? '✅ Có' : '❌ Chưa'}
                />
                <InfoCard label="Ngày tạo" value={formatDateOnly(detail?.created_at ?? null)} />
                <InfoCard label="Đăng nhập cuối" value={formatDate(detail?.last_login ?? null)} />
              </div>

              {/* Stats */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <StatCard
                  label="Số đặt vé"
                  value={String(detail?.bookings_count || 0)}
                  icon="TicketIcon"
                  color="var(--primary)"
                />
                <StatCard
                  label="Tổng chi tiêu"
                  value={
                    detail?.total_spent ? detail.total_spent.toLocaleString('vi-VN') + '₫' : '0₫'
                  }
                  icon="CurrencyDollarIcon"
                  color="var(--vj-navy)"
                />
                <StatCard
                  label="Số dư ví"
                  value={
                    detail?.wallet_balance
                      ? detail.wallet_balance.toLocaleString('vi-VN') + '₫'
                      : '0₫'
                  }
                  icon="WalletIcon"
                  color="var(--vj-purple)"
                />
                <StatCard
                  label="Điểm SkyJoy"
                  value={
                    detail?.loyalty_points
                      ? detail.loyalty_points.toLocaleString('vi-VN') + 'đ'
                      : '0đ'
                  }
                  icon="BadgeCheckIcon"
                  color="var(--vj-purple)"
                />
              </div>

              {/* Operator Notes */}
              {detail?.operator_notes && (
                <div className="bg-[var(--surface-2)] rounded-vj p-4">
                  <h4 className="font-semibold text-[var(--foreground)] mb-2">Ghi chú vận hành</h4>
                  <p className="text-[var(--foreground-muted)] whitespace-pre-wrap">
                    {detail.operator_notes}
                  </p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'bookings' && (
            <div className="space-y-4">
              {detail?.recent_bookings.length === 0 ? (
                <div className="text-center py-8 text-[var(--foreground-muted)]">
                  <Icon name="TicketIcon" size={32} className="mx-auto mb-2 opacity-50" />
                  <p>Chưa có đặt vé nào</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[var(--foreground-muted)] border-b border-[var(--border)]">
                        <th className="pb-2">Mã đặt chỗ</th>
                        <th className="pb-2">Chuyến bay</th>
                        <th className="pb-2">Tuyến</th>
                        <th className="pb-2">Trạng thái</th>
                        <th className="pb-2">Giá trị</th>
                        <th className="pb-2">Ngày tạo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail?.recent_bookings.map((b) => (
                        <tr key={b.id} className="border-b border-[var(--border)]">
                          <td className="py-3 font-mono font-[KoHo,sans-serif]">
                            {b.booking_code}
                          </td>
                          <td className="py-3">{b.flight_no}</td>
                          <td className="py-3">{b.route}</td>
                          <td className="py-3">
                            <span
                              className={`px-2 py-1 rounded text-xs font-semibold ${getStatusBadge(b.status).bg} ${getStatusBadge(b.status).text}`}
                            >
                              {getStatusBadge(b.status).label}
                            </span>
                          </td>
                          <td className="py-3">{b.total_price.toLocaleString('vi-VN')}₫</td>
                          <td className="py-3 text-[var(--foreground-muted)]">
                            {formatDateOnly(b.created_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'wallet' && (
            <div className="space-y-6">
              <div className="bg-[var(--surface-2)] rounded-2xl p-6 text-center">
                <p className="text-sm text-[var(--foreground-muted)]">Số dư hiện tại</p>
                <p className="text-4xl font-bold font-[KoHo,sans-serif] text-[var(--vj-purple)] mt-2">
                  {detail?.wallet_balance?.toLocaleString('vi-VN') || 0}₫
                </p>
              </div>
              <div className="bg-[var(--surface)] rounded-vj border border-[var(--border)] p-4">
                <h4 className="font-semibold mb-3">Lịch sử giao dịch (giả lập)</h4>
                <p className="text-[var(--foreground-muted)]">
                  Tích hợp với wallet_transactions table khi cần.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'loyalty' && (
            <div className="space-y-6">
              <div className="bg-[var(--vj-purple)]/10 border border-[var(--vj-purple)]/30 rounded-2xl p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-[var(--vj-purple)] font-[Be_Vietnam_Pro,sans-serif]">
                      Hạng thành viên
                    </p>
                    <p className="text-2xl font-bold font-[KoHo,sans-serif] text-[var(--vj-purple)]">
                      {detail?.loyalty_tier || 'Bronze'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-[var(--vj-purple)]">Điểm hiện tại</p>
                    <p className="text-3xl font-bold font-[KoHo,sans-serif] text-[var(--vj-purple)]">
                      {detail?.loyalty_points?.toLocaleString('vi-VN') || 0}đ
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-[var(--surface)] rounded-vj border border-[var(--border)] p-4">
                <h4 className="font-semibold mb-3">Lịch sử tích điểm (giả lập)</h4>
                <p className="text-[var(--foreground-muted)]">
                  Tích hợp với loyalty_transactions table khi cần.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'sessions' && (
            <div className="space-y-4">
              {detail?.sessions.length === 0 ? (
                <div className="text-center py-8 text-[var(--foreground-muted)]">
                  <Icon name="DeviceMobileIcon" size={32} className="mx-auto mb-2 opacity-50" />
                  <p>Không có phiên hoạt động</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[var(--foreground-muted)] border-b border-[var(--border)]">
                        <th className="pb-2">Thiết bị</th>
                        <th className="pb-2">Trình duyệt/OS</th>
                        <th className="pb-2">IP</th>
                        <th className="pb-2">Hoạt động cuối</th>
                        <th className="pb-2">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail?.sessions.map((s) => (
                        <tr key={s.id} className="border-b border-[var(--border)]">
                          <td className="py-3">
                            <div className="flex items-center gap-2">
                              <Icon
                                name={
                                  s.device_type === 'mobile'
                                    ? 'DeviceMobileIcon'
                                    : s.device_type === 'tablet'
                                      ? 'TabletIcon'
                                      : 'DesktopComputerIcon'
                                }
                                size={18}
                                className="text-[var(--primary)]"
                              />
                              <span className="font-[KoHo,sans-serif]">
                                {s.device_name || 'Unknown'}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 text-[var(--foreground-muted)]">
                            {s.browser} / {s.os}
                          </td>
                          <td className="py-3 font-mono">{s.ip_address}</td>
                          <td className="py-3 text-[var(--foreground-muted)]">
                            {formatDate(s.last_active)}
                          </td>
                          <td className="py-3">
                            {s.is_current ? (
                              <span className="px-2 py-1 rounded text-xs font-semibold bg-green-100 text-green-700">
                                Đang dùng
                              </span>
                            ) : (
                              <span className="px-2 py-1 rounded text-xs font-semibold bg-gray-100 text-gray-700">
                                Cũ
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'chat' && (
            <div className="space-y-4">
              {detail?.chat_conversations.length === 0 ? (
                <div className="text-center py-8 text-[var(--foreground-muted)]">
                  <Icon
                    name="ChatBubbleLeftRightIcon"
                    size={32}
                    className="mx-auto mb-2 opacity-50"
                  />
                  <p>Chưa có cuộc hội thoại nào</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {detail?.chat_conversations.map((c) => (
                    <div
                      key={c.id}
                      className="bg-[var(--surface)] rounded-vj border border-[var(--border)] p-4"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-[var(--foreground)]">
                            Cuộc hội thoại #{c.id.slice(0, 8)}
                          </p>
                          <p className="text-sm text-[var(--foreground-muted)]">
                            {c.last_message
                              ? `Tin nhắn cuối: ${c.last_message.slice(0, 50)}...`
                              : 'Chưa có tin nhắn'}
                          </p>
                        </div>
                        <span
                          className={`px-2 py-1 rounded text-xs font-semibold ${c.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}
                        >
                          {c.status === 'active' ? 'Đang mở' : 'Đã lưu'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="bg-[var(--surface)] rounded-vj border border-[var(--border)] p-4">
      <p className="text-xs text-[var(--foreground-muted)] font-[Be_Vietnam_Pro,sans-serif]">
        {label}
      </p>
      <p className="text-sm font-semibold text-[var(--foreground)] font-[KoHo,sans-serif] mt-1 truncate">
        {value}
      </p>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: IconName,
  color,
}: {
  label: string;
  value: string;
  icon: string;
  color: string;
}) {
  return (
    <div className="bg-[var(--surface)] rounded-vj border border-[var(--border)] p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-[var(--foreground-muted)] font-[Be_Vietnam_Pro,sans-serif]">
            {label}
          </p>
          <p className="text-lg font-bold font-[KoHo,sans-serif] text-[var(--foreground)] mt-1">
            {value}
          </p>
        </div>
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center"
          style={{ background: `${color}/10` }}
        >
          <Icon name={IconName} size={24} style={{ color }} />
        </div>
      </div>
    </div>
  );
}
