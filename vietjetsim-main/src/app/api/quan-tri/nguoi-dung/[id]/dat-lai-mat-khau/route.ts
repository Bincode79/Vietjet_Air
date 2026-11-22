import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/admin-auth';
import { validateCsrfOrReject } from '@/lib/csrf';
import { rateLimit } from '@/lib/rate-limit';
import { hashPassword } from '@/lib/auth';
import { updateUserPassword, invalidateUserRefreshTokens, findUserById } from '@/lib/db';
import { deleteAllUserSessions } from '@/lib/security-db';
import { sendTempPasswordEmail } from '@/lib/mail';
import { writeAuditLog } from '@/lib/db';

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const csrfError = await validateCsrfOrReject(request);
    if (csrfError) return csrfError;

    const limited = rateLimit(request, { windowMs: 60_000, maxRequests: 10 });
    if (limited) return limited;

    const {
      payload: admin,
      error,
      response,
    } = await verifyAdminRequest(request, 'user:password_reset');
    if (error) return response!;

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const sendEmail = body?.send_email !== false; // default true
    const customTempPassword =
      typeof body?.temp_password === 'string' ? body.temp_password.trim() : '';

    // Verify target user exists
    const targetUser = await findUserById(id);
    if (!targetUser) {
      return NextResponse.json({ error: 'Không tìm thấy người dùng.' }, { status: 404 });
    }

    // RBAC: Admin cannot reset password for higher/equal level user
    const { canManageRole } = await import('@/lib/rbac');
    if (!canManageRole(admin.role, targetUser.role)) {
      return NextResponse.json(
        { error: 'Không có quyền đặt lại mật khẩu cho người dùng này.' },
        { status: 403 }
      );
    }

    // Prevent admin from resetting their own password via this endpoint
    if (id === admin.userId) {
      return NextResponse.json(
        { error: 'Không thể đặt lại mật khẩu cho chính mình qua endpoint này.' },
        { status: 400 }
      );
    }

    // Generate or use custom temporary password
    const tempPassword = customTempPassword || generateTempPassword();

    // Hash and update
    const newHash = await hashPassword(tempPassword);
    await updateUserPassword(id, newHash);

    // Revoke all sessions
    await Promise.all([
      invalidateUserRefreshTokens(id).catch(() => undefined),
      deleteAllUserSessions(id).catch(() => undefined),
    ]);

    // Send email with temporary password
    let emailSent = false;
    if (sendEmail && targetUser.email) {
      try {
        await sendTempPasswordEmail({
          to: targetUser.email,
          tempPassword,
          userName: targetUser.full_name || 'Quý khách',
        });
        emailSent = true;
      } catch (emailErr) {
        console.error('[ADMIN-RESET-PASSWORD] Failed to send email:', emailErr);
      }
    }

    // Audit log
    await writeAuditLog({
      adminId: admin.userId,
      adminEmail: admin.email,
      action: 'reset_user_password',
      targetType: 'user',
      targetId: id,
      detailsJson: JSON.stringify({ emailSent, customPassword: !!customTempPassword }),
      status: 'success',
    }).catch((err) => console.error('[ADMIN-RESET-PASSWORD-AUDIT] error:', err));

    return NextResponse.json({
      success: true,
      message: `Đã đặt lại mật khẩu cho ${targetUser.email}.`,
      tempPassword: process.env.NODE_ENV !== 'production' ? tempPassword : undefined,
      emailSent,
    });
  } catch (error) {
    console.error('Error resetting user password (admin):', error);
    return NextResponse.json({ error: 'Đã xảy ra lỗi. Vui lòng thử lại.' }, { status: 500 });
  }
}
