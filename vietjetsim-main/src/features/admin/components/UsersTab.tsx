'use client';
import React, { useState } from 'react';
import { Icon } from '@/shared/components/ui';
import { Pagination } from '@/shared/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import {
  createUser,
  deleteUser,
  listUserBookings,
  listUsers,
  resetUserPassword,
  updateUser,
} from '@/features/admin';
import type { AdminUserBooking } from '@/features/admin';
import { getApiErrorMessage } from '@/shared/services';

interface ToastAPI {
  success: (title: string, message?: string, options?: object) => void;
  error: (title: string, message?: string, options?: object) => void;
  warning: (title: string, message?: string, options?: object) => void;
  info: (title: string, message?: string, options?: object) => void;
}

type UserRole =
  | 'user'
  | 'admin'
  | 'super_admin'
  | 'admin_ops'
  | 'admin_finance'
  | 'admin_support'
  | 'admin_content';
type UserStatus = 'active' | 'locked';

interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  status: UserStatus;
  bookings: number;
  spent: number;
  joinDate: string;
  /** Ghi chú vận hành của operator (migration 050). */
  operatorNotes?: string;
  lastLogin?: string;
  address?: string;
  skyjoyMemberId?: string;
}

const STATUS_TABS: { value: 'all' | UserStatus; label: string; activeColor: string }[] = [
  { value: 'all', label: 'Tất cả', activeColor: 'text-stone-700 bg-stone-100' },
  { value: 'active', label: 'Hoạt động', activeColor: 'text-green-700 bg-green-100' },
  { value: 'locked', label: 'Đã khoá', activeColor: 'text-red-700 bg-red-100' },
];

const ROLE_TABS: { value: 'all' | UserRole; label: string; activeColor: string }[] = [
  { value: 'all', label: 'Tất cả', activeColor: 'text-stone-700 bg-stone-100' },
  { value: 'user', label: 'User', activeColor: 'text-blue-700 bg-blue-100' },
  { value: 'admin', label: 'Hệ Thống', activeColor: 'text-primary bg-primary-100' },
];

/** Row shape returned by GET /api/quan-tri/nguoi-dung. */
interface UserApiRow {
  id: string;
  full_name?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  role?: string | null;
  status?: string | null;
  bookings_count?: number | null;
  total_spent?: number | null;
  created_at?: string | null;
  /** Ghi chú vận hành (migration 050). */
  operator_notes?: string | null;
  last_login?: string | null;
  address?: string | null;
  skyjoy_member_id?: string | null;
}

