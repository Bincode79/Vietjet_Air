'use client';

import React from 'react';
import { Icon } from '@/shared/components/ui';
import { HistoryItem } from './ProfileHistory';

interface ProfileHistoryItemProps {
  item: HistoryItem;
  formatDateTime: (dateStr: string) => string;
  getStatusColor: (status: string) => string;
  getActionIcon: (action: string) => string;
  renderDetails: (details: Record<string, unknown>) => React.ReactNode | null;
}

export default function ProfileHistoryItem({
  item,
  formatDateTime,
  getStatusColor,
  getActionIcon,
  renderDetails,
}: ProfileHistoryItemProps) {
  return (
    <div
      key={item.id}
      className="bg-[var(--surface)] rounded-vj border border-[var(--border)] p-4 transition-all hover:border-[rgb(var(--primary-rgb))]/30"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-[var(--foreground)] font-[KoHo,sans-serif]">
              {item.actionLabel}
            </span>
            <span
              className={`px-2 py-0.5 rounded text-xs font-semibold ${getStatusColor(item.status)}`}
            >
              {item.status === 'success' ? 'Thành công' : 'Thất bại'}
            </span>
          </div>
          <p className="text-sm text-[var(--foreground-muted)] font-[Be_Vietnam_Pro,sans-serif]">
            {formatDateTime(item.createdAt)}
          </p>
          {renderDetails(item.details)}
        </div>
        <Icon
          name={getActionIcon(item.action)}
          size={20}
          className="text-[var(--foreground-muted)] shrink-0 mt-1"
        />
      </div>
    </div>
  );
}
