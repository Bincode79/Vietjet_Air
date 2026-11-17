import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/admin-auth';
import { auditAdmin } from '@/lib/admin-audit';
import {
  getAllUsers,
  updateUserRole,
  findUserById,
  deleteUser,
  createUser,
  findUserByEmail,
} from '@/lib/db';
import { hashPassword, validatePassword } from '@/lib/auth';
import { canManageRole } from '@/lib/rbac';
import { ASSIGNABLE_ROLES, isAssignableRole } from '@/lib/roles';
import { isAccountLocked } from '@/lib/account-lock';
import { parsePaginationParams, getPaginationMeta } from '@/lib/pagination';

// ─── GET: Get all users (admin) ─────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { error, response } = await verifyAdminRequest(request, 'user:list');
    if (error) return response;

    const { searchParams } = new URL(request.url);
    const { page, limit } = parsePaginationParams(searchParams);
    const search = searchParams.get('search') || undefined;

    let { users, total } = await getAllUsers(page, limit);

    // Filter by search if provided
    if (search) {
      const searchLower = search.toLowerCase();
      users = users.filter(
        (u) =>
          u.email.toLowerCase().includes(searchLower) ||
          u.full_name.toLowerCase().includes(searchLower)
      );
      total = users.length;
    }

    return NextResponse.json({
      users: users.map((u) => ({
        ...u,
        status: isAccountLocked(u.locked_until) ? 'locked' : 'active',
      })),
      pagination: getPaginationMeta(page, limit, total),
    });
  } catch (error) {
    console.error('Error fetching users (admin):', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to fetch users' },
      { status: 500 }
    );
  }
}

// ─── POST: Create a new member account (admin) ─────────────────────────────
//
// Cho phép admin tạo tài khoản (user hoặc admin) trực tiếp mà không cần qua
// form đăng ký công khai. Role yêu cầu 'user:create', nhưng chỉ super_admin
// mới được tạo tài khoản admin (canManageRole level 2 > 1).

