// frontend/src/features/dataset_management/components/DatasetUpload.jsx
// ** NEW FILE **
import React, { useState, useRef, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useDatasetUpload } from '../hooks/useDatasetUpload';
import Button from '../../../shared/ui/Button';
import { ArrowUpTrayIcon, XCircleIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
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

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
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
    <Card>
        <Card.Header>Upload New Dataset</Card.Header>
        <Card.Body>
            <div className="space-y-4">
                {/* Dropzone Area */}
                <div
                    {...getRootProps()}
                    className={`mt-2 flex justify-center rounded-lg border border-dashed px-6 py-10 transition-colors duration-150 ${
                        isDragActive
                        ? 'border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
                    }`}
                >
                    <div className="text-center">
                        <ArrowUpTrayIcon className="mx-auto h-12 w-12 text-gray-400" aria-hidden="true" />
                        <div className="mt-4 flex text-sm leading-6 text-gray-600 dark:text-gray-400">
                            <label
                                htmlFor="file-upload" // Link to hidden input
                                className="relative cursor-pointer rounded-md bg-white dark:bg-transparent font-semibold text-blue-600 dark:text-blue-400 focus-within:outline-none focus-within:ring-2 focus-within:ring-blue-600 focus-within:ring-offset-2 dark:focus-within:ring-offset-gray-800 hover:text-blue-500 dark:hover:text-blue-300"
                            >
                                <span>Upload a file</span>
                                <input id="file-upload" name="file-upload" type="file" className="sr-only" {...getInputProps()} ref={fileInputRef} />
                            </label>
                            <p className="pl-1">or drag and drop</p>
                        </div>
                        <p className="text-xs leading-5 text-gray-500 dark:text-gray-500">CSV, XLS, XLSX up to 50MB (Example limit)</p>
                    </div>
                </div>

                {/* Selected File Display */}
                 {file && !isUploading && !uploadError && (
                    <div className="flex items-center justify-between rounded-md border border-gray-200 dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-700/50">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate pr-2">{file.name}</span>
                         <div className="flex items-center gap-x-3">
                            <Button onClick={handleUploadClick} size="sm" variant="primary">
                                Upload
                            </Button>
                             <button onClick={handleClearFile} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                                 <XCircleIcon className="h-5 w-5" />
                             </button>
                         </div>
                     </div>
                 )}

                {/* Upload Progress */}
                {isUploading && (
                    <div className="space-y-2">
                        <div className="flex justify-between text-sm font-medium text-gray-700 dark:text-gray-300">
                            <span>Uploading: {file?.name}</span>
                            <span>{uploadProgress}%</span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                            <div
                                className="bg-blue-600 dark:bg-blue-500 h-2 rounded-full transition-width duration-150 ease-linear"
                                style={{ width: `${uploadProgress}%` }}
                            ></div>
                        </div>
                    </div>
                )}

                 {/* Success Message (Briefly shown via hook logic if needed) */}
                 {/* {uploadProgress === 100 && !isUploading && !uploadError && (
                     <div className="flex items-center gap-x-2 text-sm text-green-600 dark:text-green-400">
                         <CheckCircleIcon className="h-5 w-5" /> Upload Complete!
                     </div>
                 )} */}


                {/* Upload Error */}
                {uploadError && (
                    <div className="flex items-center gap-x-2 text-sm text-red-600 dark:text-red-400 p-3 bg-red-50 dark:bg-red-900/30 rounded-md border border-red-300 dark:border-red-600/50">
                        <XCircleIcon className="h-5 w-5 flex-shrink-0" />
                         <div className="flex-grow">
                             <span>{uploadError}</span>
                             {/* Optionally add a retry button */}
                             <button onClick={handleClearFile} className="ml-2 text-xs font-medium underline hover:text-red-700 dark:hover:text-red-300">Clear</button>
                         </div>
                    </div>
                )}
            </div>
        </Card.Body>
    </Card>
  );
};

export default DatasetUpload;