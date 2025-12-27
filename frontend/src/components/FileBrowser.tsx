'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { 
  FolderIcon, 
  FileIcon,
  FileText,
  Image,
  Film,
  Music,
  FileSpreadsheet,
  Presentation,
  MoreVertical,
  Loader2,
  Trash2,
  FolderInput,
  X,
  CheckSquare,
  Square,
  Download
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { FileItem, Folder, filesApi, foldersApi } from '@/lib/api';
import { FilePreview } from './FilePreview';
import { ShareModal } from './ShareModal';
import { RenameModal } from './RenameModal';
import { MoveModal } from './MoveModal';
import { ConfirmModal } from './ConfirmModal';
import { VersionHistoryModal } from './VersionHistoryModal';
import { TagsModal } from './TagsModal';
import { CommentsModal } from './CommentsModal';
import { FileDetailsModal } from './FileDetailsModal';
import { UploadVersionModal } from './UploadVersionModal';
import { ContextMenu, getFileContextMenuItems, getFolderContextMenuItems, getTrashedFileContextMenuItems, getTrashedFolderContextMenuItems } from './ContextMenu';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

interface FileBrowserProps {
  folders: Folder[];
  files: FileItem[];
  onFolderClick: (folderId: string) => void;
  onRefresh: () => void;
  viewMode?: 'grid' | 'list';
  isTrashView?: boolean;
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return Image;
  if (mimeType.startsWith('video/')) return Film;
  if (mimeType.startsWith('audio/')) return Music;
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return FileSpreadsheet;
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return Presentation;
  if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('text') || mimeType.includes('word')) return FileText;
  return FileIcon;
}

function getFileIconColor(mimeType: string) {
  if (mimeType.startsWith('image/')) return 'text-red-500';
  if (mimeType.startsWith('video/')) return 'text-red-600';
  if (mimeType.startsWith('audio/')) return 'text-purple-500';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'text-green-600';
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'text-orange-500';
  if (mimeType.includes('pdf')) return 'text-red-500';
  if (mimeType.includes('word') || mimeType.includes('document')) return 'text-blue-600';
  return 'text-gray-500';
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'ready':
      return null; // Don't show badge for ready files
    case 'scanning':
    case 'processing':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-yellow-100 text-yellow-700">
          <Loader2 className="w-3 h-3 animate-spin" />
          {status === 'scanning' ? 'Scanning' : 'Processing'}
        </span>
      );
    case 'error':
      return <span className="px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-700">Error</span>;
    case 'infected':
      return <span className="px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-700">⚠️ Infected</span>;
    default:
      return <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">{status}</span>;
  }
}