export async function POST(request: NextRequest) {
  try {
    const { payload, error, response } = await verifyAdminRequest(request, 'user:create');
    if (error) return response;

    const body = await request.json();
    const { email, password, full_name, phone, role = 'user', skyjoy_member_id } = body ?? {};

    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Email không hợp lệ.' },
        { status: 400 }
      );
    }
    const validation = validatePassword(String(password ?? ''));
    if (!validation.valid) {
      return NextResponse.json(
        { error: 'Bad Request', message: validation.errors.join('; ') },
        { status: 400 }
      );
    }
    const name = String(full_name ?? '').trim();
    if (name.length < 2 || name.length > 255) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Họ tên phải từ 2 đến 255 ký tự.' },
        { status: 400 }
      );
    }
    const normalizedRole = String(role ?? 'user').trim();
    if (!isAssignableRole(normalizedRole)) {
      return NextResponse.json(
        {
          error: 'Bad Request',
          message: `Role không hợp lệ. Phải là một trong: ${ASSIGNABLE_ROLES.join(', ')}`,
        },
        { status: 400 }
      );
    }
    // Chặn tạo tài khoản vượt cấp (VD: admin_ops tạo super_admin, admin tạo admin khác).
    if (!canManageRole(payload.role, normalizedRole)) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Không có quyền tạo tài khoản với vai trò này.' },
        { status: 403 }
      );
    }
    const phoneStr =
      phone === undefined || phone === null || String(phone).trim() === ''
        ? null
        : String(phone).trim();

    const existing = await findUserByEmail(email.trim().toLowerCase());
    if (existing) {
      return NextResponse.json(
        { error: 'Conflict', message: 'Email đã được sử dụng.' },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(String(password));
    const created = await createUser(
      email.trim().toLowerCase(),
      passwordHash,
      name,
      normalizedRole,
      phoneStr,
      skyjoy_member_id ? String(skyjoy_member_id).trim() : null
    );

    await auditAdmin(request, payload, {
      action: 'create_user',
      targetType: 'user',
      targetId: created.id,
      details: {
        email: created.email,
        role: normalizedRole,
        skyjoy_member_id: created.skyjoy_member_id,
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: `Đã tạo tài khoản ${created.email}`,
        user: {
          id: created.id,
          email: created.email,
          full_name: created.full_name,
          role: created.role,
          skyjoy_member_id: created.skyjoy_member_id,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    // UNIQUE(email) / UNIQUE(phone) — báo 409 thay vì 500.
    const msg = error instanceof Error ? error.message : '';
    if (/duplicate key|unique/i.test(msg)) {
      return NextResponse.json(
        { error: 'Conflict', message: 'Email hoặc số điện thoại đã được sử dụng.' },
        { status: 409 }
      );
    }
    console.error('Error creating user (admin):', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Không tạo được tài khoản.' },
      { status: 500 }
    );
  }
}

// ─── PATCH: Update user role (admin) ────────────────────────────────────────

export async function PATCH(request: NextRequest) {
  try {
    const { payload, error, response } = await verifyAdminRequest(request, 'user:role_change');
    if (error) return response;

    const body = await request.json();
    const { userId, role } = body;

    if (!userId || !role) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'userId and role are required' },
        { status: 400 }
      );
    }

    // Legacy admin names stay valid as stored data but are not assignable.
    if (!isAssignableRole(role)) {
      return NextResponse.json(
        {
          error: 'Bad Request',
          message: `Invalid role. Must be one of: ${ASSIGNABLE_ROLES.join(', ')}`,
        },
        { status: 400 }
      );
    }

    // Prevent admin from changing their own role
    if (userId === payload.userId) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Cannot change your own role' },
        { status: 400 }
      );
    }

    // RBAC: Check if actor can manage the target role
    const actorRole = payload.role;
    const targetRole = role;
    if (!canManageRole(actorRole, targetRole)) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Không có quyền thay đổi role này' },
        { status: 403 }
      );
    }

    const success = await updateUserRole(userId, role);

    if (!success) {
      return NextResponse.json({ error: 'Not Found', message: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: `User role updated to ${role}`,
      userId,
      role,
    });
  } catch (error) {
    console.error('Error updating user role:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to update user role' },
      { status: 500 }
    );
  }
}

// ─── DELETE: Delete a user (admin) ──────────────────────────────────────────

export async function DELETE(request: NextRequest) {
  try {
    const { payload, error, response } = await verifyAdminRequest(request, 'user:delete');
    if (error) return response;

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'userId is required' },
        { status: 400 }
      );
    }

    // Prevent admin from deleting themselves
    if (userId === payload.userId) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Cannot delete yourself' },
        { status: 400 }
      );
    }

    // Check if user exists
    const user = await findUserById(userId);
    if (!user) {
      return NextResponse.json({ error: 'Not Found', message: 'User not found' }, { status: 404 });
    }

    // RBAC: Prevent deleting users with equal or higher role level
    const actorRole = payload.role;
    const targetRole = user.role;
    if (!canManageRole(actorRole, targetRole)) {
      return NextResponse.json(
        { error: 'Forbidden', message: 'Không có quyền xóa người dùng này' },
        { status: 403 }
      );
    }

    // Delete user from PostgreSQL (CASCADE handles related records)
    await deleteUser(userId);

    return NextResponse.json({
      success: true,
      message: 'User deleted successfully',
      userId,
    });
  } catch (error) {
    // `deleteUser` refuses to orphan booking history and marks that refusal
    // with `status = 409`. Swallowing it as a 500 told the operator the server
    // had failed instead of telling them which bookings to handle first.
    const status = (error as { status?: number } | null)?.status;
    if (status === 409) {
      return NextResponse.json(
        {
          error: 'Conflict',
          message: error instanceof Error ? error.message : 'Không thể xóa người dùng này',
        },
        { status: 409 }
      );
    }
    console.error('Error deleting user:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to delete user' },
      { status: 500 }
    );
  }
}
