import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthRequest } from '@/lib/auth';
import { sql } from '@/lib/neon';
import { parsePaginationParams, getPaginationMeta } from '@/lib/pagination';

export async function GET(request: NextRequest) {
  try {
    const { user: auth, error, response } = await verifyAuthRequest(request);
    if (error || !auth) return response!;

    const { searchParams } = new URL(request.url);
    const { page, limit } = parsePaginationParams(searchParams);
    const action = searchParams.get('action') || undefined;

    // Build query from audit_logs
    let whereClause = `WHERE admin_id = $1 AND target_type = 'user' AND target_id = $2`;
    const params: (string | number)[] = [auth.userId, auth.userId];
    let paramIndex = 3;

    if (action) {
      whereClause += ` AND action = $${paramIndex}`;
      params.push(action);
      paramIndex++;
    }

    const query = `
      SELECT 
        id,
        action,
        target_type,
        target_id,
        details_json,
        status,
        ip_address,
        user_agent,
        created_at
      FROM audit_logs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    params.push(limit, (page - 1) * limit);

    const results = await sql.query(query, params);

    // Count total
    const countQuery = `
      SELECT COUNT(*) as total FROM audit_logs ${whereClause}
    `;
    const countResult = await sql.query(countQuery, params.slice(0, -2));
    const total = parseInt(String((countResult as { total: string }[])[0]?.total ?? 0), 10);

    // Parse details_json for display
    const history = (results as {
      id: string;
      action: string;
      details_json: string;
      status: string;
      created_at: string;
    }[]).map((row) => {
      let details: Record<string, unknown> = {};
      try {
        details = JSON.parse(row.details_json);
      } catch {
        details = { raw: row.details_json };
      }
      return {
        id: row.id,
        action: row.action,
        actionLabel: getActionLabel(row.action),
        details,
        status: row.status,
        createdAt: row.created_at,
      };
    });

    return NextResponse.json({
      history,
      pagination: getPaginationMeta(page, limit, total),
    });
  } catch (error) {
    console.error('Error fetching profile history:', error);
    return NextResponse.json(
      { error: 'Không thể tải lịch sử thay đổi.' },
      { status: 500 }
    );
  }
}

function getActionLabel(action: string): string {
  const map: Record<string, string> = {
    update_profile: 'Cập nhật hồ sơ',
    change_password: 'Đổi mật khẩu',
    update_avatar: 'Cập nhật avatar',
    delete_avatar: 'Xóa avatar',
    link_skyjoy: 'Liên kết SkyJoy',
    unlink_skyjoy: 'Hủy liên kết SkyJoy',
    enable_2fa: 'Bật 2FA',
    disable_2fa: 'Tắt 2FA',
    reset_user_password: 'Admin đặt lại mật khẩu',
    user_lock: 'Khóa tài khoản',
    user_unlock: 'Mở khóa tài khoản',
  };
  return map[action] || action;
}