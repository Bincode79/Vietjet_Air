'use client';

import React from 'react';
import SkyIdRealAuthPage from './skyid/SkyIdRealAuthPage';
import { type SkyIdMode } from './skyid/SkyIdAuthFlow';

/**
 * `SignInPopup` — hiển thị giao diện xác thực SkyJoy ID 2 cột chính thức
 * khi mở từ modal toàn site.
 */
export interface SignInPopupProps {
  mode?: SkyIdMode;
  /** Đường dẫn quay lại sau khi xác thực thành công. */
  redirectTo?: string;
  onClose?: () => void;
}

export default function SignInPopup({ mode = 'login', redirectTo, onClose }: SignInPopupProps) {
  const initialMode = mode === 'register' ? 'register' : 'login';
  return (
    <SkyIdRealAuthPage
      initialMode={initialMode}
      redirectTo={redirectTo}
      onClose={onClose}
      isModal
    />
  );
}

/** Popup "Quên mật khẩu?" — cùng giao diện modal. */
export function ForgotPasswordPopup({ onClose }: { onClose?: () => void }) {
  return (
    <SkyIdRealAuthPage
      initialMode="login"
      onClose={onClose}
      isModal
    />
  );
}
