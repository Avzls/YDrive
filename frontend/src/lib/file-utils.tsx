import { 
  FileIcon,
  FileText,
  Image,
  Film,
  Music,
  FileSpreadsheet,
  Presentation,
  Loader2,
} from 'lucide-react';

/**
 * Get appropriate icon component for file type
 */
export function getFileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return Image;
  if (mimeType.startsWith('video/')) return Film;
  if (mimeType.startsWith('audio/')) return Music;
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return FileSpreadsheet;
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return Presentation;
  if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('text') || mimeType.includes('word')) return FileText;
  return FileIcon;
}

/**
 * Get CSS color class for file icon based on type
 */
export function getFileIconColor(mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'text-red-500';
  if (mimeType.startsWith('video/')) return 'text-red-600';
  if (mimeType.startsWith('audio/')) return 'text-purple-500';
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'text-green-600';
  if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'text-orange-500';
  if (mimeType.includes('pdf')) return 'text-red-500';
  if (mimeType.includes('word') || mimeType.includes('document')) return 'text-blue-600';
  return 'text-gray-500';
}

/**
 * Format file size in human-readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/**
 * Get status badge component for file status
 */
export function getStatusBadge(status: string) {
  switch (status) {
    case 'ready':
      return null;
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
