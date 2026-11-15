import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/admin-auth';
import { isAdminRole } from '@/lib/roles';
import type { FlightRecord } from '@/lib/db';
import { getApiErrorMessage } from '@/shared/services';
import { sql } from '@/lib/neon';
import {
  getAllFlights,
  getAllBookings,
  getAllUsers,
  getAllRefunds,
  updateBookingStatus,
  updateFlight,
  getSstkLogs,
  insertSstkLog,
  archiveOldRefunds,
} from '@/lib/db';
import { FARE_LADDER_RATIO, MIN_TICKET_PRICE_FLOOR } from '@/lib/flight-pricing-constants';

// ─── Auth guard ──────────────────────────────────────────────────────────────

async function getAdminId(request: NextRequest): Promise<string | { error: NextResponse }> {
  const result = await verifyAdminRequest(request, 'sstk:execute');
  if (result.error || result.response) return { error: result.response! };
  return result.payload.userId || 'admin';
}

// ─── Tool definitions (server-side executors) ───────────────────────────────

const TOOLS: Record<
  string,
  {
    label: string;
    description: string;
    category: string;
    execute: (
      params: Record<string, unknown>,
      adminId: string
    ) => Promise<{ summary: string; status: 'success' | 'error' | 'partial' }>;
  }
> = {
  'cleanup-expired': {
    label: 'Dọn dẹp đặt vé hết hạn',
    description: 'Huỷ tự động các đặt vé ở trạng thái pending quá 30 phút',
    category: 'booking',
    execute: async (_params, _adminId) => {
      const bookings = await getAllBookings({ page: 1, limit: 1000 });
      const now = new Date();
      let count = 0;
      for (const b of bookings.bookings) {
        if (b.status === 'pending') {
          const createdAt = new Date(b.created_at);
          const diffMs = now.getTime() - createdAt.getTime();
          if (diffMs > 30 * 60 * 1000) {
            await updateBookingStatus(b.id, 'cancelled');
            count++;
          }
        }
      }
      return { summary: `Đã huỷ ${count} đặt vé hết hạn`, status: 'success' as const };
    },
  },

  'sync-prices': {
    label: 'Đồng bộ giá chuyến bay',
    description: 'Đặt lại giá vé theo mức cơ sở, giữ nguyên tỷ lệ giá theo cabin',
    category: 'flight',
    execute: async (params, _adminId) => {
      const flightsResult = await getAllFlights();
      const flights = flightsResult.flights || [];

      const basePrice = Number(params.basePrice);
      if (!Number.isFinite(basePrice) || basePrice <= 0) {
        return {
          summary: 'Giá cơ sở không hợp lệ (phải là số lớn hơn 0)',
          status: 'error' as const,
        };
      }
      // Giá sàn dùng chung với phần điều chỉnh giá hàng loạt — một chuyến bay
      // có giá 0đ sẽ làm trang tìm chuyến hiển thị sai và hỏng luồng đặt vé.
      const base = Math.max(MIN_TICKET_PRICE_FLOOR, Math.round(basePrice));

      let updated = 0;
      const failures: string[] = [];

      for (const flight of flights) {
        // Giữ tỷ lệ cabin của chuyến bay này: business luôn đắt hơn economy
        // theo đúng thang giá mà seed migration 030 dùng.
        const economyPrice = base;
        const businessPrice = Math.max(economyPrice, Math.round(economyPrice * FARE_LADDER_RATIO));

        try {
          await updateFlight(flight.id, {
            price: economyPrice,
            economy_price: economyPrice,
            business_price: businessPrice,
          });
          updated++;
        } catch (error) {
          failures.push(`${flight.flight_no} (${String(error)})`);
        }
      }

      if (failures.length > 0) {
        return {
          summary: `Đã cập nhật ${updated}/${flights.length} chuyến bay. Lỗi: ${failures.slice(0, 3).join('; ')}`,
          status: 'partial' as const,
        };
      }

      return {
        summary: `Đã đồng bộ giá cho ${updated} chuyến bay (giá cơ sở: ${base.toLocaleString('vi-VN')}₫)`,
        status: 'success' as const,
      };
    },
  },

  'reset-stuck-chat': {
    label: 'Reset chat bị treo',
    description: 'Xóa presence của người dùng offline > 1 giờ để giải phóng session chat',
    category: 'chat',
    execute: async (_params, _adminId) => {
      // `DELETE ... RETURNING` trả về đúng các hàng đã xoá. Trước đây lệnh
      // DELETE không có RETURNING nên `result.length` luôn bằng 0 và tool báo
      // "Đã xóa 0 presence record" dù đã xoá hàng loạt.
      const result = await sql`
        DELETE FROM chat_presence
        WHERE last_seen < NOW() - INTERVAL '1 hour'
        RETURNING id
      `;
      const count = Array.isArray(result) ? result.length : 0;
      return { summary: `Đã xóa ${count} presence record cũ`, status: 'success' as const };
    },
  },

  'promote-active-users': {
    label: 'Nâng cấp user hoạt động',
    description:
      'Tự động đánh dấu user có > 5 booking thành công là "loyalty user" (không thay đổi role admin)',
    category: 'user',
    execute: async (_params, _adminId) => {
      const usersResult = await getAllUsers(1, 1000);
      const bookingsResult = await getAllBookings({ page: 1, limit: 10000 });
      const successBookingsByUser: Record<string, number> = {};
      const bookings = bookingsResult.bookings || [];
      for (const b of bookings) {
        if (b.status === 'completed') {
          successBookingsByUser[b.user_id] = (successBookingsByUser[b.user_id] || 0) + 1;
        }
      }
      let marked = 0;
      const users = usersResult.users || [];
      for (const u of users) {
        if ((successBookingsByUser[u.id] || 0) >= 5 && !isAdminRole(u.role)) {
          // Only log the action — do NOT change role to admin.
          // Role changes must go through the RBAC admin panel with explicit approval.
          await insertSstkLog(
            'promote-active-users',
            'Promote Active Users',
            _adminId,
            JSON.stringify({ userId: u.id, completedBookings: successBookingsByUser[u.id] }),
            'Đã đánh dấu user loyalty',
            'success'
          );
          marked++;
        }
      }
      return {
        summary: `Đã đánh dấu ${marked} user đạt tiêu chí loyalty (>5 booking hoàn thành)`,
        status: 'success' as const,
      };
    },
  },

  'archive-old-refunds': {
    label: 'Lưu trữ hoàn tiền cũ',
    description: 'Tự động lưu trữ (archive) các yêu cầu hoàn tiền đã xử lý/duyệt > 90 ngày',
    category: 'refund',
    execute: async (_params, _adminId) => {
      const archivedCount = await archiveOldRefunds(90);
      return {
        summary: `Đã lưu trữ ${archivedCount} yêu cầu hoàn tiền cũ (>90 ngày)`,
        status: 'success' as const,
      };
    },
  },

  'generate-report': {
    label: 'Tạo báo cáo tổng hợp',
    description: 'Xuất báo cáo tổng quan hệ thống (users, flights, bookings, revenue)',
    category: 'report',
    execute: async (_params, _adminId) => {
      const [usersResult, flightsResult, bookingsResult, refundsResult] = await Promise.all([
        getAllUsers(1, 1),
        getAllFlights(),
        getAllBookings({ page: 1, limit: 1 }),
        getAllRefunds(),
      ]);
      const flights = flightsResult.flights || [];
      const report = {
        timestamp: new Date().toISOString(),
        totalUsers: usersResult.total,
        totalFlights: flights.length,
        totalBookings: bookingsResult.total,
        totalRefunds: refundsResult.total,
        note: 'Báo cáo được tạo bởi SSTK',
      };
      return {
        summary: `Báo cáo: ${report.totalUsers} users, ${report.totalFlights} flights, ${report.totalBookings} bookings, ${report.totalRefunds} refunds`,
        status: 'success' as const,
      };
    },
  },

  'bulk-cancel-flights': {
    label: 'Huỷ loạt chuyến bay',
    description: 'Chuyển nhiều chuyến bay sang trạng thái đã huỷ trong khoảng thời gian',
    category: 'flight',
    execute: async (params, _adminId) => {
      const dateFrom = params.dateFrom;
      const dateTo = params.dateTo;
      if (!dateFrom || !dateTo) {
        return { summary: 'Thiếu tham số dateFrom hoặc dateTo', status: 'error' as const };
      }
      const allFlightsResult = await getAllFlights();
      const allFlights = allFlightsResult.flights || [];
      // `FlightRecord` has no `date` column — filtering on it made every
      // comparison `undefined >= 'YYYY-MM-DD'` (false), so this tool always
      // reported zero flights. Compare the date part of `depart_time` instead.
      const filtered = allFlights.filter((f: FlightRecord) => {
        const day = f.depart_time.slice(0, 10);
        return day >= dateFrom && day <= dateTo;
      });

      // Huỷ = đổi `status`, KHÔNG phải xoá hàng. Trước đây tool này gọi
      // `deleteFlight`, tức là xoá vĩnh viễn chuyến bay (và chỉ chạy được khi
      // chuyến bay chưa có booking nào) trong khi nhãn nói "huỷ".
      let cancelled = 0;
      const failures: string[] = [];
      for (const f of filtered) {
        try {
          await updateFlight(f.id, { status: 'cancelled' });
          cancelled++;
        } catch (error) {
          failures.push(`${f.flight_no} (${String(error)})`);
        }
      }

      if (failures.length > 0) {
        return {
          summary: `Đã huỷ ${cancelled}/${filtered.length} chuyến bay. Lỗi: ${failures.slice(0, 3).join('; ')}`,
          status: 'partial' as const,
        };
      }

      return {
        summary: `Đã huỷ ${cancelled}/${filtered.length} chuyến bay trong khoảng ${dateFrom} → ${dateTo}`,
        status: 'success' as const,
      };
    },
  },

  'notify-pending-bookings': {
    label: 'Nhắc nhở đặt vé chờ duyệt',
    description: 'Gửi thông báo cho tất cả user có đặt vé ở trạng thái pending',
    category: 'notification',
    execute: async (_params, _adminId) => {
      const bookingsResult = await getAllBookings({ page: 1, limit: 1000 });
      const bookings = bookingsResult.bookings || [];
      const pending = bookings.filter((b: { status: string }) => b.status === 'pending');
      // In a real system this would push notifications via WS/email
      return {
        summary: `Tìm thấy ${pending.length} đặt vé chờ duyệt. Đã gửi nhắc nhở (mock).`,
        status: 'success' as const,
      };
    },
  },
};

