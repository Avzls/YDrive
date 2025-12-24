'use client';

import { useState, useEffect } from 'react';
import { X, FileText, HardDrive, Calendar, Clock, FolderOpen, User, Tag as TagIcon, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { FileItem, Tag, tagsApi } from '@/lib/api';

interface FileDetailsModalProps {
  file: FileItem;
  onClose: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getFileType(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'Image';
  if (mimeType.startsWith('video/')) return 'Video';
  if (mimeType.startsWith('audio/')) return 'Audio';
  if (mimeType.includes('pdf')) return 'PDF Document';
  if (mimeType.includes('word') || mimeType.includes('document')) return 'Word Document';
  if (mimeType.includes('sheet') || mimeType.includes('excel')) return 'Spreadsheet';
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'Presentation';
  if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('archive')) return 'Archive';
  if (mimeType.includes('text')) return 'Text File';
  return 'File';
}

export function FileDetailsModal({ file, onClose }: FileDetailsModalProps) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loadingTags, setLoadingTags] = useState(true);

  useEffect(() => {
    loadTags();
  }, [file.id]);

  const loadTags = async () => {
    try {
      const data = await tagsApi.getFileTags(file.id);
      setTags(data);
    } catch (err) {
      console.error('Failed to load tags:', err);
    } finally {
      setLoadingTags(false);
    }
  };

  const statusColors: Record<string, { bg: string; text: string }> = {
    ready: { bg: 'bg-green-100', text: 'text-green-700' },
    processing: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
    pending: { bg: 'bg-gray-100', text: 'text-gray-700' },
    scanning: { bg: 'bg-blue-100', text: 'text-blue-700' },
    error: { bg: 'bg-red-100', text: 'text-red-700' },
    infected: { bg: 'bg-red-100', text: 'text-red-700' },
  };

  const status = statusColors[file.status] || statusColors.pending;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-500" />
            <h2 className="text-lg font-semibold">File Details</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-full"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* File Name */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="font-semibold text-lg break-all">{file.name}</h3>
            <p className="text-sm text-gray-500 mt-1">{getFileType(file.mimeType)}</p>
          </div>

          {/* Details Grid */}
          <div className="space-y-3">
            {/* Size */}
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 rounded-lg">
                <HardDrive className="w-4 h-4 text-gray-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Size</p>
                <p className="font-medium">{formatFileSize(file.sizeBytes)}</p>
              </div>
            </div>

            {/* Type */}
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 rounded-lg">
                <FileText className="w-4 h-4 text-gray-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Type</p>
                <p className="font-medium">{file.mimeType}</p>
              </div>
            </div>

            {/* Created */}
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 rounded-lg">
                <Calendar className="w-4 h-4 text-gray-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Created</p>
                <p className="font-medium">{format(new Date(file.createdAt), 'PPpp')}</p>
              </div>
            </div>

            {/* Modified */}
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 rounded-lg">
                <Clock className="w-4 h-4 text-gray-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Modified</p>
                <p className="font-medium">{format(new Date(file.updatedAt), 'PPpp')}</p>
              </div>
            </div>

            {/* Location */}
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 rounded-lg">
                <FolderOpen className="w-4 h-4 text-gray-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Location</p>
                <p className="font-medium">{file.folderId ? 'In folder' : 'My Drive (root)'}</p>
              </div>
            </div>

            {/* Status */}
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 rounded-lg">
                <User className="w-4 h-4 text-gray-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Status</p>
                <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${status.bg} ${status.text}`}>
                  {file.status.charAt(0).toUpperCase() + file.status.slice(1)}
                </span>
              </div>
            </div>

            {/* Tags */}
            <div className="flex items-start gap-3">
              <div className="p-2 bg-gray-100 rounded-lg">
                <TagIcon className="w-4 h-4 text-gray-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-gray-500">Tags</p>
                {loadingTags ? (
                  <Loader2 className="w-4 h-4 animate-spin text-gray-400 mt-1" />
                ) : tags.length === 0 ? (
                  <p className="text-gray-400 text-sm">No tags</p>
                ) : (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {tags.map(tag => (
                      <span
                        key={tag.id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ 
                          backgroundColor: `${tag.color}20`,
                          color: tag.color 
                        }}
                      >
                        <span 
                          className="w-2 h-2 rounded-full" 
                          style={{ backgroundColor: tag.color }}
                        />
                        {tag.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Starred */}
            {file.isStarred && (
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <span className="text-yellow-600">⭐</span>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Starred</p>
                  <p className="font-medium text-yellow-600">This file is starred</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end p-4 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
