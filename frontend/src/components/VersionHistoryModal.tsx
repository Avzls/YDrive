'use client';

import { useState, useEffect } from 'react';
import { X, Download, RotateCcw, Loader2, History, FileText, Image, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { filesApi, FileItem } from '@/lib/api';
import { toast } from 'sonner';
import { ConfirmModal } from './ConfirmModal';

interface FileVersion {
  id: string;
  versionNumber: number;
  sizeBytes: number;
  createdAt: string;
  comment?: string;
  uploadedBy?: {
    id: string;
    name: string;
    email: string;
  };
}

interface VersionHistoryModalProps {
  file: FileItem;
  onClose: () => void;
  onRestore?: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function VersionHistoryModal({ file, onClose, onRestore }: VersionHistoryModalProps) {
  const [versions, setVersions] = useState<FileVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [restoreConfirm, setRestoreConfirm] = useState<FileVersion | null>(null);
  const [previewVersion, setPreviewVersion] = useState<FileVersion | null>(null);
  
  // Check if file type supports preview
  const isPreviewable = file.mimeType.startsWith('image/') || 
    file.mimeType.startsWith('video/') || 
    file.mimeType === 'application/pdf';
  
  const getVersionPreviewUrl = (versionId: string) => {
    return filesApi.getVersionDownloadUrl(versionId);
  };

  useEffect(() => {
    loadVersions();
  }, [file.id]);

  const loadVersions = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await filesApi.listVersions(file.id);
      setVersions(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load versions');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = (version: FileVersion) => {
    const url = filesApi.getVersionDownloadUrl(version.id);
    window.open(url, '_blank');
  };

  const handleRestoreClick = (version: FileVersion) => {
    if (restoring) return;
    setRestoreConfirm(version);
  };

  const handleRestoreConfirm = async () => {
    if (!restoreConfirm) return;
    
    setRestoring(restoreConfirm.id);
    setRestoreConfirm(null);
    
    try {
      await filesApi.restoreVersion(restoreConfirm.id);
      toast.success(`Restored to version ${restoreConfirm.versionNumber}`);
      loadVersions();
      onRestore?.();
    } catch (err: any) {
      toast.error(err.message || 'Failed to restore version');
    } finally {
      setRestoring(null);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <History className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Version History</h2>
                <p className="text-sm text-gray-500 truncate max-w-md">{file.name}</p>
              </div>
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
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
              </div>
            ) : error ? (
              <div className="text-center py-12">
                <p className="text-red-500">{error}</p>
                <button
                  onClick={loadVersions}
                  className="mt-4 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600"
                >
                  Retry
                </button>
              </div>
            ) : versions.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">No version history available</p>
                <p className="text-sm text-gray-400 mt-1">Upload a new version to start tracking history</p>
              </div>
            ) : (
              <div className="space-y-3">
                {versions.map((version, index) => (
                  <div
                    key={version.id}
                    className={`p-4 rounded-lg border transition-colors ${
                      index === 0 
                        ? 'border-purple-200 bg-purple-50' 
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      {/* Thumbnail */}
                      {isPreviewable && (
                        <div 
                          className="w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100 border border-gray-200 cursor-pointer hover:ring-2 hover:ring-purple-400 transition-all"
                          onClick={() => setPreviewVersion(version)}
                          title="Click to preview"
                        >
                          {file.mimeType.startsWith('image/') ? (
                            <img
                              src={getVersionPreviewUrl(version.id)}
                              alt={`Version ${version.versionNumber}`}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                                (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                              }}
                            />
                          ) : file.mimeType.startsWith('video/') ? (
                            <div className="w-full h-full flex items-center justify-center bg-gray-200">
                              <Eye className="w-6 h-6 text-gray-500" />
                            </div>
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-red-50">
                              <FileText className="w-6 h-6 text-red-500" />
                            </div>
                          )}
                          <div className="hidden w-full h-full flex items-center justify-center">
                            <Image className="w-6 h-6 text-gray-400" />
                          </div>
                        </div>
                      )}
                      
                      {/* Version info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`font-medium ${index === 0 ? 'text-purple-700' : 'text-gray-900'}`}>
                            Version {version.versionNumber}
                          </span>
                          {index === 0 && (
                            <span className="px-2 py-0.5 text-xs bg-purple-500 text-white rounded-full">
                              Current
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 mt-1">
                          {format(new Date(version.createdAt), 'MMM d, yyyy \'at\' h:mm a')}
                          {' · '}
                          {formatBytes(Number(version.sizeBytes))}
                        </p>
                        {version.uploadedBy && (
                          <p className="text-sm text-gray-400 mt-0.5">
                            by {version.uploadedBy.name || version.uploadedBy.email}
                          </p>
                        )}
                        {version.comment && (
                          <p className="text-sm text-gray-600 mt-2 italic">"{version.comment}"</p>
                        )}
                      </div>
                      
                      {/* Actions */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {isPreviewable && (
                          <button
                            onClick={() => setPreviewVersion(version)}
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                            title="Preview this version"
                          >
                            <Eye className="w-4 h-4 text-gray-600" />
                          </button>
                        )}
                        <button
                          onClick={() => handleDownload(version)}
                          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                          title="Download this version"
                        >
                          <Download className="w-4 h-4 text-gray-600" />
                        </button>
                        {index !== 0 && (
                          <button
                            onClick={() => handleRestoreClick(version)}
                            disabled={!!restoring}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50 transition-colors"
                            title="Restore to this version"
                          >
                            {restoring === version.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <RotateCcw className="w-4 h-4" />
                            )}
                            Restore
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
            <p className="text-xs text-gray-500 text-center">
              Restoring a version creates a new version based on the selected one
            </p>
          </div>
        </div>
      </div>

      {/* Restore Confirmation Modal */}
      {restoreConfirm && (
        <ConfirmModal
          title="Restore Version"
          message={`Restore "${file.name}" to version ${restoreConfirm.versionNumber}? This will create a new version based on this old version.`}
          confirmLabel="Restore"
          cancelLabel="Cancel"
          variant="info"
          onConfirm={handleRestoreConfirm}
          onCancel={() => setRestoreConfirm(null)}
        />
      )}
      
      {/* Version Preview Modal */}
      {previewVersion && (
        <div 
          className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setPreviewVersion(null)}
        >
          <button
            onClick={() => setPreviewVersion(null)}
            className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white"
          >
            <X className="w-6 h-6" />
          </button>
          <div className="absolute top-4 left-4 text-white">
            <p className="font-medium">{file.name}</p>
            <p className="text-sm text-gray-400">Version {previewVersion.versionNumber}</p>
          </div>
          <div onClick={(e) => e.stopPropagation()}>
            {file.mimeType.startsWith('image/') ? (
              <img
                src={getVersionPreviewUrl(previewVersion.id)}
                alt={`Version ${previewVersion.versionNumber}`}
                className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
              />
            ) : file.mimeType.startsWith('video/') ? (
              <video
                src={getVersionPreviewUrl(previewVersion.id)}
                controls
                autoPlay
                className="max-w-full max-h-[85vh] rounded-lg shadow-2xl"
              />
            ) : file.mimeType === 'application/pdf' ? (
              <iframe
                src={getVersionPreviewUrl(previewVersion.id)}
                className="w-[90vw] h-[85vh] max-w-5xl rounded-lg shadow-2xl bg-white"
                title={`Version ${previewVersion.versionNumber}`}
              />
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}
