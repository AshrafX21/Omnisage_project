/**
 * FileUploadZone Component.
 * 
 * Renders a premium, interactive drag-and-drop file upload region.
 * Emits upload actions and tracks upload status, file progress, and errors.
 */

import React, { useState, useRef } from 'react';
import { Upload, FileText, CheckCircle, AlertCircle, Loader } from 'lucide-react';
import { apiService } from '../services/apiService';

/**
 * FileUploadZone component for uploading medical records.
 * 
 * @param {Object} props
 * @param {Function} props.onUploadSuccess - Callback triggered when a file is successfully uploaded and parsed.
 * @returns {JSX.Element} The file upload zone UI.
 */
export default function FileUploadZone({ onUploadSuccess }) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [uploads, setUploads] = useState([]); // List of { id, name, status, progress, error }
  const fileInputRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const processFiles = async (files) => {
    const newUploads = Array.from(files).map(file => ({
      tempId: Math.random().toString(36).substring(7),
      name: file.name,
      status: 'uploading',
      progress: 10,
      error: null
    }));

    setUploads(prev => [...newUploads, ...prev]);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const uploadMetadata = newUploads[i];

      try {
        // Trigger file upload and parsing API
        const parsedRecord = await apiService.uploadRecord(file);
        
        // Update list status to success
        setUploads(prev => prev.map(u => 
          u.tempId === uploadMetadata.tempId 
            ? { ...u, status: 'success', progress: 100 }
            : u
        ));

        // Invoke callback to refresh dashboard lists
        if (onUploadSuccess) {
          onUploadSuccess(parsedRecord);
        }
      } catch (err) {
        const errorMsg = err.response?.data?.detail || "Upload or parsing failed.";
        setUploads(prev => prev.map(u => 
          u.tempId === uploadMetadata.tempId 
            ? { ...u, status: 'failed', error: errorMsg }
            : u
        ));
      }
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      processFiles(e.target.files);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current.click();
  };

  return (
    <div className="w-full space-y-4">
      {/* Drag & Drop Main Box */}
      <div
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={triggerFileInput}
        className={`w-full py-10 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all duration-300 ${
          isDragActive 
            ? 'border-primary-500 bg-primary-50/5 scale-[1.01]' 
            : 'border-white/10 bg-slate-900/30 hover:border-primary-500/50 hover:bg-slate-900/40'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          accept=".pdf,.dcm,.dicom,.png,.jpg,.jpeg,.heic"
          onChange={handleFileChange}
        />
        
        <div className="p-4 bg-slate-800/80 rounded-full border border-white/5 shadow-md mb-4 text-primary-500 animate-pulse-slow">
          <Upload className="h-8 w-8" />
        </div>
        
        <h3 className="text-lg font-semibold text-white mb-1">
          Upload Medical Records
        </h3>
        
        <p className="text-sm text-slate-400 text-center px-6 max-w-md mb-3">
          Drag & drop your files here, or <span className="text-primary-500 font-medium hover:underline">browse files</span>
        </p>

        <p className="text-xs text-slate-500">
          Supports PDFs, medical scans (DICOM), and image uploads (.png, .jpg, .heic)
        </p>
      </div>

      {/* Upload Progress List */}
      {uploads.length > 0 && (
        <div className="glass-panel p-4 max-h-48 overflow-y-auto space-y-2.5">
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Upload Activity
          </h4>
          {uploads.map((upload) => (
            <div key={upload.tempId} className="bg-slate-800/20 border border-white/5 rounded-lg p-2.5 text-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3 truncate">
                  <FileText className="h-5 w-5 text-slate-400 shrink-0" />
                  <span className="text-slate-200 truncate font-medium max-w-[200px] md:max-w-xs">
                    {upload.name}
                  </span>
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  {upload.status === 'uploading' && (
                    <span className="flex items-center text-xs text-primary-500 font-medium">
                      <Loader className="animate-spin h-3.5 w-3.5 mr-1" />
                      Parsing...
                    </span>
                  )}
                  {upload.status === 'success' && (
                    <span className="flex items-center text-xs text-emerald-500 font-medium">
                      <CheckCircle className="h-3.5 w-3.5 mr-1" />
                      Indexed
                    </span>
                  )}
                  {upload.status === 'failed' && (
                    <span className="flex items-center text-xs text-rose-500 font-medium">
                      <AlertCircle className="h-3.5 w-3.5 mr-1" />
                      Failed
                    </span>
                  )}
                </div>
              </div>

              {/* Full error text, wrapped (not truncated) — a truncated
                  "Failed to record data in da..." with no visible way to
                  read the rest makes real failures undiagnosable. */}
              {upload.status === 'failed' && upload.error && (
                <p className="mt-1.5 pl-8 text-xs text-rose-400/80 break-words">
                  {upload.error}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
