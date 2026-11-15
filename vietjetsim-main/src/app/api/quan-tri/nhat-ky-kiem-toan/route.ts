import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/neon';
import { verifyAdminRequest } from '@/lib/admin-auth';
import { parsePaginationParams, getOffset } from '@/lib/pagination';

// ─── GET: Get audit logs with filters ─────────────────────────────────────────

/**
 * Row shape of the audit-log list.
 *
 * These are the query's aliases: `audit_logs` stores `target_type`,
 * `target_id` and `details_json`, and the list column is headed "Tài nguyên"
 * ("resource"), so the projection renames them. The tab renders the alias
 * names, so the aliases and this type have to agree.
 */
interface AuditLogRow {
  id: string;
  action: string;
  resource: string;
  resource_id: string | null;
  details: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  user_email: string | null;
  user_name: string | null;
  user_role: string | null;
}

/**
 * The projection every branch of this endpoint used to repeat.
 *
 * `audit_logs` stores `target_type`, `target_id` and `details_json`; the
 * table's column is headed "Tài nguyên" and the tab reads `resource` /
 * `resource_id` / `details`, so the projection renames them.
 */
const SELECT_COLUMNS = `
  SELECT
    al.id,
    al.action,
    al.target_type as resource,
    al.target_id as resource_id,
    al.details_json as details,
    al.ip_address,
    al.user_agent,
    al.created_at,
    u.email as user_email,
    u.full_name as user_name,
    u.role as user_role
  FROM audit_logs al
  LEFT JOIN user_profiles u ON al.admin_id = u.id`;

export async function GET(request: NextRequest) {
  try {
    const { error, response } = await verifyAdminRequest(request, 'rbac:audit_log');
    if (error) return response;

    const { searchParams } = new URL(request.url);
    const { page, limit } = parsePaginationParams(searchParams, { limit: 50 });
    const action = searchParams.get('action') || '';
    const userId = searchParams.get('user_id') || '';
    const resource = searchParams.get('resource') || '';
    const dateFrom = searchParams.get('date_from') || '';
    const dateTo = searchParams.get('date_to') || '';
    /**
     * The free-text search the tab sends. It used to be sent as `q` and read
     * by nobody: the endpoint only ever looked at `action`, `user_id`,
     * `resource` and the dates, so the search box filtered nothing and the
     * operator could not find a log entry by actor, target or id.
     */
    const search = searchParams.get('q') || searchParams.get('search') || '';
    const offset = getOffset(page, limit);

    /**
     * One filter set, one query.
     *
     * The endpoint used to carry six near-identical branches — one per
     * combination of filters — and the `q` search existed in none of them.
     * Every branch had to be kept in step by hand, and they had drifted.
     */
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (action) {
      values.push(`%${action}%`);
      conditions.push(`al.action ILIKE $${values.length}`);
    }
    if (userId) {
      values.push(userId);
      conditions.push(`al.admin_id = $${values.length}`);
    }
    if (resource) {
      values.push(`%${resource}%`);
      conditions.push(`al.target_type ILIKE $${values.length}`);
    }
    if (dateFrom) {
      values.push(dateFrom);
      conditions.push(`al.created_at >= $${values.length}`);
    }
    if (dateTo) {
      values.push(`${dateTo} 23:59:59`);
      conditions.push(`al.created_at <= $${values.length}`);
    }
    if (search) {
      values.push(`%${search}%`);
      const p = `$${values.length}`;
      conditions.push(
        `(al.action ILIKE ${p} OR al.target_type ILIKE ${p} OR al.target_id ILIKE ${p} ` +
          `OR u.email ILIKE ${p} OR u.full_name ILIKE ${p})`
      );
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const logs = await sql.query<AuditLogRow>(
      `${SELECT_COLUMNS} ${whereClause} ORDER BY al.created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset]
    );

    const countResult = await sql.query<{ total: number }>(
      `SELECT COUNT(*) as total FROM audit_logs al LEFT JOIN user_profiles u ON al.admin_id = u.id ${whereClause}`,
      values
    );
    const total = Number(countResult[0]?.total || 0);

    // Get unique actions and resources for filter options
    const actions = await sql<{
      action: string;
    }>`SELECT DISTINCT action FROM audit_logs ORDER BY action`;
    const resources = await sql<{
      target_type: string;
    }>`SELECT DISTINCT target_type FROM audit_logs ORDER BY target_type`;

    return NextResponse.json({
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      filters: {
        actions: actions.map((a) => a.action),
        resources: resources.map((r) => r.target_type),
      },
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to fetch audit logs' },
      { status: 500 }
    );
  }
}
