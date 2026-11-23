'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Icon } from '@/shared/components/ui';
import { useToast } from '@/hooks/useToast';
import { apiRequest, getApiErrorMessage } from '@/shared/services';
import { AdminUser } from '../types';

export interface UserDetailUser extends AdminUser {
  updated_at?: string;
  skyjoy_id?: string;
  bookings?: Array<{
    id: string;
    booking_code: string;
    flight_id?: string;
    status: string;
    total_price: number;
    flight_no?: string;
    route?: string;
    created_at: string;
  }>;
  payments?: Array<{
    id: string;
    booking_id?: string;
    amount: number;
    payment_method?: string;
    status: string;
    created_at: string;
  }>;
  chat_sessions?: Array<{
    id: string;
    customer_name?: string;
    status: string;
    last_message?: string;
    created_at: string;
  }>;
  refund_requests?: Array<{
    id: string;
    booking_id: string;
    booking_code: string;
    refund_amount: number;
    status: string;
    reason: string;
    created_at: string;
  }>;
  loyalty_transactions?: Array<{
    id: string;
    points: number;
    type: string;
    description: string;
    created_at: string;
  }>;
}

export interface UserDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId?: string | null;
  user?: UserDetailUser | AdminUser | null;
  onUpdateUser?: (user: AdminUser) => void;
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
  refund_requests?: Array<{
    id: string;
    booking_id: string;
    booking_code: string;
    refund_amount: number;
    status: string;
    reason: string;
    created_at: string;
  }>;
  loyalty_transactions?: Array<{
    id: string;
    points: number;
    type: string;
    description: string;
    created_at: string;
  }>;
}

type TimelineCategory = 'all' | 'booking' | 'payment' | 'chat' | 'loyalty' | 'refund';

interface TimelineEvent {
  id: string;
  timestamp: string;
  category: TimelineCategory;
  categoryLabel: string;
  title: string;
  description: string;
  badge?: string;
  icon: string;
}

