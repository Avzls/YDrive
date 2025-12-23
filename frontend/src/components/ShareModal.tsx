'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Copy, Check, Link, Trash2, ExternalLink, Lock, Download, Calendar, Users, Search, UserPlus, Loader2 } from 'lucide-react';
import { FileItem, Folder, ShareLink, sharingApi, permissionsApi, SharedUser, PermissionEntry } from '@/lib/api';
import { format } from 'date-fns';

interface ShareModalProps {
  file?: FileItem;
  folder?: Folder;
  onClose: () => void;
}

export function ShareModal({ file, folder, onClose }: ShareModalProps) {
  const itemId = file?.id || folder?.id || '';
  const itemName = file?.name || folder?.name || '';
  const isFolder = !!folder;
  const resourceType = isFolder ? 'folder' : 'file';

  // Link sharing state
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const [allowDownload, setAllowDownload] = useState(true);
  const [password, setPassword] = useState('');
  const [expiresIn, setExpiresIn] = useState<string>('');

  // User sharing state
  const [activeTab, setActiveTab] = useState<'users' | 'links'>('users');
  const [userSearch, setUserSearch] = useState('');
  const [searchResults, setSearchResults] = useState<SharedUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [sharedUsers, setSharedUsers] = useState<PermissionEntry[]>([]);
  const [selectedRole, setSelectedRole] = useState<'viewer' | 'editor'>('viewer');
  const [sharingUser, setSharingUser] = useState(false);

  useEffect(() => {
    loadData();
  }, [itemId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [linksResult, usersResult] = await Promise.all([
        isFolder 
          ? sharingApi.listLinks(undefined, itemId)
          : sharingApi.listLinks(itemId),
        permissionsApi.listAccess(itemId, resourceType),
      ]);
      setLinks(linksResult);
      setSharedUsers(usersResult);
    } catch (err) {
      console.error('Failed to load sharing data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Debounced user search
  const handleUserSearch = useCallback(async (query: string) => {
    setUserSearch(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    
    setSearching(true);
    try {
      const results = await permissionsApi.searchUsers(query);
      // Filter out users who already have access
      const existingIds = new Set(sharedUsers.map(u => u.userId));
      setSearchResults(results.filter(u => !existingIds.has(u.id)));
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setSearching(false);
    }
  }, [sharedUsers]);

  const handleShareWithUser = async (user: SharedUser) => {
    setSharingUser(true);
    try {
      await permissionsApi.shareWith(itemId, resourceType, user.id, selectedRole);
      setUserSearch('');
      setSearchResults([]);
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to share');
    } finally {
      setSharingUser(false);
    }
  };

  const handleRevokeAccess = async (userId: string) => {
    try {
      await permissionsApi.revokeAccess(itemId, resourceType, userId);
      setSharedUsers(sharedUsers.filter(u => u.userId !== userId));
    } catch (err) {
      console.error('Failed to revoke access:', err);
    }
  };

  const createLink = async () => {
    try {
      setCreating(true);
      setError(null);

      const options: any = { allowDownload };
      if (password) options.password = password;
      if (expiresIn) {
        const days = parseInt(expiresIn);
        if (days > 0) {
          const expiry = new Date();
          expiry.setDate(expiry.getDate() + days);
          options.expiresAt = expiry;
        }
      }

      const newLink = isFolder
        ? await sharingApi.createFolderLink(itemId, options)
        : await sharingApi.createLink(itemId, options);
      setLinks([newLink, ...links]);
      
      setShowOptions(false);
      setPassword('');
      setExpiresIn('');
      
      copyToClipboard(newLink.shareUrl, newLink.id);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create link');
    } finally {
      setCreating(false);
    }
  };

  const deleteLink = async (linkId: string) => {
    try {
      await sharingApi.deleteLink(linkId);
      setLinks(links.filter(l => l.id !== linkId));
    } catch (err) {
      console.error('Failed to delete link:', err);
    }
  };

  const copyToClipboard = async (text: string, linkId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(linkId);
      setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'owner': return 'bg-purple-100 text-purple-700';
      case 'editor': return 'bg-blue-100 text-blue-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div 
        className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Share "{itemName}"</h2>
            <p className="text-sm text-gray-500">Share with people or create a public link</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b px-6">
          <button
            onClick={() => setActiveTab('users')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'users'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Users className="w-4 h-4 inline mr-2" />
            People
          </button>
          <button
            onClick={() => setActiveTab('links')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'links'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Link className="w-4 h-4 inline mr-2" />
            Links
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {activeTab === 'users' ? (
            <div className="space-y-4">
              {/* User Search */}
              <div className="relative">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={userSearch}
                      onChange={(e) => handleUserSearch(e.target.value)}
                      placeholder="Search by NIP, name, or email..."
                      className="w-full pl-9 pr-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {searching && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
                    )}
                  </div>
                  <select
                    value={selectedRole}
                    onChange={(e) => setSelectedRole(e.target.value as 'viewer' | 'editor')}
                    className="px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                  </select>
                </div>

                {/* Search Results Dropdown */}
                {searchResults.length > 0 && (
                  <div className="absolute left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg z-10 max-h-48 overflow-auto">
                    {searchResults.map((user) => (
                      <button
                        key={user.id}
                        onClick={() => handleShareWithUser(user)}
                        disabled={sharingUser}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left"
                      >
                        <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-medium">
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{user.name}</p>
                          <p className="text-xs text-gray-500 truncate">{user.nip} • {user.email}</p>
                        </div>
                        <UserPlus className="w-4 h-4 text-blue-500" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {error && (
                <p className="text-sm text-red-500 bg-red-50 p-3 rounded-lg">{error}</p>
              )}

              {/* People with access */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">
                  {sharedUsers.length > 0 ? 'People with access' : 'No people have access yet'}
                </h3>
                
                {loading ? (
                  <div className="text-center py-4">
                    <Loader2 className="w-6 h-6 text-blue-500 animate-spin mx-auto" />
                  </div>
                ) : (
                  <div className="space-y-2">
                    {sharedUsers.map((perm) => (
                      <div
                        key={perm.id}
                        className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg group"
                      >
                        <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-medium">
                          {perm.user?.name?.charAt(0).toUpperCase() || 'U'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {perm.user?.name || 'Unknown User'}
                          </p>
                          <p className="text-xs text-gray-500 truncate">
                            {perm.user?.email}
                          </p>
                        </div>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRoleBadgeColor(perm.role)}`}>
                          {perm.role}
                        </span>
                        {perm.role !== 'owner' && (
                          <button
                            onClick={() => handleRevokeAccess(perm.userId)}
                            className="p-2 hover:bg-red-100 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                            title="Remove access"
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div>
              {/* Create new link section */}
              <div className="mb-6">
                {!showOptions ? (
                  <button
                    onClick={() => setShowOptions(true)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                  >
                    <Link className="w-5 h-5" />
                    Get shareable link
                  </button>
                ) : (
                  <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
                    <h3 className="font-medium text-gray-900">Link options</h3>
                    
                    {/* Allow download */}
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={allowDownload}
                        onChange={(e) => setAllowDownload(e.target.checked)}
                        className="w-4 h-4 text-blue-500 rounded"
                      />
                      <Download className="w-4 h-4 text-gray-500" />
                      <span className="text-sm text-gray-700">Allow download</span>
                    </label>

                    {/* Password protection */}
                    <div className="flex items-center gap-3">
                      <Lock className="w-4 h-4 text-gray-500" />
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Password (optional)"
                        className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    {/* Expiry */}
                    <div className="flex items-center gap-3">
                      <Calendar className="w-4 h-4 text-gray-500" />
                      <select
                        value={expiresIn}
                        onChange={(e) => setExpiresIn(e.target.value)}
                        className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">No expiration</option>
                        <option value="1">1 day</option>
                        <option value="7">7 days</option>
                        <option value="30">30 days</option>
                        <option value="90">90 days</option>
                      </select>
                    </div>

                    {error && (
                      <p className="text-sm text-red-500">{error}</p>
                    )}

                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowOptions(false)}
                        className="flex-1 px-4 py-2 text-gray-700 border rounded-lg hover:bg-gray-100 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={createLink}
                        disabled={creating}
                        className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
                      >
                        {creating ? 'Creating...' : 'Create link'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Existing links */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">
                  {links.length > 0 ? 'Active links' : 'No active links'}
                </h3>

                {loading ? (
                  <div className="text-center py-4 text-gray-500">Loading...</div>
                ) : (
                  <div className="space-y-2">
                    {links.map((link) => (
                      <div
                        key={link.id}
                        className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg group"
                      >
                        <Link className="w-5 h-5 text-gray-400 flex-shrink-0" />
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-700 font-mono truncate">
                              {link.shareUrl.replace(/^https?:\/\//, '')}
                            </span>
                            {link.expiresAt && (
                              <span className="text-xs text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded">
                                Expires {format(new Date(link.expiresAt), 'MMM d')}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {!link.allowDownload && (
                              <span className="text-xs text-gray-500">No download</span>
                            )}
                            <span className="text-xs text-gray-400">
                              {link.accessCount} views
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => copyToClipboard(link.shareUrl, link.id)}
                            className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                            title="Copy link"
                          >
                            {copied === link.id ? (
                              <Check className="w-4 h-4 text-green-500" />
                            ) : (
                              <Copy className="w-4 h-4 text-gray-500" />
                            )}
                          </button>
                          <button
                            onClick={() => window.open(link.shareUrl, '_blank')}
                            className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                            title="Open link"
                          >
                            <ExternalLink className="w-4 h-4 text-gray-500" />
                          </button>
                          <button
                            onClick={() => deleteLink(link.id)}
                            className="p-2 hover:bg-red-100 rounded-lg transition-colors"
                            title="Delete link"
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 rounded-b-xl">
          <p className="text-xs text-gray-500 text-center">
            {activeTab === 'users' 
              ? 'People you share with will see this in their "Shared with me" folder'
              : `Anyone with the link can ${links.some(l => l.allowDownload) ? 'view and download' : 'view'} this ${isFolder ? 'folder' : 'file'}`
            }
          </p>
        </div>
      </div>
    </div>
  );
}
