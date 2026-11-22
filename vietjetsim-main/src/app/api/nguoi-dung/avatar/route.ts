import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthRequest } from '@/lib/auth';
import { validateCsrfOrReject } from '@/lib/csrf';
import { rateLimit } from '@/lib/rate-limit';
import { sql } from '@/lib/neon';
import { writeAuditLog } from '@/lib/db';
import { randomUUID } from 'crypto';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const UPLOAD_DIR = process.env.UPLOAD_DIR || './public/uploads/avatars';

// Ensure upload directory exists
async function ensureUploadDir() {
  const fs = await import('fs/promises');
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
}

export async function POST(request: NextRequest) {
  try {
    const csrfError = await validateCsrfOrReject(request);
    if (csrfError) return csrfError;

    const limited = rateLimit(request, { windowMs: 60_000, maxRequests: 10 });
    if (limited) return limited;

    const { user: auth, error, response } = await verifyAuthRequest(request);
    if (error || !auth) return response!;

    const formData = await request.formData();
    const file = formData.get('avatar') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'Không có file được tải lên.' }, { status: 400 });
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Định dạng file không được hỗ trợ. Chỉ chấp nhận JPEG, PNG, WebP.' },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File quá lớn. Kích thước tối đa 5MB.' }, { status: 400 });
    }

    await ensureUploadDir();

    // Generate unique filename
    const ext = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : 'webp';
    const filename = `${auth.userId}_${Date.now()}_${randomUUID().slice(0, 8)}.${ext}`;
    const filepath = `${UPLOAD_DIR}/${filename}`;

    // Save file
    const fs = await import('fs/promises');
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(filepath, buffer);

    // Generate public URL
    const avatarUrl = `/uploads/avatars/${filename}`;

    // Delete old avatar if exists
    const oldAvatar = await sql`
      SELECT avatar_url FROM user_profiles WHERE id = ${auth.userId}
    `;
    const oldUrl = (oldAvatar as { avatar_url: string | null }[])[0]?.avatar_url;
    if (oldUrl && oldUrl.startsWith('/uploads/avatars/')) {
      const fs = await import('fs/promises');
      const oldPath = `./public${oldUrl}`;
      await fs.unlink(oldPath).catch(() => {}); // Ignore if not exists
    }

    // Update database
    await sql`
      UPDATE user_profiles
      SET avatar_url = ${avatarUrl}, updated_at = NOW()
      WHERE id = ${auth.userId}
    `;

    // Audit log
    await writeAuditLog({
      adminId: auth.userId,
      adminEmail: auth.email,
      action: 'update_avatar',
      targetType: 'user',
      targetId: auth.userId,
      detailsJson: JSON.stringify({ filename, size: file.size, type: file.type }),
      status: 'success',
    }).catch((err) => console.error('[AVATAR-UPLOAD-AUDIT] error:', err));

    return NextResponse.json({
      success: true,
      message: 'Tải lên avatar thành công.',
      avatarUrl,
    });
  } catch (error) {
    console.error('Error uploading avatar:', error);
    return NextResponse.json({ error: 'Đã xảy ra lỗi khi tải lên avatar.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const csrfError = await validateCsrfOrReject(request);
    if (csrfError) return csrfError;

    const { user: auth, error, response } = await verifyAuthRequest(request);
    if (error || !auth) return response!;

    // Get current avatar
    const current = await sql`
      SELECT avatar_url FROM user_profiles WHERE id = ${auth.userId}
    `;
    const avatarUrl = (current as { avatar_url: string | null }[])[0]?.avatar_url;

    if (!avatarUrl) {
      return NextResponse.json({ error: 'Không có avatar để xóa.' }, { status: 404 });
    }

    // Delete file if local upload
    if (avatarUrl.startsWith('/uploads/avatars/')) {
      const fs = await import('fs/promises');
      const filepath = `./public${avatarUrl}`;
      await fs.unlink(filepath).catch(() => {});
    }

    // Update database
    await sql`
      UPDATE user_profiles
      SET avatar_url = NULL, updated_at = NOW()
      WHERE id = ${auth.userId}
    `;

    // Audit log
    await writeAuditLog({
      adminId: auth.userId,
      adminEmail: auth.email,
      action: 'delete_avatar',
      targetType: 'user',
      targetId: auth.userId,
      detailsJson: JSON.stringify({ previousUrl: avatarUrl }),
      status: 'success',
    }).catch((err) => console.error('[AVATAR-DELETE-AUDIT] error:', err));

    return NextResponse.json({
      success: true,
      message: 'Đã xóa avatar.',
    });
  } catch (error) {
    console.error('Error deleting avatar:', error);
    return NextResponse.json({ error: 'Đã xảy ra lỗi khi xóa avatar.' }, { status: 500 });
  }
}