// ─── GET: List tools + recent logs ─────────────────────────────────────────

export async function GET(request: NextRequest) {
  const authResult = await getAdminId(request);
  if (typeof authResult !== 'string') return authResult.error;

  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');

  if (action === 'logs') {
    const logs = await getSstkLogs(100);
    return NextResponse.json({ data: logs });
  }

  // Return tool definitions
  const toolList = Object.entries(TOOLS).map(([key, val]) => ({
    key,
    label: val.label,
    description: val.description,
    category: val.category,
  }));

  const categories = [...new Set(Object.values(TOOLS).map((t) => t.category))];

  return NextResponse.json({
    tools: toolList,
    categories,
  });
}

// ─── POST: Execute a tool ───────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const authResult = await getAdminId(request);
  if (typeof authResult !== 'string') return authResult.error;

  try {
    const body = await request.json();
    const { toolKey, params = {} } = body;

    if (!toolKey || !TOOLS[toolKey]) {
      return NextResponse.json(
        { error: 'Bad Request', message: `Invalid tool key: ${toolKey}` },
        { status: 400 }
      );
    }

    const tool = TOOLS[toolKey];

    // Execute the tool
    const result = await tool.execute(params, authResult);

    // Log execution
    try {
      await insertSstkLog(
        toolKey,
        tool.label,
        authResult,
        JSON.stringify(params),
        result.summary,
        result.status
      );
    } catch (logErr) {
      // Don't fail the request if logging fails
      console.error('SSTK log failed:', logErr);
    }

    return NextResponse.json({
      // `success` phản ánh kết quả của tool, không phải "route đã chạy xong".
      // Trước đây route luôn trả `success: true`, nên một tool hỏng (giá cơ sở
      // không hợp lệ, cập nhật thất bại) vẫn hiện thông báo thành công.
      success: result.status === 'success',
      toolKey,
      label: tool.label,
      ...result,
      executedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('SSTK execute error:', err);

    // Try to log the error
    try {
      const body = await request.json().catch(() => ({ toolKey: 'unknown' }));
      await insertSstkLog(
        body.toolKey || 'unknown',
        body.toolKey || 'Unknown',
        authResult,
        JSON.stringify(body.params || {}),
        getApiErrorMessage(err, 'Unknown error'),
        'error'
      );
    } catch {
      /* ignore */
    }

    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: getApiErrorMessage(err, 'Tool execution failed'),
      },
      { status: 500 }
    );
  }
}