export function FileBrowser({ folders, files, onFolderClick, onRefresh, viewMode = 'grid', isTrashView = false }: FileBrowserProps) {
  const [previewFile, setPreviewFile] = useState<FileItem | null>(null);
  const [shareFile, setShareFile] = useState<FileItem | null>(null);
  const [shareFolder, setShareFolder] = useState<Folder | null>(null);
  const [renameItem, setRenameItem] = useState<{ type: 'file' | 'folder'; item: FileItem | Folder } | null>(null);
  const [moveItem, setMoveItem] = useState<{ type: 'file' | 'folder'; item: FileItem | Folder } | null>(null);
  const [copyItem, setCopyItem] = useState<FileItem | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; type: 'file' | 'folder'; item: FileItem | Folder } | null>(null);
  const [versionHistoryFile, setVersionHistoryFile] = useState<FileItem | null>(null);
  const [uploadVersionFile, setUploadVersionFile] = useState<FileItem | null>(null);
  const [tagsFile, setTagsFile] = useState<FileItem | null>(null);
  const [commentsFile, setCommentsFile] = useState<FileItem | null>(null);
  const [detailsFile, setDetailsFile] = useState<FileItem | null>(null);
  
  // Multi-select state
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [selectedFolders, setSelectedFolders] = useState<Set<string>>(new Set());
  const [showMoveSelected, setShowMoveSelected] = useState(false);

  // Drag and drop state
  const [draggedItem, setDraggedItem] = useState<{ type: 'file' | 'folder'; id: string } | null>(null);
  const [dropTargetFolderId, setDropTargetFolderId] = useState<string | null>(null);

  // Clipboard state for Ctrl+C / Ctrl+V
  const [clipboard, setClipboard] = useState<{ fileIds: string[]; folderIds: string[] } | null>(null);

  const hasSelection = selectedFiles.size > 0 || selectedFolders.size > 0;
  const totalSelected = selectedFiles.size + selectedFolders.size;
  const allSelected = selectedFiles.size === files.length && selectedFolders.size === folders.length && (files.length + folders.length) > 0;

  const toggleFileSelection = (fileId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedFiles(prev => {
      const next = new Set(prev);
      if (next.has(fileId)) {
        next.delete(fileId);
      } else {
        next.add(fileId);
      }
      return next;
    });
  };

  const toggleFolderSelection = (folderId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedFiles(new Set(files.map(f => f.id)));
    setSelectedFolders(new Set(folders.map(f => f.id)));
  };

  const clearSelection = () => {
    setSelectedFiles(new Set());
    setSelectedFolders(new Set());
  };

  // Confirm delete modal state (declared before useEffect that uses it)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleBulkDelete = () => {
    setShowDeleteConfirm(true);
  };

  // Handle paste from clipboard (Ctrl+V)
  const handlePasteFromClipboard = async () => {
    if (!clipboard) return;
    
    const { fileIds, folderIds } = clipboard;
    const total = fileIds.length + folderIds.length;
    
    if (total === 0) return;
    
    try {
      toast.info(`Pasting ${total} item(s)...`);
      
      // Copy files to current folder (null means root)
      for (const fileId of fileIds) {
        // We need to get current folder context - for now, files will be copied to same location
        // In a real implementation, you'd pass currentFolderId from parent
        await filesApi.copy(fileId, null);
      }
      
      // Note: Folder copy is not implemented in backend yet
      // For now, just show a message for folders
      if (folderIds.length > 0) {
        toast.warning('Folder copy not yet supported');
      }
      
      toast.success(`${fileIds.length} file(s) pasted`);
      onRefresh();
    } catch (err) {
      console.error('Paste error:', err);
      toast.error('Failed to paste some items');
    }
  };

  // Keyboard shortcuts handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      
      // Don't trigger if any modal is open
      if (previewFile || shareFile || shareFolder || renameItem || moveItem || copyItem || 
          versionHistoryFile || tagsFile || commentsFile || detailsFile || showDeleteConfirm) {
        // Only allow Escape to close modals
        if (e.key === 'Escape') {
          if (previewFile) setPreviewFile(null);
          if (shareFile) setShareFile(null);
          if (shareFolder) setShareFolder(null);
          if (renameItem) setRenameItem(null);
          if (moveItem) setMoveItem(null);
          if (copyItem) setCopyItem(null);
          if (versionHistoryFile) setVersionHistoryFile(null);
          if (tagsFile) setTagsFile(null);
          if (commentsFile) setCommentsFile(null);
          if (detailsFile) setDetailsFile(null);
          if (showDeleteConfirm) setShowDeleteConfirm(false);
        }
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
        toast.success(`${totalSelected} item(s) copied`);
        return;
      }

      // Ctrl+V / Cmd+V - Paste from clipboard
      if ((e.ctrlKey || e.metaKey) && e.key === 'v' && clipboard) {
        e.preventDefault();
        handlePasteFromClipboard();
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
    previewFile, shareFile, shareFolder, renameItem, moveItem, copyItem,
    versionHistoryFile, tagsFile, commentsFile, detailsFile, showDeleteConfirm,
    contextMenu, isTrashView, onFolderClick, onRefresh
  ]);

  const executeBulkDelete = async () => {
    const total = selectedFiles.size + selectedFolders.size;
    setShowDeleteConfirm(false);
    
    try {
      // Delete files - use Promise.all for parallel execution
      const filePromises = Array.from(selectedFiles).map(fileId => 
        isTrashView ? filesApi.permanentDelete(fileId) : filesApi.delete(fileId)
      );
      // Delete folders
      const folderPromises = Array.from(selectedFolders).map(folderId => 
        isTrashView ? foldersApi.permanentDelete(folderId) : foldersApi.delete(folderId)
      );
      
      await Promise.all([...filePromises, ...folderPromises]);
      
      toast.success(isTrashView 
        ? `${total} item(s) permanently deleted` 
        : `${total} item(s) moved to trash`
      );
      clearSelection();
      onRefresh();
    } catch (err) {
      console.error('Bulk delete error:', err);
      toast.error('Failed to delete some items');
    }
  };

  const handleBulkMove = async (targetFolderId: string | null) => {
    try {
      // Move files
      for (const fileId of selectedFiles) {
        await filesApi.move(fileId, targetFolderId);
      }
      // Move folders
      for (const folderId of selectedFolders) {
        await foldersApi.move(folderId, targetFolderId);
      }
      toast.success(`${totalSelected} item(s) moved`);
      clearSelection();
      setShowMoveSelected(false);
      onRefresh();
    } catch (err) {
      toast.error('Failed to move some items');
    }
  };

  const handleContextMenu = (e: React.MouseEvent, type: 'file' | 'folder', item: FileItem | Folder) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, type, item });
  };

  // Drag handlers
  const handleDragStart = (e: React.DragEvent, type: 'file' | 'folder', id: string) => {
    e.dataTransfer.effectAllowed = 'move';
    setDraggedItem({ type, id });
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setDropTargetFolderId(null);
  };

  const handleDragOver = (e: React.DragEvent, folderId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    // Don't allow drop on self
    if (draggedItem?.type === 'folder' && draggedItem.id === folderId) return;
    setDropTargetFolderId(folderId);
  };

  const handleDragLeave = () => {
    setDropTargetFolderId(null);
  };

  const handleDrop = async (e: React.DragEvent, targetFolderId: string) => {
    e.preventDefault();
    setDropTargetFolderId(null);
    
    if (!draggedItem) return;
    
    // Don't drop folder on itself
    if (draggedItem.type === 'folder' && draggedItem.id === targetFolderId) {
      toast.error("Cannot move folder into itself");
      return;
    }

    try {
      if (draggedItem.type === 'file') {
        await filesApi.move(draggedItem.id, targetFolderId);
        toast.success('File moved');
      } else {
        await foldersApi.move(draggedItem.id, targetFolderId);
        toast.success('Folder moved');
      }
      onRefresh();
    } catch (err) {
      toast.error('Failed to move item');
    }
    
    setDraggedItem(null);
  };

  const handleDownload = async (file: FileItem) => {
    try {
      const url = await filesApi.getDownloadUrl(file.id);
      
      // Fetch as blob to handle cross-origin download with correct filename
      const response = await fetch(url);
      if (!response.ok) throw new Error('Download failed');
      
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = file.name; // This will work since blob URL is same-origin
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Clean up blob URL
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error('Download failed:', err);
      toast.error('Failed to download file');
    }
  };

  const handleBulkDownload = async () => {
    if (selectedFiles.size === 0) return;
    try {
      toast.info('Preparing download...');
      await filesApi.bulkDownload(Array.from(selectedFiles));
      toast.success('Download started');
    } catch (err) {
      console.error('Bulk download failed:', err);
      toast.error('Failed to download files');
    }
  };

  const handleRenameFile = async (newName: string) => {
    if (!renameItem || renameItem.type !== 'file') return;
    try {
      await filesApi.rename(renameItem.item.id, newName);
      toast.success(`Renamed to "${newName}"`);
      onRefresh();
    } catch (err) {
      toast.error('Failed to rename file');
    }
  };

  const handleRenameFolder = async (newName: string) => {
    if (!renameItem || renameItem.type !== 'folder') return;
    try {
      await foldersApi.rename(renameItem.item.id, newName);
      toast.success(`Renamed to "${newName}"`);
      onRefresh();
    } catch (err) {
      toast.error('Failed to rename folder');
    }
  };

  const handleDelete = async (file: FileItem) => {
    try {
      await filesApi.delete(file.id);
      toast.success(`"${file.name}" moved to trash`);
      onRefresh();
    } catch (err) {
      toast.error('Failed to delete file');
    }
  };

  const handleToggleStar = async (file: FileItem) => {
    try {
      const result = await filesApi.toggleStar(file.id);
      toast.success(result.isStarred ? `"${file.name}" added to starred` : `"${file.name}" removed from starred`);
      onRefresh();
    } catch (err) {
      toast.error('Failed to update starred status');
    }
  };

  const handleMoveFile = async (targetFolderId: string | null) => {
    if (!moveItem || moveItem.type !== 'file') return;
    try {
      await filesApi.move(moveItem.item.id, targetFolderId);
      toast.success(`"${moveItem.item.name}" moved`);
      onRefresh();
    } catch (err) {
      toast.error('Failed to move file');
    }
  };

  const handleMoveFolder = async (targetFolderId: string | null) => {
    if (!moveItem || moveItem.type !== 'folder') return;
    try {
      await foldersApi.move(moveItem.item.id, targetFolderId);
      toast.success(`"${moveItem.item.name}" moved`);
      onRefresh();
    } catch (err) {
      toast.error('Failed to move folder');
    }
  };

  const handleCopyFile = async (targetFolderId: string | null) => {
    if (!copyItem) return;
    try {
      await filesApi.copy(copyItem.id, targetFolderId);
      toast.success(`"${copyItem.name}" copied`);
      onRefresh();
    } catch (err) {
      toast.error('Failed to copy file');
    }
  };

  const handleDeleteFolder = async (folder: Folder) => {
    try {
      await foldersApi.delete(folder.id);
      toast.success(`"${folder.name}" moved to trash`);
      onRefresh();
    } catch (err) {
      toast.error('Failed to delete folder');
    }
  };

  const handleToggleStarFolder = async (folder: Folder) => {
    try {
      const result = await foldersApi.toggleStar(folder.id);
      toast.success(result.isStarred ? `"${folder.name}" added to starred` : `"${folder.name}" removed from starred`);
      onRefresh();
    } catch (err) {
      toast.error('Failed to update starred status');
    }
  };

  const triggerVersionUpload = (file: FileItem) => {
    setUploadVersionFile(file);
  };

  const handleDownloadFolder = async (folder: Folder) => {
    try {
      toast.info(`Preparing download for "${folder.name}"...`);
      const url = foldersApi.getDownloadUrl(folder.id);
      console.log('[Download] URL:', url);
      
      // Fetch as blob
      const response = await fetch(url);
      console.log('[Download] Response status:', response.status, response.statusText);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Download] Error response:', errorText);
        throw new Error(`Download failed: ${response.status}`);
      }
      
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `${folder.name}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      URL.revokeObjectURL(blobUrl);
      toast.success(`Downloaded "${folder.name}.zip"`);
    } catch (err) {
      console.error('Download failed:', err);
      toast.error('Failed to download folder');
    }
  };

  // Trash view handlers
  const handleRestoreFile = async (file: FileItem) => {
    try {
      await filesApi.restore(file.id);
      toast.success(`"${file.name}" restored`);
      onRefresh();
    } catch (err) {
      toast.error('Failed to restore file');
    }
  };

  const handlePermanentDeleteFile = async (file: FileItem) => {
    try {
      await filesApi.permanentDelete(file.id);
      toast.success(`"${file.name}" permanently deleted`);
      onRefresh();
    } catch (err) {
      toast.error('Failed to permanently delete file');
    }
  };

  const handleRestoreFolder = async (folder: Folder) => {
    try {
      await foldersApi.restore(folder.id);
      toast.success(`"${folder.name}" restored`);
      onRefresh();
    } catch (err) {
      toast.error('Failed to restore folder');
    }
  };

  const handlePermanentDeleteFolder = async (folder: Folder) => {
    try {
      await foldersApi.permanentDelete(folder.id);
      toast.success(`"${folder.name}" permanently deleted`);
      onRefresh();
    } catch (err) {
      toast.error('Failed to permanently delete folder');
    }
  };

  if (folders.length === 0 && files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-gray-400">
        <FolderIcon className="w-20 h-20 mb-4 text-gray-300" />
        <p className="text-lg text-gray-600 font-medium">Drop files here</p>
        <p className="text-sm mt-1 text-gray-500">or use the "New" button</p>
      </div>
    );
  }

  // Grid View
  if (viewMode === 'grid') {
    return (
      <>
        {/* Selection Toolbar */}
        {hasSelection && (
          <div className="flex items-center gap-4 mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <button
              onClick={clearSelection}
              className="p-1 hover:bg-blue-100 rounded"
            >
              <X className="w-5 h-5 text-blue-600" />
            </button>
            <span className="text-sm text-blue-700 font-medium">
              {totalSelected} selected
            </span>
            <div className="flex-1" />
            {!isTrashView && selectedFiles.size > 0 && (
              <button
                onClick={handleBulkDownload}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-blue-100 rounded"
              >
                <Download className="w-4 h-4" />
                Download
              </button>
            )}
            {!isTrashView && (
              <button
                onClick={() => setShowMoveSelected(true)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-blue-100 rounded"
              >
                <FolderInput className="w-4 h-4" />
                Move
              </button>
            )}
            <button
              onClick={handleBulkDelete}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded"
            >
              <Trash2 className="w-4 h-4" />
              {isTrashView ? 'Delete Forever' : 'Delete'}
            </button>
          </div>
        )}

        {/* Select All checkbox */}
        {(files.length > 0 || folders.length > 0) && (
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={allSelected ? clearSelection : selectAll}
              className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800"
            >
              {allSelected ? (
                <CheckSquare className="w-5 h-5 text-blue-500" />
              ) : (
                <Square className="w-5 h-5" />
              )}
              {allSelected ? 'Deselect all' : 'Select all'}
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {/* Folders */}
          {folders.map((folder) => {
            const isSelected = selectedFolders.has(folder.id);
            const isDropTarget = dropTargetFolderId === folder.id;
            return (
              <div
                key={folder.id}
                draggable={!isTrashView}
                onDragStart={(e) => handleDragStart(e, 'folder', folder.id)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => handleDragOver(e, folder.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, folder.id)}
                onClick={(e) => {
                  if (e.ctrlKey || e.metaKey) {
                    toggleFolderSelection(folder.id, e);
                  } else if (!hasSelection) {
                    onFolderClick(folder.id);
                  } else {
                    toggleFolderSelection(folder.id, e);
                  }
                }}
                onContextMenu={(e) => handleContextMenu(e, 'folder', folder)}
                className={`file-card group flex flex-col items-center p-4 rounded-lg border cursor-pointer relative transition-all ${
                  isDropTarget ? 'border-blue-500 bg-blue-100 scale-105' :
                  isSelected ? 'border-blue-500 bg-blue-50' : 'border-transparent hover:border-gray-200'
                } ${draggedItem?.type === 'folder' && draggedItem.id === folder.id ? 'opacity-50' : ''}`}
              >
                {/* Checkbox */}
                <button
                  onClick={(e) => toggleFolderSelection(folder.id, e)}
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
          })}

          {/* Files */}
          {files.map((file) => {
            const IconComponent = getFileIcon(file.mimeType);
            const iconColor = getFileIconColor(file.mimeType);
            const isSelected = selectedFiles.has(file.id);
            return (
              <div
                key={file.id}
                draggable={!isTrashView}
                onDragStart={(e) => handleDragStart(e, 'file', file.id)}
                onDragEnd={handleDragEnd}
                onClick={(e) => {
                  if (e.ctrlKey || e.metaKey) {
                    toggleFileSelection(file.id, e);
                  } else if (hasSelection) {
                    toggleFileSelection(file.id, e);
                  } else if (file.status === 'ready') {
                    setPreviewFile(file);
                  }
                }}
                onContextMenu={(e) => handleContextMenu(e, 'file', file)}
                className={`file-card group flex flex-col items-center p-4 rounded-lg border cursor-pointer relative transition-all ${
                  isSelected ? 'border-blue-500 bg-blue-50' : 'border-transparent hover:border-gray-200'
                } ${draggedItem?.type === 'file' && draggedItem.id === file.id ? 'opacity-50' : ''}`}
              >
                {/* Checkbox */}
                <button
                  onClick={(e) => toggleFileSelection(file.id, e)}
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
                <div className="w-full aspect-video mb-2 flex items-center justify-center bg-gray-50 rounded-lg overflow-hidden border border-gray-100 relative group-hover:border-gray-300 transition-colors">
                  {file.thumbnailKey ? (
                    <img
                      src={`${API_BASE}/files/${file.id}/thumbnail?token=${typeof window !== 'undefined' ? localStorage.getItem('accessToken') : ''}`}
                      alt={file.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        // If thumbnail fails, fallback to icon
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
                <p className="text-sm text-gray-700 text-center truncate w-full px-1">{file.name}</p>
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-xs text-gray-400">{formatFileSize(file.sizeBytes)}</span>
                  {getStatusBadge(file.status)}
                </div>

                {/* Quick actions on hover */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleContextMenu(e, 'file', file);
                  }}
                  className="absolute top-2 right-2 p-1 rounded-full hover:bg-gray-200 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <MoreVertical className="w-4 h-4 text-gray-500" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Context Menu */}
        {contextMenu && contextMenu.type === 'file' && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            items={isTrashView 
              ? getTrashedFileContextMenuItems(contextMenu.item as FileItem, {
                  onRestore: () => handleRestoreFile(contextMenu.item as FileItem),
                  onPermanentDelete: () => handlePermanentDeleteFile(contextMenu.item as FileItem),
                })
              : getFileContextMenuItems(contextMenu.item as FileItem, {
                  onPreview: () => setPreviewFile(contextMenu.item as FileItem),
                  onDownload: () => handleDownload(contextMenu.item as FileItem),
                  onShare: () => setShareFile(contextMenu.item as FileItem),
                  onStar: () => handleToggleStar(contextMenu.item as FileItem),
                  onRename: () => setRenameItem({ type: 'file', item: contextMenu.item as FileItem }),
                  onMove: () => setMoveItem({ type: 'file', item: contextMenu.item as FileItem }),
                  onCopy: () => setCopyItem(contextMenu.item as FileItem),
                  onTags: () => setTagsFile(contextMenu.item as FileItem),
                  onComments: () => setCommentsFile(contextMenu.item as FileItem),
                  onDelete: () => handleDelete(contextMenu.item as FileItem),
                  onDetails: () => setDetailsFile(contextMenu.item as FileItem),
                  onVersionHistory: () => setVersionHistoryFile(contextMenu.item as FileItem),
                  onUploadNewVersion: () => triggerVersionUpload(contextMenu.item as FileItem),
                })
            }
            onClose={() => setContextMenu(null)}
          />
        )}

        {contextMenu && contextMenu.type === 'folder' && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            items={isTrashView
              ? getTrashedFolderContextMenuItems(contextMenu.item as Folder, {
                  onRestore: () => handleRestoreFolder(contextMenu.item as Folder),
                  onPermanentDelete: () => handlePermanentDeleteFolder(contextMenu.item as Folder),
                })
              : getFolderContextMenuItems(contextMenu.item as Folder, {
                  onOpen: () => onFolderClick((contextMenu.item as Folder).id),
                  onDownload: () => handleDownloadFolder(contextMenu.item as Folder),
                  onShare: () => setShareFolder(contextMenu.item as Folder),
                  onStar: () => handleToggleStarFolder(contextMenu.item as Folder),
                  onRename: () => setRenameItem({ type: 'folder', item: contextMenu.item as Folder }),
                  onMove: () => setMoveItem({ type: 'folder', item: contextMenu.item as Folder }),
                  onDelete: () => handleDeleteFolder(contextMenu.item as Folder),
                })
            }
            onClose={() => setContextMenu(null)}
          />
        )}

        {/* Preview Modal */}
        {previewFile && (
          <FilePreview 
            file={previewFile} 
            onClose={() => setPreviewFile(null)} 
          />
        )}

        {/* Version History Modal */}
        {versionHistoryFile && (
          <VersionHistoryModal
            file={versionHistoryFile}
            onClose={() => setVersionHistoryFile(null)}
            onRestore={() => {
              onRefresh();
              setVersionHistoryFile(null);
            }}
          />
        )}

        {/* Upload Version Modal */}
        {uploadVersionFile && (
          <UploadVersionModal
            file={uploadVersionFile}
            onClose={() => setUploadVersionFile(null)}
            onSuccess={onRefresh}
          />
        )}

        {/* Share Modal */}
        {shareFile && (
          <ShareModal
            file={shareFile}
            onClose={() => setShareFile(null)}
          />
        )}

        {/* Share Folder Modal */}
        {shareFolder && (
          <ShareModal
            folder={shareFolder}
            onClose={() => setShareFolder(null)}
          />
        )}

        {/* Rename Modal */}
        {renameItem && (
          <RenameModal
            currentName={renameItem.item.name}
            type={renameItem.type}
            onRename={renameItem.type === 'file' ? handleRenameFile : handleRenameFolder}
            onClose={() => setRenameItem(null)}
          />
        )}

        {/* Move Modal */}
        {moveItem && (
          <MoveModal
            itemName={moveItem.item.name}
            currentFolderId={moveItem.type === 'file' ? (moveItem.item as FileItem).folderId : (moveItem.item as Folder).parentId}
            onMove={moveItem.type === 'file' ? handleMoveFile : handleMoveFolder}
            onClose={() => setMoveItem(null)}
          />
        )}

        {/* Copy Modal */}
        {copyItem && (
          <MoveModal
            itemName={copyItem.name}
            currentFolderId={copyItem.folderId}
            onMove={handleCopyFile}
            onClose={() => setCopyItem(null)}
            title="Copy to"
          />
        )}

        {/* Bulk Move Modal */}
        {showMoveSelected && (
          <MoveModal
            itemName={`${totalSelected} item(s)`}
            currentFolderId={undefined}
            onMove={handleBulkMove}
            onClose={() => setShowMoveSelected(false)}
          />
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <ConfirmModal
            title={isTrashView ? "Delete Forever" : "Delete Items"}
            message={isTrashView 
              ? `Permanently delete ${totalSelected} item(s)? This action cannot be undone.`
              : `Move ${totalSelected} item(s) to trash?`
            }
            confirmLabel={isTrashView ? "Delete Forever" : "Delete"}
            variant="danger"
            onConfirm={executeBulkDelete}
            onCancel={() => setShowDeleteConfirm(false)}
          />
        )}

        {/* Tags Modal */}
        {tagsFile && (
          <TagsModal
            fileId={tagsFile.id}
            fileName={tagsFile.name}
            onClose={() => setTagsFile(null)}
            onUpdate={onRefresh}
          />
        )}

        {/* Comments Modal */}
        {commentsFile && (
          <CommentsModal
            fileId={commentsFile.id}
            fileName={commentsFile.name}
            onClose={() => setCommentsFile(null)}
          />
        )}

        {/* File Details Modal */}
        {detailsFile && (
          <FileDetailsModal
            file={detailsFile}
            onClose={() => setDetailsFile(null)}
          />
        )}
      </>
    );
  }

  // List View
  return (
    <>
      {/* Selection Toolbar */}
      {hasSelection && (
        <div className="flex items-center gap-4 mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <button
            onClick={clearSelection}
            className="p-1 hover:bg-blue-100 rounded"
          >
            <X className="w-5 h-5 text-blue-600" />
          </button>
          <span className="text-sm text-blue-700 font-medium">
            {totalSelected} selected
          </span>
          <div className="flex-1" />
          {!isTrashView && selectedFiles.size > 0 && (
            <button
              onClick={handleBulkDownload}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-blue-100 rounded"
            >
              <Download className="w-4 h-4" />
              Download
            </button>
          )}
          {!isTrashView && (
            <button
              onClick={() => setShowMoveSelected(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-blue-100 rounded"
            >
              <FolderInput className="w-4 h-4" />
              Move
            </button>
          )}
          <button
            onClick={handleBulkDelete}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded"
          >
            <Trash2 className="w-4 h-4" />
            {isTrashView ? 'Delete Forever' : 'Delete'}
          </button>
        </div>
      )}

      <div className="border border-gray-200 rounded-lg overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-gray-50 border-b border-gray-200 text-sm font-medium text-gray-600">
          <div className="col-span-6 flex items-center gap-3">
            <button
              onClick={allSelected ? clearSelection : selectAll}
              className="p-0.5"
            >
              {allSelected ? (
                <CheckSquare className="w-5 h-5 text-blue-500" />
              ) : (
                <Square className="w-5 h-5" />
              )}
            </button>
            Name
          </div>
          <div className="col-span-2">Owner</div>
          <div className="col-span-2">Last modified</div>
          <div className="col-span-2">File size</div>
        </div>

        {/* Folders */}
        {folders.map((folder) => {
          const isSelected = selectedFolders.has(folder.id);
          const isDropTarget = dropTargetFolderId === folder.id;
          return (
            <div
              key={folder.id}
              draggable={!isTrashView}
              onDragStart={(e) => handleDragStart(e, 'folder', folder.id)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => handleDragOver(e, folder.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, folder.id)}
              onClick={(e) => {
                if (e.ctrlKey || e.metaKey) {
                  toggleFolderSelection(folder.id, e);
                } else if (!hasSelection) {
                  onFolderClick(folder.id);
                } else {
                  toggleFolderSelection(folder.id, e);
                }
              }}
              onContextMenu={(e) => handleContextMenu(e, 'folder', folder)}
              className={`grid grid-cols-12 gap-4 px-4 py-3 border-b border-gray-100 cursor-pointer items-center transition-all ${
                isDropTarget ? 'bg-blue-100 border-blue-500' :
                isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
              } ${draggedItem?.type === 'folder' && draggedItem.id === folder.id ? 'opacity-50' : ''}`}
            >
              <div className="col-span-6 flex items-center gap-3">
                <button
                  onClick={(e) => toggleFolderSelection(folder.id, e)}
                  className="p-0.5"
                >
                  {isSelected ? (
                    <CheckSquare className="w-5 h-5 text-blue-500" />
                  ) : (
                    <Square className="w-5 h-5 text-gray-400" />
                  )}
                </button>
                <FolderIcon className="w-6 h-6 text-gray-400 fill-gray-100" />
                <span className="text-gray-700 truncate">{folder.name}</span>
              </div>
              <div className="col-span-2 text-sm text-gray-500">me</div>
              <div className="col-span-2 text-sm text-gray-500">
                {format(new Date(folder.createdAt), 'MMM d, yyyy')}
              </div>
              <div className="col-span-2 text-sm text-gray-500">—</div>
            </div>
          );
        })}

        {/* Files */}
        {files.map((file) => {
          const IconComponent = getFileIcon(file.mimeType);
          const iconColor = getFileIconColor(file.mimeType);
          const isSelected = selectedFiles.has(file.id);
          return (
            <div
              key={file.id}
              draggable={!isTrashView}
              onDragStart={(e) => handleDragStart(e, 'file', file.id)}
              onDragEnd={handleDragEnd}
              onClick={(e) => {
                if (e.ctrlKey || e.metaKey) {
                  toggleFileSelection(file.id, e);
                } else if (hasSelection) {
                  toggleFileSelection(file.id, e);
                } else if (file.status === 'ready') {
                  setPreviewFile(file);
                }
              }}
              onContextMenu={(e) => handleContextMenu(e, 'file', file)}
              className={`grid grid-cols-12 gap-4 px-4 py-3 border-b border-gray-100 cursor-pointer items-center group ${
                isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
              } ${draggedItem?.type === 'file' && draggedItem.id === file.id ? 'opacity-50' : ''}`}
            >
              <div className="col-span-6 flex items-center gap-3">
                <button
                  onClick={(e) => toggleFileSelection(file.id, e)}
                  className="p-0.5"
                >
                  {isSelected ? (
                    <CheckSquare className="w-5 h-5 text-blue-500" />
                  ) : (
                    <Square className="w-5 h-5 text-gray-400" />
                  )}
                </button>
                {file.thumbnailKey ? (
                  <div className="w-10 h-10 rounded border border-gray-200 overflow-hidden flex-shrink-0">
                    <img
                      src={`${API_BASE}/files/${file.id}/thumbnail?token=${typeof window !== 'undefined' ? localStorage.getItem('accessToken') : ''}`}
                      alt={file.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ) : (
                  <IconComponent className={`w-6 h-6 ${iconColor}`} />
                )}
                <span className="text-gray-700 truncate">{file.name}</span>
                {getStatusBadge(file.status)}
              </div>
              <div className="col-span-2 text-sm text-gray-500">me</div>
              <div className="col-span-2 text-sm text-gray-500">
                {format(new Date(file.createdAt), 'MMM d, yyyy')}
              </div>
              <div className="col-span-2 text-sm text-gray-500 flex items-center justify-between">
                <span>{formatFileSize(file.sizeBytes)}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleContextMenu(e, 'file', file);
                  }}
                  className="p-1 rounded-full hover:bg-gray-200 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <MoreVertical className="w-4 h-4 text-gray-500" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Context Menu */}
      {contextMenu && contextMenu.type === 'file' && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={isTrashView
            ? getTrashedFileContextMenuItems(contextMenu.item as FileItem, {
                onRestore: () => handleRestoreFile(contextMenu.item as FileItem),
                onPermanentDelete: () => handlePermanentDeleteFile(contextMenu.item as FileItem),
              })
            : getFileContextMenuItems(contextMenu.item as FileItem, {
                onPreview: () => setPreviewFile(contextMenu.item as FileItem),
                onDownload: () => handleDownload(contextMenu.item as FileItem),
                onShare: () => setShareFile(contextMenu.item as FileItem),
                onStar: () => handleToggleStar(contextMenu.item as FileItem),
                onRename: () => setRenameItem({ type: 'file', item: contextMenu.item as FileItem }),
                onMove: () => setMoveItem({ type: 'file', item: contextMenu.item as FileItem }),
                onCopy: () => setCopyItem(contextMenu.item as FileItem),
                onTags: () => setTagsFile(contextMenu.item as FileItem),
                onComments: () => setCommentsFile(contextMenu.item as FileItem),
                onDelete: () => handleDelete(contextMenu.item as FileItem),
                onDetails: () => setDetailsFile(contextMenu.item as FileItem),
              })
          }
          onClose={() => setContextMenu(null)}
        />
      )}

      {contextMenu && contextMenu.type === 'folder' && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={isTrashView
            ? getTrashedFolderContextMenuItems(contextMenu.item as Folder, {
                onRestore: () => handleRestoreFolder(contextMenu.item as Folder),
                onPermanentDelete: () => handlePermanentDeleteFolder(contextMenu.item as Folder),
              })
            : getFolderContextMenuItems(contextMenu.item as Folder, {
                onOpen: () => onFolderClick((contextMenu.item as Folder).id),
                onDownload: () => handleDownloadFolder(contextMenu.item as Folder),
                onShare: () => setShareFolder(contextMenu.item as Folder),
                onStar: () => handleToggleStarFolder(contextMenu.item as Folder),
                onRename: () => setRenameItem({ type: 'folder', item: contextMenu.item as Folder }),
                onMove: () => setMoveItem({ type: 'folder', item: contextMenu.item as Folder }),
                onDelete: () => handleDeleteFolder(contextMenu.item as Folder),
              })
          }
          onClose={() => setContextMenu(null)}
        />
      )}
      {/* Version History Modal */}
      {versionHistoryFile && (
        <VersionHistoryModal
          file={versionHistoryFile}
          onClose={() => setVersionHistoryFile(null)}
          onRestore={() => {
            onRefresh();
            setVersionHistoryFile(null);
          }}
        />
      )}

      {/* Upload Version Modal */}
      {uploadVersionFile && (
        <UploadVersionModal
          file={uploadVersionFile}
          onClose={() => setUploadVersionFile(null)}
          onSuccess={onRefresh}
        />
      )}

      {/* Preview Modal */}
      {previewFile && (
        <FilePreview 
          file={previewFile} 
          onClose={() => setPreviewFile(null)} 
        />
      )}

      {/* Share Modal */}
      {shareFile && (
        <ShareModal
          file={shareFile}
          onClose={() => setShareFile(null)}
        />
      )}

      {/* Share Folder Modal */}
      {shareFolder && (
        <ShareModal
          folder={shareFolder}
          onClose={() => setShareFolder(null)}
        />
      )}

      {/* Rename Modal */}
      {renameItem && (
        <RenameModal
          currentName={renameItem.item.name}
          type={renameItem.type}
          onRename={renameItem.type === 'file' ? handleRenameFile : handleRenameFolder}
          onClose={() => setRenameItem(null)}
        />
      )}

      {/* Move Modal */}
      {moveItem && (
        <MoveModal
          itemName={moveItem.item.name}
          currentFolderId={moveItem.type === 'file' ? (moveItem.item as FileItem).folderId : (moveItem.item as Folder).parentId}
          onMove={moveItem.type === 'file' ? handleMoveFile : handleMoveFolder}
          onClose={() => setMoveItem(null)}
        />
      )}

      {/* Copy Modal */}
      {copyItem && (
        <MoveModal
          itemName={copyItem.name}
          currentFolderId={copyItem.folderId}
          onMove={handleCopyFile}
          onClose={() => setCopyItem(null)}
          title="Copy to"
        />
      )}

      {/* Bulk Move Modal */}
      {showMoveSelected && (
        <MoveModal
          itemName={`${totalSelected} item(s)`}
          currentFolderId={undefined}
          onMove={handleBulkMove}
          onClose={() => setShowMoveSelected(false)}
        />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <ConfirmModal
          title={isTrashView ? "Delete Forever" : "Delete Items"}
          message={isTrashView 
            ? `Permanently delete ${totalSelected} item(s)? This action cannot be undone.`
            : `Move ${totalSelected} item(s) to trash?`
          }
          confirmLabel={isTrashView ? "Delete Forever" : "Delete"}
          variant="danger"
          onConfirm={executeBulkDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}

      {/* Tags Modal */}
      {tagsFile && (
        <TagsModal
          fileId={tagsFile.id}
          fileName={tagsFile.name}
          onClose={() => setTagsFile(null)}
          onUpdate={onRefresh}
        />
      )}

      {/* Comments Modal */}
      {commentsFile && (
        <CommentsModal
          fileId={commentsFile.id}
          fileName={commentsFile.name}
          onClose={() => setCommentsFile(null)}
        />
      )}

      {/* File Details Modal */}
      {detailsFile && (
        <FileDetailsModal
          file={detailsFile}
          onClose={() => setDetailsFile(null)}
        />
      )}
    </>
  );
}
