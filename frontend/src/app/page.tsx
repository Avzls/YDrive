'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Settings,
  HelpCircle,
  ChevronRight,
  Home,
  Loader2,
  Menu,
  RefreshCw,
  LogOut,
  Upload
} from 'lucide-react';
import { useAuthStore } from '@/lib/store';
import { foldersApi, filesApi, Folder, FileItem, authApi, permissionsApi } from '@/lib/api';
import { Sidebar } from '@/components/Sidebar';
import { SearchBar } from '@/components/SearchBar';
import { FileBrowser } from '@/components/FileBrowser';
import { ViewToggle } from '@/components/ViewToggle';

interface BreadcrumbItem {
  id: string | null;
  name: string;
}

export default function HomePage() {
  const router = useRouter();
  const { user, logout, setUser, accessToken } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([{ id: null, name: 'My Drive' }]);
  const [currentView, setCurrentView] = useState<'drive' | 'shared' | 'recent' | 'starred' | 'trash'>('drive');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Drag & Drop state
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  // Hydrate store on mount
  useEffect(() => {
    useAuthStore.persist.rehydrate();
    setMounted(true);
  }, []);

  // Check auth on mount
  useEffect(() => {
    if (!mounted) return;
    
    const checkAuth = async () => {
      if (!accessToken) {
        router.push('/login');
        return;
      }
      try {
        const userData = await authApi.me();
        setUser(userData);
      } catch (err) {
        logout();
        router.push('/login');
      }
    };
    checkAuth();
  }, [mounted, accessToken]);

  const loadContents = useCallback(async () => {
    setLoading(true);
    try {
      if (currentView === 'trash') {
        // Load trashed items
        const [trashedFiles, trashedFolders] = await Promise.all([
          filesApi.listTrashed(),
          foldersApi.listTrashed(),
        ]);
        setFolders(trashedFolders);
        setFiles(trashedFiles);
      } else if (currentView === 'starred') {
        // Load starred items (both files and folders)
        const [starredFiles, starredFolders] = await Promise.all([
          filesApi.listStarred(),
          foldersApi.listStarred(),
        ]);
        setFolders(starredFolders);
        setFiles(starredFiles);
      } else if (currentView === 'recent') {
        // Load recently accessed files
        const recentFiles = await filesApi.listRecent();
        setFolders([]);
        setFiles(recentFiles);
      } else if (currentView === 'shared') {
        // Load files/folders shared with current user
        const sharedData = await permissionsApi.listSharedWithMe();
        setFolders(sharedData.folders);
        setFiles(sharedData.files);
      } else {
        // Normal drive view
        const data = await foldersApi.list(currentFolderId || undefined);
        setFolders(data.folders);
        setFiles(data.files);
      }
    } catch (err) {
      console.error('Failed to load contents:', err);
    } finally {
      setLoading(false);
    }
  }, [currentFolderId, currentView]);

  useEffect(() => {
    if (mounted && accessToken) {
      loadContents();
    }
  }, [mounted, currentFolderId, accessToken, loadContents, currentView]);

  const handleFolderClick = async (folderId: string) => {
    const folder = folders.find(f => f.id === folderId);
    if (folder) {
      setBreadcrumbs(prev => [...prev, { id: folderId, name: folder.name }]);
      setCurrentFolderId(folderId);
    }
  };

  const handleBreadcrumbClick = (index: number) => {
    const item = breadcrumbs[index];
    setBreadcrumbs(prev => prev.slice(0, index + 1));
    setCurrentFolderId(item.id);
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await foldersApi.create(newFolderName, currentFolderId || undefined);
      setNewFolderName('');
      setShowNewFolder(false);
      loadContents();
    } catch (err) {
      console.error('Failed to create folder:', err);
    }
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      // Clear search, reload normal contents
      loadContents();
      return;
    }
    
    setLoading(true);
    try {
      const [fileResults, folderResults] = await Promise.all([
        filesApi.search(query),
        foldersApi.search(query),
      ]);
      setFiles(fileResults);
      setFolders(folderResults);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const handleUpload = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    
    // Import FileUploader functions
    const { filesApi } = await import('@/lib/api');
    
    for (const file of Array.from(files)) {
      try {
        await filesApi.directUpload(file, currentFolderId || undefined);
      } catch (err) {
        console.error('Upload failed:', err);
      }
    }
    
    loadContents();
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Drag & Drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;

    const droppedFiles = e.dataTransfer.files;
    if (!droppedFiles?.length) return;

    // Don't allow drop in trash or special views
    if (currentView !== 'drive') return;

    for (const file of Array.from(droppedFiles)) {
      try {
        await filesApi.directUpload(file, currentFolderId || undefined);
      } catch (err) {
        console.error('Upload failed:', err);
      }
    }
    
    loadContents();
  };

  if (!mounted) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (!accessToken) {
    return null;
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200">
        <div className="h-16 px-4 flex items-center justify-between gap-4">
          {/* Logo & Menu */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="p-2 hover:bg-gray-100 rounded-full lg:hidden"
            >
              <Menu className="w-5 h-5 text-gray-600" />
            </button>
            <div className="flex items-center gap-2">
              <img src="/logo.png" alt="Drive" className="w-10 h-10 object-contain" />
              <span className="text-xl text-gray-600 font-normal hidden sm:block">Drive</span>
            </div>
          </div>

          {/* Search Bar */}
          <SearchBar onSearch={handleSearch} />

          {/* Right Actions */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <button className="p-2 hover:bg-gray-100 rounded-full" title="Support">
              <HelpCircle className="w-5 h-5 text-gray-600" />
            </button>
            <button className="p-2 hover:bg-gray-100 rounded-full" title="Settings">
              <Settings className="w-5 h-5 text-gray-600" />
            </button>
            
            {/* User Avatar with Dropdown */}
            <div className="relative ml-2">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-medium hover:shadow-md transition-shadow"
                title={user?.name || 'User'}
              >
                {user?.name?.charAt(0).toUpperCase() || 'U'}
              </button>

              {/* User Dropdown Menu */}
              {showUserMenu && (
                <>
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={() => setShowUserMenu(false)} 
                  />
                  <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
                    {/* User Info */}
                    <div className="px-4 py-3 border-b border-gray-200">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center text-lg font-medium">
                          {user?.name?.charAt(0).toUpperCase() || 'U'}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{user?.name}</p>
                          <p className="text-sm text-gray-500">{user?.email}</p>
                        </div>
                      </div>
                    </div>
                    {/* Logout Button */}
                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        handleLogout();
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-gray-700 hover:bg-gray-100 transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Sign out</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          currentView={currentView}
          onViewChange={setCurrentView}
          onNewFolder={() => setShowNewFolder(true)}
          onUpload={handleUpload}
          storageUsed={user?.storageUsedBytes || 0}
          storageQuota={user?.storageQuotaBytes || 0}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          isAdmin={user?.isAdmin || false}
          onAdminClick={() => router.push('/admin')}
        />

        {/* Main Content */}
        <main 
          className="flex-1 overflow-auto bg-white relative"
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {/* Drop Overlay */}
          {isDragging && currentView === 'drive' && (
            <div className="absolute inset-0 z-50 bg-blue-500/10 backdrop-blur-sm flex items-center justify-center border-4 border-dashed border-blue-500 rounded-lg m-2 pointer-events-none">
              <div className="text-center">
                <Upload className="w-16 h-16 text-blue-500 mx-auto mb-4" />
                <p className="text-xl font-semibold text-blue-700">Drop files to upload</p>
                <p className="text-sm text-blue-600 mt-1">Files will be uploaded to current folder</p>
              </div>
            </div>
          )}
          {/* Toolbar */}
          <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3">
            <div className="flex items-center justify-between">
              {/* Breadcrumbs */}
              <nav className="flex items-center gap-1 text-sm">
                {breadcrumbs.map((item, index) => (
                  <div key={index} className="flex items-center">
                    {index > 0 && <ChevronRight className="w-4 h-4 text-gray-400 mx-1" />}
                    <button
                      onClick={() => handleBreadcrumbClick(index)}
                      className={`flex items-center gap-1 px-2 py-1 rounded-md transition-colors ${
                        index === breadcrumbs.length - 1
                          ? 'text-gray-900 font-medium'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {index === 0 && <Home className="w-4 h-4" />}
                      <span>{item.name}</span>
                    </button>
                  </div>
                ))}
              </nav>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <button
                  onClick={loadContents}
                  disabled={loading}
                  className="flex items-center gap-2 px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-50"
                  title="Refresh"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  <span className="text-sm hidden sm:inline">Refresh</span>
                </button>
                <ViewToggle view={viewMode} onViewChange={setViewMode} />
              </div>
            </div>
          </div>

          {/* Content Area */}
          <div className="p-6">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              </div>
            ) : (
              <FileBrowser
                folders={folders}
                files={files}
                onFolderClick={handleFolderClick}
                onRefresh={loadContents}
                viewMode={viewMode}
                isTrashView={currentView === 'trash'}
              />
            )}
          </div>
        </main>
      </div>

      {/* Hidden file input for uploads */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* New Folder Modal */}
      {showNewFolder && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-md shadow-xl animate-slide-in">
            <div className="p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">New folder</h3>
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Untitled folder"
                className="w-full px-4 py-3 rounded-md border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
              />
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-200">
              <button
                onClick={() => {
                  setShowNewFolder(false);
                  setNewFolderName('');
                }}
                className="px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-md font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