export default function UserDetailModal({ isOpen, onClose, userId, user }: UserDetailModalProps) {
  const toast = useToast();
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<
    'overview' | 'timeline' | 'bookings' | 'wallet' | 'loyalty' | 'sessions' | 'chat'
  >('overview');
  const [timelineFilter, setTimelineFilter] = useState<TimelineCategory>('all');

  const fetchDetail = useCallback(async () => {
    const targetId = userId || user?.id;
    if (!targetId) return;
    setIsLoading(true);
    try {
      const data = await apiRequest<UserDetail>(`/api/quan-tri/nguoi-dung/${targetId}`);
      setDetail(data);
    } catch (error) {
      toast.error('Lỗi', getApiErrorMessage(error, 'Không thể tải chi tiết người dùng.'));
    } finally {
      setIsLoading(false);
    }
  }, [userId, user?.id, toast]);

  useEffect(() => {
    if (!isOpen) {
      setDetail(null);
      return;
    }

    if (user) {
      const u = user as UserDetailUser;
      const mappedDetail: UserDetail = {
        id: u.id,
        email: u.email,
        full_name: u.full_name || 'Khách hàng',
        role: u.role || 'user',
        phone: u.phone || null,
        skyjoy_member_id: u.skyjoy_id || null,
        email_verified: true,
        phone_verified: false,
        created_at: u.created_at || new Date().toISOString(),
        updated_at: u.updated_at || new Date().toISOString(),
        last_login: null,
        locked_until: null,
        operator_notes: null,
        bookings_count: (u.bookings || []).length,
        total_spent: (u.bookings || []).reduce((sum, b) => sum + (Number(b.total_price) || 0), 0),
        wallet_balance: (u as { wallet_balance?: number }).wallet_balance || 0,
        loyalty_tier: (u as { loyalty_tier?: string }).loyalty_tier || 'Thành viên',
        loyalty_points: (u as { loyalty_points?: number }).loyalty_points || 0,
        sessions: (u as { sessions?: UserDetail['sessions'] }).sessions || [],
        recent_bookings: (u.bookings || []).map((b) => ({
          id: b.id,
          booking_code: b.booking_code,
          status: b.status,
          total_price: Number(b.total_price) || 0,
          created_at: b.created_at,
          flight_no: b.flight_no || 'VJ',
          route: b.route || '—',
        })),
        recent_payments: (u.payments || []).map((p) => ({
          id: p.id,
          amount: Number(p.amount) || 0,
          method: p.payment_method || 'vietqr',
          status: p.status,
          created_at: p.created_at,
        })),
        chat_conversations: (u.chat_sessions || []).map((c) => ({
          id: c.id,
          status: c.status,
          last_message: c.last_message || null,
          updated_at: c.created_at,
        })),
        refund_requests: (u.refund_requests || []).map((r) => ({
          id: r.id,
          booking_id: r.booking_id,
          booking_code: r.booking_code,
          refund_amount: Number(r.refund_amount) || 0,
          status: r.status,
          reason: r.reason || '',
          created_at: r.created_at,
        })),
        loyalty_transactions: (u.loyalty_transactions || []).map((l) => ({
          id: l.id,
          points: Number(l.points) || 0,
          type: l.type,
          description: l.description,
          created_at: l.created_at,
        })),
      };
      setDetail(mappedDetail);
    } else if (userId) {
      fetchDetail();
    }
  }, [isOpen, userId, user, fetchDetail]);

  const timelineEvents = useMemo(() => {
    if (!detail) return [];
    const events: TimelineEvent[] = [];

    // Account creation
    if (detail.created_at) {
      events.push({
        id: `reg-${detail.id}`,
        timestamp: detail.created_at,
        category: 'all',
        categoryLabel: 'Tài khoản',
        title: 'Đăng ký tài khoản thành viên',
        description: `Tài khoản ${detail.email} được tạo trên hệ thống Vietjet.`,
        icon: 'UserPlusIcon',
      });
    }

    // Bookings
    (detail.recent_bookings || []).forEach((b) => {
      events.push({
        id: `b-${b.id}`,
        timestamp: b.created_at,
        category: 'booking',
        categoryLabel: 'Đặt vé',
        title: `Đặt chỗ chuyến bay ${b.flight_no} (${b.route})`,
        description: `Mã PNR: ${b.booking_code} • Số tiền: ${b.total_price.toLocaleString('vi-VN')}₫`,
        badge: b.status,
        icon: 'TicketIcon',
      });
    });

    // Payments
    (detail.recent_payments || []).forEach((p) => {
      events.push({
        id: `pay-${p.id}`,
        timestamp: p.created_at,
        category: 'payment',
        categoryLabel: 'Thanh toán',
        title: `Thanh toán thành công qua ${p.method}`,
        description: `Số tiền: ${p.amount.toLocaleString('vi-VN')}₫ • Trạng thái: ${p.status}`,
        icon: 'CreditCardIcon',
      });
    });

    // Chat
    (detail.chat_conversations || []).forEach((c) => {
      events.push({
        id: `chat-${c.id}`,
        timestamp: c.updated_at,
        category: 'chat',
        categoryLabel: 'CSKH',
        title: 'Hỗ trợ trực tuyến qua Chat CSKH',
        description: c.last_message
          ? `Nội dung: "${c.last_message}"`
          : 'Phiên trao đổi thông tin với hỗ trợ viên.',
        badge: c.status,
        icon: 'ChatBubbleLeftRightIcon',
      });
    });

    // Refunds
    (detail.refund_requests || []).forEach((r) => {
      events.push({
        id: `ref-${r.id}`,
        timestamp: r.created_at,
        category: 'refund',
        categoryLabel: 'Hoàn vé',
        title: `Yêu cầu hoàn vé: ${r.status === 'approved' ? 'Đã duyệt' : r.status}`,
        description: `Mã PNR: ${r.booking_code} • Hoàn lại: ${r.refund_amount.toLocaleString('vi-VN')}₫. Lý do: ${r.reason}`,
        badge: r.status,
        icon: 'ArrowPathIcon',
      });
    });

    // Loyalty
    (detail.loyalty_transactions || []).forEach((l) => {
      events.push({
        id: `loy-${l.id}`,
        timestamp: l.created_at,
        category: 'loyalty',
        categoryLabel: 'Điểm thưởng',
        title: l.type === 'earn' ? 'Cộng điểm SkyJoy' : 'Tiêu điểm SkyJoy',
        description: `${l.points > 0 ? '+' : ''}${l.points} SkyPoint • ${l.description}`,
        icon: 'SparklesIcon',
      });
    });

    // Sort descending by timestamp
    return events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [detail]);

  const filteredTimeline = useMemo(() => {
    if (timelineFilter === 'all') return timelineEvents;
    return timelineEvents.filter((e) => e.category === timelineFilter);
  }, [timelineEvents, timelineFilter]);

  if (!isOpen || (!userId && !user)) return null;

  const formatCurrency = (amount: number) => amount.toLocaleString('vi-VN') + '₫';
  const formatDate = (dateStr: string | null) =>
    dateStr ? new Date(dateStr).toLocaleString('vi-VN') : '—';
  const tabs = [
    { id: 'overview', label: 'Tổng quan', icon: 'UserCircleIcon' },
    {
      id: 'timeline',
      label: 'Dòng thời gian 360°',
      icon: 'ClockIcon',
    },
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
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-8 max-w-sm w-full text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-[var(--foreground-muted)] font-[Be_Vietnam_Pro,sans-serif]">
            Đang tải thông tin khách hàng...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[var(--background)] border border-[var(--border)] rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-fade-in">
        {/* Header */}
        <div className="p-6 border-b border-[var(--border)] flex items-center justify-between bg-[var(--surface)]">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-primary/10 border-2 border-primary/20 flex items-center justify-center text-primary font-bold text-xl">
              {detail?.full_name?.charAt(0) || 'U'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold font-[KoHo,sans-serif] text-[var(--foreground)]">
                  {detail?.full_name}
                </h2>
                <span
                  className="text-xs px-2.5 py-0.5 rounded-full font-semibold text-white"
                  style={{ background: getRoleBadge(detail?.role || 'user').bg }}
                >
                  {getRoleBadge(detail?.role || 'user').label}
                </span>
                {detail?.skyjoy_member_id && (
                  <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    {detail.skyjoy_member_id}
                  </span>
                )}
              </div>
              <p className="text-sm text-[var(--foreground-muted)] font-[Be_Vietnam_Pro,sans-serif] mt-0.5">
                {detail?.email} • {detail?.phone || 'Chưa cập nhật SĐT'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-active)] rounded-vj transition-all"
          >
            <Icon name="XMarkIcon" size={20} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 p-2 border-b border-[var(--border)] bg-[var(--surface)] overflow-x-auto">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-vj text-xs font-semibold whitespace-nowrap transition-all ${
                  isActive
                    ? 'bg-primary text-white shadow-vj-sm'
                    : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-hover)]'
                }`}
              >
                <Icon name={tab.icon} size={16} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <StatCard
                  label="Tổng chi tiêu"
                  value={formatCurrency(detail?.total_spent || 0)}
                  icon="CreditCardIcon"
                  color="#10B981"
                />
                <StatCard
                  label="Số lượt bay"
                  value={`${detail?.bookings_count || 0} vé`}
                  icon="TicketIcon"
                  color="#3B82F6"
                />
                <StatCard
                  label="Số dư ví"
                  value={formatCurrency(detail?.wallet_balance || 0)}
                  icon="WalletIcon"
                  color="#8B5CF6"
                />
                <StatCard
                  label="Hạng SkyJoy"
                  value={detail?.loyalty_tier || 'Thành viên'}
                  icon="SparklesIcon"
                  color="#F59E0B"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InfoCard label="Email đăng ký" value={detail?.email || ''} />
                <InfoCard label="Số điện thoại" value={detail?.phone || 'Chưa cập nhật'} />
                <InfoCard label="Ngày tham gia" value={formatDate(detail?.created_at || null)} />
                <InfoCard
                  label="Cập nhật lần cuối"
                  value={formatDate(detail?.updated_at || null)}
                />
              </div>
            </div>
          )}

          {activeTab === 'timeline' && (
            <div className="space-y-5">
              {/* Category Filter Chips */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
                {[
                  { id: 'all', label: 'Tất cả' },
                  { id: 'booking', label: 'Đặt vé' },
                  { id: 'payment', label: 'Thanh toán' },
                  { id: 'chat', label: 'CSKH' },
                  { id: 'loyalty', label: 'Điểm thưởng' },
                  { id: 'refund', label: 'Hoàn vé' },
                ].map((chip) => (
                  <button
                    key={chip.id}
                    onClick={() => setTimelineFilter(chip.id as TimelineCategory)}
                    className={`px-3 py-1 rounded-xl font-bold transition-all ${
                      timelineFilter === chip.id
                        ? 'bg-primary text-white shadow'
                        : 'bg-white/5 text-slate-400 hover:text-white border border-white/5'
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>

              {/* Timeline Items */}
              <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-white/10">
                {filteredTimeline.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-400">
                    Chưa có sự kiện nào trong danh mục này.
                  </div>
                ) : (
                  filteredTimeline.map((item) => (
                    <div key={item.id} className="relative group">
                      <div className="absolute -left-6 top-1 w-3.5 h-3.5 rounded-full bg-primary ring-4 ring-slate-900" />
                      <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-colors">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="font-bold text-sm text-white">{item.title}</span>
                          <span className="text-xs2 text-slate-500 font-mono">
                            {new Date(item.timestamp).toLocaleString('vi-VN')}
                          </span>
                        </div>
                        <p className="text-xs text-slate-300">{item.description}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'bookings' && (
            <div className="space-y-3">
              {(detail?.recent_bookings || []).length === 0 ? (
                <p className="text-sm text-[var(--foreground-muted)] text-center py-8">
                  Chưa có lịch sử đặt vé nào.
                </p>
              ) : (
                detail?.recent_bookings.map((b) => (
                  <div
                    key={b.id}
                    className="p-4 rounded-vj border border-[var(--border)] bg-[var(--surface)] flex items-center justify-between"
                  >
                    <div>
                      <p className="font-bold text-[var(--foreground)]">
                        {b.flight_no} ({b.route})
                      </p>
                      <p className="text-xs text-[var(--foreground-muted)]">
                        PNR: {b.booking_code} • Ngày: {formatDate(b.created_at)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-primary">{formatCurrency(b.total_price)}</p>
                      <span
                        className={`text-2xs px-2 py-0.5 rounded font-bold ${getStatusBadge(b.status).bg} ${getStatusBadge(b.status).text}`}
                      >
                        {getStatusBadge(b.status).label}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'wallet' && (
            <div className="p-4 bg-[var(--surface)] rounded-vj border border-[var(--border)]">
              <p className="text-xs text-[var(--foreground-muted)]">Số dư khả dụng:</p>
              <p className="text-2xl font-black text-emerald-500 mt-1">
                {formatCurrency(detail?.wallet_balance || 0)}
              </p>
            </div>
          )}

          {activeTab === 'loyalty' && (
            <div className="p-4 bg-[var(--surface)] rounded-vj border border-[var(--border)]">
              <p className="text-xs text-[var(--foreground-muted)]">Hạng hội viên SkyJoy:</p>
              <p className="text-xl font-bold text-amber-400 mt-1">{detail?.loyalty_tier}</p>
              <p className="text-xs text-slate-400 mt-2">
                Điểm thưởng khả dụng:{' '}
                <strong className="text-white">{detail?.loyalty_points || 0} SkyPoint</strong>
              </p>
            </div>
          )}

          {activeTab === 'sessions' && (
            <div className="space-y-3">
              {(detail?.sessions || []).map((s) => (
                <div
                  key={s.id}
                  className="p-3 bg-[var(--surface)] rounded-vj border border-[var(--border)] flex justify-between text-xs"
                >
                  <div>
                    <span className="font-bold text-white">
                      {s.device_name || 'Thiết bị'} ({s.browser || 'Web'} on {s.os || 'OS'})
                    </span>
                    <p className="text-slate-400">IP: {s.ip_address}</p>
                  </div>
                  <span className="text-slate-500">{formatDate(s.last_active)}</span>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'chat' && (
            <div className="space-y-3">
              {(detail?.chat_conversations || []).map((c) => (
                <div
                  key={c.id}
                  className="p-3.5 bg-[var(--surface)] rounded-vj border border-[var(--border)] flex justify-between items-center text-xs"
                >
                  <div>
                    <p className="font-bold text-white">Hội thoại #{c.id.slice(0, 8)}</p>
                    <p className="text-slate-400">{c.last_message || 'Chưa có tin nhắn'}</p>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-white/5 text-slate-300">{c.status}</span>
                </div>
              ))}
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
