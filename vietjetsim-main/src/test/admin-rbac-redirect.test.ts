import { describe, it, expect } from 'vitest';
import { isPublicRoute, isPublicApiRoute } from '@/lib/route-access';
import { isAdminRole, roleLevel } from '@/lib/roles';

/**
 * Kịch bản kiểm tra phân quyền RBAC và redirect route bảo mật.
 *
 * Các bài kiểm tra này chạy ở mức đơn vị (unit level) — không cần trình duyệt
 * hay database. Chúng xác minh:
 *   1. Route `/quan-tri/*` và `/tai-khoan` KHÔNG phải public route.
 *   2. API `/api/quan-tri/*` KHÔNG phải public API route.
 *   3. Helper `isAdminRole` nhận diện đúng role admin.
 *   4. Helper `roleLevel` enforce đúng cấp phân quyền (admin > user).
 */

describe('admin RBAC and protected-route redirect', () => {
  describe('isPublicRoute — protected routes must NOT be public', () => {
    const protectedRoutes = [
      '/tai-khoan',
      '/quan-tri',
      '/quan-tri/dashboard/summary',
      '/quan-tri/nguoi-dung',
      '/quan-tri/chuyen-bay',
      '/quan-tri/ma-giam-gia',
      '/quan-tri/hoan-tien',
      '/quan-tri/don-hang',
      '/quan-tri/cai-dat',
      '/quan-tri/phan-quyen',
      '/quan-tri/bao-cao/doanh-thu',
      '/editor',
    ];

    for (const route of protectedRoutes) {
      it(`blocks anonymous access to ${route}`, () => {
        expect(isPublicRoute(route)).toBe(false);
      });
    }
  });

  describe('isPublicApiRoute — admin API routes must NOT be public', () => {
    const protectedApiRoutes = [
      '/api/quan-tri/nguoi-dung',
      '/api/quan-tri/chuyen-bay',
      '/api/quan-tri/ma-giam-gia',
      '/api/quan-tri/hoan-tien',
      '/api/quan-tri/don-hang',
      '/api/quan-tri/cai-dat',
      '/api/quan-tri/phan-quyen',
      '/api/quan-tri/bao-cao/doanh-thu',
      '/api/quan-tri/dashboard/summary',
    ];

    for (const route of protectedApiRoutes) {
      it(`blocks anonymous access to ${route}`, () => {
        expect(isPublicApiRoute(route)).toBe(false);
      });
    }
  });

  describe('isAdminRole — role classification', () => {
    it('returns true for admin role', () => {
      expect(isAdminRole('admin')).toBe(true);
    });

    it('returns false for user role', () => {
      expect(isAdminRole('user')).toBe(false);
    });

    it('returns false for undefined role', () => {
      expect(isAdminRole(undefined)).toBe(false);
    });
  });

  describe('roleLevel — permission hierarchy', () => {
    it('admin has higher level than user', () => {
      expect(roleLevel('admin')).toBeGreaterThan(roleLevel('user'));
    });

    it('user has base level', () => {
      expect(roleLevel('user')).toBe(0);
    });

    it('admin has elevated level', () => {
      expect(roleLevel('admin')).toBeGreaterThan(0);
    });
  });
});
