import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthRequest } from '@/lib/auth';
import { validateCsrfOrReject } from '@/lib/csrf';
import { rateLimit } from '@/lib/rate-limit';
import { sql } from '@/lib/neon';
import { writeAuditLog } from '@/lib/db';
import { deleteUser } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const csrfError = await validateCsrfOrReject(request);
    if (csrfError) return csrfError;

    const limited = rateLimit(request, { windowMs: 60_000, maxRequests: 2 });
    if (limited) return limited;

    const { user: auth, error, response } = await verifyAuthRequest(request);
    if (error || !auth) return response!;

    const body = await request.json().catch(() => ({}));
    const password = body?.password || '';
    const confirmation = body?.confirmation || '';

    const userId = auth.userId;

    // Verify password
    if (!password) {
      return NextResponse.json({ error: 'Vui lòng nhập mật khẩu để xác nhận.' }, { status: 400 });
    }

    // Require explicit confirmation text
    if (confirmation !== 'XÓA TÀI KHOẢN CỦA TÔI') {
      return NextResponse.json(
        { error: 'Vui lòng nhập chính xác: "XÓA TÀI KHOẢN CỦA TÔI" để xác nhận.' },
        { status: 400 }
      );
    }

    // Verify password
    const userRows = await sql`SELECT password_hash FROM user_profiles WHERE id = ${userId}`;
    const user = (userRows as { password_hash: string }[])[0];
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const bcrypt = await import('bcryptjs');
    const isValid = await bcrypt.default.compare(password, user.password_hash);
    if (!isValid) {
      return NextResponse.json({ error: 'Mật khẩu không đúng.' }, { status: 401 });
    }

    // Check for active bookings that would be affected
    const activeBookings = await sql`
      SELECT id, booking_code, status FROM bookings
      WHERE user_id = ${userId} AND status IN ('pending', 'confirmed', 'checked_in')
    `;
    const active = activeBookings as { id: string; booking_code: string; status: string }[];
    if (active.length > 0) {
      return NextResponse.json(
        {
          error: 'Tài khoản có đặt chỗ đang hoạt động.',
          message: `Không thể xóa tài khoản khi có ${active.length} đặt chỗ đang hoạt động (pending/confirmed/checked_in). Vui lòng hủy hoặc hoàn tất các chuyến bay trước.`,
          activeBookings: active.map((b) => ({ id: b.id, code: b.booking_code, status: b.status })),
        },
        { status: 409 }
      );
    }

    // Check for pending refunds
    const pendingRefunds = await sql`
      SELECT id FROM refund_requests WHERE user_id = ${userId} AND status IN ('pending', 'approved')
    `;
    if ((pendingRefunds as { id: string }[]).length > 0) {
      return NextResponse.json(
        { error: 'Có yêu cầu hoàn tiền đang chờ xử lý. Vui lòng chờ hoàn tất.' },
        { status: 409 }
      );
    }

    // Check for wallet balance > 0
    const walletRows = await sql`SELECT balance FROM user_wallets WHERE user_id = ${userId}`;
    const wallet = (walletRows as { balance: number }[])[0];
    if (wallet && wallet.balance > 0) {
      return NextResponse.json(
        {
          error: 'Ví vẫn còn số dư.',
          message: `Số dư ví: ${wallet.balance.toLocaleString('vi-VN')}₫. Vui lòng rút toàn bộ số dư trước khi xóa tài khoản.`,
        },
        { status: 409 }
      );
    }

    // Check for active Movi credit
    const moviRows = await sql`
      SELECT id FROM movi_credit_applications
      WHERE user_id = ${userId} AND status IN ('pending', 'approved', 'active')
    `;
    if ((moviRows as { id: string }[]).length > 0) {
      return NextResponse.json(
        { error: 'Có khoản Movi đang hoạt động. Vui lòng đóng trước khi xóa tài khoản.' },
        { status: 409 }
      );
    }

    // Proceed with deletion - use existing deleteUser function
    await deleteUser(userId);

    // Audit log
    await writeAuditLog({
      adminId: userId,
      adminEmail: auth.email,
      action: 'gdpr_delete',
      targetType: 'user',
      targetId: userId,
      detailsJson: JSON.stringify({ reason: 'GDPR right to be forgotten' }),
      status: 'success',
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      message: 'Tài khoản đã được xóa hoàn toàn theo yêu cầu GDPR (Right to be Forgotten).',
    });
  } catch (error) {
    console.error('Error deleting GDPR account:', error);
    return NextResponse.json(
      { error: 'Không thể xóa tài khoản. Vui lòng thử lại.' },
      { status: 500 }
    );
  }
}
