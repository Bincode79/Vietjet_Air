-- Migration 053: quyền đặt lại mật khẩu người dùng cho admin.
--
-- Bối cảnh: tab Quản lý người dùng có thể sửa tên/email/phone/role/khoá,
-- nhưng KHÔNG đặt lại được mật khẩu — khách quên mật khẩu mà mất quyền truy
-- cập email thì support bó tay. Quyền mới `user:password_reset` lấp chỗ này.
--
-- Cấp cho:
--   * `admin` / `super_admin`: full (kèm check-in perms từ migration 052 để
--     replay độc lập vẫn đủ bộ — `ON CONFLICT DO NOTHING` nên chạy lại an toàn).
--   * `admin_ops` / `admin_support`: reset mật khẩu + xem user (support cần
--     làm giúp khách qua điện thoại/chat).
--
-- API `PATCH /api/quan-tri/nguoi-dung/[id]/dat-lai-mat-khau` enforce quyền này
-- qua `verifyAdminRequest(request, 'user:password_reset')`.

-- admin: full user-management + check-in (gộp 052 để replay độc lập đủ bộ).
INSERT INTO role_permissions (role_name, permission)
SELECT 'admin', unnest(ARRAY[
  'user:password_reset',
  'checkin:list', 'checkin:view', 'checkin:cancel'
])
ON CONFLICT (role_name, permission) DO NOTHING;

-- super_admin: mirror admin (enforcement bypass bảng này, nhưng console RBAC đọc từ đây).
INSERT INTO role_permissions (role_name, permission)
SELECT 'super_admin', unnest(ARRAY[
  'user:password_reset',
  'checkin:list', 'checkin:view', 'checkin:cancel'
])
ON CONFLICT (role_name, permission) DO NOTHING;

-- admin_ops / admin_support: xem user + reset mật khẩu + xem check-in.
INSERT INTO role_permissions (role_name, permission)
SELECT r.role_name, unnest(ARRAY[
  'user:password_reset',
  'checkin:list', 'checkin:view'
])
FROM (VALUES ('admin_ops'), ('admin_support')) AS r(role_name)
ON CONFLICT (role_name, permission) DO NOTHING;
