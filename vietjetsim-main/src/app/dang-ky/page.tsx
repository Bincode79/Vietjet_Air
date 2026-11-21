'use client';

export const dynamic = 'force-dynamic';

import React from 'react';
import { useSearchParams } from 'next/navigation';
import SkyIdRealAuthPage from '@/features/auth/components/skyid/SkyIdRealAuthPage';

/**
 * Trang "Đăng ký" tài khoản SkyJoy của Vietjet Air.
 * Giao diện 2 cột chuẩn auth.vietjetair.com.
 */
function RegisterPageInner() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || undefined;

  return (
    <main id="main-content" className="min-h-screen">
      <SkyIdRealAuthPage initialMode="register" redirectTo={redirect} />
    </main>
  );
}

export default function RegisterPage() {
  return (
    <React.Suspense fallback={null}>
      <RegisterPageInner />
    </React.Suspense>
  );
}
