'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { Icon } from '@/shared/components/ui';
import { getSystemSettings, updateSystemSettings, sendTestEmail } from '@/features/admin';
import {
  SYSTEM_CONFIG_SCHEMA,
  getSystemConfigBounds,
  type SystemConfigKey,
} from '@/lib/system-config-schema';
import { getApiErrorMessage } from '@/shared/services';
import { AdminTabHeader, ADMIN_CARD_STYLE, ADMIN_ACTION_BTN } from './AdminSection';
import EmailTemplatePreviewModal from './EmailTemplatePreviewModal';

interface SettingsObject {
  [key: string]: { value: string; description?: string };
}

interface ToastAPI {
  success: (title: string, message?: string, options?: object) => void;
  error: (title: string, message?: string, options?: object) => void;
}

const SETTING_CATEGORIES = [
  { id: 'booking', label: 'Cấu hình đặt vé', icon: 'TicketIcon' },
  { id: 'notification', label: 'Điều chỉnh Email tự động & Thông báo', icon: 'EnvelopeIcon' },
];

/**
 * Danh sách cài đặt hiển thị trong tab.
 *
 * Mỗi mục PHẢI có một key nằm trong `SYSTEM_CONFIG_SCHEMA`
 * (`src/lib/system-config.ts`) — đó là danh sách những key thực sự được đọc
 * khi hệ thống chạy. Key không có trong schema sẽ không có tác dụng gì, nên
 * không được đưa vào đây: một ô cài đặt "bấm lưu xong nhưng không có gì đổi"
 * tệ hơn là không có ô đó.
 */
const DEFAULT_SETTINGS: Array<{
  key: string;
  label: string;
  description: string;
  type: 'text' | 'number' | 'boolean' | 'select';
  category: string;
  options?: { value: string; label: string }[];
}> = [
  // --- Booking ---
  {
    key: 'max_passengers_per_booking',
    label: 'Số khách tối đa/đơn',
    description:
      'Giới hạn số khách trong một đơn đặt vé. Áp dụng ở API tạo booking nên không thể vượt qua bằng cách gửi request trực tiếp.',
    type: 'number',
    category: 'booking',
  },
  // --- Notification / Điều chỉnh Email tự động ---
  {
    key: 'auto_send_payment_invoice_email',
    label: 'Tự động gửi hoá đơn & vé điện tử',
    description:
      'Tự động gửi email hoá đơn & vé điện tử (E-ticket) cho khách hàng ngay khi hoàn tất thanh toán.',
    type: 'boolean',
    category: 'notification',
  },
  {
    key: 'auto_send_booking_confirmation_email',
    label: 'Tự động gửi email xác nhận đặt chỗ',
    description:
      'Gửi email thông tin hành trình & hướng dẫn chuyển khoản cho khách hàng ngay khi tạo đơn.',
    type: 'boolean',
    category: 'notification',
  },
  {
    key: 'auto_send_fare_change_email',
    label: 'Tự động gửi công văn giá vé cho Đại lý',
    description:
      'Tự động phát hành và gửi thông báo biểu giá vé mới cho các đại lý đối tác khi cập nhật giá.',
    type: 'boolean',
    category: 'notification',
  },
  {
    key: 'auto_send_flight_delay_email',
    label: 'Tự động gửi thông báo đổi giờ bay / hoãn chuyến',
    description:
      'Gửi email cảnh báo và cập nhật giờ bay mới cho hành khách khi chuyến bay bị hoãn (delayed).',
    type: 'boolean',
    category: 'notification',
  },
  {
    key: 'email_notifications',
    label: 'Bật/Tắt toàn bộ thông báo qua email',
    description: 'Công tắc tổng cho phép hoặc tạm dừng gửi mọi loại email từ hệ thống.',
    type: 'boolean',
    category: 'notification',
  },
];

