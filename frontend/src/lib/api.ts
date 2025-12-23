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
  search: async (query: string) => {
    const { data } = await api.get<FileItem[]>('/files/search', { params: { q: query } });
    return data;
  },
  listStarred: async () => {
    const { data } = await api.get<FileItem[]>('/files/starred');
    return data;
  },
  toggleStar: async (id: string) => {
    const { data } = await api.post<{ isStarred: boolean }>(`/files/${id}/star`);
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

export default api;
