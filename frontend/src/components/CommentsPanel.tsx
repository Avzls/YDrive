'use client';

import { useState, useEffect } from 'react';
import { MessageSquare, Send, Loader2, Trash2, Pencil, Check, XCircle, History } from 'lucide-react';
import { toast } from 'sonner';
import { Comment, commentsApi, filesApi } from '@/lib/api';
import { format } from 'date-fns';

interface CommentsPanelProps {
  fileId: string;
  fileName?: string;
  onVersionClick?: (versionId: string, versionNumber: number) => void;
  selectedVersionId?: string | null;
}

interface FileVersion {
  id: string;
  versionNumber: number;
  sizeBytes: number;
  createdAt: string;
  comment?: string;
  uploadedBy?: {
    id: string;
    name: string;
    email: string;
  };
}

export function CommentsPanel({ fileId, fileName, onVersionClick, selectedVersionId }: CommentsPanelProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [versions, setVersions] = useState<FileVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [versionsLoading, setVersionsLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  useEffect(() => {
    loadComments();
    loadVersions();
  }, [fileId]);

  const loadComments = async () => {
    setLoading(true);
    try {
      const data = await commentsApi.list(fileId);
      setComments(data);
    } catch (err) {
      console.error('Failed to load comments:', err);
      toast.error('Failed to load comments');
    } finally {
      setLoading(false);
    }
  };

  const loadVersions = async () => {
    setVersionsLoading(true);
    try {
      const data = await filesApi.listVersions(fileId);
      setVersions(data);
    } catch (err) {
      console.error('Failed to load versions:', err);
    } finally {
      setVersionsLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!newComment.trim()) return;
    setSubmitting(true);
    try {
      const comment = await commentsApi.create(fileId, newComment.trim());
      setComments([comment, ...comments]);
      setNewComment('');
      toast.success('Comment added');
    } catch (err) {
      console.error('Failed to add comment:', err);
      toast.error('Failed to add comment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (commentId: string) => {
    if (!editContent.trim()) return;
    try {
      const updated = await commentsApi.update(fileId, commentId, editContent.trim());
      setComments(comments.map(c => c.id === commentId ? updated : c));
      setEditingId(null);
      toast.success('Comment updated');
    } catch (err) {
      console.error('Failed to update comment:', err);
      toast.error('Failed to update comment');
    }
  };

  const handleDelete = async (commentId: string) => {
    if (!confirm('Delete this comment?')) return;
    try {
      await commentsApi.delete(fileId, commentId);
      setComments(comments.filter(c => c.id !== commentId));
      toast.success('Comment deleted');
    } catch (err) {
      console.error('Failed to delete comment:', err);
      toast.error('Failed to delete comment');
    }
  };

  const startEdit = (comment: Comment) => {
    setEditingId(comment.id);
    setEditContent(comment.content);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditContent('');
  };

  // Show all versions (sorted newest first)

  return (
    <div className="flex flex-col h-full bg-slate-900/95 border-l border-slate-700">
      {/* Version History Section */}
      {versions.length > 0 && (
        <>
          <div className="flex items-center gap-2 p-4 border-b border-slate-700 flex-shrink-0">
            <History className="w-5 h-5 text-purple-400" />
            <h3 className="text-white font-medium">Version History</h3>
            <span className="text-slate-400 text-sm">({versions.length})</span>
          </div>
          <div className="max-h-[200px] overflow-y-auto border-b border-slate-700">
            {versionsLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-purple-400" />
              </div>
            ) : (
              <div className="p-3 space-y-2">
                {versions.map((version, index) => (
                  <div 
                    key={version.id} 
                    onClick={() => onVersionClick?.(version.id, version.versionNumber)}
                    className={`rounded-lg p-2.5 border transition-all ${
                      selectedVersionId === version.id 
                        ? 'bg-purple-500/30 border-purple-400 ring-1 ring-purple-400' 
                        : onVersionClick 
                          ? 'bg-purple-500/10 border-purple-500/20 hover:bg-purple-500/20 cursor-pointer' 
                          : 'bg-purple-500/10 border-purple-500/20'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold text-purple-400">
                        v{version.versionNumber}
                      </span>
                      {index === 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-purple-500 text-white rounded">Current</span>
                      )}
                      <span className="text-xs text-slate-500">
                        {format(new Date(version.createdAt), 'MMM d, yyyy')}
                      </span>
                    </div>
                    {version.comment && (
                      <p className="text-sm text-slate-300">{version.comment}</p>
                    )}
                    {version.uploadedBy && (
                      <p className="text-xs text-slate-500 mt-1">
                        by {version.uploadedBy.name || version.uploadedBy.email}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Comments Header */}
      <div className="flex items-center gap-2 p-4 border-b border-slate-700 flex-shrink-0">
        <MessageSquare className="w-5 h-5 text-blue-400" />
        <h3 className="text-white font-medium">Comments</h3>
        <span className="text-slate-400 text-sm">({comments.length})</span>
      </div>

      {/* Comments list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
          </div>
        ) : comments.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No comments yet</p>
            <p className="text-xs">Be the first to comment!</p>
          </div>
        ) : (
          comments.map(comment => (
            <div key={comment.id} className="bg-slate-800/80 rounded-lg p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm text-white">
                      {comment.user?.name || 'Unknown'}
                    </span>
                    <span className="text-xs text-slate-500">
                      {format(new Date(comment.createdAt), 'MMM d, HH:mm')}
                    </span>
                  </div>
                  
                  {editingId === comment.id ? (
                    <div className="space-y-2">
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-white resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                        rows={4}
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleUpdate(comment.id)}
                          className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 flex items-center gap-1"
                        >
                          <Check className="w-3 h-3" /> Save
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="px-3 py-1 bg-slate-600 text-white rounded text-sm hover:bg-slate-500 flex items-center gap-1"
                        >
                          <XCircle className="w-3 h-3" /> Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-300 whitespace-pre-wrap break-words">
                      {comment.content}
                    </p>
                  )}
                </div>
                
                {editingId !== comment.id && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => startEdit(comment)}
                      className="p-1 hover:bg-slate-700 rounded"
                      title="Edit"
                    >
                      <Pencil className="w-3.5 h-3.5 text-slate-400" />
                    </button>
                    <button
                      onClick={() => handleDelete(comment.id)}
                      className="p-1 hover:bg-red-500/20 rounded"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add comment input */}
      <div className="p-4 border-t border-slate-700 flex-shrink-0">
        <div className="space-y-2">
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a comment or description..."
            className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg resize-none text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={4}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                handleSubmit();
              }
            }}
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">Ctrl+Enter to send</p>
            <button
              onClick={handleSubmit}
              disabled={!newComment.trim() || submitting}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm"
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Send
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
