import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/admin-auth';
import { validateCsrfOrReject } from '@/lib/csrf';
import { rateLimit } from '@/lib/rate-limit';
import { sql } from '@/lib/neon';
import { findUserByEmail, createUser } from '@/lib/db';
import { hashPassword, validatePassword } from '@/lib/auth';
import { canManageRole } from '@/lib/rbac';
import { isAssignableRole } from '@/lib/roles';
import { writeAuditLog } from '@/lib/db';
import { normalizePhone } from '@/lib/utils';

interface ImportResult {
  row: number;
  email: string;
  success: boolean;
  error?: string;
  userId?: string;
}

export async function POST(request: NextRequest) {
  try {
    const csrfError = await validateCsrfOrReject(request);
    if (csrfError) return csrfError;

    const limited = rateLimit(request, { windowMs: 60_000, maxRequests: 5 });
    if (limited) return limited;

    const { payload: admin, error, response } = await verifyAdminRequest(request, 'user:create');
    if (error) return response!;

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'Không có file được tải lên.' }, { status: 400 });
    }

    // Validate file type
    if (!file.name.endsWith('.csv') && !file.name.endsWith('.txt')) {
      return NextResponse.json({ error: 'Chỉ chấp nhận file CSV hoặc TXT.' }, { status: 400 });
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: 'File quá lớn. Tối đa 2MB.' }, { status: 400 });
    }

    // Parse CSV
    const text = await file.text();
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length < 2) {
      return NextResponse.json(
        { error: 'File phải có ít nhất 1 dòng header và 1 dòng dữ liệu.' },
        { status: 400 }
      );
    }

    // Parse header
    const header = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/"/g, ''));
    const requiredColumns = ['email', 'full_name'];
    const optionalColumns = ['phone', 'role', 'password', 'skyjoy_member_id'];

    for (const col of requiredColumns) {
      if (!header.includes(col)) {
        return NextResponse.json(
          { error: `Thiếu cột bắt buộc: ${col}. Các cột cần: ${requiredColumns.join(', ')}` },
          { status: 400 }
        );
      }
    }

    // Parse data rows
    const results: {
      row: number;
      email: string;
      success: boolean;
      error?: string;
      userId?: string;
    }[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) {
        results.push({ row: i + 1, email: '', success: false, error: 'Dòng trống' });
        continue;
      }

      // Simple CSV parse (handle quoted fields)
      const values: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim());

      if (values.length < header.length) {
        results.push({ row: i + 1, email: '', success: false, error: 'Số cột không khớp header' });
        continue;
      }

      const rowData: Record<string, string> = {};
      header.forEach((h, idx) => {
        rowData[h] = values[idx]?.replace(/^"|"$/g, '').trim() || '';
      });

      const email = rowData.email?.toLowerCase().trim();
      const fullName = rowData.full_name?.trim();
      const phone = rowData.phone?.trim() || null;
      const role = (rowData.role?.trim() || 'user') as 'user' | 'admin';
      const password = rowData.password?.trim() || '';
      const skyjoyMemberId = rowData.skyjoy_member_id?.trim().toUpperCase() || null;

      // Validate
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        results.push({
          row: i + 1,
          email: email || '',
          success: false,
          error: 'Email không hợp lệ',
        });
        continue;
      }
      if (!fullName || fullName.length < 2) {
        results.push({ row: i + 1, email, success: false, error: 'Họ tên phải từ 2 ký tự' });
        continue;
      }

      // Validate role
      if (!['user', 'admin'].includes(role)) {
        results.push({ row: i + 1, email, success: false, error: 'Role phải là user hoặc admin' });
        continue;
      }

      // RBAC check
      if (!canManageRole(admin.role, role)) {
        results.push({ row: i + 1, email, success: false, error: 'Không có quyền tạo role này' });
        continue;
      }

      // Check existing
      const existing = await findUserByEmail(email);
      if (existing) {
        results.push({ row: i + 1, email, success: false, error: 'Email đã tồn tại' });
        continue;
      }

      // Phone normalization
      const normalizedPhone = phone ? normalizePhone(phone) : null;
      if (phone && !normalizedPhone) {
        results.push({ row: i + 1, email, success: false, error: 'Số điện thoại không hợp lệ' });
        continue;
      }

      // Check phone unique
      if (normalizedPhone) {
        const phoneExists = await sql`
          SELECT id FROM user_profiles WHERE phone = ${normalizedPhone}
        `;
        if ((phoneExists as unknown[]).length > 0) {
          results.push({
            row: i + 1,
            email,
            success: false,
            error: 'Số điện thoại đã được sử dụng',
          });
          continue;
        }
      }

      // Password
      let passwordHash: string;
      if (password) {
        const pwdCheck = validatePassword(password);
        if (!pwdCheck.valid) {
          results.push({ row: i + 1, email, success: false, error: pwdCheck.errors.join('; ') });
          continue;
        }
        passwordHash = await hashPassword(password);
      } else {
        // Generate random password
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*';
        const bytes = new Uint8Array(12);
        crypto.getRandomValues(bytes);
        const tempPass = Array.from(bytes, (b) => chars[b % chars.length]).join('');
        passwordHash = await hashPassword(tempPass);
      }

      // SkyJoy ID validation
      if (skyjoyMemberId && !/^SJ\d{8,10}$/.test(skyjoyMemberId)) {
        results.push({
          row: i + 1,
          email,
          success: false,
          error: 'Mã SkyJoy không hợp lệ (SJ + 8-10 số)',
        });
        continue;
      }

      // Check SkyJoy ID unique
      if (skyjoyMemberId) {
        const skyjoyExists = await sql`
          SELECT id FROM user_profiles WHERE skyjoy_member_id = ${skyjoyMemberId}
        `;
        if ((skyjoyExists as unknown[]).length > 0) {
          results.push({ row: i + 1, email, success: false, error: 'Mã SkyJoy đã được sử dụng' });
          continue;
        }
      }

      // Create user
      try {
        const created = await createUser(
          email,
          passwordHash,
          fullName,
          role,
          normalizedPhone,
          skyjoyMemberId
        );

        results.push({ row: i + 1, email, success: true, userId: created.id });

        // Audit log
        await writeAuditLog({
          adminId: admin.userId,
          adminEmail: admin.email,
          action: 'import_user',
          targetType: 'user',
          targetId: created.id,
          detailsJson: JSON.stringify({ email, role, source: 'csv_import' }),
          status: 'success',
        }).catch(() => {});
      } catch (err) {
        results.push({
          row: i + 1,
          email,
          success: false,
          error: 'Lỗi tạo user: ' + (err as Error).message,
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.length - successCount;

    return NextResponse.json({
      success: true,
      message: `Nhập thành công ${successCount}/${results.length} người dùng.`,
      results,
      summary: { total: results.length, success: successCount, failed: failCount },
    });
  } catch (error) {
    console.error('Error importing users:', error);
    return NextResponse.json({ error: 'Đã xảy ra lỗi khi nhập dữ liệu.' }, { status: 500 });
  }
}
