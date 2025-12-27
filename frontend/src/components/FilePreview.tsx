'use client';

import { useEffect, useState } from 'react';
import { X, Download, ExternalLink, FileText, Package, Folder, File, MessageSquare, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { FileItem, filesApi } from '@/lib/api';
import { format } from 'date-fns';
import { CommentsPanel } from './CommentsPanel';

interface FilePreviewProps {
  file: FileItem;
  onClose: () => void;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

function getPreviewUrl(fileId: string): string {
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : '';
  return `${API_BASE}/files/${fileId}/preview?token=${token}`;
}

// Text-based file types that can be previewed as text
const TEXT_MIME_TYPES = [
  'text/plain',
  'text/csv',
  'text/html',
  'text/css',
  'text/javascript',
  'application/json',
  'application/xml',
  'text/xml',
  'text/markdown',
  'application/x-yaml',
  'text/yaml',
];

// Check if file is text-based by mime type or extension
function isTextFile(mimeType: string, fileName: string): boolean {
  if (TEXT_MIME_TYPES.includes(mimeType)) return true;
  const ext = fileName.split('.').pop()?.toLowerCase();
  return ['txt', 'csv', 'json', 'xml', 'md', 'yaml', 'yml', 'log', 'ini', 'cfg', 'conf'].includes(ext || '');
}

// Office file MIME types
const OFFICE_MIME_TYPES = [
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];

export function FilePreview({ file, onClose }: FilePreviewProps) {
  const previewUrl = getPreviewUrl(file.id);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [textLoading, setTextLoading] = useState(false);
  const [textError, setTextError] = useState<string | null>(null);
  const [archiveContents, setArchiveContents] = useState<any[] | null>(null);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [showComments, setShowComments] = useState(true);

  const isImage = file.mimeType.startsWith('image/');
  const isVideo = file.mimeType.startsWith('video/');
  const isPdf = file.mimeType === 'application/pdf';
  const isAudio = file.mimeType.startsWith('audio/');
  const isOffice = OFFICE_MIME_TYPES.includes(file.mimeType);
  const extension = file.name.split('.').pop()?.toLowerCase();
  const isArchive = ['zip', 'rar'].includes(extension || '');
  const isText = isTextFile(file.mimeType, file.name);

  // For Office files, only show iframe if hasPreview is true
  const canShowOfficePreview = isOffice && file.hasPreview;

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Load text content for text files
  useEffect(() => {
    if (isText && !textContent && !textLoading) {
      setTextLoading(true);
      fetch(previewUrl)
        .then(res => {
          if (!res.ok) throw new Error('Failed to load file');
          return res.text();
        })
        .then(content => {
          // Limit content to 500KB for display
          if (content.length > 500000) {
            setTextContent(content.substring(0, 500000) + '\n\n... (content truncated)');
          } else {
            setTextContent(content);
          }
        })
        .catch(err => setTextError(err.message))
        .finally(() => setTextLoading(false));
    }
  }, [isText, previewUrl, textContent, textLoading]);

  // Load archive contents
  useEffect(() => {
    if (isArchive && !archiveContents && !archiveLoading && !archiveError) {
      setArchiveLoading(true);
      filesApi.listArchiveContents(file.id)
        .then(contents => {
          // Sort: directories first, then by name
          const sorted = [...contents].sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.name.localeCompare(b.name);
          });
          setArchiveContents(sorted);
        })
        .catch(err => setArchiveError(err.message))
        .finally(() => setArchiveLoading(false));
    }
  }, [isArchive, file.id, archiveContents, archiveLoading, archiveError]);

  const handleDownload = async () => {
    const url = await filesApi.getDownloadUrl(file.id);
    
    // Fetch as blob to handle cross-origin download with correct filename
    const response = await fetch(url);
    if (!response.ok) return;
    
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
  };

  const renderPreview = () => {
    if (isImage) {
      return (
        <img
          src={previewUrl}
          alt={file.name}
          className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
        />
      );
    }

    if (isVideo) {
      return (
        <video
          src={previewUrl}
          controls
          autoPlay
          className="max-w-full max-h-[80vh] rounded-lg shadow-2xl"
        >
          Your browser does not support video playback.
        </video>
      );
    }

    if (isAudio) {
      return (
        <div className="bg-slate-800 p-8 rounded-lg shadow-2xl">
          <div className="text-center mb-4">
            <p className="text-white text-lg font-medium">{file.name}</p>
          </div>
          <audio src={previewUrl} controls autoPlay className="w-full">
            Your browser does not support audio playback.
          </audio>
        </div>
      );
    }

    if (isPdf) {
      return (
        <iframe
          src={previewUrl}
          className="w-[90vw] h-[85vh] max-w-5xl rounded-lg shadow-2xl"
          title={file.name}
        />
      );
    }

    // Office files - only show iframe if preview was generated
    if (isOffice) {
      if (canShowOfficePreview) {
        return (
          <iframe
            src={previewUrl}
            className="w-[90vw] h-[85vh] max-w-5xl rounded-lg shadow-2xl"
            title={file.name}
          />
        );
      } else {
        // Preview not available for this Office file
        return (
          <div className="bg-slate-800 p-8 rounded-lg shadow-2xl text-center max-w-lg">
            <FileText className="w-16 h-16 text-slate-400 mx-auto mb-4" />
            <p className="text-white text-lg mb-2">{file.name}</p>
            <p className="text-slate-400 mb-6">
              Preview sedang diproses atau tidak tersedia.
              <br />
              Silakan download file untuk melihat isi lengkap.
            </p>
            <button
              onClick={handleDownload}
              className="px-6 py-3 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors flex items-center gap-2 mx-auto"
            >
              <Download className="w-5 h-5" />
              Download File
            </button>
          </div>
        );
      }
    }

    // Text-based files (CSV, TXT, JSON, etc.)
    if (isText) {
      if (textLoading) {
        return (
          <div className="bg-slate-800 p-8 rounded-lg shadow-2xl text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4"></div>
            <p className="text-white">Loading file content...</p>
          </div>
        );
      }

      if (textError) {
        return (
          <div className="bg-slate-800 p-8 rounded-lg shadow-2xl text-center">
            <p className="text-red-400 mb-4">Failed to load file: {textError}</p>
            <button
              onClick={handleDownload}
              className="px-6 py-3 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors flex items-center gap-2 mx-auto"
            >
              <Download className="w-5 h-5" />
              Download File
            </button>
          </div>
        );
      }

      // Render CSV as table if it's a CSV file
      const isCsv = file.mimeType === 'text/csv' || file.name.toLowerCase().endsWith('.csv');
      
      if (isCsv && textContent) {
        const lines = textContent.split('\n').filter(line => line.trim());
        const rows = lines.map(line => {
          // Simple CSV parsing (handles basic cases)
          const cells: string[] = [];
          let current = '';
          let inQuotes = false;
          for (const char of line) {
            if (char === '"') {
              inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
              cells.push(current.trim());
              current = '';
            } else {
              current += char;
            }
          }
          cells.push(current.trim());
          return cells;
        });

        return (
          <div className="bg-slate-800 rounded-lg shadow-2xl overflow-hidden max-w-6xl w-[90vw]">
            <div className="px-4 py-3 bg-slate-700 border-b border-slate-600">
              <p className="text-white font-medium">{file.name}</p>
            </div>
            <div className="overflow-auto max-h-[75vh]">
              <table className="w-full text-sm">
                <thead className="bg-slate-700 sticky top-0">
                  {rows.length > 0 && (
                    <tr>
                      {rows[0].map((cell, i) => (
                        <th key={i} className="px-4 py-2 text-left text-slate-200 font-medium border-r border-slate-600 last:border-r-0">
                          {cell || '-'}
                        </th>
                      ))}
                    </tr>
                  )}
                </thead>
                <tbody>
                  {rows.slice(1).map((row, rowIndex) => (
                    <tr key={rowIndex} className="border-t border-slate-700 hover:bg-slate-700/50">
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex} className="px-4 py-2 text-slate-300 border-r border-slate-700 last:border-r-0">
                          {cell || '-'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      }

      // Regular text file
      return (
        <div className="bg-slate-800 rounded-lg shadow-2xl overflow-hidden max-w-5xl w-[90vw]">
          <div className="px-4 py-3 bg-slate-700 border-b border-slate-600">
            <p className="text-white font-medium">{file.name}</p>
          </div>
          <pre className="p-4 overflow-auto max-h-[75vh] text-slate-200 text-sm font-mono whitespace-pre-wrap">
            {textContent}
          </pre>
        </div>
      );
    }

    if (isArchive) {
      if (archiveLoading) {
        return (
          <div className="bg-slate-800 p-8 rounded-lg shadow-2xl text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4"></div>
            <p className="text-white">Membaca isi arsip...</p>
          </div>
        );
      }

      if (archiveError) {
        return (
          <div className="bg-slate-800 p-8 rounded-lg shadow-2xl text-center">
            <p className="text-red-400 mb-4">Gagal memuat isi arsip: {archiveError}</p>
            <button
              onClick={handleDownload}
              className="px-6 py-3 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors flex items-center gap-2 mx-auto"
            >
              <Download className="w-5 h-5" />
              Download File
            </button>
          </div>
        );
      }

      return (
        <div className="bg-slate-800 rounded-lg shadow-2xl overflow-hidden max-w-5xl w-[90vw]">
          <div className="px-4 py-3 bg-slate-700 border-b border-slate-600 flex items-center gap-2">
            <Package className="w-5 h-5 text-purple-400" />
            <p className="text-white font-medium">{file.name}</p>
          </div>
          <div className="overflow-auto max-h-[75vh]">
            <table className="w-full text-sm">
              <thead className="bg-slate-700/50 sticky top-0 backdrop-blur-md">
                <tr className="text-slate-400 border-b border-slate-700">
                  <th className="px-4 py-2 text-left font-medium">Nama</th>
                  <th className="px-4 py-2 text-right font-medium">Ukuran</th>
                  <th className="px-4 py-2 text-right font-medium">Modifikasi</th>
                </tr>
              </thead>
              <tbody>
                {archiveContents?.map((item, index) => (
                  <tr key={index} className="border-t border-slate-700/50 hover:bg-slate-700/30 transition-colors">
                    <td className="px-4 py-2 text-slate-200">
                      <div className="flex items-center gap-2">
                        {item.isDirectory ? (
                          <Folder className="w-4 h-4 text-blue-400 fill-blue-400/20" />
                        ) : (
                          <File className="w-4 h-4 text-slate-400" />
                        )}
                        <span className="truncate max-w-md">{item.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right text-slate-400 font-mono">
                      {item.isDirectory ? '-' : formatBytes(item.size)}
                    </td>
                    <td className="px-4 py-2 text-right text-slate-500 text-xs">
                      {item.mtime ? format(new Date(item.mtime), 'dd MMM yyyy HH:mm') : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    // Unsupported file type
    return (
      <div className="bg-slate-800 p-8 rounded-lg shadow-2xl text-center max-w-lg">
        <FileText className="w-16 h-16 text-slate-400 mx-auto mb-4" />
        <p className="text-white text-lg mb-2">{file.name}</p>
        <p className="text-slate-400 mb-6">
          Preview tidak tersedia untuk jenis file ini.
          <br />
          <span className="text-sm">({file.mimeType})</span>
        </p>
        <button
          onClick={handleDownload}
          className="px-6 py-3 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors flex items-center gap-2 mx-auto"
        >
          <Download className="w-5 h-5" />
          Download File
        </button>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 bg-black/90 backdrop-blur-sm z-50"
      onClick={onClose}
    >
      {/* Main container with flex layout */}
      <div className="flex h-full" onClick={(e) => e.stopPropagation()}>
        {/* Left side: Preview area */}
        <div className={`flex-1 flex flex-col transition-all duration-300 ${showComments ? 'pr-0' : ''}`}>
          {/* Header */}
          <div className="flex items-center justify-between p-4 flex-shrink-0">
            <h3 className="text-white font-medium truncate max-w-[50%]">{file.name}</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={handleDownload}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                title="Download"
              >
                <Download className="w-5 h-5" />
              </button>
              <button
                onClick={() => window.open(previewUrl, '_blank')}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                title="Open in new tab"
              >
                <ExternalLink className="w-5 h-5" />
              </button>
              <button
                onClick={() => setShowComments(!showComments)}
                className={`p-2 rounded-lg transition-colors ${showComments ? 'bg-blue-500/30 text-blue-400' : 'bg-white/10 hover:bg-white/20 text-white'}`}
                title={showComments ? 'Hide comments' : 'Show comments'}
              >
                {showComments ? <PanelRightClose className="w-5 h-5" /> : <PanelRightOpen className="w-5 h-5" />}
              </button>
              <button
                onClick={onClose}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Preview content */}
          <div className="flex-1 flex items-center justify-center overflow-auto p-4">
            {renderPreview()}
          </div>
        </div>

        {/* Right side: Comments panel */}
        {showComments && (
          <div className="w-[380px] flex-shrink-0 h-full">
            <CommentsPanel fileId={file.id} fileName={file.name} />
          </div>
        )}
      </div>
    </div>
  );
}

function formatBytes(bytes: number, decimals = 2) {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
