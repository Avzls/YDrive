'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { filesApi } from '@/lib/api';

interface UploadFile {
  file: File;
  id?: string;
  progress: number;
  status: 'pending' | 'uploading' | 'processing' | 'done' | 'error';
  error?: string;
}

interface FileUploaderProps {
  folderId?: string;
  onUploadComplete?: () => void;
}

export function FileUploader({ folderId, onUploadComplete }: FileUploaderProps) {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const uploadFile = async (uploadFile: UploadFile) => {
    const { file } = uploadFile;
    
    try {
      // Update status to uploading
      setFiles(prev => prev.map(f => 
        f.file === file ? { ...f, status: 'uploading' as const, progress: 10 } : f
      ));

      console.log('[DEBUG] Direct upload:', {
        name: file.name,
        sizeBytes: file.size,
        mimeType: file.type || 'application/octet-stream',
        folderId: folderId
      });

      // Use direct upload - simpler and avoids presigned URL issues
      setFiles(prev => prev.map(f => 
        f.file === file ? { ...f, progress: 30 } : f
      ));

      const result = await filesApi.directUpload(file, folderId);

      setFiles(prev => prev.map(f => 
        f.file === file ? { ...f, id: result.id, progress: 100, status: 'done' as const } : f
      ));

      onUploadComplete?.();
    } catch (err: any) {
      console.error('[Upload Error]', err);
      setFiles(prev => prev.map(f => 
        f.file === file ? { ...f, status: 'error' as const, error: err.message } : f
      ));
    }
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles: UploadFile[] = acceptedFiles.map(file => ({
      file,
      progress: 0,
      status: 'pending' as const,
    }));

    setFiles(prev => [...prev, ...newFiles]);
    newFiles.forEach(uploadFile);
  }, [folderId]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

  const removeFile = (file: File) => {
    setFiles(prev => prev.filter(f => f.file !== file));
  };

  const pendingCount = files.filter(f => ['pending', 'uploading', 'processing'].includes(f.status)).length;

  return (
    <>
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
              <h3 className="text-lg font-semibold text-white">Upload Files</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Dropzone */}
            <div className="p-4">
              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
                  isDragActive
                    ? 'border-purple-500 bg-purple-500/10'
                    : 'border-white/20 hover:border-purple-500/50'
                }`}
              >
                <input {...getInputProps()} />
                <Upload className="w-10 h-10 mx-auto mb-3 text-slate-400" />
                {isDragActive ? (
                  <p className="text-purple-300">Drop files here...</p>
                ) : (
                  <>
                    <p className="text-slate-300 mb-1">Drag & drop files here</p>
                    <p className="text-slate-500 text-sm">or click to browse</p>
                  </>
                )}
              </div>
            </div>

            {/* File List */}
            {files.length > 0 && (
              <div className="px-4 pb-4 max-h-64 overflow-y-auto">
                <div className="space-y-2">
                  {files.map((f, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 p-3 bg-white/5 rounded-lg"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{f.file.name}</p>
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
                          <button onClick={() => removeFile(f.file)}>
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
