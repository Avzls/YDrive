'use client';

import { useState } from 'react';
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
  Loader2
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { FileItem, Folder, filesApi, foldersApi } from '@/lib/api';
import { FilePreview } from './FilePreview';
import { ShareModal } from './ShareModal';
import { RenameModal } from './RenameModal';
import { MoveModal } from './MoveModal';
import { ContextMenu, getFileContextMenuItems, getFolderContextMenuItems, getTrashedFileContextMenuItems, getTrashedFolderContextMenuItems } from './ContextMenu';

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
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; type: 'file' | 'folder'; item: FileItem | Folder } | null>(null);

  const handleContextMenu = (e: React.MouseEvent, type: 'file' | 'folder', item: FileItem | Folder) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, type, item });
  };

  const handleDownload = async (file: FileItem) => {
    try {
      const url = await filesApi.getDownloadUrl(file.id);
      window.open(url, '_blank');
    } catch (err) {
      console.error('Download failed:', err);
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
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {/* Folders */}
          {folders.map((folder) => (
            <div
              key={folder.id}
              onClick={() => onFolderClick(folder.id)}
              onContextMenu={(e) => handleContextMenu(e, 'folder', folder)}
              className="file-card group flex flex-col items-center p-4 rounded-lg border border-transparent hover:border-gray-200 cursor-pointer"
            >
              <div className="w-12 h-12 mb-2 flex items-center justify-center">
                <FolderIcon className="w-12 h-12 text-gray-400 fill-gray-100" />
              </div>
              <p className="text-sm text-gray-700 text-center truncate w-full">{folder.name}</p>
            </div>
          ))}

          {/* Files */}
          {files.map((file) => {
            const IconComponent = getFileIcon(file.mimeType);
            const iconColor = getFileIconColor(file.mimeType);
            return (
              <div
                key={file.id}
                onClick={() => file.status === 'ready' && setPreviewFile(file)}
                onContextMenu={(e) => handleContextMenu(e, 'file', file)}
                className="file-card group flex flex-col items-center p-4 rounded-lg border border-transparent hover:border-gray-200 cursor-pointer relative"
              >
                <div className="w-12 h-12 mb-2 flex items-center justify-center">
                  <IconComponent className={`w-12 h-12 ${iconColor}`} />
                </div>
                <p className="text-sm text-gray-700 text-center truncate w-full">{file.name}</p>
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
                  onDelete: () => handleDelete(contextMenu.item as FileItem),
                  onDetails: () => console.log('Details:', contextMenu.item),
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
            onMove={handleMoveFile}
            onClose={() => setMoveItem(null)}
          />
        )}
      </>
    );
  }

  // List View
  return (
    <>
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-gray-50 border-b border-gray-200 text-sm font-medium text-gray-600">
          <div className="col-span-6">Name</div>
          <div className="col-span-2">Owner</div>
          <div className="col-span-2">Last modified</div>
          <div className="col-span-2">File size</div>
        </div>

        {/* Folders */}
        {folders.map((folder) => (
          <div
            key={folder.id}
            onClick={() => onFolderClick(folder.id)}
            onContextMenu={(e) => handleContextMenu(e, 'folder', folder)}
            className="grid grid-cols-12 gap-4 px-4 py-3 border-b border-gray-100 hover:bg-gray-50 cursor-pointer items-center"
          >
            <div className="col-span-6 flex items-center gap-3">
              <FolderIcon className="w-6 h-6 text-gray-400 fill-gray-100" />
              <span className="text-gray-700 truncate">{folder.name}</span>
            </div>
            <div className="col-span-2 text-sm text-gray-500">me</div>
            <div className="col-span-2 text-sm text-gray-500">
              {format(new Date(folder.createdAt), 'MMM d, yyyy')}
            </div>
            <div className="col-span-2 text-sm text-gray-500">—</div>
          </div>
        ))}

        {/* Files */}
        {files.map((file) => {
          const IconComponent = getFileIcon(file.mimeType);
          const iconColor = getFileIconColor(file.mimeType);
          return (
            <div
              key={file.id}
              onClick={() => file.status === 'ready' && setPreviewFile(file)}
              onContextMenu={(e) => handleContextMenu(e, 'file', file)}
              className="grid grid-cols-12 gap-4 px-4 py-3 border-b border-gray-100 hover:bg-gray-50 cursor-pointer items-center group"
            >
              <div className="col-span-6 flex items-center gap-3">
                <IconComponent className={`w-6 h-6 ${iconColor}`} />
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
                onDelete: () => handleDelete(contextMenu.item as FileItem),
                onDetails: () => console.log('Details:', contextMenu.item),
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
    </>
  );
}
