-- Repair the old submission flow, which granted SELLER before KYC approval.
-- Preserve previously approved sellers, including those renewing their KYC.
WITH applicants AS MATERIALIZED (
  SELECT u.id
  FROM users u
  JOIN seller_profiles p ON p.user_id = u.id
  WHERE p.kyc_status IN ('PENDING', 'REJECTED')
    AND p.verified_at IS NULL
    AND u.role IN ('BUYER', 'SELLER')
    AND NOT EXISTS (
      SELECT 1 FROM kyc_applications a
      WHERE a.user_id = u.id AND a.status = 'VERIFIED'
    )
    AND NOT EXISTS (
      SELECT 1 FROM user_roles r
      WHERE r.user_id = u.id AND r.role_code NOT IN ('BUYER', 'SELLER')
    )
), restored_users AS (
  UPDATE users SET role = 'BUYER'
  WHERE id IN (SELECT id FROM applicants)
  RETURNING id
), restored_buyers AS (
  INSERT INTO user_roles (id, user_id, role_code, created_at)
  SELECT gen_random_uuid()::text, id, 'BUYER', CURRENT_TIMESTAMP
  FROM restored_users
  ON CONFLICT (user_id, role_code) DO NOTHING
)
DELETE FROM user_roles
WHERE user_id IN (SELECT id FROM applicants) AND role_code = 'SELLER';
