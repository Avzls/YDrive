'use client';

import { useCallback, useState, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, X, CheckCircle, AlertCircle, Loader2, Folder, FolderUp } from 'lucide-react';
import { filesApi, foldersApi } from '@/lib/api';
import { toast } from 'sonner';

interface UploadFile {
  file: File;
  relativePath?: string;  // For folder uploads: "folder/subfolder/file.txt"
  id?: string;
  progress: number;
  status: 'pending' | 'uploading' | 'processing' | 'done' | 'error';
  error?: string;
}

interface FileUploaderProps {
  folderId?: string;
  onUploadComplete?: () => void;
  isOpen?: boolean;
  onClose?: () => void;
}

// Helper to read all entries from a directory recursively
async function readDirectoryRecursive(
  dirEntry: FileSystemDirectoryEntry,
  path: string = ''
): Promise<{ file: File; relativePath: string }[]> {
  const results: { file: File; relativePath: string }[] = [];
  const dirReader = dirEntry.createReader();
  
  // Read all entries (may require multiple reads)
  const readEntries = (): Promise<FileSystemEntry[]> => {
    return new Promise((resolve, reject) => {
      dirReader.readEntries(resolve, reject);
    });
  };
  
  let entries: FileSystemEntry[] = [];
  let batch: FileSystemEntry[];
  do {
    batch = await readEntries();
    entries = entries.concat(batch);
  } while (batch.length > 0);
  
  for (const entry of entries) {
    const entryPath = path ? `${path}/${entry.name}` : entry.name;
    
    if (entry.isFile) {
      const fileEntry = entry as FileSystemFileEntry;
      const file = await new Promise<File>((resolve, reject) => {
        fileEntry.file(resolve, reject);
      });
      results.push({ file, relativePath: entryPath });
    } else if (entry.isDirectory) {
      const subdirResults = await readDirectoryRecursive(
        entry as FileSystemDirectoryEntry,
        entryPath
      );
      results.push(...subdirResults);
    }
  }
  
  return results;
}

// Process DataTransferItemList to handle both files and folders
async function processDropItems(
  items: DataTransferItemList
): Promise<{ file: File; relativePath?: string }[]> {
  const results: { file: File; relativePath?: string }[] = [];
  const entries: FileSystemEntry[] = [];
  
  // Get entries first (must be done synchronously in drop handler)
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind === 'file') {
      const entry = item.webkitGetAsEntry?.();
      if (entry) {
        entries.push(entry);
      }
    }
  }
  
  // Process entries (can be async)
  for (const entry of entries) {
    if (entry.isFile) {
      const fileEntry = entry as FileSystemFileEntry;
      const file = await new Promise<File>((resolve, reject) => {
        fileEntry.file(resolve, reject);
      });
      results.push({ file });
    } else if (entry.isDirectory) {
      const dirResults = await readDirectoryRecursive(
        entry as FileSystemDirectoryEntry,
        entry.name
      );
      results.push(...dirResults);
    }
  }
  
  return results;
}

