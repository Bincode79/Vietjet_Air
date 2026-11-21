import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthRequest } from '@/lib/auth';
import { validateCsrfOrReject } from '@/lib/csrf';
import { rateLimit } from '@/lib/rate-limit';
import { hashPassword, validatePassword } from '@/lib/auth';
import { updateUserPassword, invalidateUserRefreshTokens } from '@/lib/db';
import { deleteAllUserSessions } from '@/lib/security-db';
import { sendPasswordChangedEmail } from '@/lib/mail';
import { writeAuditLog } from '@/lib/db';

export async function PUT(request: NextRequest) {
  try {
    const csrfError = await validateCsrfOrReject(request);
    if (csrfError) return csrfError;

    const limited = rateLimit(request, { windowMs: 60_000, maxRequests: 5 });
    if (limited) return limited;

    const { user: auth, error, response } = await verifyAuthRequest(request);
    if (error || !auth) return response!;

    const body = await request.json();
    const currentPassword = typeof body?.current_password === 'string' ? body.current_password : '';
    const newPassword = typeof body?.new_password === 'string' ? body.new_password : '';
    const revokeSessions = body?.revoke_sessions !== false; // default true

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: 'Thiếu mật khẩu hiện tại hoặc mật khẩu mới.' },
        { status: 400 }
      );
    }

    // Validate new password strength
    const passwordCheck = validatePassword(newPassword);
    if (!passwordCheck.valid) {
      return NextResponse.json(
        { error: passwordCheck.errors.join('; ') },
        { status: 400 }
      );
    }

    // Verify current password
    const results = await sql`
      SELECT password_hash FROM user_profiles WHERE id = ${auth.userId}
    `;
    const user = (results as { password_hash: string }[])[0];
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const bcrypt = await import('bcryptjs');
    const isValid = await bcrypt.default.compare(currentPassword, user.password_hash);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Mật khẩu hiện tại không đúng.' },
        { status: 401 }
      );
    }

    // Hash and update new password
    const newHash = await hashPassword(newPassword);
    await updateUserPassword(auth.userId, newHash);

    // Revoke all sessions if requested
    if (revokeSessions) {
      await Promise.all([
        invalidateUserRefreshTokens(auth.userId).catch(() => undefined),
        deleteAllUserSessions(auth.userId).catch(() => undefined),
      ]);
    }

    // Send notification email (fire-and-forget)
    const userInfo = await sql`
      SELECT email FROM user_profiles WHERE id = ${auth.userId}
    `;
    const email = (userInfo as { email: string }[])[0]?.email;
    if (email) {
      void sendPasswordChangedEmail({ to: email }).catch(() => undefined);
    }

    // Audit log
    await writeAuditLog({
      adminId: auth.userId,
      adminEmail: auth.email,
      action: 'change_password',
      targetType: 'user',
      targetId: auth.userId,
      detailsJson: JSON.stringify({ revokeSessions }),
      status: 'success',
    }).catch((err) => console.error('[CHANGE-PASSWORD-AUDIT] error:', err));

    return NextResponse.json({
      success: true,
      message: 'Đổi mật khẩu thành công.',
      revokeSessions,
    });
  } catch (error) {
    console.error('Error changing password:', error);
    return NextResponse.json(
      { error: 'Đã xảy ra lỗi. Vui lòng thử lại.' },
      { status: 500 }
    );
  }
}