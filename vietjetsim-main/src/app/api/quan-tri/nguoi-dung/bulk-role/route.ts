import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/admin-auth';
import { validateCsrfOrReject } from '@/lib/csrf';
import { rateLimit } from '@/lib/rate-limit';
import { findUserById, updateUserRole } from '@/lib/db';
import { canManageRole } from '@/lib/rbac';
import { isAssignableRole } from '@/lib/roles';
import { writeAuditLog } from '@/lib/db';

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
    const newRole = typeof body?.role === 'string' ? body.role.trim() : '';

    if (userIds.length === 0) {
      return NextResponse.json({ error: 'Danh sách user_ids không được rỗng.' }, { status: 400 });
    }

    if (userIds.length > 100) {
      return NextResponse.json({ error: 'Tối đa 100 người dùng mỗi lần.' }, { status: 400 });
    }

    if (!isAssignableRole(newRole)) {
      return NextResponse.json(
        { error: `Role không hợp lệ. Phải là: user hoặc admin.` },
        { status: 400 }
      );
    }

    const results: Array<{
      userId: string;
      success: boolean;
      error?: string;
      oldRole?: string;
      newRole?: string;
    }> = [];

    for (const userId of userIds) {
      try {
        // Verify target user exists
        const targetUser = await findUserById(userId);
        if (!targetUser) {
          results.push({ userId, success: false, error: 'User not found' });
          continue;
        }

        // RBAC: Admin cannot change role for higher/equal level user
        if (!canManageRole(admin.role, targetUser.role)) {
          results.push({
            userId,
            success: false,
            error: 'Insufficient permission for target user',
          });
          continue;
        }

        // RBAC: Admin cannot assign role higher than their capability
        if (!canManageRole(admin.role, newRole)) {
          results.push({ userId, success: false, error: 'Cannot assign this role' });
          continue;
        }

        // Prevent admin from changing their own role
        if (userId === admin.userId) {
          results.push({ userId, success: false, error: 'Cannot change your own role' });
          continue;
        }

        const oldRole = targetUser.role;
        await updateUserRole(userId, newRole);

        // Audit log
        await writeAuditLog({
          adminId: admin.userId,
          adminEmail: admin.email,
          action: 'bulk_role_change',
          targetType: 'user',
          targetId: userId,
          detailsJson: JSON.stringify({ oldRole, newRole }),
          status: 'success',
        }).catch((err) => console.error('[BULK-ROLE-AUDIT] error:', err));

        results.push({ userId, success: true, oldRole, newRole });
      } catch (err) {
        console.error(`[BULK-ROLE] Error for ${userId}:`, err);
        results.push({ userId, success: false, error: 'Internal error' });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.length - successCount;

    return NextResponse.json({
      success: true,
      message: `Đã đổi role cho ${successCount}/${results.length} tài khoản.`,
      results,
      summary: { total: results.length, success: successCount, failed: failCount },
    });
  } catch (error) {
    console.error('Error bulk role change:', error);
    return NextResponse.json({ error: 'Đã xảy ra lỗi. Vui lòng thử lại.' }, { status: 500 });
  }
}