export function FileUploader({ folderId, onUploadComplete, isOpen: controlledIsOpen, onClose }: FileUploaderProps) {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  
  // Support both controlled and uncontrolled modes
  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;
  const setIsOpen = onClose || setInternalIsOpen;
  const [uploadMode, setUploadMode] = useState<'files' | 'folder'>('files');
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Create folders if needed and return folder ID mapping
  const createFolderStructure = async (
    relativePaths: string[],
    parentFolderId?: string
  ): Promise<Map<string, string>> => {
    const folderMap = new Map<string, string>();
    const seenFolders = new Set<string>();
    
    // Collect all unique folder paths
    for (const relativePath of relativePaths) {
      const parts = relativePath.split('/');
      parts.pop(); // Remove file name
      
      let currentPath = '';
      for (const part of parts) {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        seenFolders.add(currentPath);
      }
    }
    
    // Sort folders by depth so parents are created first
    const sortedFolders = Array.from(seenFolders).sort(
      (a, b) => a.split('/').length - b.split('/').length
    );
    
    // Create folders
    for (const folderPath of sortedFolders) {
      const parts = folderPath.split('/');
      const folderName = parts[parts.length - 1];
      const parentPath = parts.slice(0, -1).join('/');
      
      // Determine parent folder ID
      let targetParentId = parentFolderId;
      if (parentPath && folderMap.has(parentPath)) {
        targetParentId = folderMap.get(parentPath);
      }
      
      try {
        const newFolder = await foldersApi.create(folderName, targetParentId);
        folderMap.set(folderPath, newFolder.id);
      } catch (err: any) {
        console.error(`Failed to create folder ${folderPath}:`, err);
        // Continue anyway, files will go to parent folder
      }
    }
    
    return folderMap;
  };

  const uploadFile = async (
    uploadFile: UploadFile,
    folderMap?: Map<string, string>,
    baseFolderId?: string
  ) => {
    const { file, relativePath } = uploadFile;
    
    try {
      // Update status to uploading
      setFiles(prev => prev.map(f => 
        f.file === file && f.relativePath === relativePath 
          ? { ...f, status: 'uploading' as const, progress: 10 } 
          : f
      ));

      // Determine target folder ID
      let targetFolderId = baseFolderId;
      if (relativePath && folderMap) {
        const parts = relativePath.split('/');
        parts.pop(); // Remove file name
        const folderPath = parts.join('/');
        if (folderPath && folderMap.has(folderPath)) {
          targetFolderId = folderMap.get(folderPath);
        }
      }

      setFiles(prev => prev.map(f => 
        f.file === file && f.relativePath === relativePath 
          ? { ...f, progress: 30 } 
          : f
      ));

      const result = await filesApi.directUpload(file, targetFolderId);

      setFiles(prev => prev.map(f => 
        f.file === file && f.relativePath === relativePath 
          ? { ...f, id: result.id, progress: 100, status: 'done' as const } 
          : f
      ));
    } catch (err: any) {
      console.error('[Upload Error]', err);
      setFiles(prev => prev.map(f => 
        f.file === file && f.relativePath === relativePath 
          ? { ...f, status: 'error' as const, error: err.message } 
          : f
      ));
    }
  };

  const startUpload = async (newFiles: UploadFile[]) => {
    // Check if any files have relative paths (folder upload)
    const hasRelativePaths = newFiles.some(f => f.relativePath);
    
    if (hasRelativePaths) {
      // Create folder structure first
      const relativePaths = newFiles
        .filter(f => f.relativePath)
        .map(f => f.relativePath!);
      
      toast.info('Creating folder structure...');
      const folderMap = await createFolderStructure(relativePaths, folderId);
      
      // Upload all files
      for (const uploadFileItem of newFiles) {
        await uploadFile(uploadFileItem, folderMap, folderId);
      }
    } else {
      // Simple file upload
      for (const uploadFileItem of newFiles) {
        await uploadFile(uploadFileItem, undefined, folderId);
      }
    }
    
    onUploadComplete?.();
  };

  // Handle regular file drops
  const onDrop = useCallback(async (acceptedFiles: File[], _: any, event: any) => {
    // Check if this is a folder drop using dataTransfer
    const dataTransfer = event?.dataTransfer;
    
    if (dataTransfer?.items) {
      const hasFolder = Array.from(dataTransfer.items as DataTransferItemList).some(
        (item: DataTransferItem) => {
          const entry = item.webkitGetAsEntry?.();
          return entry?.isDirectory;
        }
      );
      
      if (hasFolder) {
        // Process as folder upload
        try {
          const processedFiles = await processDropItems(dataTransfer.items);
          const newFiles: UploadFile[] = processedFiles.map(({ file, relativePath }) => ({
            file,
            relativePath,
            progress: 0,
            status: 'pending' as const,
          }));
          
          if (newFiles.length > 0) {
            setFiles(prev => [...prev, ...newFiles]);
            toast.success(`Found ${newFiles.length} files in folder`);
            startUpload(newFiles);
          }
        } catch (err) {
          console.error('Error processing folder:', err);
          toast.error('Failed to read folder contents');
        }
        return;
      }
    }
    
    // Regular file upload
    const newFiles: UploadFile[] = acceptedFiles.map(file => ({
      file,
      progress: 0,
      status: 'pending' as const,
    }));

    setFiles(prev => [...prev, ...newFiles]);
    startUpload(newFiles);
  }, [folderId]);

  // Handle folder input change (for folder button)
  const handleFolderSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    
    const newFiles: UploadFile[] = [];
    
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      // webkitRelativePath contains the relative path including folder name
      const relativePath = (file as any).webkitRelativePath || file.name;
      
      newFiles.push({
        file,
        relativePath,
        progress: 0,
        status: 'pending' as const,
      });
    }
    
    if (newFiles.length > 0) {
      setFiles(prev => [...prev, ...newFiles]);
      toast.success(`Found ${newFiles.length} files in folder`);
      startUpload(newFiles);
    }
    
    // Reset input
    e.target.value = '';
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop,
    noClick: false,
    noKeyboard: false,
  });

  const removeFile = (file: File, relativePath?: string) => {
    setFiles(prev => prev.filter(f => !(f.file === file && f.relativePath === relativePath)));
  };

  const pendingCount = files.filter(f => ['pending', 'uploading', 'processing'].includes(f.status)).length;
  const folderCount = new Set(files.filter(f => f.relativePath).map(f => {
    const parts = f.relativePath!.split('/');
    return parts[0];
  })).size;

  return (
    <>
      {/* Hidden folder input */}
      <input
        ref={folderInputRef}
        type="file"
        /* @ts-ignore - webkitdirectory is not in types */
        webkitdirectory=""
        directory=""
        multiple
        style={{ display: 'none' }}
        onChange={handleFolderSelect}
      />
      
      {/* Upload Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium hover:from-purple-600 hover:to-pink-600 transition-all shadow-lg shadow-purple-500/25"
      >
        <Upload className="w-4 h-4" />
        Upload
        {pendingCount > 0 && (
          <span className="ml-1 px-2 py-0.5 bg-white/20 rounded-full text-xs">
            {pendingCount}
          </span>
        )}
      </button>

      {/* Upload Modal */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-2xl w-full max-w-lg border border-white/10 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <h3 className="text-lg font-semibold text-white">Upload Files or Folder</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Upload Options */}
            <div className="p-4 grid grid-cols-2 gap-3">
              {/* Files Dropzone */}
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer ${
                  isDragActive
                    ? 'border-purple-500 bg-purple-500/10'
                    : 'border-white/20 hover:border-purple-500/50'
                }`}
              >
                <input {...getInputProps()} />
                <Upload className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                {isDragActive ? (
                  <p className="text-purple-300 text-sm">Drop here...</p>
                ) : (
                  <>
                    <p className="text-slate-300 text-sm mb-1">Files</p>
                    <p className="text-slate-500 text-xs">Drag & drop or click</p>
                  </>
                )}
              </div>

              {/* Folder Button */}
              <button
                onClick={() => folderInputRef.current?.click()}
                className="border-2 border-dashed border-white/20 rounded-xl p-6 text-center transition-all hover:border-blue-500/50 hover:bg-blue-500/5"
              >
                <FolderUp className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                <p className="text-slate-300 text-sm mb-1">Folder</p>
                <p className="text-slate-500 text-xs">Click to browse</p>
              </button>
            </div>
            
            {/* Hint */}
            <div className="px-4 pb-2">
              <p className="text-xs text-slate-500 text-center">
                💡 Tip: You can also drag & drop folders directly!
              </p>
            </div>

            {/* File List */}
            {files.length > 0 && (
              <div className="px-4 pb-4 max-h-64 overflow-y-auto">
                {folderCount > 0 && (
                  <p className="text-xs text-slate-400 mb-2">
                    <Folder className="w-3 h-3 inline-block mr-1" />
                    {folderCount} folder(s) • {files.length} file(s)
                  </p>
                )}
                <div className="space-y-2">
                  {files.map((f, i) => (
                    <div
                      key={`${f.relativePath || f.file.name}-${i}`}
                      className="flex items-center gap-3 p-3 bg-white/5 rounded-lg"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">
                          {f.relativePath || f.file.name}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all ${
                                f.status === 'error' ? 'bg-red-500' : 'bg-purple-500'
                              }`}
                              style={{ width: `${f.progress}%` }}
                            />
                          </div>
                          <span className="text-xs text-slate-400">{f.progress}%</span>
                        </div>
                      </div>
                      <div className="flex-shrink-0">
                        {f.status === 'done' && <CheckCircle className="w-5 h-5 text-green-500" />}
                        {f.status === 'error' && <AlertCircle className="w-5 h-5 text-red-500" />}
                        {['uploading', 'processing'].includes(f.status) && (
                          <Loader2 className="w-5 h-5 text-purple-500 animate-spin" />
                        )}
                        {f.status === 'pending' && (
                          <button onClick={() => removeFile(f.file, f.relativePath)}>
                            <X className="w-5 h-5 text-slate-400 hover:text-white" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="flex justify-end gap-2 p-4 border-t border-white/10">
              <button
                onClick={() => {
                  setFiles([]);
                  setIsOpen(false);
                }}
                className="px-4 py-2 text-slate-300 hover:text-white transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

