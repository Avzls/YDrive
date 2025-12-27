'use client';

import { X, Download, FolderInput, Trash2 } from 'lucide-react';

interface SelectionToolbarProps {
  totalSelected: number;
  selectedFilesCount: number;
  isTrashView: boolean;
  onClearSelection: () => void;
  onBulkDownload: () => void;
  onShowMoveSelected: () => void;
  onBulkDelete: () => void;
}

export function SelectionToolbar({
  totalSelected,
  selectedFilesCount,
  isTrashView,
  onClearSelection,
  onBulkDownload,
  onShowMoveSelected,
  onBulkDelete,
}: SelectionToolbarProps) {
  return (
    <div className="flex items-center gap-4 mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
      <button
        onClick={onClearSelection}
        className="p-1 hover:bg-blue-100 rounded"
      >
        <X className="w-5 h-5 text-blue-600" />
      </button>
      <span className="text-sm text-blue-700 font-medium">
        {totalSelected} selected
      </span>
      <div className="flex-1" />
      {!isTrashView && selectedFilesCount > 0 && (
        <button
          onClick={onBulkDownload}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-blue-100 rounded"
        >
          <Download className="w-4 h-4" />
          Download
        </button>
      )}
      {!isTrashView && (
        <button
          onClick={onShowMoveSelected}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-blue-100 rounded"
        >
          <FolderInput className="w-4 h-4" />
          Move
        </button>
      )}
      <button
        onClick={onBulkDelete}
        className="flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded"
      >
        <Trash2 className="w-4 h-4" />
        {isTrashView ? 'Delete Forever' : 'Delete'}
      </button>
    </div>
  );
}
