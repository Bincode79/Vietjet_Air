'use client';

/**
 * Admin RBAC console.
 *
 * The matrix is now **enforced**. `verifyAdminRequest()` checks each route's
 * `permission` against the `role_permissions` table (migration 019) via
 * `lib/role-permissions.ts`, and this panel renders the same grants so an
 * operator can see and change them.
 *
 * Two caveats worth keeping in view:
 *   * `super_admin` bypasses the table entirely, so narrowing it here has no
 *     effect on that role by design.
 *   * The sets rendered here are the static mirror in `lib/rbac.ts`; the
 *     request path trusts the database. A grant is only live once persisted.
 *
 * Treat this screen as the control surface for RBAC, not as a record of a
 * decision that lives somewhere else.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Icon } from '@/shared/components/ui';
import {
  listRbacRoles,
  listRbacAudit,
  listRbacConfig,
  setRbacConfig,
  assignRbacRole,
  removeRbacRole,
  type AdminRbacAuditRow,
  type AdminRoleRow,
  type AdminSystemConfigRow,
} from '@/features/admin';
import { getApiErrorMessage } from '@/shared/services';
import { SYSTEM_CONFIG_SCHEMA, type SystemConfigKey } from '@/lib/system-config';
import {
  PERMISSION_CATEGORIES,
  PERMISSION_LABELS,
  SYSTEM_ROLES,
  type Permission,
  type SystemRoleName,
} from '@/lib/rbac';

interface ToastAPI {
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
}

type TabId = 'roles' | 'matrix' | 'audit' | 'config';

export default function AdminRBACPanel({ onToast }: { onToast?: ToastAPI }) {
  const [activeTab, setActiveTab] = useState<TabId>('matrix');
  const [loading, setLoading] = useState(true);
  const [adminRoles, setAdminRoles] = useState<AdminRoleRow[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminRbacAuditRow[]>([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedUserEmail, setSelectedUserEmail] = useState('');
  const [assignRoleName, setAssignRoleName] = useState<SystemRoleName>('admin_ops');
  const [isAssigning, setIsAssigning] = useState(false);
  const [configRows, setConfigRows] = useState<AdminSystemConfigRow[]>([]);
  const [configLoading, setConfigLoading] = useState(false);
  const [configError, setConfigError] = useState(false);
  const [savingConfigKey, setSavingConfigKey] = useState<string | null>(null);

  // ─── Fetch data ──────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [rolesData, logsData] = await Promise.all([listRbacRoles(), listRbacAudit(50)]);
      setAdminRoles(rolesData.roles || []);
      setAuditLogs(logsData.logs || []);
    } catch (err) {
      console.error('RBAC fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ─── System config (tab "Cấu hình hệ thống") ─────────────────────────
  //
  // Dữ liệu đọc từ bảng `system_config` thật. Trước đây tab này hiển thị
  // các giá trị hard-code (`site_name`, `maintenance_mode`, …) và bấm vào chỉ
  // hiện toast "đang được phát triển" — tức là admin thấy một bảng cấu hình
  // nhưng không thay đổi được gì.

  const fetchConfig = useCallback(async () => {
    setConfigLoading(true);
    setConfigError(false);
    try {
      const data = await listRbacConfig();
      setConfigRows(data.configs || []);
    } catch (err) {
      console.error('RBAC config fetch error:', err);
      setConfigError(true);
    } finally {
      setConfigLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'config') fetchConfig();
  }, [activeTab, fetchConfig]);

  /** Giá trị hiện tại của một key: ưu tiên hàng trong DB, không có thì dùng mặc định schema. */
  const configValueOf = (key: SystemConfigKey): string => {
    const row = configRows.find((c) => c.key === key);
    if (row) return row.value;
    return String(SYSTEM_CONFIG_SCHEMA[key].default);
  };

  const handleToggleConfig = async (key: SystemConfigKey) => {
    const next = configValueOf(key) === 'true' ? 'false' : 'true';
    setSavingConfigKey(key);
    try {
      await setRbacConfig({ key, value: next });
      setConfigRows((prev) => [
        ...prev.filter((c) => c.key !== key),
        {
          id: `local-${key}`,
          key,
          value: next,
          type: 'boolean',
          description: SYSTEM_CONFIG_SCHEMA[key].description,
          category: null,
          updated_at: new Date().toISOString(),
        },
      ]);
      onToast?.success('Đã cập nhật', `${key} = ${next}`);
    } catch (err) {
      onToast?.error('Lỗi', getApiErrorMessage(err, 'Không thể cập nhật cấu hình'));
    } finally {
      setSavingConfigKey(null);
    }
  };

  // ─── Assign role handler ─────────────────────────────────────────────

  const handleAssignRole = async () => {
    if (!selectedUserEmail) return;
    setIsAssigning(true);

    try {
      const data = await assignRbacRole({
        targetUserId: selectedUserEmail,
        roleName: assignRoleName,
      });
      onToast?.success('Gán role thành công', data.message);
      setShowAssignModal(false);
      setSelectedUserEmail('');
      fetchData();
    } catch (err) {
      onToast?.error('Lỗi mạng', getApiErrorMessage(err, 'Không thể gán role'));
    } finally {
      setIsAssigning(false);
    }
  };

  // ─── Remove role handler ─────────────────────────────────────────────

  const handleRemoveRole = async (userId: string, email: string) => {
    if (!confirm(`Xác nhận xóa quyền hệ thống của "${email}"?`)) return;

    try {
      const data = await removeRbacRole(userId);
      onToast?.success('Đã xóa role', data.message);
      fetchData();
    } catch (err) {
      onToast?.error('Lỗi', getApiErrorMessage(err, 'Không thể xóa role'));
    }
  };

  // ─── Render helpers ──────────────────────────────────────────────────

  const TABS: { id: TabId; label: string; icon: string }[] = [
    { id: 'matrix', label: 'Ma trận phân quyền', icon: 'Squares2X2Icon' },
    { id: 'roles', label: 'Quản lý Hệ Thống', icon: 'ShieldCheckIcon' },
    { id: 'audit', label: 'Audit Log', icon: 'DocumentTextIcon' },
    { id: 'config', label: 'Cấu hình hệ thống', icon: 'Cog6ToothIcon' },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2
            className="text-xl font-bold flex items-center gap-2 text-navy"
            style={{ fontWeight: 800 }}
          >
            <Icon name="ShieldCheckIcon" size={22} className="text-primary" />
            Hệ thống Phân quyền RBAC
          </h2>
          <p className="text-sm mt-1 font-koho">
            Quản lý chi tiết quyền hạn cho từng tài khoản hệ thống — Role-Based Access Control
          </p>
        </div>
        <button
          onClick={() => setShowAssignModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-vj text-white text-sm font-bold transition-all shadow-vj-md hover:shadow-vj-lg bg-primary-solid"
        >
          <Icon name="UserPlusIcon" size={16} /> Gán quyền Hệ Thống
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-vj-pill rounded-vj p-1 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-vj text-xs font-semibold transition-all whitespace-nowrap ${
              activeTab === t.id
                ? 'bg-white shadow text-red-700 font-bold'
                : 'text-vj-gray hover:text-vj-text-dim'
            } font-koho`}
          >
            <Icon name={t.icon} size={14} /> {t.label}
          </button>
        ))}
      </div>

      {/* ═══════ TAB: MATRIX ══════ */}
      {activeTab === 'matrix' && (
        <div className="space-y-4">
          {/* System roles summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
            {Object.values(SYSTEM_ROLES).map((def) => (
              <div
                key={def.name}
                className={`rounded-vj p-4 border ${def.bgColor.replace('bg-gradient-to-r', 'bg')} border-opacity-20`}
                style={{
                  borderColor: def.color.includes('red')
                    ? '#FCA5A5'
                    : def.color.includes('blue')
                      ? '#93C5FD'
                      : def.color.includes('emerald')
                        ? '#86EFAC'
                        : def.color.includes('purple')
                          ? '#D8B4FE'
                          : '#FDE68A',
                }}
              >
                <div
                  className={`text-xs2 font-black uppercase tracking-wider mb-1`}
                  style={{ color: def.color }}
                >
                  {def.label}
                </div>
                <div className="text-xs mb-2 leading-relaxed" style={{ color: '#4B5563' }}>
                  {def.description}
                </div>
                <div className="flex items-center justify-between">
                  <span
                    className="text-2xs font-bold px-2 py-0.5 rounded-full"
                    style={{
                      background: def.color.includes('red')
                        ? '#FEE2E2'
                        : def.color.includes('blue')
                          ? '#EFF6FF'
                          : def.color.includes('emerald')
                            ? '#D1FAE5'
                            : def.color.includes('purple')
                              ? '#FAF5FF'
                              : '#FFFBEB',
                      color: def.color,
                    }}
                  >
                    Level {def.level}
                  </span>
                  <span className="text-2xs text-vj-muted">{def.permissions.size} quyền</span>
                </div>
              </div>
            ))}
          </div>

          {/* Full permission matrix table */}
          <div className="bg-white rounded-vj border border-vj-border-light overflow-hidden">
            <div
              className="px-4 py-3 border-b border-vj-border-light flex items-center justify-between"
              style={{ background: 'linear-gradient(135deg, #1A2948 0%, #0F1E3A 100%)' }}
            >
              <span className="text-white font-bold text-sm font-koho">
                Ma trận Phân quyền Chi tiết
              </span>
              <span className="text-white/60 text-xs">
                {PERMISSION_CATEGORIES.length} nhóm &middot; {Object.keys(PERMISSION_LABELS).length}{' '}
                quyền
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-vj-surface-2">
                    <th className="text-left px-3 py-2 font-semibold text-vj-gray uppercase tracking-wider min-w-[140px]">
                      Nhóm / Quyền
                    </th>
                    {Object.keys(SYSTEM_ROLES).map((roleKey) => {
                      const r = SYSTEM_ROLES[roleKey as SystemRoleName];
                      return (
                        <th
                          key={roleKey}
                          className="px-2 py-2 text-center font-semibold min-w-[80px]"
                          style={{ color: r.color.replace('text-', '') }}
                          dangerouslySetInnerHTML={{
                            __html: `<span class="${r.bgColor.split(' ')[0]} text-white px-2 py-0.5 rounded text-2xs font-bold">${r.label}</span>`,
                          }}
                        />
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {PERMISSION_CATEGORIES.map((cat) => (
                    <React.Fragment key={cat.key}>
                      {/* Category header row */}
                      <tr className="border-t border-vj-border-light bg-vj-surface-2/50">
                        <td
                          colSpan={Object.keys(SYSTEM_ROLES).length + 1}
                          className="px-3 py-1.5 font-bold text-vj-text-dim text-2xs uppercase tracking-wider flex items-center gap-1.5 font-koho"
                        >
                          <Icon name={cat.icon} size={12} /> {cat.label}
                        </td>
                      </tr>
                      {/* Permission rows */}
                      {cat.permissions.map((perm) => (
                        <tr
                          key={perm}
                          className="border-b border-gray-50 hover:bg-vj-surface-rose/30 transition-colors"
                        >
                          <td className="px-3 py-1.5 font-medium text-vj-text-strong" title={perm}>
                            {PERMISSION_LABELS[perm]}
                          </td>
                          {(
                            Object.entries(SYSTEM_ROLES) as [
                              SystemRoleName,
                              (typeof SYSTEM_ROLES)[SystemRoleName],
                            ][]
                          ).map(([rk, rd]) => (
                            <td key={rk} className="px-2 py-1.5 text-center">
                              {rd.permissions.has(perm) ? (
                                <span
                                  className="inline-flex items-center justify-center w-5 h-5 rounded-full text-2xs font-bold"
                                  style={{ background: '#DCFCE7', color: '#166534' }}
                                >
                                  &#10003;
                                </span>
                              ) : (
                                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-vj-muted">
                                  &#x2715;
                                </span>
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ TAB: ROLES MANAGEMENT ══════ */}
      {activeTab === 'roles' && (
        <div className="bg-white rounded-vj border border-vj-border-light overflow-hidden">
          <div
            className="px-4 py-3 border-b border-vj-border-light flex items-center justify-between"
            style={{ background: 'linear-gradient(135deg, #1A2948 0%, #0F1E3A 100%)' }}
          >
            <span className="text-white font-bold text-sm font-koho">
              Danh sách Tài khoản Hệ Thống & Phân quyền
            </span>
            <span className="text-white/60 text-xs">{adminRoles.length} tài khoản</span>
          </div>

          {loading ? (
            <div className="p-12 flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-red-200 border-t-red-600 rounded-full animate-spin" />
            </div>
          ) : adminRoles.length === 0 ? (
            <div className="p-12 text-center text-vj-muted">
              <Icon name="UsersIcon" size={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">Chưa có tài khoản hệ thống nào được gán role chi tiết</p>
              <button
                onClick={() => setShowAssignModal(true)}
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-white px-4 py-2 rounded-vj bg-primary-solid"
              >
                <Icon name="PlusIcon" size={14} /> Gán quyền đầu tiên
              </button>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {adminRoles.map((ar) => {
                const roleDef = SYSTEM_ROLES[ar.role_name as SystemRoleName];
                const perms = ar.custom_permissions
                  ? (JSON.parse(ar.custom_permissions) as Permission[])
                  : null;
                const permList = perms || (roleDef ? Array.from(roleDef.permissions) : []);
                return (
                  <div key={ar.id} className="px-4 py-3 hover:bg-vj-surface-2 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-9 h-9 rounded-vj flex items-center justify-center text-white text-xs font-bold"
                          style={{
                            background: (roleDef?.bgColor || '#6B7280').split(' ')[1] || '#6B7280',
                          }}
                        >
                          {(ar.full_name || '?')[0].toUpperCase()}
                        </div>
                        <div>
                          <div className="font-semibold text-sm text-navy">
                            {ar.full_name || 'Unknown'}
                          </div>
                          <div className="text-xs text-vj-muted">{ar.email}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {/* Role badge */}
                        <span
                          className={`text-xs2 font-bold px-2.5 py-1 rounded-full ${roleDef?.bgColor || 'bg-vj-surface-3'} text-white`}
                        >
                          {roleDef?.label || ar.role_name}
                        </span>

                        {/* Permission count */}
                        <span className="text-2xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-semibold">
                          {permList.length} quyền
                        </span>

                        {/* Actions */}
                        <button
                          onClick={() => handleRemoveRole(ar.user_id, ar.email)}
                          className="w-7 h-7 rounded-vj flex items-center justify-center text-vj-muted hover:text-vj-red hover:bg-vj-surface-rose transition-colors"
                          title="Xóa role"
                        >
                          <Icon name="TrashIcon" size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Mini permission list */}
                    <div className="mt-2 ml-14 flex flex-wrap gap-1">
                      {permList.slice(0, 8).map((p) => (
                        <span
                          key={p}
                          className="text-2xs px-1.5 py-0.5 rounded bg-vj-pill text-vj-gray font-mono truncate max-w-[120px]"
                        >
                          {p}
                        </span>
                      ))}
                      {permList.length > 8 && (
                        <span className="text-2xs px-1.5 py-0.5 rounded bg-vj-pill text-vj-muted">
                          +{permList.length - 8} nữa
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════ TAB: AUDIT LOG ══════ */}
      {activeTab === 'audit' && (
        <div className="bg-white rounded-vj border border-vj-border-light overflow-hidden">
          <div
            className="px-4 py-3 border-b border-vj-border-light flex items-center justify-between"
            style={{ background: 'linear-gradient(135deg, #1A2948 0%, #0F1E3A 100%)' }}
          >
            <span className="text-white font-bold text-sm font-koho">
              Audit Log — Lịch sử thao tác
            </span>
            <button
              onClick={fetchData}
              className="text-white/70 hover:text-white text-xs flex items-center gap-1 transition-colors"
            >
              <Icon name="ArrowPathIcon" size={12} /> Làm mới
            </button>
          </div>

          {auditLogs.length === 0 ? (
            <div className="p-12 text-center text-vj-muted">
              <Icon name="DocumentTextIcon" size={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">Chưa có bản ghi audit</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50 max-h-[600px] overflow-y-auto">
              {auditLogs.map((log) => (
                <div key={log.id} className="px-4 py-2.5 hover:bg-vj-surface-2 transition-colors">
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${
                        log.status === 'success'
                          ? 'bg-vj-pay-green'
                          : log.status === 'denied'
                            ? 'bg-red-500'
                            : 'bg-amber-500'
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <code className="text-xs2 font-mono font-bold px-1.5 py-0.5 rounded bg-vj-pill text-purple-700">
                          {log.action}
                        </code>
                        <span className="text-2xs text-vj-muted">→</span>
                        <span className="text-2xs font-semibold text-vj-text-strong">
                          {log.target_type}
                        </span>
                        {log.target_id && (
                          <span className="text-2xs font-mono text-vj-muted">
                            #{log.target_id.slice(0, 8)}
                          </span>
                        )}
                        <span
                          className={`ml-auto text-2xs font-bold px-1.5 py-0.5 rounded ${
                            log.status === 'success'
                              ? 'bg-vj-pay-green text-vj-pay-green'
                              : log.status === 'denied'
                                ? 'bg-red-50 text-red-700'
                                : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          {log.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-2xs text-vj-muted">
                        <span className="font-semibold">{log.admin_email}</span>
                        <span>{new Date(log.created_at).toLocaleString('vi-VN')}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════ TAB: CONFIG ══════ */}
      {activeTab === 'config' && (
        <div className="bg-white rounded-vj border border-vj-border-light p-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h3 className="font-bold text-base font-koho">Cấu hình hệ thống</h3>
            <button
              onClick={fetchConfig}
              disabled={configLoading}
              className="text-xs font-bold text-primary hover:underline disabled:opacity-50 disabled:no-underline"
            >
              {configLoading ? 'Đang tải…' : 'Tải lại'}
            </button>
          </div>

          {configError ? (
            <div className="rounded-vj border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              Không thể tải cấu hình hệ thống.
            </div>
          ) : (
            <>
              <p className="text-xs text-vj-gray mb-4">
                Giá trị đọc trực tiếp từ bảng{' '}
                <code className="bg-vj-pill px-1 rounded">system_config</code>. Chỉ các cài đặt có
                tác dụng thật mới được liệt kê — cài đặt không có trong danh sách này sẽ không ảnh
                hưởng gì tới hệ thống.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {(Object.keys(SYSTEM_CONFIG_SCHEMA) as SystemConfigKey[]).map((key) => {
                  const spec = SYSTEM_CONFIG_SCHEMA[key];
                  const isBoolean = spec.type === 'boolean';
                  const currentValue = configValueOf(key);
                  const isOn = currentValue === 'true';
                  const isSaving = savingConfigKey === key;

                  return (
                    <div
                      key={key}
                      className="rounded-vj border border-vj-border-light p-4 hover:border-primary/40 hover:shadow-vj-sm transition-all"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-vj bg-red-50 flex items-center justify-center">
                          <Icon name="Cog6ToothIcon" size={15} className="text-primary" />
                        </div>
                        <span className="text-2xs font-mono text-vj-muted">{key}</span>
                      </div>
                      <div className="font-bold text-sm text-navy">{spec.description}</div>

                      {isBoolean ? (
                        <button
                          role="switch"
                          aria-checked={isOn}
                          aria-label={spec.description}
                          disabled={isSaving}
                          onClick={() => handleToggleConfig(key)}
                          className={`relative w-12 h-6 mt-3 rounded-full transition-all duration-300 disabled:opacity-50 ${
                            isOn ? 'bg-vj-pay-green' : 'bg-vj-surface-3'
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-vj-md transition-transform duration-300 ${
                              isOn ? 'translate-x-6' : 'translate-x-0.5'
                            }`}
                          />
                        </button>
                      ) : (
                        <div className="text-lg font-black mt-1 font-koho">{currentValue}</div>
                      )}

                      <div className="text-2xs text-vj-muted mt-2">
                        {isBoolean ? (isOn ? 'Đang bật' : 'Đang tắt') : `Mặc định: ${spec.default}`}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div
                className="mt-4 p-3 rounded-vj flex items-start gap-2"
                style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}
              >
                <Icon
                  name="InformationCircleIcon"
                  size={16}
                  className="text-yellow-600 mt-0.5 flex-shrink-0"
                />
                <p className="text-xs" style={{ color: '#92400E' }}>
                  Thay đổi được ghi vào{' '}
                  <code className="bg-yellow-100 px-1 rounded">system_config</code> và có hiệu lực
                  với các request tiếp theo. Mọi thay đổi đều được ghi vào Audit Log.
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══════ ASSIGN ROLE MODAL ══════ */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowAssignModal(false)}
          />
          <div
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            style={{ animation: 'fadeInUp 0.25s ease-out' }}
          >
            <div
              className="px-5 py-4 border-b border-vj-border-light"
              style={{ background: 'linear-gradient(135deg, #EC2029 0%, #D91A21 100%)' }}
            >
              <h3 className="text-white font-bold font-heading-sm">Gán quyền cho Hệ Thống</h3>
              <p className="text-white/70 text-xs mt-0.5">Chọn role và nhập thông tin người dùng</p>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-vj-muted uppercase tracking-wider mb-1.5">
                  Email / User ID
                </label>
                <input
                  type="text"
                  value={selectedUserEmail}
                  onChange={(e) => setSelectedUserEmail(e.target.value)}
                  placeholder="user@example.com hoặc user ID"
                  className="w-full px-3 py-2.5 bg-vj-surface-2 border border-vj-border-light rounded-vj text-sm focus:outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-vj-muted uppercase tracking-wider mb-2">
                  Chọn Role
                </label>
                <div className="grid grid-cols-1 gap-2">
                  {(
                    Object.entries(SYSTEM_ROLES) as [
                      SystemRoleName,
                      (typeof SYSTEM_ROLES)[SystemRoleName],
                    ][]
                  ).map(([key, def]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setAssignRoleName(key)}
                      className={`flex items-center justify-between px-4 py-3 rounded-vj border-2 transition-all text-left ${
                        assignRoleName === key
                          ? 'border-red-500 bg-red-50'
                          : 'border-vj-border-light hover:border-vj-line'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-8 h-8 rounded-vj flex items-center justify-center text-white text-xs font-bold ${def.bgColor}`}
                        >
                          L{def.level}
                        </div>
                        <div>
                          <div
                            className="font-bold text-sm"
                            style={{ color: assignRoleName === key ? '#EC2029' : '#1A2948' }}
                          >
                            {def.label}
                          </div>
                          <div className="text-2xs text-vj-muted">
                            {def.permissions.size} permissions
                          </div>
                        </div>
                      </div>
                      {assignRoleName === key && (
                        <Icon name="CheckCircleIcon" size={18} className="text-primary" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Selected role preview */}
              {(() => {
                const selected = SYSTEM_ROLES[assignRoleName];
                return (
                  <div
                    className="rounded-vj p-3 space-y-2"
                    style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}
                  >
                    <div className="flex items-center gap-2">
                      <Icon name="EyeIcon" size={13} className="text-vj-muted" />
                      <span className="text-2xs font-bold uppercase tracking-wider text-vj-gray">
                        Preview quyền:
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {Array.from(selected!.permissions)
                        .slice(0, 12)
                        .map((p) => (
                          <span
                            key={p}
                            className="text-3xs px-1.5 py-0.5 rounded bg-white border border-vj-border-light text-vj-text-strong font-mono"
                          >
                            {p}
                          </span>
                        ))}
                      {selected!.permissions.size > 12 && (
                        <span className="text-3xs px-1.5 py-0.5 rounded bg-red-50 text-vj-red-dark font-bold">
                          +{selected!.permissions.size - 12} nữa
                        </span>
                      )}
                    </div>
                  </div>
                );
              })()}

              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setShowAssignModal(false)}
                  disabled={isAssigning}
                  className="flex-1 border border-vj-line text-vj-text-strong font-semibold py-2.5 rounded-vj text-sm hover:bg-vj-surface-2 disabled:opacity-50 font-koho"
                >
                  Huỷ
                </button>
                <button
                  onClick={handleAssignRole}
                  disabled={!selectedUserEmail || isAssigning}
                  className="flex-1 text-white font-bold py-2.5 rounded-vj text-sm disabled:opacity-40 flex items-center justify-center gap-2"
                  style={{
                    background: isAssigning ? '#9CA3AF' : '#EC2029',
                  }}
                >
                  {isAssigning ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Đang gán...
                    </>
                  ) : (
                    <>
                      <Icon name="ShieldCheckIcon" size={14} /> Xác nhận gán
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
