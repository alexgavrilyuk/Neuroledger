// frontend/src/features/dataset_management/hooks/useDatasetUpload.js
import { useState } from 'react';
import apiClient from '../../../shared/services/apiClient';

export const useDatasetUpload = (onComplete) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState(null);

  const uploadFile = async (file, teamId = null) => {
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(0);
    setUploadError(null);

    try {
      // Create FormData for file upload
      const formData = new FormData();
      formData.append('file', file);

      // Add teamId if provided
      if (teamId) {
        formData.append('teamId', teamId);
      }

      // Upload directly to our proxy endpoint
      const response = await apiClient.post('/datasets/proxy-upload', formData, {
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(percentCompleted);
        },
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      if (response.data.status !== 'success') {
        throw new Error(response.data.message || 'Failed to upload dataset');
      }

      // Simulate completion for a moment so users can see 100%
      setUploadProgress(100);

      // If we got here, everything succeeded
      setTimeout(() => {
        setIsUploading(false);
        if (onComplete) onComplete(response.data.data);
      }, 1000);

    } catch (error) {
      console.error('Dataset upload failed:', error);
      setUploadError(error.message || 'Failed to upload file');
      setIsUploading(false);
    }
  };

  return {
    uploadFile,
    isUploading,
    uploadProgress,
    uploadError,
    resetUpload: () => {
      setUploadProgress(0);
      setUploadError(null);
    }
  };
};