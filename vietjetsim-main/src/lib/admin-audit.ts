import type { NextRequest } from 'next/server';
import type { JWTPayload } from '@/lib/auth';
import { writeAuditLog } from '@/lib/db';

/**
 * Ghi audit log cho thao tác quản trị — fire-and-forget, không bao giờ làm
 * fail request chính (pattern thống nhất cho mọi route quan-tri).
 *
 * Dùng sau khi thao tác ghi thành công:
 *   await auditAdmin(request, payload, { action: 'create_flight', targetType: 'flight', targetId: id });
 */
export async function auditAdmin(
  request: NextRequest,
  payload: JWTPayload | { userId?: string; email?: string } | undefined,
  log: { action: string; targetType: string; targetId?: string; details?: unknown }
): Promise<void> {
  try {
    if (typeof writeAuditLog !== 'function') {
      return;
    }
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || undefined;
    const userAgent = request.headers.get('user-agent') || undefined;
    await writeAuditLog({
      adminId: payload?.userId ?? payload?.email ?? 'admin',
      adminEmail: payload?.email ?? payload?.userId ?? 'admin',
      action: log.action,
      targetType: log.targetType,
      targetId: log.targetId,
      detailsJson:
        typeof log.details === 'string' ? log.details : JSON.stringify(log.details ?? {}),
      status: 'success',
      ipAddress: ip,
      userAgent,
    });
  } catch (err) {
    console.error(`[ADMIN-AUDIT:${log.action}] error:`, err);
  }
}
