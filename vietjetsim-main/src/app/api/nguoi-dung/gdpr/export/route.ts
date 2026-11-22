import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthRequest } from '@/lib/auth';
import { validateCsrfOrReject } from '@/lib/csrf';
import { rateLimit } from '@/lib/rate-limit';
import { sql } from '@/lib/neon';
import { writeAuditLog } from '@/lib/db';
import JSZip from 'jszip';

export async function POST(request: NextRequest) {
  try {
    const csrfError = await validateCsrfOrReject(request);
    if (csrfError) return csrfError;

    const limited = rateLimit(request, { windowMs: 60_000, maxRequests: 3 });
    if (limited) return limited;

    const { user: auth, error, response } = await verifyAuthRequest(request);
    if (error || !auth) return response!;

    const body = await request.json().catch(() => ({}));
    const format = body?.format || 'json'; // 'json' | 'zip'
    const includeSensitive = body?.includeSensitive === true; // include password hash, etc.

    const userId = auth.userId;

    // Fetch all user data
    const [
      profileRows,
      bookingRows,
      paymentRows,
      sessionRows,
      walletRows,
      loyaltyRows,
      loyaltyTxnRows,
      chatRows,
      messageRows,
      checkinRows,
      refundRows,
      notificationRows,
      passengerRows,
      discountUsageRows,
    ] = await Promise.all([
      sql`SELECT * FROM user_profiles WHERE id = ${userId}`,
      sql`SELECT * FROM bookings WHERE user_id = ${userId} ORDER BY created_at DESC`,
      sql`SELECT * FROM payments WHERE user_id = ${userId} ORDER BY created_at DESC`,
      sql`SELECT id, device_name, device_type, browser, os, ip_address, last_active, is_current, created_at FROM user_sessions WHERE user_id = ${userId} ORDER BY last_active DESC`,
      sql`SELECT * FROM user_wallets WHERE user_id = ${userId}`,
      sql`SELECT * FROM user_loyalty WHERE user_id = ${userId}`,
      sql`SELECT * FROM loyalty_transactions WHERE user_id = ${userId} ORDER BY created_at DESC`,
      sql`SELECT * FROM chat_conversations WHERE user_id = ${userId} ORDER BY updated_at DESC`,
      sql`SELECT * FROM chat_messages WHERE conversation_id IN (SELECT id FROM chat_conversations WHERE user_id = ${userId}) ORDER BY created_at DESC`,
      sql`SELECT * FROM check_in WHERE user_id = ${userId} ORDER BY created_at DESC`,
      sql`SELECT * FROM refund_requests WHERE user_id = ${userId} ORDER BY created_at DESC`,
      sql`SELECT * FROM notifications WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT 100`,
      sql`SELECT * FROM passengers WHERE booking_id IN (SELECT id FROM bookings WHERE user_id = ${userId})`,
      sql`SELECT du.*, dc.code as discount_code FROM discount_usage du JOIN discount_codes dc ON du.discount_code_id = dc.id WHERE du.user_id = ${userId} ORDER BY du.used_at DESC`,
    ]);

    const profile = profileRows[0] as Record<string, unknown>;
    if (!profile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Build export data
    const exportData = {
      exportInfo: {
        exportedAt: new Date().toISOString(),
        exportedBy: 'user',
        userId,
        version: '1.0',
        format: 'gdpr-export-v1',
      },
      profile: {
        id: profile.id,
        email: profile.email,
        full_name: profile.full_name,
        phone: profile.phone,
        role: profile.role,
        status: profile.status,
        email_verified: profile.email_verified,
        phone_verified: profile.phone_verified,
        skyjoy_member_id: profile.skyjoy_member_id,
        date_of_birth: profile.dob,
        gender: profile.gender,
        address: profile.address,
        city: profile.city,
        country: profile.country,
        preferred_language: profile.preferred_language,
        avatar_url: profile.avatar_url,
        created_at: profile.created_at,
        updated_at: profile.updated_at,
        last_login: profile.last_login,
        locked_until: profile.locked_until,
        operator_notes: profile.operator_notes,
        ...(includeSensitive && { password_hash: profile.password_hash }),
      },
      bookings: (bookingRows as Record<string, unknown>[]).map((b) => ({
        id: b.id,
        booking_code: b.booking_code,
        flight_id: b.flight_id,
        status: b.status,
        total_price: b.total_price,
        discount_code_id: b.discount_code_id,
        discount_amount: b.discount_amount,
        receipt_image: b.receipt_image,
        transfer_note: b.transfer_note,
        trip_id: b.trip_id,
        leg_role: b.leg_role,
        hold_expires_at: b.hold_expires_at,
        hold_method: b.hold_method,
        created_at: b.created_at,
        updated_at: b.updated_at,
      })),
      payments: (paymentRows as Record<string, unknown>[]).map((p) => ({
        id: p.id,
        booking_id: p.booking_id,
        amount: p.amount,
        currency: p.currency,
        method: p.method,
        status: p.status,
        receipt_image: p.receipt_image,
        transfer_note: p.transfer_note,
        bank_account_id: p.bank_account_id,
        vietqr_transaction_id: p.vietqr_transaction_id,
        created_at: p.created_at,
        updated_at: p.updated_at,
      })),
      sessions: (sessionRows as Record<string, unknown>[]).map((s) => ({
        id: s.id,
        device_name: s.device_name,
        device_type: s.device_type,
        browser: s.browser,
        os: s.os,
        ip_address: s.ip_address,
        last_active: s.last_active,
        is_current: s.is_current,
        created_at: s.created_at,
      })),
      wallet: (walletRows as Record<string, unknown>[]).map((w) => ({
        id: w.id,
        balance: w.balance,
        currency: w.currency,
        account_number: w.account_number,
        created_at: w.created_at,
        updated_at: w.updated_at,
      })),
      loyalty: (loyaltyRows as Record<string, unknown>[]).map((l) => ({
        id: l.id,
        program_id: l.program_id,
        tier: l.tier,
        current_points: l.available_points,
        total_points: l.total_points,
        lifetime_points: l.lifetime_points,
        enrolled_at: l.enrolled_at,
        tier_qualified_at: l.tier_qualified_at,
      })),
      loyaltyTransactions: (loyaltyTxnRows as Record<string, unknown>[]).map((t) => ({
        id: t.id,
        transaction_type: t.transaction_type,
        points: t.points,
        description: t.description,
        booking_id: t.booking_id,
        payment_id: t.payment_id,
        created_at: t.created_at,
      })),
      chatConversations: (chatRows as Record<string, unknown>[]).map((c) => ({
        id: c.id,
        status: c.status,
        last_message: c.last_message,
        unread_by_user: c.unread_by_user,
        unread_by_admin: c.unread_by_admin,
        created_at: c.created_at,
        updated_at: c.updated_at,
      })),
      chatMessages: (messageRows as Record<string, unknown>[]).map((m) => ({
        id: m.id,
        conversation_id: m.conversation_id,
        sender_type: m.sender_type,
        sender_id: m.sender_id,
        message: m.message,
        message_type: m.message_type,
        is_read: m.is_read,
        read_at: m.read_at,
        created_at: m.created_at,
      })),
      checkIns: (checkinRows as Record<string, unknown>[]).map((c) => ({
        id: c.id,
        booking_id: c.booking_id,
        passenger_id: c.passenger_id,
        passenger_name: c.passenger_name,
        seat_number: c.seat_number,
        check_in_number: c.check_in_number,
        boarding_pass_number: c.boarding_pass_number,
        gate: c.gate,
        terminal: c.terminal,
        check_in_time: c.check_in_time,
        status: c.status,
        created_at: c.created_at,
      })),
      refunds: (refundRows as Record<string, unknown>[]).map((r) => ({
        id: r.id,
        booking_id: r.booking_id,
        reason: r.reason,
        amount: r.amount,
        status: r.status,
        admin_note: r.admin_note,
        bank_info: r.bank_info,
        created_at: r.created_at,
        updated_at: r.updated_at,
      })),
      notifications: (notificationRows as Record<string, unknown>[]).map((n) => ({
        id: n.id,
        title: n.title,
        message: n.message,
        type: n.type,
        is_read: n.is_read,
        read_at: n.read_at,
        created_at: n.created_at,
      })),
      passengers: (passengerRows as Record<string, unknown>[]).map((p) => ({
        id: p.id,
        booking_id: p.booking_id,
        full_name: p.full_name,
        date_of_birth: p.dob,
        gender: p.gender,
        phone: p.phone,
        email: p.email,
        seat_number: p.seat_number,
        seat_charge: p.seat_charge,
        baggage_charge: p.baggage_charge,
        meal_charge: p.meal_charge,
        insurance_charge: p.insurance_charge,
        special_assistance: p.special_assistance,
        created_at: p.created_at,
      })),
      discountUsage: (discountUsageRows as Record<string, unknown>[]).map((d) => ({
        id: d.id,
        discount_code: d.discount_code,
        discount_type: d.discount_type,
        discount_value: d.discount_value,
        booking_id: d.booking_id,
        used_at: d.used_at,
      })),
    };

    // Audit log
    await writeAuditLog({
      adminId: userId,
      adminEmail: (profile.email as string) || '',
      action: 'gdpr_export',
      targetType: 'user',
      targetId: userId,
      detailsJson: JSON.stringify({ format, includeSensitive }),
      status: 'success',
    }).catch(() => {});

    if (format === 'zip') {
      const zip = new JSZip();
      zip.file('export-info.json', JSON.stringify(exportData.exportInfo, null, 2));
      zip.file('profile.json', JSON.stringify(exportData.profile, null, 2));
      zip.file('bookings.json', JSON.stringify(exportData.bookings, null, 2));
      zip.file('payments.json', JSON.stringify(exportData.payments, null, 2));
      zip.file('sessions.json', JSON.stringify(exportData.sessions, null, 2));
      zip.file('wallet.json', JSON.stringify(exportData.wallet, null, 2));
      zip.file('loyalty.json', JSON.stringify(exportData.loyalty, null, 2));
      zip.file(
        'loyalty-transactions.json',
        JSON.stringify(exportData.loyaltyTransactions, null, 2)
      );
      zip.file('chat-conversations.json', JSON.stringify(exportData.chatConversations, null, 2));
      zip.file('chat-messages.json', JSON.stringify(exportData.chatMessages, null, 2));
      zip.file('check-ins.json', JSON.stringify(exportData.checkIns, null, 2));
      zip.file('refunds.json', JSON.stringify(exportData.refunds, null, 2));
      zip.file('notifications.json', JSON.stringify(exportData.notifications, null, 2));
      zip.file('passengers.json', JSON.stringify(exportData.passengers, null, 2));
      zip.file('discount-usage.json', JSON.stringify(exportData.discountUsage, null, 2));

      const zipBuffer = await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });

      return new NextResponse(new Uint8Array(zipBuffer), {
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="gdpr-export-${userId}-${new Date().toISOString().slice(0, 10)}.zip"`,
        },
      });
    }

    // JSON format
    return NextResponse.json(exportData, {
      headers: {
        'Content-Disposition': `attachment; filename="gdpr-export-${userId}-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (error) {
    console.error('Error exporting GDPR data:', error);
    return NextResponse.json({ error: 'Không thể xuất dữ liệu GDPR.' }, { status: 500 });
  }
}
