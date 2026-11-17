'use client';

import React from 'react';

/**
 * Bộ nút phụ và đường ngăn cách của SkyID.
 *
 * Số đo (13/11/2026, DOM sống `skyjoy-id.vietjetair.com`):
 *   - `.gid-content .btn`: `border-radius:8px!important`, `height:32px`.
 *   - Nút social trong luồng SkyID dùng nền trắng, viền `#E8EBEF`.
 *   - `.gid-resend-otp` / `.gid-alert`: `14px/22px`, `margin-top:4px`.
 */

export interface SkyIdSocialButtonsProps {
  appleEnabled: boolean;
  googleEnabled: boolean;
  onApple: () => void;
  onGoogle: () => void;
}

export function SkyIdSocialButtons({
  appleEnabled,
  googleEnabled,
  onApple,
  onGoogle,
}: SkyIdSocialButtonsProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <button
        type="button"
        onClick={onApple}
        disabled={!appleEnabled}
        title={
          appleEnabled ? 'Đăng nhập bằng Apple ID' : 'Đăng nhập bằng Apple ID chưa được cấu hình'
        }
        className="vj-skyid-btn-ghost flex items-center justify-center gap-2"
      >
        <svg
          className="w-4 h-4 shrink-0 fill-current"
          viewBox="0 0 170 170"
          aria-hidden="true"
        >
          <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.16-1.9-14.42-6.08-3.7-3.08-7.71-7.88-12.04-14.42-5.74-8.71-10.22-18.73-13.43-30.06-3.21-11.32-4.82-22.3-4.82-32.93 0-14.75 3.58-27.14 10.74-37.16 7.16-10.02 16.5-15.14 28.02-15.35 4.89 0 10.24 1.25 16.05 3.75 5.8 2.5 9.77 3.86 11.91 4.08 2.61-.43 6.94-1.9 13-4.4 6.06-2.5 11.45-3.64 16.18-3.43 11.7.54 21.09 4.67 28.18 12.39-10.45 6.3-15.56 15.01-15.33 26.13.22 8.7 3.65 15.89 10.3 21.57 6.65 5.68 14.45 8.75 23.4 9.21-2.4 7.4-5.3 14.7-8.7 21.9zM119.22 33.15c0-6.74 2.45-12.87 7.34-18.39 4.9-5.52 10.87-9.04 17.91-10.56-.11 1.74-.32 3.48-.64 5.22-.32 1.74-.86 3.48-1.61 5.22-1.63 4.13-4.13 8.04-7.5 11.74-3.37 3.7-7.28 6.3-11.74 7.82-.43-.33-.86-.65-1.28-1.05-.43-.4-.75-.82-.95-1.26-.98-1.95-1.47-4.43-1.47-7.44z" />
        </svg>
        <span>Apple</span>
      </button>
      <button
        type="button"
        onClick={onGoogle}
        disabled={!googleEnabled}
        title={googleEnabled ? 'Đăng nhập bằng Google' : 'Đăng nhập bằng Google chưa được cấu hình'}
        className="vj-skyid-btn-ghost flex items-center justify-center gap-2"
      >
        <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
          />
        </svg>
        <span>Google</span>
      </button>
    </div>
  );
}

/** Dòng nhắc nhở lỗi — `.gid-custom-server-error` / `.gid-alert`. */
export function SkyIdErrorNote({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="vj-skyid-error-enhanced mt-3">
      <svg className="vj-skyid-error-icon" width="16" height="16" viewBox="0 0 16 16">
        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        <path d="M8 4v5M8 11v1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
      <span>{message}</span>
    </div>
  );
}

/** Dòng gợi ý mã thử nghiệm khi chưa cấu hình SMS gateway. */
export function SkyIdDevHint({ hint }: { hint: string }) {
  if (!hint) return null;
  return (
    <p className="mt-2 rounded-md border border-[var(--vj-skyid-border)] bg-[var(--surface-2)] px-3 py-2 text-xs font-semibold text-[var(--vj-skyid-ink)]">
      {hint}
    </p>
  );
}
