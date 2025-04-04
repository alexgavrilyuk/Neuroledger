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
      // 1. Request signed URL for upload
      const getUrlResponse = await apiClient.get(`/datasets/upload-url?filename=${encodeURIComponent(file.name)}&fileSize=${file.size}`);

      if (getUrlResponse.data.status !== 'success') {
        throw new Error(getUrlResponse.data.message || 'Failed to get upload URL');
      }

      const { signedUrl, gcsPath } = getUrlResponse.data.data;

      // 2. Upload to GCS using the signed URL
      const uploadResponse = await fetch(signedUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type || 'application/octet-stream'
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(percentCompleted);
        }
      });

      if (!uploadResponse.ok) {
        throw new Error(`Upload failed with status: ${uploadResponse.status}`);
      }

      // Simulate completion for a moment so users can see 100%
      setUploadProgress(100);

      // 3. Create metadata record with backend
      const metadataResponse = await apiClient.post('/datasets', {
        gcsPath,
        originalFilename: file.name,
        name: file.name, // Default to filename, user can rename later
        fileSizeBytes: file.size,
        teamId: teamId || null // Add teamId if provided
      });

      if (metadataResponse.data.status !== 'success') {
        throw new Error(metadataResponse.data.message || 'Failed to create dataset metadata');
      }

      // If we got here, all steps succeeded
      setTimeout(() => {
        setIsUploading(false);
        if (onComplete) onComplete(metadataResponse.data.data);
      }, 1000); // Keep 100% progress visible briefly

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