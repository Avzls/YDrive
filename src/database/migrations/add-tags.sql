-- Migration: Add Tags Feature
-- Run this on existing database to add tags support

-- Create tags table
CREATE TABLE IF NOT EXISTS tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(50) NOT NULL,
    color VARCHAR(7) DEFAULT '#1a73e8',
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_tag_name_per_user UNIQUE(owner_id, name)
);

CREATE INDEX IF NOT EXISTS idx_tags_owner ON tags(owner_id);

-- Create file_tags join table
CREATE TABLE IF NOT EXISTS file_tags (
    tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    PRIMARY KEY (tag_id, file_id)
);

CREATE INDEX IF NOT EXISTS idx_file_tags_tag ON file_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_file_tags_file ON file_tags(file_id);

-- Done!
SELECT 'Tags tables created successfully' AS status;
