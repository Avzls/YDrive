'use client';

import { useState, useEffect } from 'react';
import { X, Copy, Check, Link, Trash2, ExternalLink, Lock, Download, Calendar } from 'lucide-react';
import { FileItem, Folder, ShareLink, sharingApi } from '@/lib/api';
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
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Options for new link
  const [showOptions, setShowOptions] = useState(false);
  const [allowDownload, setAllowDownload] = useState(true);
  const [password, setPassword] = useState('');
  const [expiresIn, setExpiresIn] = useState<string>('');

  useEffect(() => {
    loadLinks();
  }, [itemId]);

  const loadLinks = async () => {
    try {
      setLoading(true);
      const result = isFolder 
        ? await sharingApi.listLinks(undefined, itemId)
        : await sharingApi.listLinks(itemId);
      setLinks(result);
    } catch (err) {
      console.error('Failed to load links:', err);
    } finally {
      setLoading(false);
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
      
      // Reset options
      setShowOptions(false);
      setPassword('');
      setExpiresIn('');
      
      // Auto-copy new link
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
            <p className="text-sm text-gray-500">Create a link to share with anyone</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
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

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 rounded-b-xl">
          <p className="text-xs text-gray-500 text-center">
            Anyone with the link can {links.some(l => l.allowDownload) ? 'view and download' : 'view'} this file
          </p>
        </div>
      </div>
    </div>
  );
}
