// frontend/src/features/dashboard/hooks/usePromptSubmit.js
// ** UPDATED FILE - Use updateMessageById, store reportHtml separately **
import { useState, useCallback } from 'react';
import apiClient from '../../../shared/services/apiClient';
import logger from '../../../shared/utils/logger';

// --- FIX: Accept updateMessageById ---
export const usePromptSubmit = (addMessageCallback, updateMessageById, clearAllLoadingFlags) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const submitPrompt = useCallback(async (promptText, selectedDatasetIds) => {
    if (!updateMessageById || !addMessageCallback) {
         logger.error("usePromptSubmit: addMessageCallback or updateMessageById function is missing!");
         setError("Internal error: Chat state handler missing.");
         return;
    }

    logger.debug("usePromptSubmit: Starting prompt submission...");
    setIsLoading(true);
    setError(null);

    // Add placeholder AI message - use addMessageCallback which returns the ID
    const loadingMessageId = addMessageCallback({
        type: 'ai',
        content: "Generating report...", // Placeholder text
        contentType: 'loading', // Simple content type
        isLoading: true,
        // Let addMessage assign ID
    });
    logger.debug(`usePromptSubmit: Added loading placeholder message with ID: ${loadingMessageId}`);

    try {
      logger.debug("usePromptSubmit: Calling apiClient.post('/prompts')...");
      const response = await apiClient.post('/prompts', {
        promptText,
        selectedDatasetIds,
      });
      logger.log("usePromptSubmit: Received API response:", response);
      logger.debug("usePromptSubmit: Checking response status:", response?.data?.status);
      logger.debug("usePromptSubmit: Checking response data:", response?.data?.data);

      if (response?.data?.status === 'success' && response?.data?.data) {
         logger.info("usePromptSubmit: API call successful, processing data...");
         const { executionOutput, executionStatus, promptId } = response.data.data;
         logger.debug(`usePromptSubmit: executionOutput length = ${executionOutput?.length}`);
         logger.debug(`usePromptSubmit: executionStatus = ${executionStatus}`);
         logger.debug(`usePromptSubmit: promptId = ${promptId}`);

         // --- FIX: Update the placeholder message using its ID ---
         if (executionStatus === 'completed') {
             updateMessageById(loadingMessageId, {
                 content: "Report generated successfully. Click to view.", // User-facing message
                 contentType: 'report_available', // New type to indicate report exists
                 reportHtml: executionOutput, // Store HTML separately
                 promptId: promptId, // Store original prompt ID if needed
                 isError: false,
                 isLoading: false // Ensure loading is false
             });
             logger.debug(`usePromptSubmit: Updated message ${loadingMessageId} with report_available.`);
         } else {
             // Handle execution or generation error reported by backend
             const errorMessage = executionOutput || 'An unknown error occurred during report generation.';
              updateMessageById(loadingMessageId, {
                 content: `Error generating report: ${errorMessage}`,
                 contentType: 'error',
                 isError: true,
                 isLoading: false // Ensure loading is false
             });
             logger.error(`usePromptSubmit: Updated message ${loadingMessageId} with backend error: ${errorMessage}`);
             setError(errorMessage); // Also set hook-level error maybe
         }

      } else {
        logger.error("usePromptSubmit: API response status not 'success' or data missing:", response?.data);
        throw new Error(response?.data?.message || 'Failed to get AI response or execution result');
      }
    } catch (err) {
       logger.error('usePromptSubmit: Error during API call or processing:', err);
       const errorMessage = err.response?.data?.message || err.message || 'An error occurred while processing your request.';
       setError(errorMessage);

        // --- FIX: Update the placeholder message using its ID on error ---
         updateMessageById(loadingMessageId, {
            content: `Error: ${errorMessage}`,
            contentType: 'error',
            isError: true,
            isLoading: false // Ensure loading is false
        });
         logger.error(`usePromptSubmit: Updated message ${loadingMessageId} with API/processing error.`);
    } finally {
      logger.debug("usePromptSubmit: Entering finally block.");
      setIsLoading(false);
       // Clear any potentially stuck loading flags (optional safeguard)
       // clearAllLoadingFlags();
       logger.debug("usePromptSubmit: Finished prompt submission flow.");
    }
  }, [addMessageCallback, updateMessageById, clearAllLoadingFlags]); // Add dependencies


  return { submitPrompt, isLoading, error };
};