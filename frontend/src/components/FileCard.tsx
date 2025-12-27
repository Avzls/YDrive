'use client';

import { CheckSquare, Square, MoreVertical } from 'lucide-react';
import { FileItem } from '@/lib/api';
import { getFileIcon, getFileIconColor, formatFileSize, getStatusBadge } from '@/lib/file-utils';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

interface FileCardProps {
  file: FileItem;
  isSelected: boolean;
  isDragging: boolean;
  hasSelection: boolean;
  isTrashView: boolean;
  onSelect: (fileId: string, e?: React.MouseEvent) => void;
  onPreview: (file: FileItem) => void;
  onContextMenu: (e: React.MouseEvent, file: FileItem) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
}

export function FileCard({
  file,
  isSelected,
  isDragging,
  hasSelection,
  isTrashView,
  onSelect,
  onPreview,
  onContextMenu,
  onDragStart,
  onDragEnd,
}: FileCardProps) {
  const IconComponent = getFileIcon(file.mimeType);
  const iconColor = getFileIconColor(file.mimeType);

  return (
    <div
      draggable={!isTrashView}
      onDragStart={(e) => onDragStart(e, file.id)}
      onDragEnd={onDragEnd}
      onClick={(e) => {
        if (e.ctrlKey || e.metaKey) {
          onSelect(file.id, e);
        } else if (hasSelection) {
          onSelect(file.id, e);
        } else if (file.status === 'ready') {
          onPreview(file);
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu(e, file);
      }}
      className={`file-card group flex flex-col items-center p-4 rounded-lg border cursor-pointer relative transition-all ${
        isSelected ? 'border-blue-500 bg-blue-50' : 'border-transparent hover:border-gray-200'
      } ${isDragging ? 'opacity-50' : ''}`}
    >
      {/* Checkbox */}
      <button
        onClick={(e) => onSelect(file.id, e)}
        className={`absolute top-2 left-2 p-0.5 rounded ${
          isSelected || hasSelection ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        {isSelected ? (
          <CheckSquare className="w-5 h-5 text-blue-500" />
        ) : (
          <Square className="w-5 h-5 text-gray-400" />
        )}
      </button>
      
      {/* Thumbnail / Icon */}
      <div className="w-full aspect-video mb-2 flex items-center justify-center bg-gray-50 rounded-lg overflow-hidden border border-gray-100 relative group-hover:border-gray-300 transition-colors">
        {file.thumbnailKey ? (
          <img
            src={`${API_BASE}/files/${file.id}/thumbnail?token=${typeof window !== 'undefined' ? localStorage.getItem('accessToken') : ''}`}
            alt={file.name}
            className="w-full h-full object-cover"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
              const iconContainer = target.parentElement?.querySelector('.fallback-icon') as HTMLElement;
              if (iconContainer) iconContainer.style.display = 'flex';
            }}
          />
        ) : null}
        <div 
          className={`fallback-icon w-full h-full flex items-center justify-center ${file.thumbnailKey ? 'hidden' : ''}`}
        >
          <IconComponent className={`w-12 h-12 ${iconColor}`} />
        </div>
      </div>
      
      {/* File name */}
      <p className="text-sm text-gray-700 text-center truncate w-full px-1">{file.name}</p>
      
      {/* File size and status */}
      <div className="flex items-center gap-1 mt-1">
        <span className="text-xs text-gray-400">{formatFileSize(file.sizeBytes)}</span>
        {getStatusBadge(file.status)}
      </div>

      {/* Quick actions on hover */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onContextMenu(e, file);
        }}
        className="absolute top-2 right-2 p-1 rounded-full hover:bg-gray-200 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <MoreVertical className="w-4 h-4 text-gray-500" />
      </button>
    </div>
  );
}
