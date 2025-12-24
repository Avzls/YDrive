'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Eye,
  Download,
  Share2,
  Star,
  Pencil,
  FolderInput,
  Trash2,
  Copy,
  Info,
  RotateCcw,
  XCircle,
  History,
  Upload
} from 'lucide-react';

interface ContextMenuItem {
  id: string;
  label: string;
  icon: React.ElementType;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  divider?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });

  useEffect(() => {
    // Adjust position if menu would go off screen
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const newX = x + rect.width > window.innerWidth ? window.innerWidth - rect.width - 8 : x;
      const newY = y + rect.height > window.innerHeight ? window.innerHeight - rect.height - 8 : y;
      setPosition({ x: newX, y: newY });
    }
  }, [x, y]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const handleScroll = () => onClose();

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEscape);
    document.addEventListener('scroll', handleScroll, true);

    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEscape);
      document.removeEventListener('scroll', handleScroll, true);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[200px] bg-white rounded-lg shadow-lg border border-gray-200 py-2"
      style={{ left: position.x, top: position.y }}
    >
      {items.map((item, index) => (
        <div key={item.id}>
          {item.divider && index > 0 && <hr className="my-1 border-gray-200" />}
          <button
            onClick={() => {
              if (!item.disabled) {
                item.onClick();
                onClose();
              }
            }}
            disabled={item.disabled}
            className={`w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors ${
              item.disabled
                ? 'text-gray-400 cursor-not-allowed'
                : item.danger
                ? 'text-red-600 hover:bg-red-50'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <item.icon className="w-4 h-4" />
            <span>{item.label}</span>
          </button>
        </div>
      ))}
    </div>,
    document.body
  );
}

export function getFileContextMenuItems(
  file: { id: string; name: string; status: string; isStarred?: boolean },
  callbacks: {
    onPreview: () => void;
    onDownload: () => void;
    onShare: () => void;
    onStar: () => void;
    onRename: () => void;
    onMove: () => void;
    onDelete: () => void;
    onDetails: () => void;
    onVersionHistory?: () => void;
    onUploadNewVersion?: () => void;
  }
): ContextMenuItem[] {
  const isReady = file.status === 'ready';

  const items: ContextMenuItem[] = [
    { id: 'preview', label: 'Preview', icon: Eye, onClick: callbacks.onPreview, disabled: !isReady },
    { id: 'download', label: 'Download', icon: Download, onClick: callbacks.onDownload, disabled: !isReady },
    { id: 'share', label: 'Share', icon: Share2, onClick: callbacks.onShare, divider: true },
    { id: 'star', label: file.isStarred ? 'Remove from Starred' : 'Add to Starred', icon: Star, onClick: callbacks.onStar },
    { id: 'rename', label: 'Rename', icon: Pencil, onClick: callbacks.onRename },
    { id: 'move', label: 'Move to', icon: FolderInput, onClick: callbacks.onMove },
  ];

  if (callbacks.onVersionHistory) {
    items.push({ id: 'versions', label: 'Version history', icon: History, onClick: callbacks.onVersionHistory });
  }

  if (callbacks.onUploadNewVersion) {
    items.push({ id: 'upload-version', label: 'Upload new version', icon: Upload, onClick: callbacks.onUploadNewVersion });
  }

  items.push(
    { id: 'details', label: 'File details', icon: Info, onClick: callbacks.onDetails, divider: true },
    { id: 'delete', label: 'Move to trash', icon: Trash2, onClick: callbacks.onDelete, danger: true, divider: true },
  );

  return items;
}

// Helper function to create folder context menu items
export function getFolderContextMenuItems(
  folder: { id: string; name: string; isStarred?: boolean },
  callbacks: {
    onOpen: () => void;
    onDownload: () => void;
    onShare: () => void;
    onStar: () => void;
    onRename: () => void;
    onMove: () => void;
    onDelete: () => void;
  }
): ContextMenuItem[] {
  return [
    { id: 'open', label: 'Open', icon: Eye, onClick: callbacks.onOpen },
    { id: 'download', label: 'Download as ZIP', icon: Download, onClick: callbacks.onDownload },
    { id: 'share', label: 'Share', icon: Share2, onClick: callbacks.onShare, divider: true },
    { id: 'star', label: folder.isStarred ? 'Remove from Starred' : 'Add to Starred', icon: Star, onClick: callbacks.onStar },
    { id: 'rename', label: 'Rename', icon: Pencil, onClick: callbacks.onRename },
    { id: 'move', label: 'Move to', icon: FolderInput, onClick: callbacks.onMove },
    { id: 'delete', label: 'Move to trash', icon: Trash2, onClick: callbacks.onDelete, danger: true, divider: true },
  ];
}

// Trash view - file context menu items
export function getTrashedFileContextMenuItems(
  file: { id: string; name: string },
  callbacks: {
    onRestore: () => void;
    onPermanentDelete: () => void;
  }
): ContextMenuItem[] {
  return [
    { id: 'restore', label: 'Restore', icon: RotateCcw, onClick: callbacks.onRestore },
    { id: 'permanent-delete', label: 'Delete permanently', icon: XCircle, onClick: callbacks.onPermanentDelete, danger: true },
  ];
}

// Trash view - folder context menu items
export function getTrashedFolderContextMenuItems(
  folder: { id: string; name: string },
  callbacks: {
    onRestore: () => void;
    onPermanentDelete: () => void;
  }
): ContextMenuItem[] {
  return [
    { id: 'restore', label: 'Restore', icon: RotateCcw, onClick: callbacks.onRestore },
    { id: 'permanent-delete', label: 'Delete permanently', icon: XCircle, onClick: callbacks.onPermanentDelete, danger: true },
  ];
}
