-- Seeder: Demo Users
-- Run this to create demo users for testing
-- All passwords: admin123 (same for simplicity)

-- Admin: NIP 00000001, Password: admin123
INSERT INTO users (id, nip, email, name, password_hash, is_active, is_admin, created_at, updated_at)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  '00000001',
  'admin@ydrive.local',
  'Administrator',
  '$2b$10$5CaZkucFFlDpRkMS8cQsB.SiddY.x8fS/4Ky20Q8wGn4ijNEaxPQK',
  true,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
) ON CONFLICT (nip) DO UPDATE SET 
  password_hash = EXCLUDED.password_hash,
  name = EXCLUDED.name,
  is_admin = EXCLUDED.is_admin,
  updated_at = CURRENT_TIMESTAMP;

-- User 1: NIP 00000002, Password: admin123
INSERT INTO users (id, nip, email, name, password_hash, is_active, is_admin, created_at, updated_at)
VALUES (
  'a0000000-0000-0000-0000-000000000002',
  '00000002',
  'user1@ydrive.local',
  'User Satu',
  '$2b$10$5CaZkucFFlDpRkMS8cQsB.SiddY.x8fS/4Ky20Q8wGn4ijNEaxPQK',
  true,
  false,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
) ON CONFLICT (nip) DO UPDATE SET 
  password_hash = EXCLUDED.password_hash,
  name = EXCLUDED.name,
  is_admin = EXCLUDED.is_admin,
  updated_at = CURRENT_TIMESTAMP;

-- User 2: NIP 00000003, Password: admin123
INSERT INTO users (id, nip, email, name, password_hash, is_active, is_admin, created_at, updated_at)
VALUES (
  'a0000000-0000-0000-0000-000000000003',
  '00000003',
  'user2@ydrive.local',
  'User Dua',
  '$2b$10$5CaZkucFFlDpRkMS8cQsB.SiddY.x8fS/4Ky20Q8wGn4ijNEaxPQK',
  true,
  false,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
) ON CONFLICT (nip) DO UPDATE SET 
  password_hash = EXCLUDED.password_hash,
  name = EXCLUDED.name,
  is_admin = EXCLUDED.is_admin,
  updated_at = CURRENT_TIMESTAMP;

SELECT 'Demo users seeded/updated successfully' AS status;
