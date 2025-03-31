// frontend/src/features/dataset_management/hooks/useDatasetUpload.js
// ** FULLY UPDATED FILE **
import { useState } from 'react';
import apiClient from '../../../shared/services/apiClient';
import axios from 'axios'; // Use raw axios for direct GCS upload

export const useDatasetUpload = (onUploadSuccess) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState(null);

  const uploadFile = async (file) => {
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(0);
    setUploadError(null);

    try {
      // 1. Get Signed URL - PASS fileSize
      console.log(`Requesting upload URL for: ${file.name}, size: ${file.size}`);
      // Add fileSize to the query parameters
      const urlResponse = await apiClient.get(
        `/datasets/upload-url?filename=${encodeURIComponent(file.name)}&fileSize=${file.size}`
      );

      if (urlResponse.data.status !== 'success' || !urlResponse.data.data?.signedUrl) {
        throw new Error(urlResponse.data.message || 'Failed to get upload URL from server.');
      }

      const { signedUrl, gcsPath } = urlResponse.data.data;
      console.log(`Got signed URL for path: ${gcsPath}`);

      // 2. Upload file directly to GCS using the signed URL
      console.log(`Uploading ${file.name} to GCS...`);
      const fileContentType = file.type || 'application/octet-stream'; // Determine content type
      const uploadResponse = await axios.put(signedUrl, file, {
        headers: {
           // Set Content-Type. Axios automatically adds Content-Length for Blob/File.
           'Content-Type': fileContentType,
        },
        onUploadProgress: (progressEvent) => {
          // Ensure progressEvent.total is available before calculating percentage
          if (progressEvent.total && progressEvent.total > 0) {
             const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
             setUploadProgress(percentCompleted);
             // console.log(`Upload progress: ${percentCompleted}%`); // Optional: Reduce logging
          } else {
             // Handle cases where total size isn't reported (less common for single PUT)
             // Avoid setting intermediate progress without total size
             console.warn("Upload progress event missing total size.");
          }
        },
      });

      // Check for GCS success status (usually 200 OK for PUT)
      if (uploadResponse.status !== 200) {
         // Attempt to parse error from GCS response if available
         let gcsErrorMsg = `GCS upload failed with status: ${uploadResponse.status}`;
         if (uploadResponse.data) { // GCS often returns XML error details
            console.error("GCS Error Response:", uploadResponse.data);
            // Basic parsing attempt
            const responseText = String(uploadResponse.data); // Ensure it's a string
            const messageMatch = responseText.match(/<Message>(.*?)<\/Message>/);
            const detailsMatch = responseText.match(/<Details>(.*?)<\/Details>/);
            if (messageMatch && messageMatch[1]) {
                gcsErrorMsg += ` - ${messageMatch[1]}`;
            }
            if (detailsMatch && detailsMatch[1]) {
                gcsErrorMsg += ` (${detailsMatch[1]})`;
            }
         }
         throw new Error(gcsErrorMsg);
      }
      console.log("GCS Upload successful.");
      setUploadProgress(100); // Explicitly set to 100% on success before backend call

      // 3. Notify our backend that upload is complete & create metadata
      console.log("Notifying backend of successful upload...");
      const metadataResponse = await apiClient.post('/datasets', {
        name: file.name, // Use original filename as default name
        originalFilename: file.name,
        gcsPath: gcsPath,
        fileSizeBytes: file.size,
      });

       if (metadataResponse.data.status !== 'success') {
          throw new Error(metadataResponse.data.message || 'Failed to save dataset metadata on server.');
      }
      console.log("Dataset metadata saved successfully.");

      // Callback on complete success (GCS upload + metadata save)
      if (onUploadSuccess) {
        onUploadSuccess(metadataResponse.data.data); // Pass new dataset data if needed
      }

    } catch (err) {
       console.error("Dataset upload failed:", err);
        let message = 'Dataset upload failed.';
        // Extract message more reliably
        if (axios.isAxiosError(err)) {
            // Prioritize backend error message if available from metadata step
            message = err.response?.data?.message || err.response?.statusText || err.message;
            // Include specific GCS message if it was thrown earlier
            if (err.message.includes("GCS upload failed")) {
                 message = err.message;
             }
        } else if (err.message) {
             message = err.message;
        }
        setUploadError(message);
        setUploadProgress(0); // Reset progress on error

    } finally {
      setIsUploading(false);
      // Consider resetting progress after a short delay to show 100% briefly
        // setTimeout(() => { if (!uploadError) setUploadProgress(0); }, 3000);
    }
  };

  // Return state and upload function
  return { uploadFile, isUploading, uploadProgress, uploadError };
};