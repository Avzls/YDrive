'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  ArrowLeft, 
  Activity, 
  Upload, 
  Download, 
  Trash2, 
  RotateCcw, 
  Pencil, 
  FolderInput, 
  Share2, 
  FileText,
  Folder,
  Clock,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { format } from 'date-fns';
import { useAuthStore } from '@/lib/store';
import { auditApi, AuditLogEntry } from '@/lib/api';

function getActionIcon(action: string) {
  if (action.includes('upload') || action.includes('version.create')) return Upload;
  if (action.includes('download')) return Download;
  if (action.includes('delete')) return Trash2;
  if (action.includes('restore')) return RotateCcw;
  if (action.includes('rename')) return Pencil;
  if (action.includes('move')) return FolderInput;
  if (action.includes('share')) return Share2;
  return Activity;
}

function getActionColor(action: string) {
  if (action.includes('upload') || action.includes('version.create')) return 'bg-green-100 text-green-600';
  if (action.includes('download')) return 'bg-blue-100 text-blue-600';
  if (action.includes('delete')) return 'bg-red-100 text-red-600';
  if (action.includes('restore')) return 'bg-purple-100 text-purple-600';
  if (action.includes('rename')) return 'bg-yellow-100 text-yellow-600';
  if (action.includes('move')) return 'bg-orange-100 text-orange-600';
  if (action.includes('share')) return 'bg-cyan-100 text-cyan-600';
  return 'bg-gray-100 text-gray-600';
}

function getActionLabel(action: string): string {
  const labels: Record<string, string> = {
    'file.upload': 'Uploaded file',
    'file.download': 'Downloaded file',
    'file.delete': 'Moved to trash',
    'file.restore': 'Restored from trash',
    'file.rename': 'Renamed file',
    'file.move': 'Moved file',
    'file.share': 'Shared file',
    'file.version.create': 'Uploaded new version',
    'folder.create': 'Created folder',
    'folder.delete': 'Deleted folder',
    'folder.restore': 'Restored folder',
    'folder.rename': 'Renamed folder',
    'folder.move': 'Moved folder',
    'folder.share': 'Shared folder',
    'user.login': 'Logged in',
    'user.logout': 'Logged out',
  };
  return labels[action] || action;
}

export default function ActivityPage() {
  const router = useRouter();
  const { user, accessToken } = useAuthStore();
  const [activities, setActivities] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !accessToken) {
      router.push('/login');
    }
  }, [mounted, accessToken, router]);

  useEffect(() => {
    if (mounted && accessToken) {
      loadActivities();
    }
  }, [mounted, accessToken]);

  const loadActivities = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await auditApi.getMyActivity(100);
      setActivities(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load activity');
    } finally {
      setLoading(false);
    }
  };

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/')}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Activity className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">Activity</h1>
              <p className="text-sm text-gray-500">Your recent activity history</p>
            </div>
          </div>
          <div className="flex-1" />
          <button
            onClick={loadActivities}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          </div>
        ) : error ? (
          <div className="text-center py-24">
            <p className="text-red-500">{error}</p>
            <button
              onClick={loadActivities}
              className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              Retry
            </button>
          </div>
        ) : activities.length === 0 ? (
          <div className="text-center py-24">
            <Activity className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-gray-600">No activity yet</h2>
            <p className="text-sm text-gray-400 mt-1">Your file activity will appear here</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="divide-y divide-gray-100">
              {activities.map((activity) => {
                const Icon = getActionIcon(activity.action);
                const colorClass = getActionColor(activity.action);
                const ResourceIcon = activity.resourceType === 'folder' ? Folder : FileText;
                
                return (
                  <div
                    key={activity.id}
                    className="flex items-start gap-4 p-4 hover:bg-gray-50 transition-colors"
                  >
                    {/* Action Icon */}
                    <div className={`p-2 rounded-lg ${colorClass}`}>
                      <Icon className="w-4 h-4" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">
                          {getActionLabel(activity.action)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <ResourceIcon className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-600 truncate">
                          {activity.resourceName || activity.resourceId}
                        </span>
                      </div>
                      {activity.details && Object.keys(activity.details).length > 0 && (
                        <div className="text-xs text-gray-400 mt-1">
                          {activity.details.oldName && activity.details.newName && (
                            <span>"{activity.details.oldName}" → "{activity.details.newName}"</span>
                          )}
                          {activity.details.versionNumber && (
                            <span>Version {activity.details.versionNumber}</span>
                          )}
                          {activity.details.sizeBytes && (
                            <span> · {(activity.details.sizeBytes / 1024 / 1024).toFixed(2)} MB</span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Time */}
                    <div className="flex items-center gap-1 text-xs text-gray-400 whitespace-nowrap">
                      <Clock className="w-3 h-3" />
                      {format(new Date(activity.createdAt), 'MMM d, h:mm a')}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
