'use client';

import React, { useEffect, useState } from 'react';
import { useToast } from '@/hooks/useToast';
import { Icon } from '@/shared/components/ui';
import { ToastContainer } from '@/shared/components/feedback';
import { AdminTab } from './AdminDashboardClient';
import { useAdminDashboard } from '../hooks/useAdminDashboard';
import { exportRevenueReportPdf } from '@/features/admin';
import { KPIWidget } from './KPIWidget';
import RevenueChart from './RevenueChart';
import SeatClassPieChart from './SeatClassPieChart';
import TopRoutesBarChart from './TopRoutesBarChart';
import CancellationDonutChart from './CancellationDonutChart';
import RecentBookingsTable from './RecentBookingsTable';
import UpcomingFlightsTable from './UpcomingFlightsTable';

interface Props {
  onNavigate?: (tab: AdminTab) => void;
}

function formatCurrency(val: number): string {
  if (val >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(2)} tỷ₫`;
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)} tr₫`;
  return `${val.toLocaleString('vi-VN')}₫`;
}

/** `YYYY-MM-DD` theo múi giờ Việt Nam, khớp tham số API báo cáo. */
function vnDateString(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export default function OverviewTab({ onNavigate }: Props) {
  const { data, loading, error, lastUpdated, refetch } = useAdminDashboard();
  const [mounted, setMounted] = useState(false);
  const [exporting, setExporting] = useState(false);
  const toast = useToast();

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleExportReport = async () => {
    if (exporting) return;
    setExporting(true);
    const to = vnDateString(new Date());
    const from = vnDateString(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000));
    try {
      const blob = await exportRevenueReportPdf({ from, to });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `bao-cao-doanh-thu-${from}_${to}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Thu hồi sau khi trình duyệt đã bắt đầu tải, tránh huỷ file giữa chừng.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success('Đã xuất báo cáo', `Báo cáo doanh thu ${from} → ${to} đã được tải xuống.`);
    } catch (err) {
      toast.error(
        'Không xuất được báo cáo',
        err instanceof Error ? err.message : 'Vui lòng thử lại sau.'
      );
    } finally {
      setExporting(false);
    }
  };

  const formattedLastUpdated =
    mounted && lastUpdated
      ? lastUpdated.toLocaleTimeString('vi-VN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-2.5">
            <span className="w-3 h-3 rounded-full bg-primary animate-pulse" />
            Bảng điều khiển tổng quan
          </h2>
          <p className="text-xs text-vj-admin-muted mt-1">
            Theo dõi thời gian thực các chỉ số kinh doanh, chuyến bay và đặt chỗ Vietjet
          </p>
        </div>

        <div className="flex items-center gap-3">
          {formattedLastUpdated && (
            <span className="text-xs text-vj-admin-muted hidden sm:inline-block">
              Cập nhật lúc:{' '}
              <span className="font-mono text-vj-admin-muted font-semibold">
                {formattedLastUpdated}
              </span>
            </span>
          )}
          <button
            type="button"
            onClick={handleExportReport}
            disabled={exporting}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-vj text-xs font-bold text-white bg-vj-pay-green border border-vj-pay-green hover:bg-vj-pay-green transition-all active:scale-98 disabled:opacity-50"
          >
            <Icon
              name={exporting ? 'ArrowPathIcon' : 'ArrowDownTrayIcon'}
              size={14}
              className={exporting ? 'animate-spin' : ''}
            />
            {exporting ? 'Đang xuất…' : 'Xuất báo cáo'}
          </button>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-vj text-xs font-bold text-white bg-vj-blue border border-vj-blue hover:bg-vj-blue transition-all active:scale-98 disabled:opacity-50"
          >
            <Icon name="ArrowPathIcon" size={14} className={loading ? 'animate-spin' : ''} />
            Làm mới
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div
          className="rounded-2xl border p-5 flex flex-col sm:flex-row items-center justify-between gap-4"
          style={{
            background: 'rgba(239, 68, 68, 0.1)',
            borderColor: 'rgba(239, 68, 68, 0.3)',
          }}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-vj bg-vj-red-dark text-red-400">
              <Icon name="ExclamationTriangleIcon" size={24} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-red-400">Không thể tải dữ liệu mới nhất</h4>
              <p className="text-xs text-red-400 mt-0.5">{error}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            className="px-4 py-2 rounded-vj text-xs font-bold text-white bg-vj-red-dark hover:bg-vj-red-dark transition-colors"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && !data ? (
        <div className="space-y-6">
          {/* KPI Skeleton */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-28 rounded-2xl border animate-pulse"
                style={{
                  background: 'rgba(30, 41, 59, 0.4)',
                  borderColor: 'rgba(255, 255, 255, 0.05)',
                }}
              />
            ))}
          </div>

          {/* Charts Skeleton */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div
              className="h-[340px] rounded-2xl border animate-pulse"
              style={{
                background: 'rgba(30, 41, 59, 0.4)',
                borderColor: 'rgba(255, 255, 255, 0.05)',
              }}
            />
            <div
              className="h-[340px] rounded-2xl border animate-pulse"
              style={{
                background: 'rgba(30, 41, 59, 0.4)',
                borderColor: 'rgba(255, 255, 255, 0.05)',
              }}
            />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div
              className="h-[340px] rounded-2xl border animate-pulse"
              style={{
                background: 'rgba(30, 41, 59, 0.4)',
                borderColor: 'rgba(255, 255, 255, 0.05)',
              }}
            />
            <div
              className="h-[340px] rounded-2xl border animate-pulse"
              style={{
                background: 'rgba(30, 41, 59, 0.4)',
                borderColor: 'rgba(255, 255, 255, 0.05)',
              }}
            />
          </div>

          {/* Tables Skeleton */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div
              className="h-64 rounded-2xl border animate-pulse"
              style={{
                background: 'rgba(30, 41, 59, 0.4)',
                borderColor: 'rgba(255, 255, 255, 0.05)',
              }}
            />
            <div
              className="h-64 rounded-2xl border animate-pulse"
              style={{
                background: 'rgba(30, 41, 59, 0.4)',
                borderColor: 'rgba(255, 255, 255, 0.05)',
              }}
            />
          </div>
        </div>
      ) : (
        <>
          {/* 4 KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KPIWidget
              title="Bookings hôm nay"
              value={data?.kpi?.bookingsToday?.toLocaleString('vi-VN') ?? '0'}
              change={data?.kpi?.bookingsTodayChange}
              icon={<Icon name="TicketIcon" size={24} className="text-sky-400" />}
              colorClass="text-sky-400"
            />
            <KPIWidget
              title="Doanh thu hôm nay"
              value={formatCurrency(data?.kpi?.revenueToday ?? 0)}
              change={data?.kpi?.revenueTodayChange}
              icon={<Icon name="CurrencyDollarIcon" size={24} className="text-vj-pay-green-text" />}
              colorClass="text-vj-pay-green-text"
            />
            <KPIWidget
              title="Người dùng hoạt động"
              value={data?.kpi?.activeUsers?.toLocaleString('vi-VN') ?? '0'}
              change={data?.kpi?.activeUsersChange}
              icon={<Icon name="UsersIcon" size={24} className="text-purple-400" />}
              colorClass="text-purple-400"
            />
            <KPIWidget
              title="Tỷ lệ lấp đầy ghế"
              value={`${data?.kpi?.loadFactor ?? 0}%`}
              subValue="Load Factor"
              change={data?.kpi?.loadFactorChange}
              icon={<Icon name="ChartBarIcon" size={24} className="text-amber-400" />}
              colorClass="text-amber-400"
            />
          </div>

          {/* Grid 2 cột: RevenueChart + SeatClassPieChart */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <RevenueChart data={data?.revenue} />
            <SeatClassPieChart data={data?.seatDistribution} />
          </div>

          {/* Grid 2 cột: TopRoutesBarChart + CancellationDonutChart */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <TopRoutesBarChart data={data?.topRoutes} />
            <CancellationDonutChart data={data?.cancellationRate} />
          </div>

          {/* Grid 2 cột: RecentBookingsTable + UpcomingFlightsTable */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <RecentBookingsTable
              data={data?.recentBookings}
              onViewAll={onNavigate ? () => onNavigate('bookings') : undefined}
            />
            <UpcomingFlightsTable
              data={data?.upcomingFlights}
              onViewAll={onNavigate ? () => onNavigate('flights') : undefined}
            />
          </div>
        </>
      )}

      {/* `useToast` sở hữu state của chính nó; AdminDashboardClient có một
          container riêng nên toast của tab này sẽ bị nuốt nếu không render
          ở đây (nút "Xuất báo cáo" báo thành công/thất bại qua toast). */}
      <ToastContainer toasts={toast.toasts} onDismiss={toast.dismiss} position="top-right" />
    </div>
  );
}
