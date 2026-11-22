import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/admin-auth';
import { auditAdmin } from '@/lib/admin-audit';
import { getAllAgencies, getAllUsers } from '@/lib/db';
import { sendFareAnnouncementEmail, type FareAnnouncementRouteItem } from '@/lib/mail';

interface SendFareDocBody {
  documentNo?: string;
  title?: string;
  effectiveDate?: string;
  routes?: FareAnnouncementRouteItem[];
  recipientsType?: 'agencies' | 'custom' | 'all';
  customEmails?: string[];
  note?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  try {
    const { error, response, payload } = await verifyAdminRequest(request, 'flight:price_edit');
    if (error) return response;

    const body = (await request.json()) as SendFareDocBody;
    const routes = Array.isArray(body?.routes) ? body.routes : [];

    if (routes.length === 0) {
      return NextResponse.json(
        {
          error: 'Bad Request',
          message: 'Danh sách biểu giá vé không được để trống (routes is required).',
        },
        { status: 400 }
      );
    }

    const recipientsType = body.recipientsType || 'agencies';
    const emailSet = new Set<string>();

    if (recipientsType === 'agencies' || recipientsType === 'all') {
      try {
        const { agencies } = await getAllAgencies({ limit: 100, activeOnly: true });
        for (const ag of agencies || []) {
          const email = ag.contact_email;
          if (email && EMAIL_REGEX.test(email.trim())) {
            emailSet.add(email.trim().toLowerCase());
          }
        }
      } catch (agencyErr) {
        console.warn('Lỗi lấy danh sách đại lý:', agencyErr);
      }
    }

    if (recipientsType === 'custom' || recipientsType === 'all' || emailSet.size === 0) {
      const customs = Array.isArray(body.customEmails) ? body.customEmails : [];
      for (const e of customs) {
        if (typeof e === 'string' && EMAIL_REGEX.test(e.trim())) {
          emailSet.add(e.trim().toLowerCase());
        }
      }
    }

    if (recipientsType === 'all') {
      try {
        const { users } = await getAllUsers(1, 50);
        for (const u of users || []) {
          if (u.email && EMAIL_REGEX.test(u.email.trim())) {
            emailSet.add(u.email.trim().toLowerCase());
          }
        }
      } catch (userErr) {
        console.warn('Lỗi lấy danh sách người dùng:', userErr);
      }
    }

    const recipientList = Array.from(emailSet);
    if (recipientList.length === 0) {
      return NextResponse.json(
        {
          error: 'Bad Request',
          message:
            'Không tìm thấy địa chỉ email người nhận hợp lệ. Vui lòng nhập địa chỉ email đối tác/đại lý.',
        },
        { status: 400 }
      );
    }

    const now = new Date();
    const defaultDocNo = `CV-VJC/${now.getFullYear()}/GVE-${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const docNo = body.documentNo?.trim() || defaultDocNo;
    const title = body.title?.trim() || 'THÔNG BÁO VỀ VIỆC ÁP DỤNG BIỂU GIÁ VÉ & CHÍNH SÁCH MỚI';
    const effectiveDate =
      body.effectiveDate?.trim() ||
      `Áp dụng từ ${now.toLocaleDateString('vi-VN')} cho đến khi có thông báo mới`;

    let sentCount = 0;
    let failedCount = 0;

    // Gửi email tuần tự hoặc theo batch
    for (const to of recipientList) {
      const ok = await sendFareAnnouncementEmail({
        to,
        documentNo: docNo,
        title,
        effectiveDate,
        routes,
        note: body.note,
      });

      if (ok) {
        sentCount++;
      } else {
        failedCount++;
      }
    }

    await auditAdmin(request, payload, {
      action: 'flight:send_fare_document',
      targetType: 'fare_document',
      targetId: docNo,
      details: {
        documentNo: docNo,
        title,
        recipientCount: recipientList.length,
        sentCount,
        failedCount,
        routesCount: routes.length,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Đã gửi văn bản thông báo giá vé (${docNo}) tới ${recipientList.length} địa chỉ người nhận.`,
      documentNo: docNo,
      sentCount,
      failedCount,
      recipients: recipientList,
    });
  } catch (error) {
    console.error('Lỗi gửi văn bản giá vé tự động:', error);
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Không thể gửi văn bản thông báo giá vé.',
      },
      { status: 500 }
    );
  }
}
