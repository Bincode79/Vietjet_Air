'use client';

import React from 'react';
import { Icon } from '@/shared/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
} from 'recharts';

// Types
interface FlightStats {
  total: number;
  scheduled: number;
  completed: number;
  delayed: number;
  cancelled: number;
  onTimeRate: number;
}

interface RevenueStats {
  total: number;
  today: number;
  thisMonth: number;
  growth: number;
}

interface UserStats {
  total: number;
  newToday: number;
  active: number;
  premium: number;
}

interface BookingStats {
  total: number;
  pending: number;
  confirmed: number;
  cancelled: number;
  pendingRate: number;
}

// Mock data generator
function generateFlightStats(): FlightStats {
  const total = 1247;
  const scheduled = 432;
  const completed = 678;
  const delayed = 89;
  const cancelled = 48;
  return {
    total,
    scheduled,
    completed,
    delayed,
    cancelled,
    onTimeRate: Math.round((completed / (completed + delayed + cancelled)) * 100),
  };
}

function generateUserStats(): UserStats {
  return {
    total: 1250000,
    newToday: 3450,
    active: 890000,
    premium: 156000,
  };
}

function generateBookingStats(): BookingStats {
  const total = 89500;
  const pending = 12450;
  const confirmed = 65300;
  const cancelled = 11800;
  return {
    total,
    pending,
    confirmed,
    cancelled,
    pendingRate: Math.round((pending / total) * 100),
  };
}

// Mock data generators
function generateFlights() {
  return [
    {
      id: 'VJ101',
      route: 'SGN → HAN',
      time: '13:00',
      status: 'scheduled',
      statusColor: 'text-blue-600 bg-blue-100',
    },
    {
      id: 'VJ102',
      route: 'HAN → SGN',
      time: '14:00',
      status: 'delayed',
      statusColor: 'text-amber-600 bg-amber-100',
    },
    {
      id: 'VJ103',
      route: 'SGN → DAD',
      time: '15:00',
      status: 'completed',
      statusColor: 'text-green-600 bg-green-100',
    },
    {
      id: 'VJ104',
      route: 'DAD → SGN',
      time: '16:00',
      status: 'scheduled',
      statusColor: 'text-blue-600 bg-blue-100',
    },
    {
      id: 'VJ105',
      route: 'SGN → CXR',
      time: '17:00',
      status: 'delayed',
      statusColor: 'text-amber-600 bg-amber-100',
    },
    {
      id: 'VJ106',
      route: 'CXR → SGN',
      time: '18:00',
      status: 'cancelled',
      statusColor: 'text-red-600 bg-red-100',
    },
  ];
}

function generateUsers() {
  return [
    {
      id: 1,
      name: 'Nguyen Van A',
      email: 'nguyenvana@email.com',
      joined: '2026-10-15',
      status: 'active',
    },
    {
      id: 2,
      name: 'Tran Thi B',
      email: 'tranthib@email.com',
      joined: '2026-10-16',
      status: 'active',
    },
    { id: 3, name: 'Le Van C', email: 'levanc@email.com', joined: '2026-10-17', status: 'premium' },
    {
      id: 4,
      name: 'Pham Thi D',
      email: 'phamthid@email.com',
      joined: '2026-10-18',
      status: 'suspended',
    },
    {
      id: 5,
      name: 'Hoang Van E',
      email: 'hoange@email.com',
      joined: '2026-10-19',
      status: 'active',
    },
  ];
}

function generateBookings() {
  return [
    {
      id: 'VJ-20261120-001',
      passenger: 'Nguyen Van A',
      flight: 'VJ101',
      status: 'confirmed',
      amount: 1200000,
    },
    {
      id: 'VJ-20261120-002',
      passenger: 'Tran Thi B',
      flight: 'VJ102',
      status: 'pending',
      amount: 850000,
    },
    {
      id: 'VJ-20261120-003',
      passenger: 'Le Van C',
      flight: 'VJ103',
      status: 'confirmed',
      amount: 950000,
    },
    {
      id: 'VJ-20261120-004',
      passenger: 'Pham Thi D',
      flight: 'VJ104',
      status: 'cancelled',
      amount: 0,
    },
    {
      id: 'VJ-20261120-005',
      passenger: 'Hoang Van E',
      flight: 'VJ105',
      status: 'pending',
      amount: 1400000,
    },
  ];
}

