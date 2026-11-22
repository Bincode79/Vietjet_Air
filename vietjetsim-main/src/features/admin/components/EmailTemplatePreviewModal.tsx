'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { Icon } from '@/shared/components/ui';
import { previewTestEmail, sendTestEmail, type EmailPreviewResponse } from '@/features/admin';
import { getApiErrorMessage } from '@/shared/services';
import { ADMIN_ACTION_BTN } from './AdminSection';

interface ToastAPI {
  success: (title: string, message?: string, options?: object) => void;
  error: (title: string, message?: string, options?: object) => void;
  info?: (title: string, message?: string, options?: object) => void;
}

interface EmailTemplatePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTemplate?: string;
  onToast?: ToastAPI;
}

const TEMPLATES: Array<{ id: string; label: string; icon: string; badge: string }> = [
  { id: 'booking', label: 'Vé & Hướng dẫn thanh toán', icon: 'TicketIcon', badge: 'VietQR / PNR' },
  { id: 'invoice', label: 'Hóa đơn điện tử VAT', icon: 'DocumentTextIcon', badge: 'Thanh toán' },
  { id: 'fare', label: 'Công văn giá vé Đại lý', icon: 'BuildingOffice2Icon', badge: 'Biểu giá' },
  { id: 'delay', label: 'Thông báo đổi giờ bay', icon: 'ClockIcon', badge: 'Chậm/Hoãn' },
  { id: 'test', label: 'Kiểm tra dịch vụ (Ping)', icon: 'SignalIcon', badge: 'SMTP' },
];

