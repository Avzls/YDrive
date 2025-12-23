'use client';

import { useState, useEffect } from 'react';
import { X, FolderIcon, ChevronRight, Home } from 'lucide-react';
import { Folder, foldersApi } from '@/lib/api';

interface MoveModalProps {
  itemName: string;
  currentFolderId?: string;
  onMove: (targetFolderId: string | null) => void;
  onClose: () => void;
}

export function MoveModal({ itemName, currentFolderId, onMove, onClose }: MoveModalProps) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [currentPath, setCurrentPath] = useState<Folder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadFolders = async (parentId?: string) => {
    setLoading(true);
    try {
      const data = await foldersApi.list(parentId);
      setFolders(data.folders);
    } catch (err) {
      console.error('Failed to load folders:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFolders();
  }, []);

  const navigateToFolder = async (folder: Folder) => {
    setCurrentPath([...currentPath, folder]);
    await loadFolders(folder.id);
    setSelectedFolderId(null);
  };

  const navigateToRoot = async () => {
    setCurrentPath([]);
    await loadFolders();
    setSelectedFolderId(null);
  };

  const navigateBack = async (index: number) => {
    const newPath = currentPath.slice(0, index + 1);
    setCurrentPath(newPath);
    await loadFolders(newPath[newPath.length - 1]?.id);
    setSelectedFolderId(null);
  };

  const handleMove = () => {
    // If no folder selected, move to current viewed folder (or root if at root)
    const targetId = selectedFolderId ?? (currentPath.length > 0 ? currentPath[currentPath.length - 1].id : null);
    onMove(targetId);
    onClose();
  };

  const getCurrentFolderId = () => {
    return currentPath.length > 0 ? currentPath[currentPath.length - 1].id : null;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div 
        className="bg-white rounded-lg shadow-xl w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">
            Move "{itemName}"
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Breadcrumb */}
        <div className="flex items-center gap-1 px-4 py-2 bg-gray-50 text-sm overflow-x-auto">
          <button 
            onClick={navigateToRoot}
            className="flex items-center gap-1 text-blue-600 hover:underline flex-shrink-0"
          >
            <Home className="w-4 h-4" />
            My Drive
          </button>
          {currentPath.map((folder, index) => (
            <div key={folder.id} className="flex items-center gap-1 flex-shrink-0">
              <ChevronRight className="w-4 h-4 text-gray-400" />
              <button 
                onClick={() => navigateBack(index)}
                className="text-blue-600 hover:underline"
              >
                {folder.name}
              </button>
            </div>
          ))}
        </div>

        {/* Folder list */}
        <div className="h-64 overflow-y-auto p-2">
          {loading ? (
            <div className="flex items-center justify-center h-full text-gray-400">
              Loading...
            </div>
          ) : folders.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-400">
              No folders here
            </div>
          ) : (
            folders
              .filter(f => f.id !== currentFolderId) // Don't show current folder
              .map((folder) => (
                <div
                  key={folder.id}
                  onDoubleClick={() => navigateToFolder(folder)}
                  onClick={() => setSelectedFolderId(folder.id === selectedFolderId ? null : folder.id)}
                  className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer ${
                    selectedFolderId === folder.id 
                      ? 'bg-blue-50 border border-blue-200' 
                      : 'hover:bg-gray-100'
                  }`}
                >
                  <FolderIcon className="w-6 h-6 text-gray-400 fill-gray-100" />
                  <span className="text-gray-700">{folder.name}</span>
                </div>
              ))
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-between items-center p-4 border-t bg-gray-50">
          <p className="text-xs text-gray-500">
            Double-click to open folder
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={handleMove}
              disabled={getCurrentFolderId() === currentFolderId}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Move here
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
