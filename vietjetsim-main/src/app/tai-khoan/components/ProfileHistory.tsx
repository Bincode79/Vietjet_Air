'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Icon } from '@/shared/components/ui';
import { apiRequest } from '@/shared/services';
import ProfileHistoryItem from './ProfileHistoryItem';

function getActionIcon(action: string): string {
  if (action.includes('delete') || action.includes('unlink')) return 'TrashIcon';
  if (action.includes('update') || action.includes('change')) return 'PencilIcon';
  if (action.includes('link')) return 'LinkIcon';
  if (action.includes('avatar')) return 'PhotoIcon';
  if (action.includes('password')) return 'KeyIcon';
  return 'ShieldCheckIcon';
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'success':
      return 'text-green-600 bg-green-50';
    case 'failed':
      return 'text-red-600 bg-red-50';
    default:
      return 'text-gray-600 bg-gray-50';
  }
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export interface HistoryItem {
  id: string;
  action: string;
  actionLabel: string;
  details: Record<string, unknown>;
  status: string;
  createdAt: string;
}

interface ProfileHistoryProps {
  className?: string;
}

export default function ProfileHistory({ className = '' }: ProfileHistoryProps) {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [filterAction, setFilterAction] = useState<string>('');
  const LIMIT = 10;

  const fetchHistory = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(LIMIT),
      });
      if (filterAction) params.set('action', filterAction);

      const data = await apiRequest<{
        history: HistoryItem[];
        pagination: { page: number; limit: number; total: number; totalPages: number };
      }>(`/api/nguoi-dung/profile/history?${params.toString()}`);

      setHistory(data.history);
      setTotal(data.pagination.total);
      setTotalPages(data.pagination.totalPages);
    } catch (error) {
      console.error('Failed to fetch profile history:', error);
    } finally {
      setIsLoading(false);
    }
  }, [page, filterAction]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const renderDetails = (details: Record<string, unknown>) => {
    if (!details || Object.keys(details).length === 0) return null;
    return (
      <details className="mt-2">
        <summary className="text-xs text-[var(--foreground-muted)] cursor-pointer font-[Be_Vietnam_Pro,sans-serif]">
          Xem chi tiết
        </summary>
        <pre className="mt-2 p-3 bg-[var(--surface-2)] rounded text-xs overflow-x-auto font-mono text-[var(--foreground-muted)]">
          {JSON.stringify(details, null, 2)}
        </pre>
      </details>
    );
  };

  return (
    <div className={className}>
      {/* Filter */}
      <div className="flex items-center gap-4 mb-4">
        <label className="text-sm font-medium text-[var(--foreground)]">Lọc theo hành động:</label>
        <select
          value={filterAction}
          onChange={(e) => {
            setFilterAction(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-vj text-sm font-[Be_Vietnam_Pro,sans-serif] text-[var(--foreground)]"
        >
          <option value="">Tất cả</option>
          <option value="update_profile">Cập nhật hồ sơ</option>
          <option value="change_password">Đổi mật khẩu</option>
          <option value="update_avatar">Cập nhật avatar</option>
          <option value="delete_avatar">Xóa avatar</option>
          <option value="link_skyjoy">Liên kết SkyJoy</option>
          <option value="unlink_skyjoy">Hủy liên kết SkyJoy</option>
          <option value="enable_2fa">Bật 2FA</option>
          <option value="disable_2fa">Tắt 2FA</option>
        </select>
      </div>

      {/* History List */}
      <div className="space-y-3">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="h-20 bg-[var(--surface-2)] rounded-vj" />
            </div>
          ))
        ) : history.length === 0 ? (
          <div className="text-center py-8 text-[var(--foreground-muted)]">
            <Icon name="ClockIcon" size={32} className="mx-auto mb-2 opacity-50" />
            <p>Chưa có lịch sử thay đổi</p>
          </div>
        ) : (
          history.map((item) => (
            <ProfileHistoryItem
              key={item.id}
              item={item}
              formatDateTime={formatDateTime}
              getStatusColor={getStatusColor}
              getActionIcon={getActionIcon}
              renderDetails={renderDetails}
            />
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-vj text-sm font-[Be_Vietnam_Pro,sans-serif] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Icon name="ChevronLeftIcon" size={16} />
          </button>
          <span className="px-4 text-sm font-[Be_Vietnam_Pro,sans-serif] text-[var(--foreground)]">
            Trang {page} / {totalPages} ({total} bản ghi)
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-4 py-2 bg-[var(--surface)] border border-[var(--border)] rounded-vj text-sm font-[Be_Vietnam_Pro,sans-serif] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Icon name="ChevronRightIcon" size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
