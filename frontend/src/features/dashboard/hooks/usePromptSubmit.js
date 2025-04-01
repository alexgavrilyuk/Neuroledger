// frontend/src/features/dashboard/hooks/usePromptSubmit.js
// ** UPDATED FILE - Accept setMessages prop **
import { useState, useCallback } from 'react';
import apiClient from '../../../shared/services/apiClient';

// --- FIX: Accept setMessages as an argument ---
export const usePromptSubmit = (addMessageCallback, setMessages) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const submitPrompt = useCallback(async (promptText, selectedDatasetIds) => {
    if (!setMessages) { // Add a check if setMessages wasn't passed
         console.error("usePromptSubmit requires the setMessages function from useChatHistory.");
         setError("Internal error: Chat state handler missing.");
         return;
    }

    setIsLoading(true);
    setError(null);

    // Add placeholder AI message using the addMessage callback
    addMessageCallback({ type: 'ai', content: null, isLoading: true, id: 'loading-' + Date.now() });

    try {
      const response = await apiClient.post('/prompts', {
        promptText,
        selectedDatasetIds,
      });

      if (response.data.status === 'success' && response.data.data?.aiResponse) {
         // --- FIX: Use the passed setMessages to update state ---
         setMessages((prevMessages) => {
             const updatedMessages = [...prevMessages];
             const lastIndex = updatedMessages.findIndex(m => m.isLoading === true);
             if (lastIndex !== -1) {
                 updatedMessages[lastIndex] = {
                      type: 'ai',
                      content: response.data.data.aiResponse,
                      id: response.data.data.promptId || Date.now(),
                      isLoading: false // Ensure loading is set to false
                  };
             } else {
                  // Fallback: Add a new message if loading placeholder somehow disappeared
                  // This replaces the direct call to addMessageCallback inside the setter
                   updatedMessages.push({ type: 'ai', content: response.data.data.aiResponse, id: response.data.data.promptId || Date.now() });
             }
             return updatedMessages;
         });

      } else {
        throw new Error(response.data.message || 'Failed to get AI response');
      }
    } catch (err) {
      console.error('Prompt submission error:', err);
       const errorMessage = err.response?.data?.message || err.message || 'An error occurred while processing your request.';
       setError(errorMessage);

        // --- FIX: Use the passed setMessages to update state on error ---
         setMessages((prevMessages) => {
             const updatedMessages = [...prevMessages];
             const lastIndex = updatedMessages.findIndex(m => m.isLoading === true);
             if (lastIndex !== -1) {
                 updatedMessages[lastIndex] = {
                      ...updatedMessages[lastIndex], // Keep original ID etc.
                      content: `Error: ${errorMessage}`,
                      isLoading: false,
                      isError: true
                 };
             } else {
                 // Fallback: Add a new error message
                  updatedMessages.push({ type: 'ai', content: `Error: ${errorMessage}`, isError: true, id: 'error-' + Date.now() });
             }
             return updatedMessages;
         });
    } finally {
      setIsLoading(false);
       // Ensure loading state is removed from any potentially stuck messages
       // --- FIX: Use the passed setMessages ---
       setMessages((prevMessages) => prevMessages.map(m => m.isLoading ? {...m, isLoading: false } : m));
    }
    // --- FIX: Removed direct call to setMessages here ---
    // }, [addMessageCallback, setMessages]); // Add setMessages to dependency array
  }, [addMessageCallback, setMessages]); // Add setMessages to dependency array


  return { submitPrompt, isLoading, error };
};