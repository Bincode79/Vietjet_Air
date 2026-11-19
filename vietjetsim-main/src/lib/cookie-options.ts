import { type NextRequest } from 'next/server';

/**
 * Determine whether a cookie should be set with the `Secure` flag.
 *
 * In production over HTTPS, `secure: true` is required to protect credentials.
 * However, if the site is accessed via plain HTTP (such as testing directly via
 * VPS IP address http://156.67.214.184), modern browsers strictly drop any Set-Cookie
 * that has the `Secure` attribute, causing all sessions, CSRF, and bookings to fail (403).
 *
 * This function detects if the actual request is HTTPS (via x-forwarded-proto or URL scheme).
 */
export function isSecureRequest(request?: Request | NextRequest): boolean {
  if (process.env.COOKIE_SECURE === 'false') return false;
  if (process.env.COOKIE_SECURE === 'true') return true;
  if (process.env.NODE_ENV !== 'production') return false;
  if (!request) return false;

  const forwardedProto = request.headers.get('x-forwarded-proto');
  if (forwardedProto) {
    return forwardedProto.split(',')[0].trim().toLowerCase() === 'https';
  }

  try {
    const url = new URL(request.url);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}
