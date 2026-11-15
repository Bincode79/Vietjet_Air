import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/neon';
import { verifyAdminRequest } from '@/lib/admin-auth';
import { writeAuditLog } from '@/lib/db';
import { SYSTEM_CONFIG_SCHEMA, type SystemConfigKey } from '@/lib/system-config';

// ─── GET: Get all system settings ───────────────────────────────────────────

/** Row shape of the `system_config` table used by this route. */
interface SystemConfigRow {
  id: string;
  key: string;
  value: string;
  description?: string | null;
  updated_at: string;
}

export async function GET(request: NextRequest) {
  try {
    const { error, response } = await verifyAdminRequest(request, 'system:config');
    if (error) return response;

    const settings = await sql<SystemConfigRow>`
      SELECT id, key, value, description, updated_at
      FROM system_config
      ORDER BY key ASC
    `;

    // Chỉ trả về các key được khai báo trong `SYSTEM_CONFIG_SCHEMA`. Key lạ (do
    // cài đặt cũ hoặc nhập tay) không thể tác động tới hành vi runtime nên
    // không nên hiện ra trong UI — hiện chúng chỉ làm form rối và dễ khiến
    // admin tưởng là đang cấu hình được.
    const knownSettings = settings.filter((s) => s.key in SYSTEM_CONFIG_SCHEMA);

    // Transform to key-value object for easier frontend consumption
    const settingsObject: Record<string, { value: string; description?: string }> = {};
    knownSettings.forEach((setting) => {
      settingsObject[setting.key] = {
        value: setting.value || '',
        description: setting.description ?? undefined,
      };
    });

    return NextResponse.json({
      settings: knownSettings,
      settingsObject,
    });
  } catch (error) {
    console.error('Error fetching system settings:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to fetch system settings' },
      { status: 500 }
    );
  }
}

// ─── PATCH: Update system settings ──────────────────────────────────────────

export async function PATCH(request: NextRequest) {
  try {
    const { error, response, payload } = await verifyAdminRequest(request, 'system:config');
    if (error) return response;

    const body = await request.json();
    const { settings } = body;

    if (!settings || typeof settings !== 'object') {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Settings object is required' },
        { status: 400 }
      );
    }

    const updatedSettings: Array<{ key: string; value: string }> = [];

    // Process each setting
    for (const [key, valueObj] of Object.entries(settings)) {
      // `valueObj` là `{ value: string }` theo hợp đồng của body, không phải
      // hàng SQL — nên ép sang shape riêng chứ không dùng `SystemConfigRow`
      // (row có `id`/`updated_at` mà body không có).
      const value = (valueObj as { value?: string }).value;

      if (value === undefined) continue;

      // Chỉ cho phép ghi các key có tác dụng runtime. Nếu không, admin có thể
      // tạo hàng `system_config` cho một key không ai đọc và tưởng là đã
      // cấu hình xong (xem `SYSTEM_CONFIG_SCHEMA`).
      if (!(key in SYSTEM_CONFIG_SCHEMA)) {
        return NextResponse.json(
          {
            error: 'Bad Request',
            message: `Unknown setting key: ${key}`,
            allowedKeys: Object.keys(SYSTEM_CONFIG_SCHEMA),
          },
          { status: 400 }
        );
      }

      const spec = SYSTEM_CONFIG_SCHEMA[key as SystemConfigKey];
      const raw = String(value).trim();

      // Chuẩn hoá về đúng kiểu đã khai báo trong schema, và từ chối giá trị
      // không hợp lệ thay vì lưu rác rồi âm thầm bị bỏ qua khi đọc lại.
      let normalized: string;
      if (spec.type === 'boolean') {
        const lowered = raw.toLowerCase();
        if (lowered !== 'true' && lowered !== 'false') {
          return NextResponse.json(
            { error: 'Bad Request', message: `${key} must be "true" or "false"` },
            { status: 400 }
          );
        }
        normalized = lowered;
      } else if (spec.type === 'number') {
        const parsed = Number(raw);
        if (!Number.isFinite(parsed)) {
          return NextResponse.json(
            { error: 'Bad Request', message: `${key} must be a number` },
            { status: 400 }
          );
        }
        if (spec.min !== undefined && parsed < spec.min) {
          return NextResponse.json(
            { error: 'Bad Request', message: `${key} must be at least ${spec.min}` },
            { status: 400 }
          );
        }
        if (spec.max !== undefined && parsed > spec.max) {
          return NextResponse.json(
            { error: 'Bad Request', message: `${key} must be at most ${spec.max}` },
            { status: 400 }
          );
        }
        normalized = String(parsed);
      } else {
        normalized = raw;
      }

      // Upsert each setting
      const [setting] = await sql<{ key: string; value: string }>`
        INSERT INTO system_config (key, value, updated_at)
        VALUES (${key}, ${normalized}, NOW())
        ON CONFLICT (key)
        DO UPDATE SET
          value = EXCLUDED.value,
          updated_at = NOW()
        RETURNING *
      `;

      updatedSettings.push(setting);
    }

    // Đổi cấu hình hệ thống phải để lại dấu vết: ai đổi, đổi key nào, sang
    // giá trị gì. Ghi log thất bại không được làm hỏng request — cấu hình đã
    // lưu xong, chỉ thiếu dấu vết.
    if (updatedSettings.length > 0) {
      await writeAuditLog({
        adminId: payload.userId,
        adminEmail: payload.email,
        action: 'update_system_config',
        targetType: 'system_config',
        detailsJson: JSON.stringify({
          changes: updatedSettings.map((s) => ({ key: s.key, value: s.value })),
        }),
        status: 'success',
        ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
      }).catch((logError) =>
        console.error('[SETTINGS-AUDIT] failed to write audit log:', logError)
      );
    }

    return NextResponse.json({
      success: true,
      settings: updatedSettings,
      message: 'Settings updated successfully',
    });
  } catch (error) {
    console.error('Error updating system settings:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to update system settings' },
      { status: 500 }
    );
  }
}
