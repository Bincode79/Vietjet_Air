import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/admin-auth';
import { findUserById, updateUserRole, updateUserProfile, deleteUser } from '@/lib/db';
import type { UserRecord } from '@/lib/db';
import { writeAuditLog } from '@/lib/db';
import { canManageRole } from '@/lib/rbac';
import { ASSIGNABLE_ROLES, isAssignableRole } from '@/lib/roles';
import { LOCKED_UNTIL_SENTINEL } from '@/lib/account-lock';
import { normalizePhone } from '@/lib/utils';
import { sql } from '@/lib/neon';

// ─── GET: Get specific user ──────────────────────────────────────────────────

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { error, response } = await verifyAdminRequest(request, 'user:view');
    if (error) return response;

    const { id } = await params;
    const user = await findUserById(id);

    if (!user) {
      return NextResponse.json({ error: 'Not Found', message: 'User not found' }, { status: 404 });
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to fetch user' },
      { status: 500 }
    );
  }
}

// ─── PATCH: Update user role or status ───────────────────────────────────────

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { payload, error, response } = await verifyAdminRequest(request, 'user:role_change');
    if (error) return response;

    const { id } = await params;
    const body = await request.json();
    const { role, status, operator_notes, full_name, email, phone } = body;

    // Prevent actor from changing their own role/status
    if (id === payload.userId) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Cannot change your own role or status' },
        { status: 400 }
      );
    }

    // Load target user to check RBAC level
    const targetUser = await findUserById(id);
    if (!targetUser) {
      return NextResponse.json({ error: 'Not Found', message: 'User not found' }, { status: 404 });
    }

    // RBAC: Check if actor can manage the target
    const actorRole = payload.role;
    const targetRole = targetUser.role;

    if (!canManageRole(actorRole, targetRole)) {
      return NextResponse.json(
        {
          error: 'Forbidden',
          message: 'Không có quyền thay đổi người dùng này (cùng cấp hoặc cao hơn)',
        },
        { status: 403 }
      );
    }

    let updatedUser;

    // Hồ sơ hiển thị (tên, email, số điện thoại).
    //
    // Ô "Chỉnh sửa người dùng" trong tab Quản lý người dùng có ba trường này,
    // nhưng trước đây form chỉ cập nhật state cục bộ rồi báo "Cập nhật thành
    // công" — không có đường ghi nào chạm tới DB. Giờ mỗi trường được ghi
    // thật, kèm kiểm tra để không tạo dữ liệu hỏng.
    const profilePatch: { full_name?: string; email?: string; phone?: string | null } = {};

    if (full_name !== undefined) {
      if (typeof full_name !== 'string' || full_name.trim().length < 2) {
        return NextResponse.json(
          { error: 'Bad Request', message: 'full_name must be a string of at least 2 characters' },
          { status: 400 }
        );
      }
      if (full_name.trim().length > 255) {
        return NextResponse.json(
          { error: 'Bad Request', message: 'full_name must be 255 characters or fewer' },
          { status: 400 }
        );
      }
      profilePatch.full_name = full_name.trim();
    }

    if (email !== undefined) {
      if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        return NextResponse.json(
          { error: 'Bad Request', message: 'email must be a valid email address' },
          { status: 400 }
        );
      }
      const normalizedEmail = email.trim().toLowerCase();
      // `user_profiles.email` là UNIQUE — ghi trùng sẽ ném lỗi constraint
      // thô (500). Kiểm tra trước để trả 409 rõ ràng.
      const existing = await sql`
        SELECT id FROM user_profiles WHERE LOWER(email) = ${normalizedEmail} AND id <> ${id}
      `;
      if ((existing as unknown[]).length > 0) {
        return NextResponse.json(
          { error: 'Conflict', message: 'Email này đã được dùng bởi tài khoản khác' },
          { status: 409 }
        );
      }
      profilePatch.email = normalizedEmail;
    }

    if (phone !== undefined) {
      if (phone !== null && phone !== '') {
        if (typeof phone !== 'string' || !/^\+?\d[\d\s]{7,19}$/.test(phone.trim())) {
          return NextResponse.json(
            { error: 'Bad Request', message: 'phone must be a valid phone number' },
            { status: 400 }
          );
        }
        // `user_profiles.phone` có UNIQUE index (migration 007/016) và đăng ký
        // luôn ghi ở dạng chuẩn hoá. Admin ghi bản thô thì hai cách gõ của
        // cùng một người (`+84 986…` và `0986…`) sẽ lọt qua UNIQUE và tạo ra
        // hai tài khoản cho một số — đúng cái lỗi migration 016 dọn dẹp.
        // Vì vậy chuẩn hoá trước khi ghi, giống `PATCH /api/nguoi-dung/profile`.
        const canonicalPhone = normalizePhone(phone);
        if (!canonicalPhone) {
          return NextResponse.json(
            { error: 'Bad Request', message: 'Số điện thoại không hợp lệ' },
            { status: 400 }
          );
        }
        // Trùng số → 409 rõ ràng, thay vì để lỗi constraint thô chạy ra 500.
        const existingPhone = await sql`
          SELECT id FROM user_profiles WHERE phone = ${canonicalPhone} AND id <> ${id}
        `;
        if (Array.isArray(existingPhone) && existingPhone.length > 0) {
          return NextResponse.json(
            { error: 'Conflict', message: 'Số điện thoại này đã được dùng bởi tài khoản khác' },
            { status: 409 }
          );
        }
        profilePatch.phone = canonicalPhone;
      } else {
        profilePatch.phone = null;
      }
    }

    if (Object.keys(profilePatch).length > 0) {
      updatedUser = await updateUserProfile(id, profilePatch);
    }

    if (role) {
      // Logic for role update
      // Only the two real roles are assignable; legacy admin names remain valid
      // as stored data (they still grant admin) but cannot be handed out.
      if (!isAssignableRole(role)) {
        return NextResponse.json(
          {
            error: 'Bad Request',
            message: `Invalid role. Must be one of: ${ASSIGNABLE_ROLES.join(', ')}`,
          },
          { status: 400 }
        );
      }

      // Also check if actor can manage the NEW role (don't promote to higher level than themselves)
      if (!canManageRole(actorRole, role)) {
        return NextResponse.json(
          { error: 'Forbidden', message: 'Không thể gán role cao hơn role hiện tại của bạn' },
          { status: 403 }
        );
      }

      updatedUser = await updateUserRole(id, role);
    }

    if (status) {
      if (status !== 'active' && status !== 'locked') {
        return NextResponse.json(
          { error: 'Bad Request', message: 'status must be "active" or "locked"' },
          { status: 400 }
        );
      }

      // There is no `status` column; `locked_until` is the lock flag. A future
      // timestamp locks the account, NULL unlocks it. Login and token refresh
      // both reject while it is in the future.
      const results = await sql`
        UPDATE user_profiles
        SET locked_until = ${status === 'locked' ? LOCKED_UNTIL_SENTINEL : null},
            updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `;
      updatedUser = (results as UserRecord[])[0];
    }

    // Ghi chú vận hành (migration 050).
    //
    // Trước đây ô "Ghi chú vận hành" trong bảng người dùng là một
    // `<textarea>` không có `value`, không có `onChange` và không có write
    // path — gõ vào không lưu gì. Cột `notes` mà UI đọc thuộc về
    // `agencies`, không phải `user_profiles`, nên nó luôn là `undefined`.
    //
    // Ghi chú được viết riêng, KHÔNG đi kèm khi đổi role hoặc khoá tài
    // khoản: hai việc đó có hậu quả phân quyền, còn ghi chú thì không.
    if (operator_notes !== undefined) {
      if (typeof operator_notes !== 'string') {
        return NextResponse.json(
          { error: 'Bad Request', message: 'operator_notes must be a string' },
          { status: 400 }
        );
      }
      const notes = operator_notes.trim();
      if (notes.length > 2000) {
        return NextResponse.json(
          { error: 'Bad Request', message: 'operator_notes must be 2000 characters or fewer' },
          { status: 400 }
        );
      }
      const results = await sql`
        UPDATE user_profiles
        SET operator_notes = ${notes || null}, updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `;
      updatedUser = (results as UserRecord[])[0];
    }

    // Không có thay đổi nào được yêu cầu — trả về user hiện tại thay vì
    // `undefined` (UI đọc `user` để cập nhật state cục bộ).
    if (!updatedUser) {
      updatedUser = targetUser;
    }

    // Nhật ký kiểm toán cho mọi thay đổi trên hồ sơ người dùng.
    const changedFields: string[] = [];
    if (profilePatch.full_name !== undefined) changedFields.push('full_name');
    if (profilePatch.email !== undefined) changedFields.push('email');
    if (profilePatch.phone !== undefined) changedFields.push('phone');
    if (role) changedFields.push('role');
    if (status) changedFields.push('status');
    if (operator_notes !== undefined) changedFields.push('operator_notes');

    if (changedFields.length > 0) {
      await writeAuditLog({
        adminId: payload.userId,
        adminEmail: payload.email,
        action: 'update_user_profile',
        targetType: 'user',
        targetId: id,
        detailsJson: JSON.stringify({ fields: changedFields }),
        status: 'success',
      }).catch((err) => console.error('[USER-UPDATE-AUDIT] error:', err));
    }

    return NextResponse.json({
      success: true,
      user: updatedUser,
      message: 'User updated successfully',
    });
  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to update user' },
      { status: 500 }
    );
  }
}

// ─── DELETE: Delete a user ───────────────────────────────────────────────────

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { payload, error, response } = await verifyAdminRequest(request, 'user:delete');
    if (error) return response;

    const { id } = await params;

    // Prevent deletion of self
    if (id === payload.userId) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Cannot delete yourself' },
        { status: 400 }
      );
    }

    const user = await findUserById(id);
    if (!user) {
      return NextResponse.json({ error: 'Not Found', message: 'User not found' }, { status: 404 });
    }

    // RBAC: Check hierarchy
    const actorRole = payload.role;
    const targetRole = user.role;
    if (!canManageRole(actorRole, targetRole)) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Không có quyền xóa người dùng này' },
        { status: 403 }
      );
    }

    await deleteUser(id);

    return NextResponse.json({
      success: true,
      message: 'User deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to delete user' },
      { status: 500 }
    );
  }
}
