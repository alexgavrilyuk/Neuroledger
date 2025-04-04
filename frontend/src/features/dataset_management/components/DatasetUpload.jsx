// frontend/src/features/dataset_management/components/DatasetUpload.jsx
import React, { useState, useRef, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useDatasetUpload } from '../hooks/useDatasetUpload';
import Button from '../../../shared/ui/Button';
import {
    ArrowUpTrayIcon,
    XCircleIcon,
    CheckCircleIcon,
    DocumentArrowUpIcon,
    DocumentIcon,
    DocumentTextIcon
} from '@heroicons/react/24/outline';
import Card from '../../../shared/ui/Card';

const DatasetUpload = ({ onUploadComplete }) => {
  const [file, setFile] = useState(null);
  const { uploadFile, isUploading, uploadProgress, uploadError } = useDatasetUpload(() => {
      // Callback when upload AND metadata creation is successful
      setFile(null); // Clear the selected file
      if (onUploadComplete) {
          onUploadComplete(); // Notify parent to e.g., refetch list
      }
  });
  const fileInputRef = useRef();

  const onDrop = useCallback((acceptedFiles) => {
    // Do something with the files
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      // Trigger upload automatically? Or wait for button click? Let's wait.
      // uploadFile(acceptedFiles[0]);
    }
  }, []);

  // Get icon based on file type
  const getFileIcon = (fileName) => {
    if (!fileName) return DocumentIcon;

    const extension = fileName.split('.').pop().toLowerCase();

    if (['csv'].includes(extension)) {
      return DocumentTextIcon;
    } else if (['xls', 'xlsx'].includes(extension)) {
      return DocumentTextIcon;
    }

    return DocumentIcon;
  };

  const FileIcon = file ? getFileIcon(file.name) : DocumentArrowUpIcon;

  const { getRootProps, getInputProps, isDragActive, isDragAccept, isDragReject } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
       // Add other types if needed
    },
    multiple: false, // Only allow one file at a time
  });

  const handleUploadClick = () => {
      if (file) {
          uploadFile(file);
      }
  }

  const handleClearFile = () => {
      setFile(null);
      // If using ref for input, clear it too
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
  }

  return (
    <Card elevation="default" hover={false} className="overflow-visible">
        <Card.Header>
            <div className="flex items-center">
                <ArrowUpTrayIcon className="h-5 w-5 mr-2 text-blue-500" />
                <span>Upload New Dataset</span>
            </div>
        </Card.Header>
        <Card.Body className="space-y-4">
            {/* Enhanced Dropzone Area */}
            <div
                {...getRootProps()}
                className={`relative mt-2 flex flex-col justify-center items-center rounded-xl border-2 border-dashed px-6 py-10 transition-all duration-300 ${
                    isDragActive && isDragAccept
                        ? 'border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20 scale-[1.02] shadow-soft-lg'
                        : isDragActive && isDragReject
                        ? 'border-red-500 dark:border-red-400 bg-red-50 dark:bg-red-900/20'
                        : 'border-gray-300 dark:border-gray-600 group-hover:border-gray-400 dark:group-hover:border-gray-500 hover:border-gray-400 dark:hover:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800/30'
                }`}
            >
                {/* Top corner badge for file type requirements */}
                <div className="absolute top-2 right-2 text-[10px] font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-full px-2 py-0.5">
                    CSV, XLS, XLSX
                </div>

                <div className="text-center">
                    {/* Icon with animation */}
                    <div className={`mx-auto h-16 w-16 flex items-center justify-center rounded-full transition-all duration-300 ${
                        isDragActive && isDragAccept
                            ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
                            : isDragActive && isDragReject
                            ? 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 animate-pulse'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 group-hover:bg-gray-200 dark:group-hover:bg-gray-700'
                    }`}>
                        <FileIcon className={`h-8 w-8 transition-transform duration-300 ${isDragActive ? 'scale-110' : ''}`} />
                    </div>

                    <div className="mt-4 flex flex-col items-center text-sm leading-6">
                        {isDragActive && isDragAccept ? (
                            <p className="font-medium text-blue-600 dark:text-blue-400">Drop to upload</p>
                        ) : isDragActive && isDragReject ? (
                            <p className="font-medium text-red-600 dark:text-red-400">File type not supported</p>
                        ) : (
                            <>
                                <p className="text-gray-600 dark:text-gray-400">
                                    <label
                                        htmlFor="file-upload"
                                        className="relative cursor-pointer rounded-md bg-transparent font-semibold text-blue-600 dark:text-blue-400 focus-within:outline-none focus-within:ring-2 focus-within:ring-blue-600 focus-within:ring-offset-2 dark:focus-within:ring-offset-gray-800 hover:text-blue-500 dark:hover:text-blue-300"
                                    >
                                        <span>Upload a file</span>
                                        <input id="file-upload" name="file-upload" type="file" className="sr-only" {...getInputProps()} ref={fileInputRef} />
                                    </label>
                                    <span className="pl-1">or drag and drop</span>
                                </p>
                                <p className="text-xs mt-1 text-gray-500 dark:text-gray-500">CSV, XLS, XLSX up to 50MB</p>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Selected File Display - Enhanced with better visualization */}
            {file && !isUploading && !uploadError && (
                <div className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-700 p-3 bg-gradient-subtle-light dark:bg-gradient-subtle-dark shadow-soft-sm dark:shadow-soft-dark-sm transition-all duration-200 hover:shadow-soft-md">
                    <div className="flex items-center space-x-3">
                        <div className="h-10 w-10 flex-shrink-0 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                            <FileIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate pr-2">{file.name}</span>
                            <span className="text-xs text-gray-500 dark:text-gray-500">
                                {(file.size / (1024 * 1024)).toFixed(2)} MB
                            </span>
                        </div>
                    </div>
                    <div className="flex items-center gap-x-3">
                        <Button
                            onClick={handleUploadClick}
                            size="sm"
                            variant="primary"
                            leftIcon={ArrowUpTrayIcon}
                            className="shadow-soft-md hover:shadow-soft-lg"
                        >
                            Upload
                        </Button>
                        <button
                            onClick={handleClearFile}
                            className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-200"
                            aria-label="Clear selection"
                        >
                            <XCircleIcon className="h-5 w-5" />
                        </button>
                    </div>
                </div>
            )}

            {/* Upload Progress - Enhanced with animation and better feedback */}
            {isUploading && (
                <div className="space-y-3 bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700 shadow-soft-md animate-fadeIn">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                            <div className="h-10 w-10 flex-shrink-0 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center animate-pulse">
                                <ArrowUpTrayIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate pr-2">
                                    Uploading: {file?.name}
                                </span>
                                <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                                    {uploadProgress}%
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
                        <div
                            style={{ width: `${uploadProgress}%` }}
                            className="bg-gradient-to-r from-blue-400 to-blue-600 dark:from-blue-500 dark:to-blue-400 h-2.5 rounded-full transition-all duration-300 ease-out"
                        ></div>
                    </div>
                </div>
            )}

            {/* Success Message (Only shown briefly via hook logic) */}
            {uploadProgress === 100 && !isUploading && !uploadError && (
                <div className="flex items-center gap-x-2 p-3 bg-green-50 dark:bg-green-900/30 rounded-lg border border-green-200 dark:border-green-700/50 text-green-700 dark:text-green-300 animate-fadeIn">
                    <CheckCircleIcon className="h-5 w-5 flex-shrink-0" />
                    <span className="text-sm font-medium">Upload Complete!</span>
                </div>
            )}

            {/* Upload Error - Enhanced with better visualization */}
            {uploadError && (
                <div className="flex items-start gap-x-3 p-4 bg-red-50 dark:bg-red-900/30 rounded-lg border border-red-200 dark:border-red-700/50 shadow-soft-sm animate-fadeIn">
                    <div className="h-6 w-6 flex-shrink-0 rounded-full bg-red-100 dark:bg-red-800/50 flex items-center justify-center">
                        <XCircleIcon className="h-4 w-4 text-red-600 dark:text-red-400" />
                    </div>
                    <div className="flex-grow">
                        <h4 className="text-sm font-medium text-red-800 dark:text-red-300 mb-1">Upload Failed</h4>
                        <p className="text-xs text-red-600 dark:text-red-400">{uploadError}</p>
                        <button
                            onClick={handleClearFile}
                            className="mt-2 text-xs font-medium text-red-700 dark:text-red-300 hover:text-red-800 dark:hover:text-red-200 underline"
                        >
                            Clear
                        </button>
                    </div>
                </div>
            )}
        </Card.Body>
    </Card>
  );
};

export default DatasetUpload;