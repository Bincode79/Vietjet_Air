/**
 * SMS Service - Stub implementation for development
 * Replace with actual SMS provider (Twilio, Vonage, etc.) in production
 */

export interface SmsOptions {
  to: string;
  code: string;
  expiresInMinutes?: number;
  purpose?: string;
}

export interface SmsResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Gửi SMS OTP
 * Trong development: chỉ log ra console
 * Trong production: tích hợp với Twilio/Vonage/Provider khác
 */
export async function sendOtpSms(opts: SmsOptions): Promise<SmsResult> {
  const { to, code, expiresInMinutes = 5, purpose = 'login' } = opts;

  // Development mode: log to console instead of sending real SMS
  if (process.env.NODE_ENV !== 'production') {
    console.log('[SMS-DEV]', {
      to,
      code,
      purpose,
      expiresInMinutes,
      message: `Mã OTP ${purpose}: ${code} (hết hạn sau ${expiresInMinutes} phút)`,
    });
    return { success: true, messageId: `dev-${Date.now()}` };
  }

  // Production: integrate with SMS provider
  // Example with Twilio:
  /*
  const twilio = require('twilio');
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  
  const message = await client.messages.create({
    body: `Ma OTP ${purpose}: ${code}. Het han sau ${expiresInMinutes} phut.`,
    from: process.env.TWILIO_PHONE_NUMBER,
    to: to.startsWith('0') ? `+84${to.slice(1)}` : to,
  });
  
  return { success: true, messageId: message.sid };
  */

  // Placeholder for other providers
  console.warn('[SMS] No SMS provider configured. SMS not sent.');
  return { success: false, error: 'SMS provider not configured' };
}

/**
 * Gửi SMS thông báo chung
 */
export async function sendNotificationSms(opts: {
  to: string;
  message: string;
}): Promise<SmsResult> {
  const { to, message } = opts;

  if (process.env.NODE_ENV !== 'production') {
    console.log('[SMS-DEV-NOTIFICATION]', { to, message });
    return { success: true, messageId: `dev-${Date.now()}` };
  }

  // Production implementation
  console.warn('[SMS] No SMS provider configured.');
  return { success: false, error: 'SMS provider not configured' };
}