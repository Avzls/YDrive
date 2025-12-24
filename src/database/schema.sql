-- ============================================
-- File Storage System - PostgreSQL Schema
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- USERS TABLE
-- ============================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    nip VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    avatar_url VARCHAR(500),
    storage_quota_bytes BIGINT DEFAULT 10737418240,
    storage_used_bytes BIGINT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    is_admin BOOLEAN DEFAULT false,
    last_login_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_nip ON users(nip);

-- ============================================
-- FOLDERS TABLE
-- ============================================
CREATE TABLE folders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    parent_id UUID REFERENCES folders(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    path VARCHAR(1000) NOT NULL,
    depth INTEGER DEFAULT 0,
    is_trashed BOOLEAN DEFAULT false,
    trashed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_folder_name_per_parent UNIQUE(parent_id, name, owner_id)
);

CREATE INDEX idx_folders_parent ON folders(parent_id);
CREATE INDEX idx_folders_owner ON folders(owner_id);
CREATE INDEX idx_folders_path ON folders(path);
CREATE INDEX idx_folders_trashed ON folders(is_trashed) WHERE is_trashed = true;

-- ============================================
-- FILES TABLE
-- ============================================
CREATE TABLE files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    folder_id UUID REFERENCES folders(id) ON DELETE SET NULL,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    current_version_id UUID,
    mime_type VARCHAR(100) NOT NULL,
    extension VARCHAR(20),
    storage_key VARCHAR(500) NOT NULL,
    size_bytes BIGINT NOT NULL,
    checksum_sha256 VARCHAR(64),
    status VARCHAR(50) DEFAULT 'uploading',
    scan_status VARCHAR(50) DEFAULT 'pending',
    processing_error TEXT,
    thumbnail_key VARCHAR(500),
    preview_key VARCHAR(500),
    has_preview BOOLEAN DEFAULT false,
    is_trashed BOOLEAN DEFAULT false,
    trashed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_file_name_per_folder UNIQUE(folder_id, name, owner_id)
);

CREATE INDEX idx_files_folder ON files(folder_id);
CREATE INDEX idx_files_owner ON files(owner_id);
CREATE INDEX idx_files_status ON files(status);
CREATE INDEX idx_files_trashed ON files(is_trashed) WHERE is_trashed = true;

-- ============================================
-- FILE VERSIONS TABLE
-- ============================================
CREATE TABLE file_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    storage_key VARCHAR(500) NOT NULL,
    size_bytes BIGINT NOT NULL,
    checksum_sha256 VARCHAR(64),
    thumbnail_key VARCHAR(500),
    preview_key VARCHAR(500),
    uploaded_by UUID NOT NULL REFERENCES users(id),
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_version_per_file UNIQUE(file_id, version_number)
);

CREATE INDEX idx_file_versions_file ON file_versions(file_id);

ALTER TABLE files 
ADD CONSTRAINT fk_current_version 
FOREIGN KEY (current_version_id) REFERENCES file_versions(id);

-- ============================================
-- PERMISSIONS TABLE
-- ============================================
CREATE TYPE permission_role AS ENUM ('owner', 'editor', 'viewer');

CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    folder_id UUID REFERENCES folders(id) ON DELETE CASCADE,
    file_id UUID REFERENCES files(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role permission_role NOT NULL,
    inherited_from UUID REFERENCES permissions(id) ON DELETE CASCADE,
    granted_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT either_folder_or_file CHECK (
        (folder_id IS NOT NULL AND file_id IS NULL) OR
        (folder_id IS NULL AND file_id IS NOT NULL)
    ),
    CONSTRAINT unique_user_folder_permission UNIQUE(user_id, folder_id),
    CONSTRAINT unique_user_file_permission UNIQUE(user_id, file_id)
);

CREATE INDEX idx_permissions_folder ON permissions(folder_id);
CREATE INDEX idx_permissions_file ON permissions(file_id);
CREATE INDEX idx_permissions_user ON permissions(user_id);

-- ============================================
-- SHARE LINKS TABLE
-- ============================================
CREATE TABLE share_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    folder_id UUID REFERENCES folders(id) ON DELETE CASCADE,
    file_id UUID REFERENCES files(id) ON DELETE CASCADE,
    token VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    allow_download BOOLEAN DEFAULT true,
    role permission_role DEFAULT 'viewer',
    expires_at TIMESTAMP,
    max_access_count INTEGER,
    access_count INTEGER DEFAULT 0,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT either_folder_or_file_share CHECK (
        (folder_id IS NOT NULL AND file_id IS NULL) OR
        (folder_id IS NULL AND file_id IS NOT NULL)
    )
);

CREATE INDEX idx_share_links_token ON share_links(token);
CREATE INDEX idx_share_links_folder ON share_links(folder_id);
CREATE INDEX idx_share_links_file ON share_links(file_id);

-- ============================================
-- AUDIT LOGS TABLE
-- ============================================
CREATE TYPE audit_action AS ENUM (
    'file.upload', 'file.download', 'file.view', 'file.delete', 'file.restore',
    'file.rename', 'file.move', 'file.share', 'file.unshare', 'file.version.create',
    'folder.create', 'folder.delete', 'folder.restore', 'folder.rename', 'folder.move',
    'folder.share', 'folder.unshare',
    'permission.grant', 'permission.revoke',
    'user.login', 'user.logout', 'user.create'
);

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    ip_address INET,
    user_agent TEXT,
    action audit_action NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID NOT NULL,
    resource_name VARCHAR(255),
    details JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);

-- ============================================
-- TAGS TABLE
-- ============================================
CREATE TABLE tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) NOT NULL,
    color VARCHAR(7) DEFAULT '#1a73e8',
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_tag_name_per_user UNIQUE(owner_id, name)
);

CREATE INDEX idx_tags_owner ON tags(owner_id);

-- ============================================
-- FILE TAGS JOIN TABLE
-- ============================================
CREATE TABLE file_tags (
    tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    PRIMARY KEY (tag_id, file_id)
);

CREATE INDEX idx_file_tags_tag ON file_tags(tag_id);
CREATE INDEX idx_file_tags_file ON file_tags(file_id);

-- ============================================
-- INSERT DEFAULT ADMIN USER
-- Password: alvin123 (bcrypt hash)
-- ============================================
INSERT INTO users (email, nip, password_hash, name, is_admin) VALUES (
    'alvin@company.local',
    '25129120',
    '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.n3ELEtxRvJvPGi',
    'Alvin',
    true
);