export default function EmailTemplatePreviewModal({
  isOpen,
  onClose,
  initialTemplate = 'booking',
  onToast,
}: EmailTemplatePreviewModalProps) {
  const [selectedTemplate, setSelectedTemplate] = useState(initialTemplate);
  const [deviceMode, setDeviceMode] = useState<'desktop' | 'mobile'>('desktop');
  const [emailData, setEmailData] = useState<EmailPreviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('');
  const [isSending, setIsSending] = useState(false);

  const loadPreview = useCallback(
    async (tpl: string) => {
      setIsLoading(true);
      try {
        const data = await previewTestEmail(tpl);
        setEmailData(data);
      } catch (err) {
        onToast?.error('Lỗi tải mẫu email', getApiErrorMessage(err, 'Không thể tải mẫu email'));
      } finally {
        setIsLoading(false);
      }
    },
    [onToast]
  );

  useEffect(() => {
    if (isOpen) {
      setSelectedTemplate(initialTemplate);
      loadPreview(initialTemplate);
    }
  }, [isOpen, initialTemplate, loadPreview]);

  const handleTemplateSwitch = (tpl: string) => {
    setSelectedTemplate(tpl);
    loadPreview(tpl);
  };

  const handleSendQuickTest = async () => {
    const trimmed = recipientEmail.trim();
    if (!trimmed || !trimmed.includes('@')) {
      onToast?.error('Email không hợp lệ', 'Vui lòng nhập địa chỉ email người nhận chính xác.');
      return;
    }
    setIsSending(true);
    try {
      const res = await sendTestEmail({ to: trimmed, template: selectedTemplate });
      onToast?.success('Gửi email thành công', res.message || `Đã gửi tới ${trimmed}`);
    } catch (err) {
      onToast?.error('Lỗi gửi email', getApiErrorMessage(err, 'Không thể gửi email thử nghiệm.'));
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="preview-email-modal-title"
    >
      <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-slate-900/90 backdrop-blur sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-vj bg-primary/15 text-primary flex items-center justify-center">
              <Icon name="EnvelopeIcon" size={20} />
            </div>
            <div>
              <h2 id="preview-email-modal-title" className="text-base font-bold text-white">
                Kiểm tra giao diện các mẫu Email tự động
              </h2>
              <p className="text-xs text-vj-admin-muted mt-0.5">
                Xem trước trực quan cách bố cục và màu sắc thương hiệu hiển thị trong hộp thư khách
                hàng
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Device Switcher */}
            <div className="flex items-center bg-slate-800 rounded-lg p-1 border border-white/10">
              <button
                type="button"
                onClick={() => setDeviceMode('desktop')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-all ${
                  deviceMode === 'desktop'
                    ? 'bg-primary text-white shadow'
                    : 'text-vj-admin-muted hover:text-white'
                }`}
                title="Xem giao diện chuẩn máy tính (600px)"
              >
                <Icon name="ComputerDesktopIcon" size={14} />
                <span>Máy tính</span>
              </button>
              <button
                type="button"
                onClick={() => setDeviceMode('mobile')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-all ${
                  deviceMode === 'mobile'
                    ? 'bg-primary text-white shadow'
                    : 'text-vj-admin-muted hover:text-white'
                }`}
                title="Xem giao diện chuẩn điện thoại (375px)"
              >
                <Icon name="DevicePhoneMobileIcon" size={14} />
                <span>Điện thoại</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="w-9 h-9 rounded-vj flex items-center justify-center text-vj-admin-muted hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Đóng"
            >
              <Icon name="XMarkIcon" size={20} />
            </button>
          </div>
        </div>

        {/* Template Selector Tabs */}
        <div className="px-6 py-2.5 bg-slate-950/60 border-b border-white/5 flex gap-2 overflow-x-auto">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => handleTemplateSwitch(t.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-vj text-xs font-semibold transition-all whitespace-nowrap ${
                selectedTemplate === t.id
                  ? 'bg-primary/20 text-primary border border-primary/40'
                  : 'bg-white/5 text-vj-admin-muted border border-white/5 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Icon name={t.icon} size={15} />
              <span>{t.label}</span>
              <span
                className={`text-3xs px-1.5 py-0.5 rounded font-mono uppercase ${
                  selectedTemplate === t.id
                    ? 'bg-primary text-white'
                    : 'bg-white/10 text-vj-admin-muted'
                }`}
              >
                {t.badge}
              </span>
            </button>
          ))}
        </div>

        {/* Preview Meta Bar (Tiêu đề thư, Người gửi) */}
        <div className="px-6 py-3 bg-slate-900 border-b border-white/5 text-xs space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-bold text-vj-admin-muted w-16">Tiêu đề:</span>
            <span className="font-semibold text-white">
              {emailData?.subject || 'Đang tải tiêu đề...'}
            </span>
          </div>
          <div className="flex items-center justify-between text-3xs text-vj-admin-muted">
            <div>
              <span>Người gửi: </span>
              <strong className="text-white/80">Vietjet Air &lt;no-reply@vietjet.shop&gt;</strong>
              <span className="mx-2">•</span>
              <span>Phân loại: </span>
              <strong className="text-primary">{emailData?.category || 'Hệ thống'}</strong>
            </div>
            <span>
              Khổ hiển thị: {deviceMode === 'desktop' ? '600px (Desktop)' : '375px (Mobile)'}
            </span>
          </div>
        </div>

        {/* Canvas / Iframe Body */}
        <div className="flex-1 bg-stone-900/60 p-4 md:p-6 overflow-y-auto flex justify-center items-start min-h-[420px]">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center p-12 text-center text-vj-admin-muted">
              <Icon name="ArrowPathIcon" size={32} className="animate-spin text-primary mb-3" />
              <p className="text-sm font-semibold text-white">
                Đang kết xuất giao diện HTML Email...
              </p>
              <p className="text-xs mt-1">
                Đang nạp các thuộc tính CSS inline và hình ảnh hãng bay
              </p>
            </div>
          ) : emailData?.html ? (
            <div
              className={`bg-white rounded-xl shadow-2xl overflow-hidden transition-all duration-300 border border-stone-300 ${
                deviceMode === 'desktop' ? 'w-full max-w-[620px]' : 'w-[375px]'
              }`}
            >
              <iframe
                title="Giao diện mẫu email"
                srcDoc={emailData.html}
                className="w-full h-[580px] border-0 bg-slate-100"
                sandbox="allow-same-origin"
              />
            </div>
          ) : (
            <div className="text-center p-12 text-vj-admin-muted">
              <Icon
                name="ExclamationTriangleIcon"
                size={36}
                className="text-amber-400 mx-auto mb-2"
              />
              <p className="font-bold text-white">Chưa có nội dung xem trước</p>
            </div>
          )}
        </div>

        {/* Footer / Quick Send Action */}
        <div className="px-6 py-4 border-t border-white/10 bg-slate-900 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <input
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="Nhập email để gửi thử ngay mẫu này..."
              className="px-3.5 py-2 bg-slate-950 border border-white/10 rounded-vj text-xs text-white placeholder:text-vj-admin-muted focus:outline-none focus:border-primary w-full sm:w-72"
            />
            <button
              onClick={handleSendQuickTest}
              disabled={isSending || !recipientEmail.trim()}
              className={`${ADMIN_ACTION_BTN} text-white bg-primary hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap`}
            >
              {isSending ? (
                <>
                  <Icon name="ArrowPathIcon" size={14} className="animate-spin" />
                  Đang gửi...
                </>
              ) : (
                <>
                  <Icon name="PaperAirplaneIcon" size={14} />
                  Gửi thử mẫu này
                </>
              )}
            </button>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <span className="text-3xs text-vj-admin-muted hidden md:inline">
              HTML Email chuẩn bảng (Table-based layout) hỗ trợ mọi ứng dụng thư điện tử
            </span>
            <button
              onClick={onClose}
              className={`${ADMIN_ACTION_BTN} text-vj-admin-muted border border-white/10 bg-white/5 hover:bg-white/10`}
            >
              Đóng
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
