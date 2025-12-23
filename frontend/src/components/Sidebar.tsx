'use client';

import { useState } from 'react';
import {
  HardDrive,
  Users,
  Star,
  Trash2,
  Plus,
  Cloud,
  ChevronDown,
  FolderPlus,
  FileUp,
  Menu,
  Clock,
} from 'lucide-react';

interface SidebarProps {
  currentView: 'drive' | 'shared' | 'recent' | 'starred' | 'trash';
  onViewChange: (view: 'drive' | 'shared' | 'recent' | 'starred' | 'trash') => void;
  onNewFolder: () => void;
  onUpload: () => void;

  storageUsed?: number;
  storageQuota?: number;

  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

const NAV_ITEMS = [
  { id: 'drive', label: 'My Drive', icon: HardDrive },
  { id: 'shared', label: 'Shared with me', icon: Users },
  { id: 'recent', label: 'Recent', icon: Clock },
  { id: 'starred', label: 'Starred', icon: Star },
  { id: 'trash', label: 'Trash', icon: Trash2 },
] as const;

export function Sidebar({
  currentView,
  onViewChange,
  onNewFolder,
  onUpload,
  storageUsed = 0,
  storageQuota = 0,
  collapsed = false,
  onToggleCollapse,
}: SidebarProps) {
  const [showNewMenu, setShowNewMenu] = useState(false);

  const formatStorage = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  if (collapsed) {
    return (
      <aside className="w-16 bg-white border-r border-gray-200 flex flex-col py-4">
        <button
          onClick={onToggleCollapse}
          className="mx-auto p-2 hover:bg-gray-100 rounded-full mb-4"
        >
          <Menu className="w-5 h-5 text-gray-600" />
        </button>

        <div className="flex-1 flex flex-col items-center gap-2">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onViewChange(item.id)}
                className={`p-3 rounded-full transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
                title={item.label}
              >
                <Icon className="w-5 h-5" />
              </button>
            );
          })}
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
      {/* New Button */}
      <div className="p-4">
        <div className="relative">
          <button
            onClick={() => setShowNewMenu(!showNewMenu)}
            className="flex items-center gap-3 px-6 py-3 bg-white border border-gray-300 rounded-2xl shadow-sm hover:shadow-md hover:bg-gray-50 transition-all"
          >
            <Plus className="w-5 h-5 text-gray-700" />
            <span className="font-medium text-gray-700">New</span>
            <ChevronDown
              className={`w-4 h-4 text-gray-500 transition-transform ${
                showNewMenu ? 'rotate-180' : ''
              }`}
            />
          </button>

          {/* New Menu Dropdown */}
          {showNewMenu && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowNewMenu(false)}
              />
              <div className="absolute left-0 top-full mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-20">
                <button
                  onClick={() => {
                    onNewFolder();
                    setShowNewMenu(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-gray-700 hover:bg-gray-100"
                >
                  <FolderPlus className="w-5 h-5" />
                  <span>New folder</span>
                </button>
                <hr className="my-2 border-gray-200" />
                <button
                  onClick={() => {
                    onUpload();
                    setShowNewMenu(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-gray-700 hover:bg-gray-100"
                >
                  <FileUp className="w-5 h-5" />
                  <span>File upload</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-full transition-colors mb-1 ${
                isActive
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? 'text-blue-600' : ''}`} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Storage with Progress Bar */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center gap-2 mb-2">
          <Cloud className="w-5 h-5 text-gray-500" />
          <span className="text-sm text-gray-600">Storage</span>
        </div>

        {/* Progress Bar */}
        {storageQuota > 0 && (
          <div className="w-full h-1.5 bg-gray-200 rounded-full mb-2 overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all ${
                (storageUsed / storageQuota) > 0.9 ? 'bg-red-500' :
                (storageUsed / storageQuota) > 0.7 ? 'bg-yellow-500' : 'bg-blue-500'
              }`}
              style={{ width: `${Math.min((storageUsed / storageQuota) * 100, 100)}%` }}
            />
          </div>
        )}

        <p className="text-xs text-gray-500">
          {formatStorage(storageUsed)} of {storageQuota > 0 ? formatStorage(storageQuota) : 'Unlimited'}
        </p>
      </div>
    </aside>
  );
}
