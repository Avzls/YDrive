import axios from 'axios';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth interceptor
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Refresh token interceptor
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('accessToken');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export interface User {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  storageQuotaBytes: number;
  storageUsedBytes: number;
}

export interface FileItem {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  folderId?: string;
  status: 'pending' | 'scanning' | 'processing' | 'ready' | 'error' | 'infected';
  scanStatus: 'pending' | 'clean' | 'infected' | 'error';
  thumbnailKey?: string;
  previewKey?: string;
  hasPreview?: boolean;
  isStarred?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Folder {
  id: string;
  name: string;
  parentId?: string;
  isStarred?: boolean;
  createdAt: string;
}

export interface FolderContents {
  folders: Folder[];
  files: FileItem[];
}

// Auth
export const authApi = {
  login: async (nip: string, password: string) => {
    const { data } = await api.post('/auth/login', { nip, password });
    return data;
  },
  refresh: async (refreshToken: string) => {
    const { data } = await api.post('/auth/refresh', { refreshToken });
    return data;
  },
  me: async () => {
    const { data } = await api.get<User>('/auth/me');
    return data;
  },
  changePassword: async (currentPassword: string, newPassword: string) => {
    const { data } = await api.post('/auth/change-password', { currentPassword, newPassword });
    return data as { success: boolean };
  },
};

// Files
export const filesApi = {
  // Direct upload via API (recommended for Docker environments)
  directUpload: async (file: File, folderId?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', file.name);
    formData.append('mimeType', file.type || 'application/octet-stream');
    if (folderId) formData.append('folderId', folderId);

    const { data } = await api.post('/files/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data as { id: string; name: string; status: string; mimeType: string; sizeBytes: number };
  },

  initUpload: async (name: string, sizeBytes: number, mimeType: string, folderId?: string) => {
    const body: { name: string; sizeBytes: number; mimeType: string; folderId?: string } = { name, sizeBytes, mimeType };
    if (folderId) body.folderId = folderId;
    console.log('[API] Init upload body:', JSON.stringify(body, null, 2));
    const { data } = await api.post('/files/init-upload', body);
    return data as { fileId: string; uploadUrl: string; expiresAt: string };
  },
  completeUpload: async (fileId: string) => {
    const { data } = await api.post('/files/complete-upload', { fileId });
    return data as FileItem;
  },
  getFile: async (id: string) => {
    const { data } = await api.get<FileItem>(`/files/${id}`);
    return data;
  },
  // Use stream endpoint for direct download (bypasses presigned URL issues)
  getDownloadUrl: async (id: string) => {
    // Return stream endpoint URL directly - browser will download from here
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : '';
    return `${API_BASE}/files/${id}/stream?token=${token}`;
  },
  delete: async (id: string) => {
    await api.delete(`/files/${id}`);
  },
  restore: async (id: string) => {
    await api.post(`/files/${id}/restore`);
  },
  listTrashed: async () => {
    const { data } = await api.get<FileItem[]>('/files/trash');
    return data;
  },
  permanentDelete: async (id: string) => {
    await api.delete(`/files/${id}/permanent`);
  },
  emptyTrash: async () => {
    const { data } = await api.delete<{ deletedCount: number }>('/files/trash/empty');
    return data;
  },
  bulkDownload: async (fileIds: string[]) => {
    const ids = fileIds.join(',');
    const response = await api.get('/files/bulk-download', {
      params: { ids },
      responseType: 'blob',
    });
    
    // Create download link
    const blob = new Blob([response.data], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    // Get filename from header or use default
    const contentDisposition = response.headers['content-disposition'];
    let fileName = 'download.zip';
    if (contentDisposition) {
      const match = contentDisposition.match(/filename="(.+)"/);
      if (match) fileName = match[1];
    }
    
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },
  listStarred: async () => {
    const { data } = await api.get<FileItem[]>('/files/starred');
    return data;
  },
  toggleStar: async (id: string) => {
    const { data } = await api.post<{ isStarred: boolean }>(`/files/${id}/star`);
    return data;
  },
  listRecent: async (limit?: number) => {
    const { data } = await api.get<FileItem[]>('/files/recent', { 
      params: limit ? { limit } : {} 
    });
    return data;
  },
  rename: async (id: string, name: string) => {
    const { data } = await api.patch<FileItem>(`/files/${id}`, { name });
    return data;
  },
  move: async (id: string, folderId: string | null) => {
    const { data } = await api.patch<FileItem>(`/files/${id}/move`, { folderId });
    return data;
  },
  copy: async (id: string, folderId: string | null) => {
    const { data } = await api.post<FileItem>(`/files/${id}/copy`, { folderId });
    return data;
  },
  search: async (filters: {
    query?: string;
    type?: string;
    modifiedAfter?: string;
    modifiedBefore?: string;
    minSize?: number;
    maxSize?: number;
    sortBy?: 'name' | 'updatedAt' | 'sizeBytes';
    sortOrder?: 'ASC' | 'DESC';
  }) => {
    const params: Record<string, string | number> = {};
    if (filters.query) params.q = filters.query;
    if (filters.type) params.type = filters.type;
    if (filters.modifiedAfter) params.modifiedAfter = filters.modifiedAfter;
    if (filters.modifiedBefore) params.modifiedBefore = filters.modifiedBefore;
    if (filters.minSize !== undefined) params.minSize = filters.minSize;
    if (filters.maxSize !== undefined) params.maxSize = filters.maxSize;
    if (filters.sortBy) params.sortBy = filters.sortBy;
    if (filters.sortOrder) params.sortOrder = filters.sortOrder;
    
    const { data } = await api.get<FileItem[]>('/files/search', { params });
    return data;
  },
  listArchiveContents: async (id: string) => {
    const { data } = await api.get<any[]>(`/files/archive/contents/${id}`);
    return data;
  },
  // Version History
  listVersions: async (fileId: string) => {
    const { data } = await api.get<any[]>(`/files/${fileId}/versions`);
    return data;
  },
  getVersionDownloadUrl: (versionId: string) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : '';
    return `${API_BASE}/files/versions/${versionId}/stream?token=${token}`;
  },
  restoreVersion: async (versionId: string) => {
    const { data } = await api.post<FileItem>(`/files/versions/${versionId}/restore`);
    return data;
  },
  uploadNewVersion: async (fileId: string, file: File, comment?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    if (comment) formData.append('comment', comment);
    const { data } = await api.post<FileItem>(`/files/${fileId}/version`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  },
};

// Folders
export const foldersApi = {
  list: async (parentId?: string) => {
    const { data } = await api.get<FolderContents>('/folders', {
      params: parentId ? { parentId } : {},
    });
    return data;
  },
  create: async (name: string, parentId?: string) => {
    const body: { name: string; parentId?: string } = { name };
    if (parentId) body.parentId = parentId;
    const { data } = await api.post<Folder>('/folders', body);
    return data;
  },
  getFolder: async (id: string) => {
    const { data } = await api.get<Folder>(`/folders/${id}`);
    return data;
  },
  rename: async (id: string, name: string) => {
    const { data } = await api.patch<Folder>(`/folders/${id}`, { name });
    return data;
  },
  delete: async (id: string) => {
    await api.delete(`/folders/${id}`);
  },
  restore: async (id: string) => {
    await api.post(`/folders/${id}/restore`);
  },
  listTrashed: async () => {
    const { data } = await api.get<Folder[]>('/folders/trash');
    return data;
  },
  permanentDelete: async (id: string) => {
    await api.delete(`/folders/${id}/permanent`);
  },
  move: async (id: string, parentId: string | null) => {
    const { data } = await api.patch<Folder>(`/folders/${id}/move`, { parentId });
    return data;
  },
  toggleStar: async (id: string) => {
    const { data } = await api.post<{ isStarred: boolean }>(`/folders/${id}/star`);
    return data;
  },
  listStarred: async () => {
    const { data } = await api.get<Folder[]>('/folders/starred/list');
    return data;
  },
  getDownloadUrl: (id: string) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : '';
    return `${API_BASE}/folders/${id}/download?token=${token}`;
  },
  search: async (query: string) => {
    const { data } = await api.get<Folder[]>('/folders/search', {
      params: { q: query }
    });
    return data;
  },
};

// Sharing
export interface ShareLink {
  id: string;
  token: string;
  fileId?: string;
  folderId?: string;
  allowDownload: boolean;
  expiresAt?: string;
  maxAccessCount?: number;
  accessCount: number;
  shareUrl: string;
  createdAt: string;
}

export interface ShareLinkOptions {
  password?: string;
  allowDownload?: boolean;
  expiresAt?: Date;
  maxAccessCount?: number;
}

export const sharingApi = {
  createLink: async (fileId: string, options?: ShareLinkOptions) => {
    const { data } = await api.post<ShareLink>('/share', { fileId, ...options });
    return data;
  },
  createFolderLink: async (folderId: string, options?: ShareLinkOptions) => {
    const { data } = await api.post<ShareLink>('/share', { folderId, ...options });
    return data;
  },
  listLinks: async (fileId?: string, folderId?: string) => {
    const params: any = {};
    if (fileId) params.fileId = fileId;
    if (folderId) params.folderId = folderId;
    const { data } = await api.get<ShareLink[]>('/share', { params });
    return data;
  },
  deleteLink: async (linkId: string) => {
    await api.delete(`/share/${linkId}`);
  },
  check: async (token: string) => {
    const { data } = await api.get<{
      valid: boolean;
      requiresPassword?: boolean;
      allowDownload?: boolean;
      type?: 'file' | 'folder';
    }>(`/share/${token}/check`);
    return data;
  },
  getInfo: async (token: string, password?: string) => {
    const { data } = await api.get<{
      type: 'file' | 'folder';
      file?: {
        id: string;
        name: string;
        mimeType: string;
        sizeBytes: number;
        hasPreview: boolean;
      };
      downloadUrl?: string;
    }>(`/share/${token}/info`, { params: password ? { password } : {} });
    return data;
  },
};

// Admin
export interface SystemStats {
  totalUsers: number;
  activeUsers: number;
  totalFiles: number;
  totalFolders: number;
  totalStorageUsed: number;
  totalStorageQuota: number;
}

export interface AdminUser {
  id: string;
  nip: string;
  email: string;
  name: string;
  isAdmin: boolean;
  isActive: boolean;
  storageQuotaBytes: number;
  storageUsedBytes: number;
  createdAt: string;
}

export interface CreateUserDto {
  nip: string;
  email: string;
  name: string;
  password: string;
  isAdmin?: boolean;
  storageQuotaBytes?: number;
}

export interface UpdateUserDto {
  name?: string;
  email?: string;
  isActive?: boolean;
  isAdmin?: boolean;
  storageQuotaBytes?: number;
  password?: string;
}

export const adminApi = {
  getStats: async () => {
    const { data } = await api.get<SystemStats>('/admin/stats');
    return data;
  },
  listUsers: async (page = 1, limit = 20, search?: string) => {
    const { data } = await api.get<{ users: AdminUser[]; total: number }>('/admin/users', {
      params: { page, limit, ...(search ? { search } : {}) },
    });
    return data;
  },
  getUser: async (id: string) => {
    const { data } = await api.get<AdminUser>(`/admin/users/${id}`);
    return data;
  },
  createUser: async (dto: CreateUserDto) => {
    const { data } = await api.post<AdminUser>('/admin/users', dto);
    return data;
  },
  updateUser: async (id: string, dto: UpdateUserDto) => {
    const { data } = await api.patch<AdminUser>(`/admin/users/${id}`, dto);
    return data;
  },
  deleteUser: async (id: string) => {
    await api.delete(`/admin/users/${id}`);
  },
};

// Permissions (User-to-User Sharing)
export interface SharedUser {
  id: string;
  nip: string;
  name: string;
  email: string;
}

export interface PermissionEntry {
  id: string;
  userId: string;
  role: 'owner' | 'editor' | 'viewer';
  createdAt: string;
  user?: SharedUser;
}

export const permissionsApi = {
  shareWith: async (resourceId: string, resourceType: 'file' | 'folder', userId: string, role: 'viewer' | 'editor') => {
    const body = resourceType === 'file' 
      ? { fileId: resourceId, userId, role }
      : { folderId: resourceId, userId, role };
    const { data } = await api.post<PermissionEntry>('/permissions/share', body);
    return data;
  },
  listAccess: async (resourceId: string, resourceType: 'file' | 'folder') => {
    const { data } = await api.get<PermissionEntry[]>(`/permissions/${resourceType}/${resourceId}`);
    return data;
  },
  revokeAccess: async (resourceId: string, resourceType: 'file' | 'folder', userId: string) => {
    await api.delete(`/permissions/${resourceType}/${resourceId}/${userId}`);
  },
  searchUsers: async (query: string) => {
    const { data } = await api.get<SharedUser[]>('/permissions/users/search', { params: { q: query } });
    return data;
  },
  listSharedWithMe: async () => {
    const { data } = await api.get<{ files: FileItem[]; folders: Folder[] }>('/permissions/shared-with-me');
    return data;
  },
};

// Audit / Activity Log
export interface AuditLogEntry {
  id: string;
  userId?: string;
  user?: {
    id: string;
    name: string;
    email: string;
  };
  action: string;
  resourceType: string;
  resourceId: string;
  resourceName?: string;
  details?: Record<string, any>;
  createdAt: string;
}

export const auditApi = {
  getMyActivity: async (limit?: number) => {
    const { data } = await api.get<AuditLogEntry[]>('/audit/my-activity', { params: { limit } });
    return data;
  },
  getRecentActivity: async (limit?: number) => {
    const { data } = await api.get<AuditLogEntry[]>('/audit/recent', { params: { limit } });
    return data;
  },
  getAllActivity: async (filters?: {
    limit?: number;
    userId?: string;
    action?: string;
    startDate?: string;
    endDate?: string;
  }) => {
    const { data } = await api.get<AuditLogEntry[]>('/audit/all', { params: filters });
    return data;
  },
  getResourceActivity: async (resourceType: string, resourceId: string, limit?: number) => {
    const { data } = await api.get<AuditLogEntry[]>('/audit/resource', { 
      params: { type: resourceType, id: resourceId, limit } 
    });
    return data;
  },
};

// Tags
export interface Tag {
  id: string;
  name: string;
  color: string;
  ownerId: string;
  createdAt: string;
}

export const tagsApi = {
  // List all tags for current user
  list: async () => {
    const { data } = await api.get<Tag[]>('/tags');
    return data;
  },
  // Create a new tag
  create: async (name: string, color?: string) => {
    const { data } = await api.post<Tag>('/tags', { name, color });
    return data;
  },
  // Update tag
  update: async (id: string, updates: { name?: string; color?: string }) => {
    const { data } = await api.patch<Tag>(`/tags/${id}`, updates);
    return data;
  },
  // Delete tag
  delete: async (id: string) => {
    await api.delete(`/tags/${id}`);
  },
  // Get files by tag
  getFilesByTag: async (tagId: string) => {
    const { data } = await api.get<FileItem[]>(`/tags/${tagId}/files`);
    return data;
  },
  // Get tags for a file
  getFileTags: async (fileId: string) => {
    const { data } = await api.get<Tag[]>(`/files/${fileId}/tags`);
    return data;
  },
  // Add tags to a file
  addTagsToFile: async (fileId: string, tagIds: string[]) => {
    const { data } = await api.post<FileItem>(`/files/${fileId}/tags`, { tagIds });
    return data;
  },
  // Set tags for a file (replace all)
  setFileTags: async (fileId: string, tagIds: string[]) => {
    const { data } = await api.patch<FileItem>(`/files/${fileId}/tags`, { tagIds });
    return data;
  },
  // Remove tags from a file
  removeTagsFromFile: async (fileId: string, tagIds: string[]) => {
    const { data } = await api.delete<FileItem>(`/files/${fileId}/tags`, { data: { tagIds } });
    return data;
  },
};

// Comments
export interface Comment {
  id: string;
  content: string;
  fileId: string;
  userId: string;
  user?: {
    id: string;
    name: string;
    email: string;
  };
  createdAt: string;
  updatedAt: string;
}

export const commentsApi = {
  // List comments for a file
  list: async (fileId: string) => {
    const { data } = await api.get<Comment[]>(`/files/${fileId}/comments`);
    return data;
  },
  // Add a comment
  create: async (fileId: string, content: string) => {
    const { data } = await api.post<Comment>(`/files/${fileId}/comments`, { content });
    return data;
  },
  // Update a comment
  update: async (fileId: string, commentId: string, content: string) => {
    const { data } = await api.patch<Comment>(`/files/${fileId}/comments/${commentId}`, { content });
    return data;
  },
  // Delete a comment
  delete: async (fileId: string, commentId: string) => {
    await api.delete(`/files/${fileId}/comments/${commentId}`);
  },
  // Get comment count
  getCount: async (fileId: string) => {
    const { data } = await api.get<{ count: number }>(`/files/${fileId}/comments/count`);
    return data.count;
  },
};

export default api;