// ─── Dữ liệu biểu đồ Recharts ─────────────────────────────────────

interface RevenuePoint {
  name: string;
  revenue: number;
  bookings: number;
}

function generateRevenueChartData(): RevenuePoint[] {
  const days = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ Nhật'];
  return days.map((name, i) => ({
    name,
    revenue: 300000000 + i * 45000000 + Math.floor(Math.random() * 20000000),
    bookings: 1200 + i * 180 + Math.floor(Math.random() * 100),
  }));
}

interface CabinClass {
  name: string;
  value: number;
  color: string;
}

function generateCabinClassData(): CabinClass[] {
  return [
    { name: 'Eco', value: 65, color: '#22c55e' },
    { name: 'Deluxe', value: 20, color: '#f59e0b' },
    { name: 'SkyBOSS', value: 10, color: '#ec4899' },
    { name: 'Business', value: 5, color: '#1e40af' },
  ];
}

interface BookingStatusPoint {
  name: string;
  confirmed: number;
  pending: number;
  cancelled: number;
}

function generateBookingStatusData(): BookingStatusPoint[] {
  return [
    { name: 'Thứ 2', confirmed: 350, pending: 120, cancelled: 15 },
    { name: 'Thứ 3', confirmed: 420, pending: 95, cancelled: 22 },
    { name: 'Thứ 4', confirmed: 380, pending: 110, cancelled: 18 },
    { name: 'Thứ 5', confirmed: 460, pending: 140, cancelled: 25 },
    { name: 'Thứ 6', confirmed: 520, pending: 180, cancelled: 30 },
    { name: 'Thứ 7', confirmed: 610, pending: 220, cancelled: 35 },
    { name: 'Chủ Nhật', confirmed: 580, pending: 200, cancelled: 40 },
  ];
}

export default function AdminDashboardEnhanced() {
  const { user } = useAuth();

  const flightStats = generateFlightStats();
  const revenueStats = {
    total: 12540000000,
    today: 850000000,
    thisMonth: 2450000000,
    growth: 12.5,
  };
  const userStats = generateUserStats();
  const bookingStats = {
    total: 89500,
    pending: 12450,
    confirmed: 65300,
    cancelled: 11800,
    pendingRate: Math.round((12450 / 89500) * 100),
  };

  const flights = generateFlights();
  const users = generateUsers();
  const bookings = generateBookings();

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-gradient-to-r from-red-600 to-orange-600 p-2 rounded-lg shadow-sm">
            <Icon name="Plane" size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Vietjet Admin</h1>
            <p className="text-xs text-gray-500">Hệ thống quản trị hành không</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-3 px-4 py-2 bg-gray-100 rounded-full">
            <span className="text-sm text-gray-600">Xin chào,</span>
            <span className="text-sm font-semibold text-gray-900">{user?.email || 'Admin'}</span>
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
              Online
            </span>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            <Icon name="LogOut" size={18} />
            <span className="text-sm font-medium text-gray-700">Đăng xuất</span>
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        {/* Welcome Section */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Bảng điều khiển</h2>
          <p className="text-gray-600">
            Chào mừng bạn trở lại, {user?.email || 'Admin'}. Đây là tổng quan về hoạt động hệ thống.
          </p>
        </div>

        {/* Key Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <MetricCard
            title="Tổng chuyến bay"
            value={flightStats.total}
            change="+12% so với tháng trước"
            trend="up"
            icon="Airplane"
            color="bg-blue-100 text-blue-600"
          />
          <MetricCard
            title="Doanh thu hôm nay"
            value={`${(revenueStats.today / 1000000).toLocaleString()} triệu`}
            change="+8.5%"
            trend="up"
            icon="DollarSign"
            color="bg-green-100 text-green-600"
          />
          <MetricCard
            title="Tổng người dùng"
            value={userStats.total.toLocaleString()}
            change="+12.5%"
            trend="up"
            icon="Users"
            color="bg-purple-100 text-purple-600"
          />
          <MetricCard
            title="Đơn đặt vé"
            value={bookingStats.total.toLocaleString()}
            change="+15.3%"
            trend="up"
            icon="Ticket"
            color="bg-rose-100 text-rose-600"
          />
          <MetricCard
            title="Tỷ lệ on-time"
            value={`${flightStats.onTimeRate}%`}
            change="+3.2%"
            trend="up"
            icon="Clock"
            color="bg-emerald-100 text-emerald-600"
          />
        </div>

        {/* Main Content Area */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Quick Actions */}
          <div className="lg:col-span-1 space-y-6">
            <QuickActionsCard />
            <RecentAlertsCard />
          </div>

          {/* Center Column - Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Active Tab Content */}
            <OverviewDashboard
              flightStats={flightStats}
              revenueStats={revenueStats}
              userStats={userStats}
              bookingStats={bookingStats}
            />
            <FlightsOverview flights={flights} />
            <UsersOverview users={users} />
            <RevenueOverview stats={revenueStats} />
            <BookingsOverview bookings={bookings} />
          </div>

          {/* Right Column - Notifications */}
          <div className="lg:col-span-1 space-y-6">
            <RecentNotificationsCard />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 px-6 py-4 mt-auto">
        <div className="flex justify-between items-center text-xs text-gray-500">
          <span>Vietjet Air Admin System v2.0.0</span>
          <span>© 2024 Vietjet Air. All rights reserved.</span>
          <span>Last updated: {new Date().toLocaleDateString('vi-VN')}</span>
        </div>
      </footer>
    </div>
  );
}

