import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/admin-auth';
import { findUserById, updateUserPassword, writeAuditLog } from '@/lib/db';
import { canManageRole } from '@/lib/rbac';
import { hashPassword, validatePassword } from '@/lib/auth';

/**
 * POST /api/quan-tri/nguoi-dung/[id]/dat-lai-mat-khau — admin đặt lại mật khẩu user.
 * Body: { newPassword: string }
 *
 * Quyền `user:password_reset`. Không cho tự reset chính mình qua đường này
 * (tự đổi thì đi luồng đổi mật khẩu thường, có xác thực mật khẩu cũ).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { payload, error, response } = await verifyAdminRequest(request, 'user:password_reset');
    if (error) return response;

    const { id } = await params;

    if (id === payload.userId) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Không thể tự đặt lại mật khẩu chính mình qua đường này' },
        { status: 400 }
      );
    }

    const targetUser = await findUserById(id);
    if (!targetUser) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Không tìm thấy người dùng' },
        { status: 404 }
      );
    }

    // Không reset mật khẩu của người có cấp cao hơn mình.
    if (!canManageRole(payload.role, targetUser.role)) {
      return NextResponse.json(
        {
          error: 'Forbidden',
          message: 'Không có quyền đặt lại mật khẩu người dùng này (cùng cấp hoặc cao hơn)',
        },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { newPassword } = body ?? {};

    if (typeof newPassword !== 'string' || !newPassword) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'newPassword là bắt buộc' },
        { status: 400 }
      );
    }

    // Cùng policy với đăng ký: 8+ ký tự, hoa + thường + số + ký tự đặc biệt.
    const check = validatePassword(newPassword);
    if (!check.valid) {
      return NextResponse.json(
        { error: 'Bad Request', message: check.errors.join('; ') },
        { status: 400 }
      );
    }

    const passwordHash = await hashPassword(newPassword);
    await updateUserPassword(id, passwordHash);

    await writeAuditLog({
      adminId: payload.userId,
      adminEmail: payload.email,
      action: 'reset_user_password',
      targetType: 'user',
      targetId: id,
      detailsJson: JSON.stringify({ target_email: targetUser.email }),
      status: 'success',
    }).catch((err) => console.error('[PASSWORD-RESET-AUDIT] error:', err));

    return NextResponse.json({ success: true, message: 'Đã đặt lại mật khẩu người dùng' });
  } catch (err) {
    console.error('Error resetting user password:', err);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Không đặt lại được mật khẩu' },
      { status: 500 }
    );
  }
}
