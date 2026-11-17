import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthRequest, comparePassword, hashPassword, validatePassword } from '@/lib/auth';
import { findUserById, updateUserPassword } from '@/lib/db';

// ─── POST: Đổi mật khẩu của chính mình ──────────────────────────────────────
//
// Bối cảnh: form "Đổi mật khẩu" trong ProfileTab trước đây chỉ `setTimeout`
// rồi báo thành công — không gọi API nào, mật khẩu trong DB không đổi.
// Route này làm thật: verify mật khẩu hiện tại → validate policy chung →
// hash + ghi DB.
//
// Body: { currentPassword, newPassword }

export async function POST(request: NextRequest) {
  try {
    const { user: auth, error, response } = await verifyAuthRequest(request);
    if (error || !auth) return response!;

    const body = await request.json().catch(() => null);
    const currentPassword = String(body?.currentPassword ?? '');
    const newPassword = String(body?.newPassword ?? '');

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Thiếu mật khẩu hiện tại hoặc mật khẩu mới.' },
        { status: 400 }
      );
    }

    if (currentPassword === newPassword) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Mật khẩu mới phải khác mật khẩu hiện tại.' },
        { status: 400 }
      );
    }

    const validation = validatePassword(newPassword);
    if (!validation.valid) {
      return NextResponse.json(
        { error: 'Bad Request', message: validation.errors.join('; ') },
        { status: 400 }
      );
    }

    const user = await findUserById(auth.userId);
    if (!user) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Không tìm thấy tài khoản.' },
        { status: 404 }
      );
    }

    const matches = await comparePassword(currentPassword, user.password_hash);
    if (!matches) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Mật khẩu hiện tại không đúng.' },
        { status: 401 }
      );
    }

    await updateUserPassword(auth.userId, await hashPassword(newPassword));

    return NextResponse.json({
      success: true,
      message: 'Đổi mật khẩu thành công.',
    });
  } catch (err) {
    console.error('Error in POST /api/nguoi-dung/doi-mat-khau:', err);
    return NextResponse.json(
      { error: 'Internal server error', message: 'Không đổi được mật khẩu. Vui lòng thử lại.' },
      { status: 500 }
    );
  }
}
