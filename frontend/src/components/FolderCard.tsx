'use client';

import { FolderIcon, CheckSquare, Square } from 'lucide-react';
import { Folder } from '@/lib/api';

interface FolderCardProps {
  folder: Folder;
  isSelected: boolean;
  isDropTarget: boolean;
  isDragging: boolean;
  hasSelection: boolean;
  isTrashView: boolean;
  onSelect: (folderId: string, e?: React.MouseEvent) => void;
  onClick: (folderId: string) => void;
  onContextMenu: (e: React.MouseEvent, folder: Folder) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent, folderId: string) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, folderId: string) => void;
}

export function FolderCard({
  folder,
  isSelected,
  isDropTarget,
  isDragging,
  hasSelection,
  isTrashView,
  onSelect,
  onClick,
  onContextMenu,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
}: FolderCardProps) {
  return (
    <div
      draggable={!isTrashView}
      onDragStart={(e) => onDragStart(e, folder.id)}
      onDragEnd={onDragEnd}
      onDragOver={(e) => onDragOver(e, folder.id)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, folder.id)}
      onClick={(e) => {
        if (e.ctrlKey || e.metaKey) {
          onSelect(folder.id, e);
        } else if (!hasSelection) {
          onClick(folder.id);
        } else {
          onSelect(folder.id, e);
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu(e, folder);
      }}
      className={`file-card group flex flex-col items-center p-4 rounded-lg border cursor-pointer relative transition-all ${
        isDropTarget ? 'border-blue-500 bg-blue-100 scale-105' :
        isSelected ? 'border-blue-500 bg-blue-50' : 'border-transparent hover:border-gray-200'
      } ${isDragging ? 'opacity-50' : ''}`}
    >
      {/* Checkbox */}
      <button
        onClick={(e) => onSelect(folder.id, e)}
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
      <div className="w-12 h-12 mb-2 flex items-center justify-center">
        <FolderIcon className="w-12 h-12 text-gray-400 fill-gray-100" />
      </div>
      <p className="text-sm text-gray-700 text-center truncate w-full">{folder.name}</p>
    </div>
  );
}
