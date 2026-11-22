'use client';

export const dynamic = 'force-dynamic';

import React from 'react';
import { useSearchParams } from 'next/navigation';
import { Header } from '@/shared/components/navigation';
import SkyIdRealAuthPage from '@/features/auth/components/skyid/SkyIdRealAuthPage';

/**
 * Trang "Đăng nhập" SkyID chính thức của Vietjet Air.
 * Giao diện 2 cột chuẩn auth.vietjetair.com:
 * - Cột trái: Form nhập số điện thoại / email, OTP, mạng xã hội và chân trang xác thực.
 * - Cột phải: Banner khuyến mãi SkyJoy đổi vé bay và quét mã QR tải app.
 */
function LoginPageInner() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || undefined;
  const mode = searchParams.get('tab') === 'register' ? 'register' : 'login';

  return (
    <>
      <Header variant="compact" showQuickServices={false} mobileTitle="ĐĂNG NHẬP" hideMobileLogo />
      <main id="main-content" className="min-h-screen">
        <SkyIdRealAuthPage initialMode={mode} redirectTo={redirect} />
      </main>
    </>
  );
}

export default function LoginPage() {
  return (
    <React.Suspense fallback={null}>
      <LoginPageInner />
    </React.Suspense>
  );
}
