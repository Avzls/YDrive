'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Download, FileText, Lock, AlertCircle, Image, Film, Music } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

interface ShareInfo {
  type: 'file' | 'folder';
  file?: {
    id: string;
    name: string;
    mimeType: string;
    sizeBytes: number;
    hasPreview: boolean;
  };
  downloadUrl?: string;
}

interface CheckResult {
  valid: boolean;
  requiresPassword?: boolean;
  allowDownload?: boolean;
  type?: 'file' | 'folder';
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return Image;
  if (mimeType.startsWith('video/')) return Film;
  if (mimeType.startsWith('audio/')) return Music;
  return FileText;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export default function SharePage() {
  const params = useParams();
  const token = params.token as string;

  const [loading, setLoading] = useState(true);
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [shareInfo, setShareInfo] = useState<ShareInfo | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [passwordRequired, setPasswordRequired] = useState(false);

  useEffect(() => {
    checkLink();
  }, [token]);

  const checkLink = async () => {
    try {
      const res = await fetch(`${API_BASE}/share/${token}/check`);
      const data: CheckResult = await res.json();
      setCheckResult(data);

      if (!data.valid) {
        setError('This link is invalid or has expired');
        setLoading(false);
        return;
      }

      if (data.requiresPassword) {
        setPasswordRequired(true);
        setLoading(false);
        return;
      }

      // No password required, get info directly
      await getInfo();
    } catch (err) {
      setError('Failed to load shared content');
      setLoading(false);
    }
  };

  const getInfo = async (pwd?: string) => {
    try {
      setLoading(true);
      setError(null);
      
      const url = new URL(`${API_BASE}/share/${token}/info`);
      if (pwd) url.searchParams.set('password', pwd);
      
      const res = await fetch(url.toString());
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || 'Invalid password');
      }

      const data: ShareInfo = await res.json();
      setShareInfo(data);
      setPasswordRequired(false);
    } catch (err: any) {
      setError(err.message || 'Failed to access shared content');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    getInfo(password);
  };

  const getPreviewUrl = () => {
    const url = new URL(`${API_BASE}/share/${token}/preview`);
    if (password) url.searchParams.set('password', password);
    return url.toString();
  };

  const getDownloadUrl = () => {
    const url = new URL(`${API_BASE}/share/${token}/download`);
    if (password) url.searchParams.set('password', password);
    return url.toString();
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  // Error state
  if (error && !passwordRequired) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Link Not Available</h1>
          <p className="text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  // Password required
  if (passwordRequired) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full">
          <Lock className="w-12 h-12 text-blue-500 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-gray-900 text-center mb-2">
            Password Protected
          </h1>
          <p className="text-gray-500 text-center mb-6">
            Enter the password to access this file
          </p>

          <form onSubmit={handlePasswordSubmit}>
            {error && (
              <p className="text-sm text-red-500 mb-4 text-center">{error}</p>
            )}
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full px-4 py-3 border rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            <button
              type="submit"
              className="w-full px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              Access File
            </button>
          </form>
        </div>
      </div>
    );
  }

  // File preview
  if (shareInfo?.file) {
    const file = shareInfo.file;
    const IconComponent = getFileIcon(file.mimeType);
    const isImage = file.mimeType.startsWith('image/');
    const isVideo = file.mimeType.startsWith('video/');
    const isPdf = file.mimeType === 'application/pdf';
    const isAudio = file.mimeType.startsWith('audio/');

    return (
      <div className="min-h-screen bg-gray-900 flex flex-col">
        {/* Header */}
        <header className="bg-gray-800 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <IconComponent className="w-6 h-6 text-gray-400" />
            <div>
              <h1 className="text-white font-medium">{file.name}</h1>
              <p className="text-gray-400 text-sm">{formatFileSize(file.sizeBytes)}</p>
            </div>
          </div>
          
          {checkResult?.allowDownload && (
            <a
              href={getDownloadUrl()}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              <Download className="w-5 h-5" />
              Download
            </a>
          )}
        </header>

        {/* Preview area */}
        <div className="flex-1 flex items-center justify-center p-4">
          {isImage && (
            <img
              src={getPreviewUrl()}
              alt={file.name}
              className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
            />
          )}

          {isVideo && (
            <video
              src={getPreviewUrl()}
              controls
              autoPlay
              className="max-w-full max-h-[80vh] rounded-lg shadow-2xl"
            >
              Your browser does not support video playback.
            </video>
          )}

          {isPdf && (
            <iframe
              src={getPreviewUrl()}
              className="w-full max-w-4xl h-[85vh] rounded-lg shadow-2xl"
              title={file.name}
            />
          )}

          {isAudio && (
            <div className="bg-gray-800 p-8 rounded-lg shadow-2xl text-center">
              <Music className="w-16 h-16 text-purple-500 mx-auto mb-4" />
              <p className="text-white text-lg mb-4">{file.name}</p>
              <audio src={getPreviewUrl()} controls autoPlay className="w-full" />
            </div>
          )}

          {!isImage && !isVideo && !isPdf && !isAudio && (
            <div className="bg-gray-800 p-8 rounded-lg shadow-2xl text-center max-w-md">
              <FileText className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-white text-lg mb-2">{file.name}</p>
              <p className="text-gray-400 mb-6">
                Preview not available for this file type
              </p>
              {checkResult?.allowDownload && (
                <a
                  href={getDownloadUrl()}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                >
                  <Download className="w-5 h-5" />
                  Download File
                </a>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <footer className="bg-gray-800 px-6 py-3 text-center">
          <p className="text-gray-500 text-sm">
            Shared via YDrive
          </p>
        </footer>
      </div>
    );
  }

  return null;
}
