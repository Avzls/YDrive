'use client';

import { useEffect } from 'react';
import { FileItem, Folder } from '@/lib/api';

interface UseFileBrowserKeyboardOptions {
  files: FileItem[];
  folders: Folder[];
  selectedFiles: Set<string>;
  selectedFolders: Set<string>;
  clipboard: { fileIds: string[]; folderIds: string[] } | null;
  hasSelection: boolean;
  totalSelected: number;
  isModalOpen: boolean;
  contextMenu: any;
  
  // Actions
  selectAll: () => void;
  clearSelection: () => void;
  setClipboard: (data: { fileIds: string[]; folderIds: string[] }) => void;
  handlePasteFromClipboard: () => void;
  handleBulkDelete: () => void;
  onFolderClick: (folderId: string) => void;
  setPreviewFile: (file: FileItem | null) => void;
  setContextMenu: (menu: any) => void;
  
  // Toast
  showCopyToast: () => void;
  showNoPasteToast: () => void;
}

export function useFileBrowserKeyboard({
  files,
  folders,
  selectedFiles,
  selectedFolders,
  clipboard,
  hasSelection,
  totalSelected,
  isModalOpen,
  contextMenu,
  selectAll,
  clearSelection,
  setClipboard,
  handlePasteFromClipboard,
  handleBulkDelete,
  onFolderClick,
  setPreviewFile,
  setContextMenu,
  showCopyToast,
  showNoPasteToast,
}: UseFileBrowserKeyboardOptions) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      // Don't trigger if any modal is open
      if (isModalOpen) {
        return;
      }

      // Ctrl+A / Cmd+A - Select all
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        selectAll();
        return;
      }

      // Ctrl+C / Cmd+C - Copy selected items to clipboard
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && hasSelection) {
        e.preventDefault();
        setClipboard({
          fileIds: Array.from(selectedFiles),
          folderIds: Array.from(selectedFolders),
        });
        showCopyToast();
        return;
      }

      // Ctrl+V / Cmd+V - Paste from clipboard
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        if (clipboard) {
          e.preventDefault();
          handlePasteFromClipboard();
        } else {
          showNoPasteToast();
        }
        return;
      }

      // Escape - Clear selection or close context menu
      if (e.key === 'Escape') {
        if (contextMenu) {
          setContextMenu(null);
        } else if (hasSelection) {
          clearSelection();
        }
        return;
      }

      // Delete / Backspace - Delete selected items
      if ((e.key === 'Delete' || e.key === 'Backspace') && hasSelection) {
        e.preventDefault();
        handleBulkDelete();
        return;
      }

      // Enter - Open folder or preview file (if single selection)
      if (e.key === 'Enter') {
        if (selectedFolders.size === 1 && selectedFiles.size === 0) {
          const folderId = Array.from(selectedFolders)[0];
          onFolderClick(folderId);
          clearSelection();
        } else if (selectedFiles.size === 1 && selectedFolders.size === 0) {
          const fileId = Array.from(selectedFiles)[0];
          const file = files.find(f => f.id === fileId);
          if (file && file.status === 'ready') {
            setPreviewFile(file);
          }
        }
        return;
      }

      // Space - Quick preview (single file only)
      if (e.key === ' ') {
        if (selectedFiles.size === 1 && selectedFolders.size === 0) {
          e.preventDefault();
          const fileId = Array.from(selectedFiles)[0];
          const file = files.find(f => f.id === fileId);
          if (file && file.status === 'ready') {
            setPreviewFile(file);
          }
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    hasSelection, selectedFiles, selectedFolders, files, folders, totalSelected, clipboard,
    isModalOpen, contextMenu,
    selectAll, clearSelection, setClipboard, handlePasteFromClipboard, handleBulkDelete,
    onFolderClick, setPreviewFile, setContextMenu, showCopyToast, showNoPasteToast,
  ]);
}