export default function SystemSettingsTab({ onToast }: { onToast?: ToastAPI }) {
  const [settings, setSettings] = useState<SettingsObject>({});
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [localSettings, setLocalSettings] = useState<SettingsObject>({});
  const [activeCategory, setActiveCategory] = useState('booking');
  const [testEmailTo, setTestEmailTo] = useState('');
  const [testEmailTemplate, setTestEmailTemplate] = useState('booking');
  const [isSendingTestEmail, setIsSendingTestEmail] = useState(false);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);

  const fetchSettings = useCallback(async () => {
    setIsLoading(true);
    setHasError(false);
    try {
      const data = await getSystemSettings();
      const fromApi = data.settingsObject || {};

      // Cài đặt chưa từng được lưu sẽ không có trong `system_config` — hiển thị
      // giá trị mặc định của schema để admin thấy được trạng thái thực tế
      // đang chạy, thay vì một ô trống gợi ý "chưa cấu hình".
      const merged: SettingsObject = {};
      for (const setting of DEFAULT_SETTINGS) {
        const saved = fromApi[setting.key];
        merged[setting.key] = {
          value:
            saved?.value ?? String(SYSTEM_CONFIG_SCHEMA[setting.key as SystemConfigKey].default),
          description: setting.description,
        };
      }
      setSettings(merged);
      setLocalSettings(merged);
    } catch {
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSettingChange = (key: string, value: string | boolean) => {
    setLocalSettings((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        value: String(value),
      },
    }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    setIsSaving(true);

    try {
      // Chỉ gửi những cài đặt thực sự thay đổi. Gửi toàn bộ cũng chạy được,
      // nhưng mỗi key là một câu `UPSERT` riêng — giữ payload nhỏ giúp lỗi
      // validation của một key không chặn việc lưu các key còn lại.
      const changed: SettingsObject = {};
      for (const setting of DEFAULT_SETTINGS) {
        const next = localSettings[setting.key]?.value;
        const prev = settings[setting.key]?.value;
        if (next !== undefined && next !== prev) {
          changed[setting.key] = { value: next };
        }
      }

      if (Object.keys(changed).length === 0) {
        setHasChanges(false);
        return;
      }

      await updateSystemSettings({ settings: changed });
      setSettings((prev) => ({ ...prev, ...changed }));
      setLocalSettings((prev) => ({ ...prev, ...changed }));
      setHasChanges(false);
      onToast?.success('Lưu thành công', 'Các cài đặt đã được cập nhật.');
    } catch (err) {
      onToast?.error('Lỗi', getApiErrorMessage(err, 'Không thể lưu cài đặt.'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    if (confirm('Bạn có chắc muốn đặt lại tất cả cài đặt về giá trị ban đầu?')) {
      // "Ban đầu" ở đây là giá trị đang lưu trên DB, không phải giá trị mặc
      // định của schema: admin vừa lưu một cấu hình hợp lệ thì Đặt lại phải
      // đưa họ về đúng trạng thái đó, không phải xóa cấu hình.
      setLocalSettings(settings);
      setHasChanges(false);
    }
  };

  const handleSendTestEmail = async () => {
    const trimmed = testEmailTo.trim();
    if (!trimmed || !trimmed.includes('@')) {
      onToast?.error('Email không hợp lệ', 'Vui lòng nhập địa chỉ email người nhận chính xác.');
      return;
    }
    setIsSendingTestEmail(true);
    try {
      const res = await sendTestEmail({ to: trimmed, template: testEmailTemplate });
      onToast?.success(
        'Gửi email thành công',
        res.message || `Đã gửi email thử nghiệm tới ${trimmed}`
      );
    } catch (err) {
      onToast?.error('Lỗi gửi email', getApiErrorMessage(err, 'Không thể gửi email thử nghiệm.'));
    } finally {
      setIsSendingTestEmail(false);
    }
  };

  const getSettingValue = (key: string, type: string): string | boolean => {
    const setting = localSettings[key];
    if (!setting) {
      // Chưa có trong state (ví dụ lần render đầu) ⇒ lấy mặc định của schema.
      const spec = SYSTEM_CONFIG_SCHEMA[key as SystemConfigKey];
      if (spec) return spec.default as string | boolean;
      return type === 'boolean' ? 'false' : '';
    }
    // Boolean được lưu dưới dạng chuỗi `"true"`/`"false"` trong `system_config`,
    // nên giá trị rỗng phải đọc là `false`, không phải chuỗi rỗng.
    if (type === 'boolean') return setting.value === 'true';
    return setting.value;
  };

  if (isLoading) {
    return (
      <div className="space-y-5">
        <AdminTabHeader icon="CogIcon" title="Cài đặt hệ thống" subtitle="Đang tải..." />
        <div className="rounded-2xl border p-6" style={ADMIN_CARD_STYLE}>
          <div className="animate-pulse space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-16 bg-slate-500 rounded-vj" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="space-y-5">
        <AdminTabHeader
          icon="CogIcon"
          title="Cài đặt hệ thống"
          subtitle="Đã xảy ra lỗi"
          actions={
            <button
              onClick={fetchSettings}
              className={`${ADMIN_ACTION_BTN} text-white bg-vj-blue border border-vj-blue hover:bg-vj-blue`}
            >
              <Icon name="ArrowPathIcon" size={14} />
              Thử lại
            </button>
          }
        />
        <div className="rounded-2xl border p-12 text-center" style={ADMIN_CARD_STYLE}>
          <Icon name="ExclamationTriangleIcon" size={48} className="text-red-400 mx-auto mb-4" />
          <p className="font-bold text-white">Không thể tải cài đặt</p>
          <p className="text-sm text-vj-admin-muted mt-2">Vui lòng thử lại sau</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <AdminTabHeader
        icon="CogIcon"
        title="Cài đặt hệ thống"
        subtitle="Quản lý các thông số cấu hình hệ thống"
        actions={
          <>
            {hasChanges && (
              <button
                onClick={handleReset}
                disabled={isSaving}
                className={`${ADMIN_ACTION_BTN} text-vj-admin-muted border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-50`}
              >
                <Icon name="ArrowPathIcon" size={14} />
                Đặt lại
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={isSaving || !hasChanges}
              className={`${ADMIN_ACTION_BTN} text-white bg-primary hover:bg-primary-dark disabled:opacity-60 disabled:cursor-not-allowed`}
            >
              {isSaving ? (
                <>
                  <Icon name="ArrowPathIcon" size={14} className="animate-spin" />
                  Đang lưu...
                </>
              ) : (
                <>
                  <Icon name="CheckIcon" size={14} />
                  Lưu thay đổi
                </>
              )}
            </button>
          </>
        }
      />
      {/* Categories Tabs */}
      <div className="flex rounded-vj border border-white/10 bg-slate-900 p-1.5 gap-1 overflow-x-auto">
        {SETTING_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-vj text-sm font-semibold transition-all whitespace-nowrap ${
              activeCategory === cat.id
                ? 'bg-primary/15 text-primary'
                : 'text-vj-admin-muted hover:bg-white/5 hover:text-white'
            }`}
          >
            <Icon name={cat.icon} size={18} />
            {cat.label}
          </button>
        ))}
      </div>

      {/* Settings List */}
      <div
        className="rounded-2xl border overflow-hidden"
        style={{ ...ADMIN_CARD_STYLE, padding: 0 }}
      >
        <div
          className="p-5 border-b border-white/5"
          style={{ background: 'linear-gradient(135deg, #1A2948 0%, #2D3E5F 100%)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-vj flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.1)' }}
            >
              <Icon
                name={SETTING_CATEGORIES.find((c) => c.id === activeCategory)?.icon || 'CogIcon'}
                size={20}
                className="text-white"
              />
            </div>
            <div>
              <h3 className="font-bold text-white">
                {SETTING_CATEGORIES.find((c) => c.id === activeCategory)?.label}
              </h3>
              <p className="text-xs text-white/70 mt-0.5">
                Cập nhật các thông số quan trọng liên quan đến{' '}
                {SETTING_CATEGORIES.find((c) => c.id === activeCategory)?.label.toLowerCase()}
              </p>
            </div>
          </div>
        </div>

        <div className="divide-y divide-white/5">
          {DEFAULT_SETTINGS.filter((s) => s.category === activeCategory).map((setting) => {
            const value = getSettingValue(setting.key, setting.type);

            return (
              <div key={setting.key} className="px-5 py-5 hover:bg-white/5 transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-white">{setting.label}</h4>
                      {hasChanges &&
                        localSettings[setting.key]?.value !== settings[setting.key]?.value && (
                          <span className="text-2xs uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20">
                            Đã thay đổi
                          </span>
                        )}
                    </div>
                    <p className="text-xs text-vj-admin-muted mt-1 max-w-xl">
                      {setting.description}
                    </p>
                  </div>
                  <div className="w-full sm:w-64 flex-shrink-0">
                    {setting.type === 'boolean' ? (
                      <div className="flex items-center">
                        <button
                          role="switch"
                          aria-checked={value === true}
                          aria-label={setting.label}
                          onClick={() =>
                            handleSettingChange(setting.key, value === true ? 'false' : 'true')
                          }
                          className={`relative w-12 h-6 rounded-full transition-all duration-300 ${
                            value === true ? 'bg-vj-pay-green' : 'bg-slate-600'
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-vj-md transition-transform duration-300 ${
                              value === true ? 'translate-x-6' : 'translate-x-0.5'
                            }`}
                          />
                        </button>
                        <span className="ml-3 text-xs font-semibold text-vj-admin-muted">
                          {value === true ? 'Đang bật' : 'Đang tắt'}
                        </span>
                      </div>
                    ) : setting.type === 'select' ? (
                      <select
                        value={String(value)}
                        onChange={(e) => handleSettingChange(setting.key, e.target.value)}
                        className="w-full px-4 py-2.5 bg-slate-900 border border-white/10 rounded-vj text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                      >
                        {setting.options?.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={setting.type === 'number' ? 'number' : 'text'}
                        value={String(value)}
                        onChange={(e) => handleSettingChange(setting.key, e.target.value)}
                        className="w-full px-4 py-2.5 bg-slate-900 border border-white/10 rounded-vj text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-vj-admin-muted"
                        min={getSystemConfigBounds(setting.key as SystemConfigKey).min ?? 0}
                        max={getSystemConfigBounds(setting.key as SystemConfigKey).max}
                        placeholder={setting.label}
                      />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Thử nghiệm gửi Email hệ thống (khi đang xem tab Email & Thông báo) */}
      {activeCategory === 'notification' && (
        <div className="rounded-2xl border p-6 space-y-5" style={ADMIN_CARD_STYLE}>
          <div className="flex items-center gap-3 border-b border-white/5 pb-4">
            <div className="w-10 h-10 rounded-vj flex items-center justify-center bg-primary/10 text-primary">
              <Icon name="PaperAirplaneIcon" size={20} />
            </div>
            <div>
              <h3 className="font-bold text-white">Kiểm tra gửi email tự động (Gửi thử nghiệm)</h3>
              <p className="text-xs text-vj-admin-muted mt-0.5">
                Gửi email thử nghiệm để kiểm tra kết nối máy chủ SMTP và định dạng các mẫu email tự
                động trước khi áp dụng thực tế.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 space-y-1.5">
              <label className="text-xs font-semibold text-white">
                Địa chỉ email nhận thử nghiệm
              </label>
              <input
                type="email"
                value={testEmailTo}
                onChange={(e) => setTestEmailTo(e.target.value)}
                placeholder="vd: admin@vietjetair.com hoặc email cá nhân..."
                className="w-full px-4 py-2.5 bg-slate-900 border border-white/10 rounded-vj text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-vj-admin-muted"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-white">Mẫu email kiểm tra</label>
              <select
                value={testEmailTemplate}
                onChange={(e) => setTestEmailTemplate(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-900 border border-white/10 rounded-vj text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
              >
                <option value="booking">Vé & Hướng dẫn thanh toán</option>
                <option value="invoice">Hóa đơn điện tử (VAT)</option>
                <option value="fare">Công văn biểu giá vé mới</option>
                <option value="delay">Thông báo hoãn / đổi giờ bay</option>
                <option value="test">Kiểm tra kết nối SMTP (Ping)</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-white/5">
            <div className="text-xs text-vj-admin-muted flex items-center gap-1.5">
              <Icon
                name="InformationCircleIcon"
                size={16}
                className="text-blue-400 flex-shrink-0"
              />
              <span>
                Hệ thống sử dụng cấu hình SMTP từ biến môi trường. Email test được ghi lại trong
                nhật ký quản trị.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsPreviewModalOpen(true)}
                className={`${ADMIN_ACTION_BTN} text-vj-admin-muted border border-white/10 bg-white/5 hover:bg-white/10 hover:text-white`}
              >
                <Icon name="EyeIcon" size={14} />
                Xem trước giao diện
              </button>
              <button
                onClick={handleSendTestEmail}
                disabled={isSendingTestEmail || !testEmailTo.trim()}
                className={`${ADMIN_ACTION_BTN} text-white bg-primary hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {isSendingTestEmail ? (
                  <>
                    <Icon name="ArrowPathIcon" size={14} className="animate-spin" />
                    Đang gửi thử...
                  </>
                ) : (
                  <>
                    <Icon name="PaperAirplaneIcon" size={14} />
                    Gửi email thử nghiệm
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Xem trước giao diện Email tự động */}
      <EmailTemplatePreviewModal
        isOpen={isPreviewModalOpen}
        onClose={() => setIsPreviewModalOpen(false)}
        initialTemplate={testEmailTemplate}
        onToast={onToast}
      />

      {/* Info Box */}
      <div
        className="rounded-vj border p-4 flex items-start gap-3"
        style={{ background: 'rgba(59,130,246,0.08)', borderColor: 'rgba(59,130,246,0.2)' }}
      >
        <Icon
          name="InformationCircleIcon"
          size={20}
          className="text-blue-400 flex-shrink-0 mt-0.5"
        />
        <div>
          <p className="text-sm font-semibold text-white">Lưu ý khi thay đổi cài đặt</p>
          <ul className="text-xs text-vj-admin-muted mt-1 space-y-1">
            <li>- Cài đặt có hiệu lực ngay với các request tiếp theo</li>
            <li>- Các thay đổi sẽ được ghi lại trong nhật ký hệ thống</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
