'use client';

import { useState, useEffect } from 'react';
import { X, Plus, Tag as TagIcon, Check, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Tag, tagsApi } from '@/lib/api';

// Preset colors for tags
const PRESET_COLORS = [
  '#1a73e8', // Blue
  '#34a853', // Green
  '#fbbc04', // Yellow
  '#ea4335', // Red
  '#9334e6', // Purple
  '#00bcd4', // Cyan
  '#ff6d00', // Orange
  '#607d8b', // Gray
  '#e91e63', // Pink
  '#795548', // Brown
];

interface TagsModalProps {
  fileId: string;
  fileName: string;
  onClose: () => void;
  onUpdate?: () => void;
}

export function TagsModal({ fileId, fileName, onClose, onUpdate }: TagsModalProps) {
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [fileTags, setFileTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(PRESET_COLORS[0]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadData();
  }, [fileId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [tags, fileTgs] = await Promise.all([
        tagsApi.list(),
        tagsApi.getFileTags(fileId),
      ]);
      setAllTags(tags);
      setFileTags(fileTgs);
    } catch (err) {
      console.error('Failed to load tags:', err);
      toast.error('Failed to load tags');
    } finally {
      setLoading(false);
    }
  };

  const toggleTag = async (tag: Tag) => {
    const isSelected = fileTags.some(t => t.id === tag.id);
    setSaving(true);
    try {
      if (isSelected) {
        await tagsApi.removeTagsFromFile(fileId, [tag.id]);
        setFileTags(prev => prev.filter(t => t.id !== tag.id));
      } else {
        await tagsApi.addTagsToFile(fileId, [tag.id]);
        setFileTags(prev => [...prev, tag]);
      }
      onUpdate?.();
    } catch (err) {
      console.error('Failed to update tags:', err);
      toast.error('Failed to update tags');
    } finally {
      setSaving(false);
    }
  };

  const createTag = async () => {
    if (!newTagName.trim()) return;
    setCreating(true);
    try {
      const tag = await tagsApi.create(newTagName.trim(), newTagColor);
      setAllTags(prev => [...prev, tag]);
      // Also add to file
      await tagsApi.addTagsToFile(fileId, [tag.id]);
      setFileTags(prev => [...prev, tag]);
      setNewTagName('');
      setShowCreate(false);
      toast.success(`Tag "${tag.name}" created`);
      onUpdate?.();
    } catch (err: any) {
      console.error('Failed to create tag:', err);
      toast.error(err.response?.data?.message || 'Failed to create tag');
    } finally {
      setCreating(false);
    }
  };

  const deleteTag = async (tag: Tag, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete tag "${tag.name}"? This will remove it from all files.`)) return;
    try {
      await tagsApi.delete(tag.id);
      setAllTags(prev => prev.filter(t => t.id !== tag.id));
      setFileTags(prev => prev.filter(t => t.id !== tag.id));
      toast.success(`Tag "${tag.name}" deleted`);
    } catch (err) {
      toast.error('Failed to delete tag');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <TagIcon className="w-5 h-5 text-gray-500" />
            <h2 className="text-lg font-semibold">Manage Tags</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-full"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          <p className="text-sm text-gray-500 mb-4">
            Tags for: <span className="font-medium text-gray-700">{fileName}</span>
          </p>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            </div>
          ) : (
            <>
              {/* Tag List */}
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {allTags.length === 0 ? (
                  <p className="text-center text-gray-400 py-4">No tags yet. Create one!</p>
                ) : (
                  allTags.map(tag => {
                    const isSelected = fileTags.some(t => t.id === tag.id);
                    return (
                      <div
                        key={tag.id}
                        onClick={() => toggleTag(tag)}
                        className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all ${
                          isSelected ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50 hover:bg-gray-100 border border-transparent'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className="w-4 h-4 rounded-full"
                            style={{ backgroundColor: tag.color }}
                          />
                          <span className="font-medium">{tag.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {isSelected && <Check className="w-4 h-4 text-blue-500" />}
                          <button
                            onClick={(e) => deleteTag(tag, e)}
                            className="p-1 hover:bg-red-100 rounded opacity-0 group-hover:opacity-100 hover:opacity-100"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-red-500" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Create Tag */}
              {showCreate ? (
                <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                  <input
                    type="text"
                    placeholder="Tag name"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg mb-3"
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && createTag()}
                  />
                  <div className="flex flex-wrap gap-2 mb-3">
                    {PRESET_COLORS.map(color => (
                      <button
                        key={color}
                        onClick={() => setNewTagColor(color)}
                        className={`w-6 h-6 rounded-full transition-all ${
                          newTagColor === color ? 'ring-2 ring-offset-2 ring-blue-500' : ''
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={createTag}
                      disabled={!newTagName.trim() || creating}
                      className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                      Create
                    </button>
                    <button
                      onClick={() => {
                        setShowCreate(false);
                        setNewTagName('');
                      }}
                      className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowCreate(true)}
                  className="w-full mt-4 flex items-center justify-center gap-2 p-3 text-blue-500 hover:bg-blue-50 rounded-lg border-2 border-dashed border-blue-200"
                >
                  <Plus className="w-4 h-4" />
                  Create New Tag
                </button>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end p-4 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
