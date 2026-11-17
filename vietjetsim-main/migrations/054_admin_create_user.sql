-- Migration 054: cho phép admin_ops / admin_support tạo tài khoản hội viên.
--
-- Bối cảnh: nút "Tạo tài khoản hội viên" gọi POST /api/quan-tri/nguoi-dung
-- với quyền 'user:create', nhưng migration 019 chỉ cấp cho admin/super_admin —
-- support nhận yêu cầu qua phone/chat vẫn phải nhờ admin. Cấp thêm cho 2 role
-- vận hành; API vẫn chặn tạo vượt cấp qua canManageRole (level 1 chỉ tạo
-- được user, không tạo được admin khác/super_admin).
INSERT INTO role_permissions (role_name, permission)
SELECT r.role_name, 'user:create'::text
FROM (VALUES ('admin_ops'), ('admin_support')) AS r(role_name)
ON CONFLICT (role_name, permission) DO NOTHING;
