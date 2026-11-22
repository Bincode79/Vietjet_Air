'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Icon } from '@/shared/components/ui';
import { useToast } from '@/hooks/useToast';
import { apiRequest, getApiErrorMessage } from '@/shared/services';

interface SkyJoyLinkProps {
  initialSkyjoyId: string | null;
  onLink: (id: string) => void;
  onUnlink: () => void;
}

export default function SkyJoyLink({ initialSkyjoyId, onLink, onUnlink }: SkyJoyLinkProps) {
  const toast = useToast();
  const [skyjoyId, setSkyjoyId] = useState<string | null>(initialSkyjoyId);
  const [isLinking, setIsLinking] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [otp, setOtp] = useState('');
  const [pendingId, setPendingId] = useState<string>('');
  const [error, setError] = useState<string>('');

  const checkStatus = useCallback(async () => {
    try {
      const data = await apiRequest<{ skyjoyMemberId: string | null; isLinked: boolean }>(
        '/api/nguoi-dung/profile/skyjoy'
      );
      setSkyjoyId(data.skyjoyMemberId);
    } catch {
      // Ignore
    }
  }, []);

  // Fetch current status on mount
  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const handleLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const id = pendingId.trim().toUpperCase();
    if (!/^SJ\d{8,10}$/.test(id)) {
      setError('Mã SkyJoy không hợp lệ. Định dạng: SJ + 8-10 chữ số (VD: SJ12345678).');
      return;
    }

    setIsLinking(true);
    try {
      const data = await apiRequest<{ success: boolean; requiresOtp: boolean; message: string }>(
        '/api/nguoi-dung/profile/skyjoy',
        {
          method: 'PATCH',
          body: { action: 'link', skyjoy_member_id: id },
        }
      );

      if (data.requiresOtp) {
        setPendingId(id);
        setShowOtpInput(true);
        toast.info('Xác thực', data.message);
      } else if (data.success) {
        setSkyjoyId(id);
        onLink(id);
        toast.success('Thành công', data.message);
      }
    } catch (error) {
      setError(getApiErrorMessage(error, 'Không thể liên kết SkyJoy.'));
    } finally {
      setIsLinking(false);
    }
  };

  const handleVerify = async () => {
    if (!otp || otp.length !== 6) {
      setError('Vui lòng nhập mã OTP 6 chữ số.');
      return;
    }

    setIsVerifying(true);
    try {
      const data = await apiRequest<{ success: boolean; message: string; skyjoyMemberId: string }>(
        '/api/nguoi-dung/profile/skyjoy',
        {
          method: 'PATCH',
          body: { action: 'verify', otp },
        }
      );

      if (data.success) {
        setSkyjoyId(data.skyjoyMemberId);
        setPendingId('');
        setShowOtpInput(false);
        setOtp('');
        onLink(data.skyjoyMemberId);
        toast.success('Thành công', data.message);
      } else {
        setError(data.message || 'Mã OTP không đúng.');
      }
    } catch (error) {
      setError(getApiErrorMessage(error, 'Mã OTP không đúng.'));
    } finally {
      setIsVerifying(false);
    }
  };

  const handleUnlink = async () => {
    if (!confirm('Bạn có chắc muốn hủy liên kết SkyJoy?')) return;

    try {
      await apiRequest('/api/nguoi-dung/profile/skyjoy', {
        method: 'PATCH',
        body: { action: 'unlink' },
      });
      setSkyjoyId(null);
      onUnlink();
      toast.success('Thành công', 'Đã hủy liên kết SkyJoy.');
    } catch (error) {
      toast.error('Lỗi', getApiErrorMessage(error, 'Không thể hủy liên kết.'));
    }
  };

  const resendOtp = async () => {
    if (!pendingId) return;
    setIsLinking(true);
    try {
      const data = await apiRequest<{ success: boolean; message: string }>(
        '/api/nguoi-dung/profile/skyjoy',
        {
          method: 'PATCH',
          body: { action: 'link', skyjoy_member_id: pendingId },
        }
      );
      toast.info('Đã gửi lại', data.message);
    } catch (error) {
      toast.error('Lỗi', getApiErrorMessage(error, 'Không thể gửi lại OTP.'));
    } finally {
      setIsLinking(false);
    }
  };

  return (
    <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-6">
      <h3 className="text-lg font-bold font-[KoHo,sans-serif] flex items-center gap-2 text-[var(--foreground)] mb-4">
        <Icon name="BadgeCheckIcon" size={22} className="text-[var(--vj-purple)]" />
        Thành viên SkyJoy
      </h3>

      <p className="text-sm text-[var(--foreground-muted)] mb-4 font-[Be_Vietnam_Pro,sans-serif]">
        Liên kết tài khoản SkyJoy để tích lũy điểm, đổi thưởng và hưởng ưu đãi độc quyền.
      </p>

      {skyjoyId ? (
        // Linked state
        <div className="bg-[var(--vj-purple)]/10 border border-[var(--vj-purple)]/30 rounded-vj p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-[var(--vj-purple)] rounded-full flex items-center justify-center">
                <Icon name="BadgeCheckIcon" size={24} className="text-white" />
              </div>
              <div>
                <p className="font-semibold text-[var(--foreground)] font-[KoHo,sans-serif]">
                  Đã liên kết SkyJoy
                </p>
                <p className="text-sm text-[var(--vj-purple)] font-[Be_Vietnam_Pro,sans-serif] font-mono">
                  {skyjoyId}
                </p>
              </div>
            </div>
            <button
              onClick={handleUnlink}
              className="px-4 py-2 bg-white/10 border border-white/20 text-white rounded-vj text-sm font-semibold font-[KoHo,sans-serif] hover:bg-white/20 transition-colors"
            >
              <Icon name="UnlinkIcon" size={16} className="mr-1" />
              Hủy liên kết
            </button>
          </div>
        </div>
      ) : (
        // Not linked state
        <div className="space-y-4">
          {!showOtpInput ? (
            // Link form
            <form onSubmit={handleLink} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] font-[Be_Vietnam_Pro,sans-serif] mb-1.5">
                  Mã thành viên SkyJoy
                </label>
                <input
                  type="text"
                  value={pendingId}
                  onChange={(e) => {
                    setPendingId(e.target.value.toUpperCase());
                    setError('');
                  }}
                  placeholder="SJ12345678"
                  className="w-full px-4 py-3 bg-[var(--surface)] border border-[var(--border)] rounded-vj text-sm font-[Be_Vietnam_Pro,sans-serif] text-[var(--foreground)] placeholder-[var(--foreground-muted)] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--primary-rgb))]/20 focus:border-[var(--primary)]"
                  disabled={isLinking}
                  maxLength={12}
                />
                <p className="text-xs text-[var(--foreground-muted)] font-[Be_Vietnam_Pro,sans-serif]">
                  Định dạng: SJ + 8-10 chữ số (VD: SJ12345678)
                </p>
                {error && (
                  <p className="text-xs text-red-500 font-[Be_Vietnam_Pro,sans-serif]">{error}</p>
                )}
              </div>
              <button
                type="submit"
                disabled={isLinking || !pendingId || !/^SJ\d{8,10}$/.test(pendingId)}
                className="w-full px-6 py-3 bg-[var(--vj-purple)] text-white rounded-vj font-semibold font-[KoHo,sans-serif] hover:bg-[var(--vj-purple)]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLinking ? (
                  <>
                    <Icon name="ArrowPathIcon" size={18} className="mr-2 animate-spin" />
                    Đang gửi OTP...
                  </>
                ) : (
                  <>
                    <Icon name="LinkIcon" size={18} className="mr-2" />
                    Gửi mã OTP xác thực
                  </>
                )}
              </button>
            </form>
          ) : (
            // OTP verification
            <div className="space-y-4 p-4 bg-[var(--surface-2)] rounded-vj border border-[var(--border)]">
              <p className="text-sm text-[var(--foreground-muted)] font-[Be_Vietnam_Pro,sans-serif] text-center">
                Mã OTP đã được gửi đến số điện thoại của bạn. Vui lòng nhập mã 6 chữ số.
              </p>
              <div className="flex items-center justify-center gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <input
                    key={i}
                    type="text"
                    maxLength={1}
                    value={otp[i] || ''}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '');
                      if (val) {
                        const newOtp = otp.substring(0, i) + val + otp.substring(i + 1);
                        setOtp(newOtp);
                        // Auto-focus next input
                        const inputs = document.querySelectorAll('input[data-otp-index]');
                        if (inputs[i + 1]) (inputs[i + 1] as HTMLInputElement).focus();
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Backspace' && !otp[i] && i > 0) {
                        const inputs = document.querySelectorAll('input[data-otp-index]');
                        (inputs[i - 1] as HTMLInputElement).focus();
                      }
                    }}
                    data-otp-index={i}
                    className="w-10 h-12 text-center text-xl font-bold font-[KoHo,sans-serif] bg-[var(--surface)] border border-[var(--border)] rounded-vj focus:outline-none focus:ring-2 focus:ring-[rgb(var(--primary-rgb))]/20 focus:border-[var(--primary)]"
                    autoComplete="one-time-code"
                    inputMode="numeric"
                  />
                ))}
              </div>
              {error && (
                <p className="text-xs text-red-500 text-center font-[Be_Vietnam_Pro,sans-serif]">
                  {error}
                </p>
              )}
              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={handleVerify}
                  disabled={isVerifying || otp.length !== 6}
                  className="flex-1 px-6 py-3 bg-[var(--primary)] text-white rounded-vj font-semibold font-[KoHo,sans-serif] hover:bg-[var(--primary-dark)] transition-colors disabled:opacity-50"
                >
                  {isVerifying ? (
                    <>
                      <Icon name="ArrowPathIcon" size={18} className="mr-2 animate-spin" />
                      Xác thực
                    </>
                  ) : (
                    <>
                      <Icon name="CheckCircleIcon" size={18} className="mr-2" />
                      Xác thực & Liên kết
                    </>
                  )}
                </button>
                <button
                  onClick={resendOtp}
                  disabled={isLinking}
                  className="px-4 py-3 bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground-muted)] rounded-vj font-semibold font-[Be_Vietnam_Pro,sans-serif] hover:bg-[var(--surface-2)] disabled:opacity-50"
                >
                  <Icon name="ArrowPathIcon" size={16} className="mr-1" />
                  Gửi lại OTP
                </button>
              </div>
              <button
                onClick={() => {
                  setShowOtpInput(false);
                  setPendingId('');
                  setOtp('');
                  setError('');
                }}
                className="w-full text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)] font-[Be_Vietnam_Pro,sans-serif]"
              >
                Hủy bỏ
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