export default function UsersTab({ onToast }: { onToast?: ToastAPI }) {
  const [users, setUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState<'all' | UserRole>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | UserStatus>('all');
  const [joinDateFrom, setJoinDateFrom] = useState('');
  const [joinDateTo, setJoinDateTo] = useState('');
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [sortKey, setSortKey] = useState<
    'name' | 'joinDate' | 'bookings' | 'spent' | 'status' | null
  >(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  // Modal tạo tài khoản mới (nút header "Tạo tài khoản hội viên").
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [createDraft, setCreateDraft] = useState({
    full_name: '',
    email: '',
    phone: '',
    password: '',
    role: 'user' as 'user' | 'admin',
    skyjoy_member_id: '',
  });
  const [isCreating, setIsCreating] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [switchingRoleId, setSwitchingRoleId] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  // Nội dung ghi chú đang soạn. Tách khỏi `selectedUser` để gõ không làm
  // đổi hàng trong bảng, và có nút lưu tường minh — trước đây ô này không
  // có `value` lẫn `onChange`, nên gõ vào không lưu gì cả.
  const [notesDraft, setNotesDraft] = useState('');
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  // Lịch sử đặt vé của user đang mở chi tiết.
  const [userBookings, setUserBookings] = useState<AdminUserBooking[]>([]);
  const [isLoadingUserBookings, setIsLoadingUserBookings] = useState(false);
  // Form đặt lại mật khẩu.
  const [showResetPw, setShowResetPw] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [isResettingPw, setIsResettingPw] = useState(false);

  const { user: currentUser } = useAuth();

  const fetchUsers = async () => {
    setIsLoading(true);
    setHasError(false);
    try {
      const data = await listUsers({ limit: 100 });
      // An empty result is a real answer — there are no customers. It renders
      // the empty state; it must never render the demo rows.
      if (data.users && Array.isArray(data.users)) {
        const mapped = data.users.map((u: UserApiRow) => ({
          id: u.id,
          name: u.full_name || u.name || 'Unknown',
          email: u.email || '',
          phone: u.phone || '0900 000 000',
          role: (u.role as UserRole) || 'user',
          status: (u.status as UserStatus) || 'active',
          bookings: u.bookings_count || 0,
          spent: Number(u.total_spent) || 0,
          joinDate: u.created_at ? new Date(u.created_at).toISOString().split('T')[0] : 'N/A',
          // `notes` is not a column of `user_profiles` — the column with that
          // name belongs to `agencies`. The operator note is
          // `operator_notes` (migration 050).
          operatorNotes: u.operator_notes ?? undefined,
          lastLogin: u.last_login ? new Date(u.last_login).toLocaleString('vi-VN') : undefined,
          address: u.address ?? undefined,
          skyjoyMemberId: u.skyjoy_member_id ?? undefined,
        }));
        setUsers(mapped);
      }
    } catch (_err) {
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  };

  React.useEffect(() => {
    fetchUsers();
  }, []);

  const retryLoad = () => fetchUsers();

  const activeFilterCount = [
    filterRole !== 'all',
    filterStatus !== 'all',
    !!joinDateFrom,
    !!joinDateTo,
  ].filter(Boolean).length;

  const clearAllFilters = () => {
    setSearchQuery('');
    setFilterRole('all');
    setFilterStatus('all');
    setJoinDateFrom('');
    setJoinDateTo('');
    setCurrentPage(1);
  };

  const filtered = users.filter((u) => {
    const matchSearch =
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.phone.includes(searchQuery);
    const matchRole = filterRole === 'all' || u.role === filterRole;
    const matchStatus = filterStatus === 'all' || u.status === filterStatus;
    const matchDateFrom = !joinDateFrom || u.joinDate >= joinDateFrom;
    const matchDateTo = !joinDateTo || u.joinDate <= joinDateTo;
    return matchSearch && matchRole && matchStatus && matchDateFrom && matchDateTo;
  });

  const sorted = sortKey
    ? [...filtered].sort((a, b) => {
        let aVal: string | number = '';
        let bVal: string | number = '';
        if (sortKey === 'name') {
          aVal = a.name;
          bVal = b.name;
        } else if (sortKey === 'joinDate') {
          aVal = a.joinDate;
          bVal = b.joinDate;
        } else if (sortKey === 'bookings') {
          aVal = a.bookings;
          bVal = b.bookings;
        } else if (sortKey === 'spent') {
          aVal = a.spent;
          bVal = b.spent;
        } else if (sortKey === 'status') {
          aVal = a.status;
          bVal = b.status;
        }
        if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
        return 0;
      })
    : filtered;

  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setCurrentPage(1);
  };

  const SortIcon = ({ col }: { col: typeof sortKey }) => {
    if (sortKey !== col)
      return (
        <Icon name="ChevronUpDownIcon" size={13} className="text-stone-300 ml-1 inline-block" />
      );
    return sortDir === 'asc' ? (
      <Icon name="ChevronUpIcon" size={13} className="text-primary ml-1 inline-block" />
    ) : (
      <Icon name="ChevronDownIcon" size={13} className="text-primary ml-1 inline-block" />
    );
  };

  const toggleStatus = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const user = users.find((u) => u.id === id);
    if (!user || togglingId === id) return;
    setTogglingId(id);
    try {
      const newStatus = user.status === 'active' ? 'locked' : 'active';
      await updateUser(id, { status: newStatus });
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, status: newStatus } : u)));
      if (selectedUser?.id === id) {
        setSelectedUser((prev) => (prev ? { ...prev, status: newStatus } : null));
      }
      if (newStatus === 'locked') {
        onToast?.warning('Tài khoản đã bị khoá', `${user.name} không thể đăng nhập.`);
      } else {
        onToast?.success('Tài khoản đã được mở khoá', `${user.name} có thể đăng nhập trở lại.`);
      }
    } catch (err) {
      onToast?.error('Lỗi', getApiErrorMessage(err, 'Không thể thay đổi trạng thái.'));
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const user = users.find((u) => u.id === id);
    if (!confirm('Bạn có chắc muốn xoá người dùng này?')) return;
    setDeletingId(id);
    try {
      await deleteUser(id);
      setUsers((prev) => prev.filter((u) => u.id !== id));
      onToast?.error('Đã xoá người dùng', `${user?.name ?? 'Người dùng'} đã bị xoá khỏi hệ thống.`);
    } catch (err) {
      onToast?.error('Lỗi khi xoá', getApiErrorMessage(err, 'Không thể xoá người dùng.'));
    } finally {
      setDeletingId(null);
    }
  };
  const handleSwitchRole = async (targetUser: User) => {
    if (!currentUser || switchingRoleId === targetUser.id) return;
    if (targetUser.id === currentUser.id) {
      onToast?.warning(
        'Không thể thay đổi vai trò',
        'Bạn không thể thay đổi vai trò của chính mình.'
      );
      return;
    }
    const newRole: UserRole = targetUser.role === 'admin' ? 'user' : 'admin';
    const actionLabel = newRole === 'admin' ? 'nâng cấp lên Hệ Thống' : 'hạ cấp về User';
    if (!confirm(`Bạn có chắc muốn ${actionLabel} tài khoản "${targetUser.name}"?`)) return;
    setSwitchingRoleId(targetUser.id);
    try {
      await updateUser(targetUser.id, { role: newRole });
      setUsers((prev) => prev.map((u) => (u.id === targetUser.id ? { ...u, role: newRole } : u)));
      if (selectedUser?.id === targetUser.id) {
        setSelectedUser((prev) => (prev ? { ...prev, role: newRole } : null));
      }
      onToast?.success('Cập nhật vai trò thành công', `${targetUser.name} đã được ${actionLabel}.`);
    } catch (err) {
      onToast?.error('Lỗi cập nhật vai trò', getApiErrorMessage(err, 'Vui lòng thử lại sau.'));
    } finally {
      setSwitchingRoleId(null);
    }
  };

  const handleSaveNotes = async () => {
    if (!selectedUser || isSavingNotes) return;
    const notes = notesDraft.trim();
    if (notes === (selectedUser.operatorNotes ?? '')) return;
    setIsSavingNotes(true);
    try {
      await updateUser(selectedUser.id, { operator_notes: notes });
      setUsers((prev) =>
        prev.map((u) =>
          u.id === selectedUser.id ? { ...u, operatorNotes: notes || undefined } : u
        )
      );
      setSelectedUser((prev) => (prev ? { ...prev, operatorNotes: notes || undefined } : prev));
      setNotesDraft(notes);
      onToast?.success('Đã lưu ghi chú', `Ghi chú của ${selectedUser.name} đã được lưu.`);
    } catch (err) {
      onToast?.error('Lỗi lưu ghi chú', getApiErrorMessage(err, 'Vui lòng thử lại sau.'));
    } finally {
      setIsSavingNotes(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    const name = editingUser.name.trim();
    const email = editingUser.email.trim();
    const phone = editingUser.phone.trim();

    if (name.length < 2) {
      onToast?.error('Lỗi nhập liệu', 'Họ tên phải có ít nhất 2 ký tự.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      onToast?.error('Lỗi nhập liệu', 'Email không hợp lệ.');
      return;
    }
    if (phone && !/^\+?\d[\d\s]{7,19}$/.test(phone)) {
      onToast?.error('Lỗi nhập liệu', 'Số điện thoại không hợp lệ.');
      return;
    }

    setIsSavingEdit(true);
    try {
      // Ghi thật vào DB. Trước đây hàm này chỉ cập nhật state cục bộ trong
      // `setTimeout` rồi báo "Cập nhật thành công" — không có gì được ghi, nên
      // mọi chỉnh sửa tên/email/điện thoại biến mất khi tải lại trang.
      const original = users.find((u) => u.id === editingUser.id);
      const res = await updateUser(editingUser.id, {
        full_name: name,
        email,
        phone: phone || null,
        // Đổi vai trò ngay trong form sửa (API [id] hỗ trợ, kể cả super_admin
        // legacy — PATCH này cần quyền user:role_change chứ không phải route
        // PATCH /nguoi-dung dành cho tự hạ cấp).
        ...(editingUser.role !== original?.role ? { role: editingUser.role } : {}),
      });

      setUsers((prev) =>
        prev.map((u) =>
          u.id === editingUser.id ? { ...u, name, email, phone, role: editingUser.role } : u
        )
      );
      setSelectedUser((prev) =>
        prev ? { ...prev, name, email, phone, role: editingUser.role } : prev
      );
      setEditingUser(null);
      onToast?.success('Cập nhật thành công', `Thông tin của ${name} đã được lưu.`);
      void res;
    } catch (err) {
      onToast?.error('Lỗi cập nhật', getApiErrorMessage(err, 'Vui lòng thử lại sau.'));
    } finally {
      setIsSavingEdit(false);
    }
  };

  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*';
    let pwd = 'VJ@';
    for (let i = 0; i < 9; i++) {
      pwd += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setCreateDraft((p) => ({ ...p, password: pwd + '9!' }));
  };

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-vj-blue flex items-center justify-center text-vj-bank-blue-text border border-vj-blue shadow-vj-lg shadow-vj-sm">
              <Icon name="UsersIcon" size={24} />
            </div>
            <div>
              Quản lý người dùng
              <p className="text-2xs font-black text-vj-admin-muted uppercase tracking-[0.2em] mt-1 opacity-70">
                Tổng số {users.length} tài khoản trong hệ thống
              </p>
            </div>
          </h2>
        </div>
        <button
          type="button"
          onClick={() => {
            setCreateDraft({
              full_name: '',
              email: '',
              phone: '',
              password: '',
              role: 'user',
              skyjoy_member_id: '',
            });
            setShowCreateForm(true);
          }}
          className="flex items-center justify-center gap-2 px-8 py-4 bg-primary hover:bg-primary-dark text-white rounded-2xl text-xs2 font-black uppercase tracking-[0.2em] shadow-xl shadow-primary/20 transition-all active:scale-98 group cursor-pointer"
        >
          <Icon
            name="PlusCircleIcon"
            size={18}
            className="transition-transform group-hover:rotate-90 duration-300"
          />
          Tạo tài khoản hội viên
        </button>
      </div>

      {/* Filters & Search */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-5 relative group">
          <Icon
            name="MagnifyingGlassIcon"
            size={20}
            className="absolute left-5 top-1/2 -translate-y-1/2 text-vj-admin-muted group-focus-within:text-vj-bank-blue-text transition-colors"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Tìm theo tên, email hoặc số điện thoại..."
            className="w-full pl-14 pr-6 py-4 bg-slate-800 border border-white/5 rounded-vj-pill text-sm font-semibold text-white placeholder-slate-600 focus:outline-none focus:border-vj-blue transition-all focus:bg-slate-800"
          />
        </div>

        <div className="xl:col-span-4 flex items-center bg-slate-800 border border-white/5 rounded-vj-pill p-1.5 gap-1">
          <div className="relative flex-1">
            <input
              type="date"
              value={joinDateFrom}
              onChange={(e) => setJoinDateFrom(e.target.value)}
              className="w-full pl-10 pr-3 py-2.5 bg-transparent border-none rounded-vj text-xs2 font-black text-vj-admin-muted focus:ring-0 uppercase tracking-wider"
            />
            <Icon
              name="CalendarDaysIcon"
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-vj-admin-muted"
            />
          </div>
          <Icon name="ArrowRightIcon" size={12} className="text-vj-admin-muted" />
          <div className="relative flex-1">
            <input
              type="date"
              value={joinDateTo}
              onChange={(e) => setJoinDateTo(e.target.value)}
              className="w-full pl-10 pr-3 py-2.5 bg-transparent border-none rounded-vj text-xs2 font-black text-vj-admin-muted focus:ring-0 uppercase tracking-wider"
            />
            <Icon
              name="CalendarDaysIcon"
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-vj-admin-muted"
            />
          </div>
        </div>

        <div className="xl:col-span-3 flex items-center justify-end">
          {(activeFilterCount > 0 || searchQuery) && (
            <button
              onClick={clearAllFilters}
              className="flex items-center gap-2 px-6 py-3 bg-vj-red-dark hover:bg-vj-red-dark text-red-400 text-2xs font-black uppercase tracking-widest rounded-2xl border border-vj-red-dark transition-all group"
            >
              <Icon
                name="XMarkIcon"
                size={16}
                className="group-hover:rotate-90 transition-transform"
              />
              Đặt lại bộ lọc ({activeFilterCount + (searchQuery ? 1 : 0)})
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex bg-slate-800 rounded-2xl p-1.5 border border-white/5 shadow-inner">
          {ROLE_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setFilterRole(tab.value)}
              className={`px-5 py-2.5 rounded-vj text-2xs font-black uppercase tracking-widest transition-all ${filterRole === tab.value ? 'bg-vj-blue text-white shadow-vj-lg' : 'text-vj-admin-muted hover:text-vj-admin-muted'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex bg-slate-800 rounded-2xl p-1.5 border border-white/5 shadow-inner">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setFilterStatus(tab.value)}
              className={`px-5 py-2.5 rounded-vj text-2xs font-black uppercase tracking-widest transition-all ${filterStatus === tab.value ? 'bg-white text-vj-admin-muted shadow-vj-lg' : 'text-vj-admin-muted hover:text-vj-admin-muted'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div
        className="rounded-3xl border overflow-hidden transition-all duration-500"
        style={{
          background: 'rgba(30, 41, 59, 0.4)',
          backdropFilter: 'blur(16px)',
          borderColor: 'rgba(255, 255, 255, 0.05)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
        }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-white/5 border-b border-white/5">
                <th
                  className="text-left text-2xs font-black text-vj-admin-muted uppercase tracking-widest px-6 py-5 cursor-pointer hover:text-white transition-colors select-none whitespace-nowrap"
                  onClick={() => handleSort('name')}
                >
                  Người dùng
                  <SortIcon col="name" />
                </th>
                <th className="text-left text-2xs font-black text-vj-admin-muted uppercase tracking-widest px-6 py-5 hidden sm:table-cell">
                  Liên hệ
                </th>
                <th className="text-center text-2xs font-black text-vj-admin-muted uppercase tracking-widest px-6 py-5">
                  Vai trò
                </th>
                <th
                  className="text-right text-2xs font-black text-vj-admin-muted uppercase tracking-widest px-6 py-5 hidden md:table-cell cursor-pointer hover:text-white transition-colors select-none whitespace-nowrap"
                  onClick={() => handleSort('bookings')}
                >
                  Đặt vé
                  <SortIcon col="bookings" />
                </th>
                <th
                  className="text-right text-2xs font-black text-vj-admin-muted uppercase tracking-widest px-6 py-5 hidden lg:table-cell cursor-pointer hover:text-white transition-colors select-none whitespace-nowrap"
                  onClick={() => handleSort('spent')}
                >
                  Chi tiêu
                  <SortIcon col="spent" />
                </th>
                <th
                  className="text-center text-2xs font-black text-vj-admin-muted uppercase tracking-widest px-6 py-5 cursor-pointer hover:text-white transition-colors select-none whitespace-nowrap"
                  onClick={() => handleSort('status')}
                >
                  Trạng thái
                  <SortIcon col="status" />
                </th>
                <th className="text-center text-2xs font-black text-vj-admin-muted uppercase tracking-widest px-6 py-5">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <tr key={i} className="border-b border-white/5 animate-pulse">
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-slate-700 rounded-vj" />
                          <div>
                            <div className="h-4 w-28 bg-slate-700 rounded-full mb-2" />
                            <div className="h-3 w-20 bg-slate-800 rounded-full" />
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5 hidden sm:table-cell">
                        <div className="h-3 w-32 bg-slate-700 rounded-full mb-2" />
                        <div className="h-3 w-24 bg-slate-800 rounded-full" />
                      </td>
                      <td className="px-6 py-5 text-center">
                        <div className="h-5 w-14 bg-slate-700 rounded-full mx-auto" />
                      </td>
                      <td className="px-6 py-5 text-right hidden md:table-cell">
                        <div className="h-4 w-8 bg-slate-700 rounded-full ml-auto" />
                      </td>
                      <td className="px-6 py-5 text-right hidden lg:table-cell">
                        <div className="h-4 w-20 bg-slate-700 rounded-full ml-auto" />
                      </td>
                      <td className="px-6 py-5 text-center">
                        <div className="h-7 w-24 bg-slate-700 rounded-vj mx-auto" />
                      </td>
                      <td className="px-6 py-5 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <div className="h-8 w-8 bg-slate-700 rounded-vj" />
                          <div className="h-8 w-8 bg-slate-700 rounded-vj" />
                        </div>
                      </td>
                    </tr>
                  ))}
                </>
              ) : hasError ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-3 animate-[fadeInUp_0.35s_ease-out]">
                      <div className="w-16 h-16 bg-red-50 border border-red-100 rounded-2xl flex items-center justify-center">
                        <Icon name="ExclamationTriangleIcon" size={28} className="text-red-400" />
                      </div>
                      <div>
                        <p className="font-bold text-stone-700 text-sm">Không thể tải dữ liệu</p>
                        <p className="text-xs text-stone-400 mt-1 max-w-xs mx-auto">
                          Đã xảy ra lỗi khi tải danh sách người dùng. Vui lòng thử lại.
                        </p>
                      </div>
                      <button
                        onClick={retryLoad}
                        className="flex items-center gap-1.5 text-xs font-semibold text-white bg-primary hover:bg-primary-dark px-4 py-2 rounded-vj transition-all shadow-glow-red hover:shadow-none mt-1"
                      >
                        <Icon name="ArrowPathIcon" size={13} />
                        Thử lại
                      </button>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-14 text-center">
                    <div className="flex flex-col items-center gap-3 animate-[fadeInUp_0.35s_ease-out]">
                      <div className="w-16 h-16 bg-stone-50 border border-stone-100 rounded-2xl flex items-center justify-center animate-[pulse_2.5s_ease-in-out_infinite]">
                        <Icon name="UserGroupIcon" size={28} className="text-stone-300" />
                      </div>
                      <div>
                        <p className="font-bold text-stone-700 text-sm">
                          Không tìm thấy người dùng
                        </p>
                        <p className="text-xs text-stone-400 mt-1 max-w-xs mx-auto">
                          {searchQuery ||
                          filterRole !== 'all' ||
                          filterStatus !== 'all' ||
                          joinDateFrom ||
                          joinDateTo
                            ? 'Bộ lọc hiện tại không khớp với người dùng nào. Hãy thử thay đổi tiêu chí tìm kiếm.'
                            : 'Chưa có người dùng nào đăng ký.'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        {(searchQuery ||
                          filterRole !== 'all' ||
                          filterStatus !== 'all' ||
                          joinDateFrom ||
                          joinDateTo) && (
                          <button
                            onClick={clearAllFilters}
                            className="flex items-center gap-1.5 text-xs font-semibold text-white bg-primary hover:bg-primary-dark px-4 py-2 rounded-vj transition-all shadow-glow-red hover:shadow-none"
                          >
                            <Icon name="ArrowPathIcon" size={13} />
                            Đặt lại bộ lọc
                          </button>
                        )}
                        <button
                          onClick={retryLoad}
                          className="flex items-center gap-1.5 text-xs font-semibold text-stone-600 border border-stone-200 hover:border-stone-300 hover:bg-stone-50 px-4 py-2 rounded-vj transition-all"
                        >
                          <Icon name="ArrowPathIcon" size={13} />
                          Tải lại
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                paginated.map((user, _i) => (
                  <tr
                    key={user.id}
                    onClick={() => {
                      setSelectedUser(user);
                      // Bản nháp ghi chú phải bắt đầu từ giá trị ĐÃ LƯU của
                      // hàng đang mở, không phải từ giá trị của hàng trước đó.
                      setNotesDraft(user.operatorNotes ?? '');
                      // Tải lịch sử đặt vé + reset form mật khẩu.
                      setShowResetPw(false);
                      setNewPassword('');
                      setIsLoadingUserBookings(true);
                      listUserBookings(user.id)
                        .then((d) => setUserBookings(d.bookings ?? []))
                        .catch(() => setUserBookings([]))
                        .finally(() => setIsLoadingUserBookings(false));
                    }}
                    className="border-b border-white/[0.03] hover:bg-white/[0.05] transition-all group cursor-pointer"
                  >
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-10 h-10 rounded-vj flex items-center justify-center text-white text-sm font-black shadow-vj-lg ${user.role === 'admin' ? 'bg-gradient-to-br from-indigo-500 to-violet-600 shadow-vj-sm' : 'bg-slate-700 shadow-black/20'}`}
                        >
                          {user.name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-bold text-vj-admin-muted text-sm group-hover:text-white transition-colors">
                            {user.name}
                          </div>
                          <div className="text-2xs font-black text-vj-admin-muted uppercase tracking-widest mt-0.5">
                            {user.joinDate}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5 hidden sm:table-cell">
                      <div className="text-sm font-semibold text-vj-admin-muted group-hover:text-vj-admin-muted transition-colors">
                        {user.email}
                      </div>
                      <div className="text-2xs font-bold text-vj-admin-muted mt-0.5">
                        {user.phone}
                      </div>
                    </td>
                    <td className="px-6 py-5 text-center">
                      <span
                        className={`text-2xs font-black px-2.5 py-1 rounded-vj uppercase tracking-wider ${
                          user.role === 'admin'
                            ? 'bg-sky-400/10 text-vj-bank-blue-text border border-sky-400/30'
                            : 'bg-slate-500 text-vj-admin-muted border border-vj-border-light'
                        }`}
                      >
                        {user.role === 'admin' ? 'Hệ Thống' : 'User'}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-right hidden md:table-cell">
                      <span className="font-black text-white text-sm tracking-tight">
                        {user.bookings}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-right hidden lg:table-cell">
                      <span className="font-black text-white text-sm tracking-tight">
                        {user.spent.toLocaleString('vi-VN')}₫
                      </span>
                    </td>
                    <td className="px-6 py-5 text-center">
                      <button
                        onClick={(e) => toggleStatus(e, user.id)}
                        disabled={user.role === 'admin' || togglingId === user.id}
                        className={`text-2xs font-black px-3 py-1 rounded-vj transition-all disabled:opacity-30 disabled:cursor-not-allowed uppercase tracking-wider ${
                          user.status === 'active'
                            ? 'bg-emerald-400/10 text-vj-pay-green-text border border-emerald-400/30 hover:bg-vj-pay-green'
                            : 'bg-red-400/10 text-red-400 border border-red-400/30 hover:bg-vj-red-dark'
                        }`}
                      >
                        {togglingId === user.id ? (
                          <Icon name="ArrowPathIcon" size={12} className="animate-spin" />
                        ) : user.status === 'active' ? (
                          'Hoạt động'
                        ) : (
                          'Đã khoá'
                        )}
                      </button>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => setEditingUser(user)}
                          disabled={
                            deletingId === user.id ||
                            togglingId === user.id ||
                            switchingRoleId === user.id
                          }
                          className="w-9 h-9 bg-slate-800 hover:bg-vj-blue text-vj-admin-muted hover:text-vj-bank-blue-text border border-white/5 rounded-vj flex items-center justify-center transition-all disabled:opacity-20 active:scale-90"
                          title="Chỉnh sửa"
                        >
                          <Icon name="PencilIcon" size={14} />
                        </button>
                        <button
                          onClick={() => handleSwitchRole(user)}
                          disabled={
                            deletingId === user.id ||
                            togglingId === user.id ||
                            switchingRoleId === user.id
                          }
                          className={`w-9 h-9 border border-white/5 rounded-vj flex items-center justify-center transition-all disabled:opacity-20 active:scale-90 ${
                            user.role === 'admin'
                              ? 'bg-slate-800 hover:bg-amber-500/20 text-vj-admin-muted hover:text-amber-400'
                              : 'bg-slate-800 hover:bg-vj-blue text-vj-admin-muted hover:text-vj-bank-blue-text'
                          }`}
                          title={user.role === 'admin' ? 'Hạ cấp về User' : 'Nâng cấp lên Hệ Thống'}
                        >
                          {switchingRoleId === user.id ? (
                            <Icon name="ArrowPathIcon" size={14} className="animate-spin" />
                          ) : (
                            <Icon
                              name={user.role === 'admin' ? 'ArrowDownIcon' : 'ArrowUpIcon'}
                              size={14}
                            />
                          )}
                        </button>
                        <button
                          onClick={(e) => handleDelete(e, user.id)}
                          disabled={
                            user.role === 'admin' ||
                            deletingId === user.id ||
                            togglingId === user.id ||
                            switchingRoleId === user.id
                          }
                          className="w-9 h-9 bg-slate-800 hover:bg-vj-red-dark text-vj-admin-muted hover:text-red-400 border border-white/5 rounded-vj flex items-center justify-center transition-all disabled:opacity-10 active:scale-90"
                          title="Xoá"
                        >
                          {deletingId === user.id ? (
                            <Icon name="ArrowPathIcon" size={14} className="animate-spin" />
                          ) : (
                            <Icon name="TrashIcon" size={14} />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {sorted.length > 0 && (
          <div className="px-6 py-5 border-t border-white/5 bg-white/5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="text-2xs font-black text-vj-admin-muted uppercase tracking-widest">
                {sorted.length > pageSize
                  ? `Hiển thị ${(safePage - 1) * pageSize + 1}–${Math.min(safePage * pageSize, sorted.length)} / ${sorted.length} người dùng`
                  : `${sorted.length} / ${users.length} người dùng`}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-2xs font-black text-vj-admin-muted uppercase tracking-widest">
                  Hiển thị:
                </span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="text-2xs font-black border border-white/10 rounded-vj px-2 py-1 bg-slate-800 text-vj-admin-muted focus:outline-none focus:border-vj-blue cursor-pointer uppercase tracking-wider transition-all"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
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

      {/* User Detail Modal */}
      {selectedUser && (
        <div className="fixed inset-0 bg-slate-950 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div
            className="w-full max-w-2xl bg-slate-900 border border-white/10 rounded-vj-oval overflow-hidden shadow-2xl relative animate-in zoom-in-95 duration-300"
            style={{
              background:
                'linear-gradient(135deg, rgba(30, 41, 59, 0.98) 0%, rgba(15, 23, 42, 0.98) 100%)',
              boxShadow: '0 25px 70px -12px rgba(0, 0, 0, 0.5), 0 0 40px rgba(99, 102, 241, 0.1)',
            }}
          >
            {/* Header / Profile Cover */}
            <div className="h-32 bg-gradient-to-r from-indigo-600/30 to-violet-600/30 relative">
              <div className="absolute -bottom-12 left-8">
                <div
                  className={`w-24 h-24 rounded-3xl flex items-center justify-center text-3xl font-black text-white shadow-2xl border-4 border-vj-border-light ${selectedUser.role === 'admin' ? 'bg-gradient-to-br from-indigo-500 to-violet-600' : 'bg-slate-700'}`}
                >
                  {selectedUser.name.charAt(0)}
                </div>
              </div>
              <button
                onClick={() => setSelectedUser(null)}
                className="absolute top-6 right-6 w-10 h-10 bg-slate-900 hover:bg-slate-900 text-vj-admin-muted hover:text-white rounded-2xl flex items-center justify-center transition-all backdrop-blur-md border border-white/5"
              >
                <Icon name="XMarkIcon" size={20} />
              </button>
            </div>

            <div className="px-8 pt-16 pb-8">
              <div className="flex flex-col md:flex-row justify-between items-start gap-6">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <h3 className="text-2xl font-black text-white tracking-tight">
                      {selectedUser.name}
                    </h3>
                    <span
                      className={`text-2xs font-black px-2.5 py-1 rounded-vj uppercase tracking-wider ${selectedUser.role === 'admin' ? 'bg-sky-400/10 text-vj-bank-blue-text border border-sky-400/30' : 'bg-slate-500 text-vj-admin-muted border border-vj-border-light'}`}
                    >
                      {selectedUser.role}
                    </span>
                  </div>
                  <p className="text-sm font-bold text-vj-admin-muted">{selectedUser.email}</p>
                  <p className="text-xs text-vj-admin-muted font-medium">
                    Thành viên từ:{' '}
                    <span className="text-vj-admin-muted font-bold">{selectedUser.joinDate}</span>
                  </p>
                </div>

                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleStatus(e, selectedUser.id);
                    }}
                    className={`px-4 py-2 rounded-vj text-xs font-black uppercase tracking-widest transition-all ${selectedUser.status === 'active' ? 'bg-red-400/10 text-red-400 border border-red-400/30 hover:bg-vj-red-dark' : 'bg-emerald-400/10 text-vj-pay-green-text border border-emerald-400/30 hover:bg-vj-pay-green'}`}
                  >
                    {selectedUser.status === 'active' ? 'Khoá tài khoản' : 'Mở khoá'}
                  </button>
                  <button
                    onClick={() => {
                      setShowResetPw((v) => !v);
                      setNewPassword('');
                    }}
                    className="px-4 py-2 bg-amber-500/10 text-amber-300 border border-amber-500/20 hover:bg-amber-500/20 rounded-vj text-xs font-black uppercase tracking-widest transition-all"
                  >
                    Đặt lại mật khẩu
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingUser(selectedUser);
                    }}
                    className="px-4 py-2 bg-vj-blue hover:bg-vj-blue text-white rounded-vj text-xs font-black uppercase tracking-widest transition-all shadow-vj-lg shadow-vj-sm"
                  >
                    Sửa thông tin
                  </button>
                </div>
              </div>

              {/* Form đặt lại mật khẩu */}
              {showResetPw && (
                <div className="mt-6 bg-amber-500/[0.06] border border-amber-500/20 rounded-2xl p-4">
                  <label className="text-2xs font-black text-amber-300/80 uppercase tracking-[0.2em] mb-3 block">
                    Đặt lại mật khẩu cho {selectedUser.email}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Tối thiểu 8 ký tự: hoa + thường + số + ký tự đặc biệt"
                      className="flex-1 bg-slate-950 border border-white/10 rounded-vj px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500/40"
                    />
                    <button
                      type="button"
                      disabled={isResettingPw || newPassword.length < 8}
                      onClick={async () => {
                        if (!confirm(`Đặt lại mật khẩu cho ${selectedUser.email}?`)) return;
                        setIsResettingPw(true);
                        try {
                          await resetUserPassword(selectedUser.id, newPassword);
                          onToast?.success(
                            'Đã đặt lại mật khẩu',
                            `Mật khẩu của ${selectedUser.email} đã được cập nhật.`
                          );
                          setNewPassword('');
                          setShowResetPw(false);
                        } catch (err) {
                          onToast?.error(
                            'Đặt lại thất bại',
                            getApiErrorMessage(err, 'Không đặt lại được mật khẩu.')
                          );
                        } finally {
                          setIsResettingPw(false);
                        }
                      }}
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-vj-admin-muted rounded-vj text-xs font-black uppercase tracking-widest transition-all disabled:opacity-40"
                    >
                      {isResettingPw ? 'Đang lưu...' : 'Xác nhận'}
                    </button>
                  </div>
                </div>
              )}

              {/* Lịch sử đặt vé */}
              <div className="mt-8">
                <label className="text-2xs font-black text-vj-admin-muted uppercase tracking-[0.2em] mb-4 block">
                  Lịch sử đặt vé ({userBookings.length})
                </label>
                {isLoadingUserBookings ? (
                  <p className="text-xs text-vj-admin-muted font-medium">Đang tải lịch sử...</p>
                ) : userBookings.length === 0 ? (
                  <p className="text-xs text-vj-admin-muted font-medium">
                    Người dùng chưa có đặt vé nào.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {userBookings.map((b) => (
                      <div
                        key={b.id}
                        className="flex items-center justify-between gap-3 bg-white/[0.03] border border-white/5 rounded-vj px-4 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-black text-white font-mono truncate">
                            {b.booking_code || b.id}
                          </p>
                          <p className="text-2xs text-vj-admin-muted font-bold truncate">
                            {b.flight_no} · {b.from_code}→{b.to_code} ·{' '}
                            {b.depart_time ? new Date(b.depart_time).toLocaleString('vi-VN') : '—'}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-black text-vj-pay-green-text">
                            {Number(b.total_price || 0).toLocaleString('vi-VN')}₫
                          </p>
                          <p className="text-2xs text-vj-admin-muted font-bold uppercase">
                            {b.status}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-10">
                {[
                  {
                    label: 'Tổng đặt vé',
                    value: selectedUser.bookings,
                    icon: 'TicketIcon',
                    color: 'indigo',
                  },
                  {
                    label: 'Đã chi tiêu',
                    value: selectedUser.spent.toLocaleString('vi-VN') + '₫',
                    icon: 'BanknotesIcon',
                    color: 'emerald',
                  },
                  { label: 'Điểm thưởng', value: '1,250', icon: 'StarIcon', color: 'amber' },
                  { label: 'Hạng thẻ', value: 'Gold', icon: 'TrophyIcon', color: 'rose' },
                ].map((stat, idx) => (
                  <div key={idx} className="bg-white/[0.02] border border-white/5 rounded-2xl p-4">
                    <Icon name={stat.icon} size={16} className={`text-${stat.color}-400 mb-2`} />
                    <div className="text-lg font-black text-white tracking-tighter">
                      {stat.value}
                    </div>
                    <div className="text-2xs font-bold text-vj-admin-muted uppercase tracking-wider">
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>

              {/* Advanced info */}
              <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-8">
                <section>
                  <label className="text-2xs font-black text-vj-admin-muted uppercase tracking-[0.2em] mb-4 block">
                    Liên hệ chi tiết
                  </label>
                  <div className="space-y-4">
                    <div className="flex items-center gap-4 bg-white/5 border border-white/5 p-3 rounded-2xl">
                      <div className="w-10 h-10 bg-slate-800 rounded-vj flex items-center justify-center text-vj-admin-muted">
                        <Icon name="PhoneIcon" size={18} />
                      </div>
                      <div>
                        <p className="text-2xs font-black text-vj-admin-muted uppercase tracking-widest">
                          Số điện thoại
                        </p>
                        <p className="text-sm font-bold text-vj-admin-muted">{selectedUser.phone}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 bg-white/5 border border-white/5 p-3 rounded-2xl">
                      <div className="w-10 h-10 bg-slate-800 rounded-vj flex items-center justify-center text-vj-admin-muted">
                        <Icon name="GlobeAltIcon" size={18} />
                      </div>
                      <div>
                        <p className="text-2xs font-black text-vj-admin-muted uppercase tracking-widest">
                          Quốc tịch
                        </p>
                        <p className="text-sm font-bold text-vj-admin-muted">Việt Nam</p>
                      </div>
                    </div>
                  </div>
                </section>

                <section>
                  <label className="text-2xs font-black text-vj-admin-muted uppercase tracking-[0.2em] mb-4 block">
                    Ghi chú vận hành
                  </label>
                  <textarea
                    className="w-full bg-white/5 border border-white/5 rounded-2xl p-4 text-xs text-vj-admin-muted placeholder-slate-600 focus:outline-none focus:border-vj-blue min-h-[110px] resize-none"
                    placeholder="Nhập ghi chú cho người dùng này (chỉ hệ thống thấy)..."
                    value={notesDraft}
                    onChange={(e) => setNotesDraft(e.target.value)}
                    maxLength={2000}
                  />
                  <div className="flex items-center justify-between mt-3">
                    <p className="text-2xs text-vj-admin-muted">
                      {notesDraft.trim() === (selectedUser.operatorNotes ?? '')
                        ? 'Chưa có thay đổi.'
                        : 'Chưa lưu — bấm "Lưu ghi chú".'}
                    </p>
                    <button
                      type="button"
                      onClick={handleSaveNotes}
                      disabled={
                        isSavingNotes || notesDraft.trim() === (selectedUser.operatorNotes ?? '')
                      }
                      className="text-2xs font-black uppercase tracking-widest px-4 py-2 rounded-vj bg-sky-400/10 text-vj-bank-blue-text border border-sky-400/30 hover:bg-vj-blue disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {isSavingNotes ? 'Đang lưu...' : 'Lưu ghi chú'}
                    </button>
                  </div>
                </section>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Modal — admin tạo tài khoản thành viên / admin mới. */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-stone-100">
              <div>
                <h3 className="font-bold text-stone-900 text-lg">Tạo tài khoản hội viên</h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  Thêm thành viên SkyJoy hoặc tài khoản quản trị hệ thống
                </p>
              </div>
              <button
                onClick={() => setShowCreateForm(false)}
                className="w-8 h-8 bg-stone-100 hover:bg-stone-200 rounded-vj flex items-center justify-center cursor-pointer transition-colors"
              >
                <Icon name="XMarkIcon" size={16} />
              </button>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const fullName = createDraft.full_name.trim();
                const email = createDraft.email.trim();
                const password = createDraft.password;
                const phone = createDraft.phone.trim();
                const skyjoyMemberId = createDraft.skyjoy_member_id.trim().toUpperCase();

                if (fullName.length < 2) {
                  onToast?.error('Lỗi nhập liệu', 'Họ tên phải có ít nhất 2 ký tự.');
                  return;
                }
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                  onToast?.error('Lỗi nhập liệu', 'Email không hợp lệ.');
                  return;
                }
                if (password.length < 8) {
                  onToast?.error('Lỗi nhập liệu', 'Mật khẩu phải có ít nhất 8 ký tự.');
                  return;
                }
                if (phone && !/^\+?\d[\d\s]{7,19}$/.test(phone)) {
                  onToast?.error('Lỗi nhập liệu', 'Số điện thoại không hợp lệ.');
                  return;
                }
                setIsCreating(true);
                try {
                  await createUser({
                    email,
                    password,
                    full_name: fullName,
                    phone: phone || null,
                    role: createDraft.role,
                    skyjoy_member_id: skyjoyMemberId || null,
                  });
                  setShowCreateForm(false);
                  onToast?.success(
                    'Tạo tài khoản thành công',
                    `Đã tạo tài khoản cho ${fullName} (${email}) với vai trò ${createDraft.role === 'admin' ? 'Quản trị viên' : 'Hội viên SkyJoy'}.`
                  );
                  await fetchUsers();
                } catch (err) {
                  onToast?.error(
                    'Không tạo được tài khoản',
                    getApiErrorMessage(err, 'Vui lòng kiểm tra lại thông tin.')
                  );
                } finally {
                  setIsCreating(false);
                }
              }}
              className="p-5 space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-stone-400 uppercase tracking-wider mb-1">
                  Họ tên *
                </label>
                <input
                  type="text"
                  value={createDraft.full_name}
                  onChange={(e) => setCreateDraft((p) => ({ ...p, full_name: e.target.value }))}
                  placeholder="NGUYEN VAN A"
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-vj text-sm form-input"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-400 uppercase tracking-wider mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  value={createDraft.email}
                  onChange={(e) => setCreateDraft((p) => ({ ...p, email: e.target.value }))}
                  placeholder="hoivien@vietjetair.com"
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-vj text-sm form-input"
                  required
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-stone-400 uppercase tracking-wider">
                    Mật khẩu khởi tạo *
                  </label>
                  <button
                    type="button"
                    onClick={generateRandomPassword}
                    className="text-2xs font-bold text-primary hover:underline cursor-pointer"
                  >
                    Tạo ngẫu nhiên
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showCreatePassword ? 'text' : 'password'}
                    value={createDraft.password}
                    onChange={(e) => setCreateDraft((p) => ({ ...p, password: e.target.value }))}
                    placeholder="Tối thiểu 8 ký tự (hoa, thường, số, ký tự đặc biệt)"
                    className="w-full px-3 py-2 pr-14 bg-stone-50 border border-stone-200 rounded-vj text-sm form-input"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowCreatePassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-stone-500 hover:text-stone-800 cursor-pointer"
                  >
                    {showCreatePassword ? 'Ẩn' : 'Hiện'}
                  </button>
                </div>
                <p className="text-2xs text-stone-400 mt-1">
                  Gửi mật khẩu khởi tạo này cho thành viên để đăng nhập lần đầu.
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-400 uppercase tracking-wider mb-1">
                  Số điện thoại
                </label>
                <input
                  type="tel"
                  value={createDraft.phone}
                  onChange={(e) => setCreateDraft((p) => ({ ...p, phone: e.target.value }))}
                  placeholder="0901 234 567"
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-vj text-sm form-input"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-400 uppercase tracking-wider mb-1">
                  Mã hội viên SkyJoy (tùy chọn)
                </label>
                <input
                  type="text"
                  value={createDraft.skyjoy_member_id}
                  onChange={(e) =>
                    setCreateDraft((p) => ({
                      ...p,
                      skyjoy_member_id: e.target.value.toUpperCase(),
                    }))
                  }
                  placeholder="Tự động cấp (SJ...) hoặc nhập mã"
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-vj text-sm form-input"
                />
                <p className="text-2xs text-stone-400 mt-1">
                  Để trống để hệ thống tự động cấp mã SkyJoy hội viên mới (SJ + 8 chữ số).
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-400 uppercase tracking-wider mb-1">
                  Vai trò
                </label>
                <select
                  value={createDraft.role}
                  onChange={(e) =>
                    setCreateDraft((p) => ({
                      ...p,
                      role: e.target.value as 'user' | 'admin',
                    }))
                  }
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-vj text-sm form-input"
                >
                  <option value="user">Hội viên SkyJoy (User)</option>
                  <option value="admin">Quản trị viên (Hệ Thống)</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  disabled={isCreating}
                  className="flex-1 border border-stone-300 text-stone-600 font-semibold py-2.5 rounded-vj text-sm hover:bg-stone-50 transition-all disabled:opacity-50 cursor-pointer"
                >
                  Huỷ
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="flex-1 bg-primary hover:bg-primary-dark text-white font-bold py-2.5 rounded-vj text-sm transition-all disabled:opacity-60 cursor-pointer flex items-center justify-center gap-2"
                >
                  {isCreating ? (
                    <>
                      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                      Đang tạo...
                    </>
                  ) : (
                    'Tạo tài khoản'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-stone-100">
              <h3 className="font-bold text-stone-900">Chỉnh sửa người dùng</h3>
              <button
                onClick={() => setEditingUser(null)}
                className="w-8 h-8 bg-stone-100 hover:bg-stone-200 rounded-vj flex items-center justify-center"
              >
                <Icon name="XMarkIcon" size={16} />
              </button>
            </div>
            <form onSubmit={handleSaveEdit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-stone-400 uppercase tracking-wider mb-1">
                  Họ tên
                </label>
                <div className={`form-field-float ${editingUser.name ? 'has-value' : ''}`}>
                  <input
                    type="text"
                    value={editingUser.name}
                    onChange={(e) =>
                      setEditingUser((p) => (p ? { ...p, name: e.target.value } : p))
                    }
                    placeholder=" "
                    className={`w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-vj text-sm form-input ${editingUser.name.trim().length >= 2 ? 'form-input-valid' : ''}`}
                  />
                  <label className="form-label-float">Nguyễn Văn A</label>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-400 uppercase tracking-wider mb-1">
                  Email
                </label>
                <div className={`form-field-float ${editingUser.email ? 'has-value' : ''}`}>
                  <input
                    type="email"
                    value={editingUser.email}
                    onChange={(e) =>
                      setEditingUser((p) => (p ? { ...p, email: e.target.value } : p))
                    }
                    placeholder=" "
                    className={`w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-vj text-sm form-input ${/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editingUser.email) ? 'form-input-valid' : ''}`}
                  />
                  <label className="form-label-float">email@example.com</label>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-400 uppercase tracking-wider mb-1">
                  Số điện thoại
                </label>
                <div className={`form-field-float ${editingUser.phone ? 'has-value' : ''}`}>
                  <input
                    type="tel"
                    value={editingUser.phone}
                    onChange={(e) =>
                      setEditingUser((p) => (p ? { ...p, phone: e.target.value } : p))
                    }
                    placeholder=" "
                    className={`w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-vj text-sm form-input ${editingUser.phone.replace(/\D/g, '').length >= 9 ? 'form-input-valid' : ''}`}
                  />
                  <label className="form-label-float">0901 234 567</label>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-stone-400 uppercase tracking-wider mb-1">
                  Vai trò
                </label>
                <select
                  value={editingUser.role}
                  onChange={(e) =>
                    setEditingUser((p) => (p ? { ...p, role: e.target.value as UserRole } : p))
                  }
                  className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-vj text-sm form-input"
                >
                  <option value="user">Người dùng</option>
                  <option value="admin">Hệ Thống</option>
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  disabled={isSavingEdit}
                  className="flex-1 border border-stone-300 text-stone-600 font-semibold py-2.5 rounded-vj text-sm hover:bg-stone-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Huỷ
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="flex-1 bg-primary hover:bg-primary-dark text-white font-bold py-2.5 rounded-vj text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSavingEdit ? (
                    <>
                      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                      Đang lưu...
                    </>
                  ) : (
                    'Lưu thay đổi'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
