import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/admin-auth';
import { sql } from '@/lib/neon';

export async function GET(request: NextRequest) {
  try {
    const { error, response } = await verifyAdminRequest(request, 'user:list');
    if (error) return response;

    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'csv'; // csv | xlsx
    const search = searchParams.get('search') || undefined;
    const role = searchParams.get('role') || undefined;
    const status = searchParams.get('status') || undefined; // active | locked
    const columns = searchParams.get('columns')?.split(',') || [
      'id',
      'email',
      'full_name',
      'role',
      'phone',
      'skyjoy_member_id',
      'email_verified',
      'created_at',
      'last_login',
      'bookings_count',
      'total_spent',
    ];

    // Build query
    let whereClause = 'WHERE 1=1';
    const params: (string | number)[] = [];
    let paramIndex = 1;

    if (search) {
      whereClause += ` AND (LOWER(email) LIKE $${paramIndex} OR LOWER(full_name) LIKE $${paramIndex})`;
      params.push(`%${search.toLowerCase()}%`);
      paramIndex++;
    }
    if (role) {
      whereClause += ` AND role = $${paramIndex}`;
      params.push(role);
      paramIndex++;
    }
    if (status === 'locked') {
      whereClause += ` AND locked_until IS NOT NULL AND locked_until > NOW()`;
    } else if (status === 'active') {
      whereClause += ` AND (locked_until IS NULL OR locked_until <= NOW())`;
    }

    // Get all users (no pagination for export)
    const query = `
      SELECT 
        u.id,
        u.email,
        u.full_name,
        u.role,
        u.phone,
        u.skyjoy_member_id,
        u.email_verified,
        u.created_at,
        u.last_login,
        u.locked_until,
        COALESCE(b.booking_count, 0) as bookings_count,
        COALESCE(b.total_spent, 0) as total_spent
      FROM user_profiles u
      LEFT JOIN (
        SELECT user_id, COUNT(*) as booking_count, SUM(total_price) as total_spent
        FROM bookings
        GROUP BY user_id
      ) b ON u.id = b.user_id
      ${whereClause}
      ORDER BY u.created_at DESC
    `;

    const results = await sql.query(query, params);
    const users = results as {
      id: string;
      email: string;
      full_name: string;
      role: string;
      phone: string | null;
      skyjoy_member_id: string | null;
      email_verified: boolean;
      created_at: string;
      last_login: string | null;
      locked_until: string | null;
      bookings_count: number;
      total_spent: number;
    }[];

    // Generate CSV
    const headers = columns.map((c) => {
      const map: Record<string, string> = {
        id: 'ID',
        email: 'Email',
        full_name: 'Họ tên',
        role: 'Vai trò',
        phone: 'Số điện thoại',
        skyjoy_member_id: 'Mã SkyJoy',
        email_verified: 'Email đã xác thực',
        created_at: 'Ngày tạo',
        last_login: 'Đăng nhập cuối',
        bookings_count: 'Số đặt vé',
        total_spent: 'Tổng chi tiêu (VND)',
        locked_until: 'Khoá đến',
      };
      return map[c] || c;
    });

    const rows = users.map((user) =>
      columns.map((col) => {
        const value = (user as Record<string, unknown>)[col];
        if (value === null || value === undefined) return '';
        if (typeof value === 'boolean') return value ? 'Có' : 'Không';
        if (col === 'total_spent' && typeof value === 'number') {
          return value.toLocaleString('vi-VN');
        }
        if (col === 'created_at' || col === 'last_login' || col === 'locked_until') {
          return value ? new Date(value as string).toLocaleString('vi-VN') : '';
        }
        return String(value);
      })
    );

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    // Add BOM for Excel UTF-8
    const bom = '\uFEFF';
    const csvWithBom = bom + csvContent;

    if (format === 'xlsx') {
      // For xlsx, return CSV with .xlsx extension (Excel can open CSV as xlsx)
      return new NextResponse(csvWithBom, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="users-export-${new Date().toISOString().slice(0, 10)}.xlsx"`,
        },
      });
    }

    return new NextResponse(csvWithBom, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="users-export-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error) {
    console.error('Error exporting users:', error);
    return NextResponse.json({ error: 'Không thể xuất dữ liệu người dùng.' }, { status: 500 });
  }
}
