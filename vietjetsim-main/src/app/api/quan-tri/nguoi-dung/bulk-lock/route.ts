import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/admin-auth';
import { validateCsrfOrReject } from '@/lib/csrf';
import { rateLimit } from '@/lib/rate-limit';
import { findUserById } from '@/lib/db';
import { deleteAllUserSessions } from '@/lib/security-db';
import { canManageRole } from '@/lib/rbac';
import { sql } from '@/lib/neon';
import { writeAuditLog } from '@/lib/db';
import { LOCKED_UNTIL_SENTINEL } from '@/lib/account-lock';

export async function PATCH(request: NextRequest) {
  try {
    const csrfError = await validateCsrfOrReject(request);
    if (csrfError) return csrfError;

    const limited = rateLimit(request, { windowMs: 60_000, maxRequests: 10 });
    if (limited) return limited;

    const {
      payload: admin,
      error,
      response,
    } = await verifyAdminRequest(request, 'user:role_change');
    if (error) return response!;

    const body = await request.json();
    const userIds = Array.isArray(body?.user_ids) ? body.user_ids : [];
    const action = body?.action === 'unlock' ? 'unlock' : 'lock';
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';

    if (userIds.length === 0) {
      return NextResponse.json({ error: 'Danh sách user_ids không được rỗng.' }, { status: 400 });
    }

    if (userIds.length > 100) {
      return NextResponse.json({ error: 'Tối đa 100 người dùng mỗi lần.' }, { status: 400 });
    }

    const results: Array<{ userId: string; success: boolean; error?: string }> = [];

    for (const userId of userIds) {
      try {
        // Verify target user exists
        const targetUser = await findUserById(userId);
        if (!targetUser) {
          results.push({ userId, success: false, error: 'User not found' });
          continue;
        }

        // RBAC check
        if (!canManageRole(admin.role, targetUser.role)) {
          results.push({ userId, success: false, error: 'Insufficient permission' });
          continue;
        }

        // Prevent self-lock
        if (userId === admin.userId) {
          results.push({ userId, success: false, error: 'Cannot lock yourself' });
          continue;
        }

        const lockValue = action === 'lock' ? LOCKED_UNTIL_SENTINEL : null;

        await sql`
          UPDATE user_profiles
          SET locked_until = ${lockValue}, updated_at = NOW()
          WHERE id = ${userId}
        `;

        // If locking, revoke all sessions
        if (action === 'lock') {
          await deleteAllUserSessions(userId).catch(() => undefined);
        }

        // Audit log per user
        await writeAuditLog({
          adminId: admin.userId,
          adminEmail: admin.email,
          action: `user_${action}`,
          targetType: 'user',
          targetId: userId,
          detailsJson: JSON.stringify({ reason }),
          status: 'success',
        }).catch((err) => console.error('[BULK-LOCK-AUDIT] error:', err));

        results.push({ userId, success: true });
      } catch (err) {
        console.error(`[BULK-LOCK] Error for ${userId}:`, err);
        results.push({ userId, success: false, error: 'Internal error' });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.length - successCount;

    return NextResponse.json({
      success: true,
      message: `${action === 'lock' ? 'Khóa' : 'Mở khóa'} ${successCount}/${results.length} tài khoản.`,
      results,
      summary: { total: results.length, success: successCount, failed: failCount },
    });
  } catch (error) {
    console.error('Error bulk lock/unlock users:', error);
    return NextResponse.json({ error: 'Đã xảy ra lỗi. Vui lòng thử lại.' }, { status: 500 });
  }
}
