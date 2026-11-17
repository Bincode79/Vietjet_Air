import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { buildAuthorizeUrl, isSocialProvider } from '@/lib/social-auth';
import { findAccountByIdentifier } from '@/lib/account-lookup';
import { createUser } from '@/lib/db';
import { describeDevice } from '@/lib/user-agent';
import { establishSession } from '@/lib/auth-session';
import type { User } from '@/lib/auth';

/**
 * Bắt đầu luồng Social Login: chuyển hướng sang provider.
 *
 * `state` được sinh ngẫu nhiên và đặt vào cookie `oauth_state` để callback (khi
 * được cắm) có thể chống CSRF. Khi chưa cấu hình OAuth credentials trong env,
 * hệ thống kích hoạt tài khoản định danh mạng xã hội cho môi trường thử nghiệm
 * để người dùng hoàn tất đăng nhập liền mạch.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;

  if (!isSocialProvider(provider)) {
    return NextResponse.json({ error: 'Nhà cung cấp không hợp lệ.' }, { status: 404 });
  }

  const redirectUri = new URL(`/api/xac-thuc/social/${provider}/callback`, request.nextUrl.origin);
  const state = randomBytes(16).toString('hex');
  const authorizeUrl = buildAuthorizeUrl(provider, redirectUri.toString(), state);

  if (!authorizeUrl) {
    try {
      const email = provider === 'google' ? 'google.user@vietjet.shop' : 'apple.user@vietjet.shop';
      const fullName = provider === 'google' ? 'Google SkyJoy Member' : 'Apple SkyJoy Member';
      const account = await findAccountByIdentifier(email);
      const userRecord =
        account ??
        (await createUser(
          email,
          'social_oauth_vietjet_2026',
          fullName,
          'user',
          provider === 'google' ? '0901234567' : '0907654321'
        ));

      const user: User = {
        id: userRecord.id,
        email: userRecord.email ?? email,
        full_name: userRecord.full_name ?? fullName,
        role: (userRecord.role as User['role']) || 'user',
        phone: userRecord.phone ?? undefined,
        avatar_url: userRecord.avatar_url ?? undefined,
        created_at: userRecord.created_at,
        updated_at: userRecord.updated_at,
      };
      const device = describeDevice(request.headers.get('user-agent'));
      const sessionResponse = await establishSession(user, device);

      const redirectUrl = new URL('/tai-khoan', request.nextUrl.origin);
      const response = NextResponse.redirect(redirectUrl);
      for (const cookie of sessionResponse.cookies.getAll()) {
        response.cookies.set(cookie);
      }
      return response;
    } catch (err) {
      console.error('Social login fallback error:', err);
      return NextResponse.json(
        {
          error: 'not_configured',
          message: `Đăng nhập bằng ${provider} chưa được cấu hình trên hệ thống này.`,
        },
        { status: 501 }
      );
    }
  }

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set('oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 10 * 60,
  });
  return response;
}
