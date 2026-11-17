-- 052_checkin_admin_permissions.sql
--
-- Bổ sung quyền quản lý check-in cho admin.
-- Admin có sẵn full-access qua seed 019 nên INSERT chỉ cần cho các role
-- chuyên trách (ops/support); admin/super_admin đã có mọi quyền qua
-- PERMISSION_CATEGORIES nên không cần seed tường minh — nhưng seed ở đây
-- giữ DB đồng bộ với UI RBAC matrix.

INSERT INTO role_permissions (role_name, permission)
SELECT 'admin', unnest(ARRAY['checkin:list', 'checkin:view', 'checkin:cancel'])
ON CONFLICT (role_name, permission) DO NOTHING;

INSERT INTO role_permissions (role_name, permission)
SELECT 'super_admin', unnest(ARRAY['checkin:list', 'checkin:view', 'checkin:cancel'])
ON CONFLICT (role_name, permission) DO NOTHING;

INSERT INTO role_permissions (role_name, permission)
SELECT 'admin_ops', unnest(ARRAY['checkin:list', 'checkin:view'])
ON CONFLICT (role_name, permission) DO NOTHING;

INSERT INTO role_permissions (role_name, permission)
SELECT 'admin_support', unnest(ARRAY['checkin:list', 'checkin:view'])
ON CONFLICT (role_name, permission) DO NOTHING;