// Metric Card Component
function MetricCard({
  title,
  value,
  change,
  trend,
  icon: IconName,
  color,
}: {
  title: string;
  value: string | number;
  change: string;
  trend: 'up' | 'down';
  icon: string;
  color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="w-10 h-10 rounded-lg {color} flex items-center justify-center">
          <Icon name={IconName} size={20} />
        </div>
        <div className="w-8 h-8 rounded-full {trend === 'up' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'} flex items-center justify-center">
          <Icon name={trend === 'up' ? 'TrendingUp' : 'TrendingDown'} size={12} />
        </div>
      </div>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-3xl font-bold text-gray-900">{value}</span>
        <span className="text-sm font-semibold {trend === 'up' ? 'text-green-600' : 'text-red-600'}">
          {change}
        </span>
      </div>
      <p className="text-sm text-gray-500">{title}</p>
    </div>
  );
}

// Quick Actions Card
function QuickActionsCard() {
  const quickActions = [
    { label: 'Thêm chuyến bay mới', icon: 'PlusCircle', color: 'bg-blue-500' },
    { label: 'Quản lý người dùng', icon: 'UserPlus', color: 'bg-purple-500' },
    { label: 'Xem báo cáo doanh thu', icon: 'BarChart3', color: 'bg-amber-500' },
    { label: 'Xuất báo cáo PDF', icon: 'FileDownload', color: 'bg-green-500' },
    { label: 'Gửi thông báo', icon: 'Send', color: 'bg-rose-500' },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <h3 className="text-sm font-bold text-gray-900 mb-4">Hành động nhanh</h3>
      <div className="space-y-2">
        {quickActions.map((action, i) => (
          <button
            key={i}
            className="w-full flex items-center justify-between px-4 py-3 rounded-lg bg-gray-50 hover:bg-gray-100 text-left transition-colors"
          >
            <div className="flex items-center gap-3">
              <Icon name={action.icon} size={16} className={`text-${action.color.split('/')[0]}`} />
              <span className="text-sm font-medium text-gray-700">{action.label}</span>
            </div>
            <Icon name="ChevronRight" size={14} className="text-gray-400" />
          </button>
        ))}
      </div>
    </div>
  );
}

// Recent Alerts Card
function RecentAlertsCard() {
  const alerts = [
    { type: 'warning', text: '12 chuyến bay chậm hôm nay', time: '5 phút trước' },
    { type: 'error', text: 'Hệ thống thanh toán cố định 30 phút', time: '2 giờ trước' },
    { type: 'info', text: 'Khách hàng VIP mới đăng ký', time: '5 giờ trước' },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <h3 className="text-sm font-bold text-gray-900 mb-4">Thông báo gần đây</h3>
      <div className="space-y-3">
        {alerts.map((alert, i) => (
          <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50">
            <Icon
              name={
                alert.type === 'error'
                  ? 'AlertCircle'
                  : alert.type === 'warning'
                    ? 'AlertTriangle'
                    : 'Info'
              }
              size={18}
              className={`mt-1 ${alert.type === 'error' ? 'text-red-500' : alert.type === 'warning' ? 'text-amber-500' : 'text-blue-500'}`}
            />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-700">{alert.text}</p>
              <p className="text-2xs text-vj-text-muted">{alert.time}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Overview Dashboard Content
function OverviewDashboard({
  flightStats,
  revenueStats,
  userStats,
  bookingStats,
}: {
  flightStats: FlightStats;
  revenueStats: RevenueStats;
  userStats: UserStats;
  bookingStats: BookingStats;
}) {
  const revenueData = generateRevenueChartData();
  const cabinData = generateCabinClassData();
  const statusData = generateBookingStatusData();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-bold text-gray-900 mb-4">Tình trạng chuyến bay</h3>
          <div className="flex items-center justify-between p-4 rounded-lg bg-[var(--surface)]">
            <div>
              <p className="text-xs font-bold text-gray-900 uppercase tracking-wider mb-1">
                Tổng chuyến bay
              </p>
              <span className="text-2xl font-bold text-gray-900">{flightStats.total}</span>
            </div>
            <div className="text-right">
              <span className="text-xs font-semibold text-green-600">
                {flightStats.onTimeRate}%
              </span>
              <p className="text-xs text-gray-400">On-time rate</p>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-xs font-medium text-gray-700">Đã hoàn thành</span>
            <span className="text-xs font-bold text-green-600">{flightStats.completed}</span>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs font-medium text-gray-700">Đang trì hoãn</span>
            <span className="text-xs font-bold text-amber-600">{flightStats.delayed}</span>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs font-medium text-gray-700">Đã hủy</span>
            <span className="text-xs font-bold text-red-600">{flightStats.cancelled}</span>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-bold text-gray-900 mb-4">Doanh thu hôm nay</h3>
          <div className="flex items-center justify-between p-4 rounded-lg bg-blue-50">
            <div>
              <span className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-1">
                Tổng doanh thu hôm nay
              </span>
              <span className="text-2xl font-bold text-blue-700 mt-1 block">
                ${(revenueStats.today / 1000000).toLocaleString()} triệu
              </span>
            </div>
            <span className="text-xs font-semibold text-green-600">+8.5%</span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div className="p-3 rounded-lg bg-gray-50">
              <p className="text-xs font-medium text-gray-700">Doanh thu tháng</p>
              <span className="text-lg font-bold text-gray-900">
                ${(revenueStats.thisMonth / 1000000).toLocaleString()} triệu
              </span>
            </div>
            <div className="p-3 rounded-lg bg-gray-50">
              <p className="text-xs font-medium text-gray-700">Tăng trưởng</p>
              <span className="text-lg font-bold text-green-600">+12.5%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Biểu đồ Recharts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Line Chart - Doanh thu 7 ngày */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-bold text-gray-900 mb-4">Doanh thu 7 ngày qua</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={revenueData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" stroke="#9ca3af" fontSize={12} />
                <YAxis stroke="#9ca3af" tickFormatter={(v) => `${v / 1e6}M`} fontSize={12} />
                <Tooltip
                  content={({ active, payload, label }: any) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload as RevenuePoint;
                      return (
                        <div className="p-3 bg-white border border-gray-200 rounded-lg shadow-lg">
                          <p className="text-sm font-bold text-gray-900">{label}</p>
                          <p className="text-sm text-gray-600">
                            Doanh thu: {data.revenue.toLocaleString()} VND
                          </p>
                          <p className="text-sm text-gray-600">Đơn đặt: {data.bookings}</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="revenue"
                  stroke="#ec4899"
                  strokeWidth={2}
                  dot={{ fill: '#ec4899', strokeWidth: 2 }}
                  strokeOpacity={1}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pie Chart - Phân bố hạng ghế */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-bold text-gray-900 mb-4">Phân bố hạng ghế</h3>
          <div className="h-64 w-full flex items-center">
            <ResponsiveContainer width={180} height={180}>
              <PieChart>
                <Pie
                  data={cabinData}
                  dataKey="value"
                  nameKey="name"
                  cx={80}
                  cy={90}
                  innerRadius={60}
                  outerRadius={80}
                  fill="#8884d8"
                  labelLine={false}
                  label={{ fill: '#4b5563', fontSize: 11 }}
                >
                  {cabinData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload, label }: any) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload as CabinClass;
                      const total = cabinData.reduce((sum, d) => sum + d.value, 0);
                      const percent = ((data.value / total) * 100).toFixed(1);
                      return (
                        <div className="p-3 bg-white border border-gray-200 rounded-lg shadow-lg">
                          <p className="text-sm font-bold text-gray-900">{data.name}</p>
                          <p className="text-sm text-gray-600">
                            {data.value}% ({percent}%)
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 space-y-2">
            {cabinData.map((item) => (
              <div key={item.name} className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-xs text-gray-700">{item.name}</span>
                <span className="text-xs font-bold text-gray-900 ml-auto">{item.value}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bar Chart - Đơn đặt theo trạng thái */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h3 className="text-sm font-bold text-gray-900 mb-4">Đơn đặt theo trạng thái</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={statusData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" stroke="#9ca3af" fontSize={11} />
                <YAxis stroke="#9ca3af" fontSize={12} />
                <Tooltip />
                <Legend />
                <Bar dataKey="confirmed" fill="#22c55e" radius={[2, 2, 0, 0]} />
                <Bar dataKey="pending" fill="#f59e0b" radius={[2, 2, 0, 0]} />
                <Bar dataKey="cancelled" fill="#ef4444" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

// Flights Overview
function FlightsOverview({
  flights,
}: {
  flights: Array<{ id: string; route: string; time: string; status: string; statusColor: string }>;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-gray-900">Chuyến bay gần đây</h3>
        <button className="text-xs font-medium text-primary hover:underline">Xem tất cả</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 font-medium text-gray-700">Mã chuyến bay</th>
              <th className="px-4 py-3 font-medium text-gray-700">Tuyến bay</th>
              <th className="px-4 py-3 font-medium text-gray-700">Giờ bay</th>
              <th className="px-4 py-3 font-medium text-gray-700">Trạng thái</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {flights.map((flight) => (
              <tr key={flight.id} className="hover:bg-gray-50/50">
                <td className="px-4 py-3 font-medium text-gray-900">{flight.id}</td>
                <td className="px-4 py-3 text-gray-700">{flight.route}</td>
                <td className="px-4 py-3 text-gray-700">{flight.time}</td>
                <td className="px-4 py-3">
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-bold text-white ${flight.statusColor}`}
                  >
                    {flight.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Users Overview
function UsersOverview({
  users,
}: {
  users: Array<{ id: number; name: string; email: string; joined: string; status: string }>;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-gray-900">Người dùng gần đây</h3>
        <button className="text-xs font-medium text-primary hover:underline">Xem tất cả</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 font-medium text-gray-700">Tên khách hàng</th>
              <th className="px-4 py-3 font-medium text-gray-700">Email</th>
              <th className="px-4 py-3 font-medium text-gray-700">Ngày đăng ký</th>
              <th className="px-4 py-3 font-medium text-gray-700">Trạng thái</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-gray-50/50">
                <td className="px-4 py-3 font-medium text-gray-900">{user.name}</td>
                <td className="px-4 py-3 text-gray-700">{user.email}</td>
                <td className="px-4 py-3 text-gray-700">{user.joined}</td>
                <td className="px-4 py-3">
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-bold ${user.status === 'active' ? 'bg-green-100 text-green-600' : user.status === 'premium' ? 'bg-purple-100 text-purple-600' : 'bg-yellow-100 text-yellow-600'}`}
                  >
                    {user.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Revenue Overview
function RevenueOverview({ stats }: { stats: RevenueStats }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <h3 className="text-sm font-bold text-gray-900 mb-4">Tổng quan doanh thu</h3>
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 rounded-lg bg-blue-50">
          <span className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-1">
            Tổng doanh thu
          </span>
          <span className="text-xl font-bold text-gray-900">
            ${(stats.total / 1000000000).toLocaleString()} tỷ
          </span>
        </div>
        <div className="p-4 rounded-lg bg-amber-50">
          <p className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-1">
            Doanh thu tháng
          </p>
          <span className="text-xl font-bold text-gray-900">
            ${(stats.thisMonth / 1000000).toLocaleString()} triệu
          </span>
        </div>
        <div className="p-4 rounded-lg bg-emerald-50">
          <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1">
            Tăng trưởng
          </p>
          <span className="text-xl font-bold text-gray-900">+${stats.growth}%</span>
        </div>
      </div>
    </div>
  );
}

// Bookings Overview
function BookingsOverview({
  bookings,
}: {
  bookings: Array<{
    id: string;
    passenger: string;
    flight: string;
    status: string;
    amount: number;
  }>;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-gray-900">Đơn đặt vé gần đây</h3>
        <button className="text-xs font-medium text-primary hover:underline">Xem tất cả</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 font-medium text-gray-700">Mã đặt chỗ</th>
              <th className="px-4 py-3 font-medium text-gray-700">Hành khách</th>
              <th className="px-4 py-3 font-medium text-gray-700">Chuyến bay</th>
              <th className="px-4 py-3 font-medium text-gray-700">Trạng thái</th>
              <th className="px-4 py-3 font-medium text-gray-700">Giá tiền</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {bookings.map((booking) => (
              <tr key={booking.id} className="hover:bg-gray-50/50">
                <td className="px-4 py-3 font-medium text-gray-900">{booking.id}</td>
                <td className="px-4 py-3 text-gray-700">{booking.passenger}</td>
                <td className="px-4 py-3 text-gray-700">{booking.flight}</td>
                <td className="px-4 py-3">
                  <span
                    className={`px-2 py-1 rounded-full text-xs font-bold ${booking.status === 'confirmed' ? 'bg-green-100 text-green-600' : booking.status === 'pending' ? 'bg-amber-100 text-amber-600' : 'bg-red-100 text-red-600'}`}
                  >
                    {booking.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-700">{booking.amount.toLocaleString()} VND</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Recent Notifications Card
function RecentNotificationsCard() {
  const notifications = [
    { type: 'success', text: 'Chuyến bay VJ121 đã khởi hành đúng giờ', time: '10 phút trước' },
    { type: 'warning', text: '12 chuyến bay chậm hôm nay', time: '1 giờ trước' },
    { type: 'error', text: 'Hệ thống thanh toán cố định 30 phút', time: '3 giờ trước' },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <h3 className="text-sm font-bold text-gray-900 mb-4">Thông báo gần đây</h3>
      <div className="space-y-3">
        {notifications.map((n, i) => (
          <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50">
            <Icon
              name={
                n.type === 'error'
                  ? 'AlertCircle'
                  : n.type === 'warning'
                    ? 'AlertTriangle'
                    : 'CheckCircle'
              }
              size={18}
              className={`mt-1 ${n.type === 'error' ? 'text-red-500' : n.type === 'warning' ? 'text-amber-500' : 'text-green-500'}`}
            />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-700">{n.text}</p>
              <p className="text-2xs text-vj-text-muted">{n.time}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
