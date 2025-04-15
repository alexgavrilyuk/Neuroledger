import apiClient from '../../../shared/services/apiClient';
import { auth } from '../../../shared/services/firebase';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import logger from '../../../shared/utils/logger';

// Chat Sessions
export const createChatSession = async (title = "New Chat", teamId = null) => {
  const response = await apiClient.post('/chats', { title, teamId });
  return response.data.data;
};

export const getChatSessions = async (limit = 10, skip = 0) => {
  const response = await apiClient.get('/chats', { params: { limit, skip } });
  return response.data.data;
};

export const getChatSession = async (sessionId) => {
  const response = await apiClient.get(`/chats/${sessionId}`);
  return response.data.data;
};

export const updateChatSession = async (sessionId, title) => {
  const response = await apiClient.patch(`/chats/${sessionId}`, { title });
  return response.data.data;
};

export const deleteChatSession = async (sessionId) => {
  const response = await apiClient.delete(`/chats/${sessionId}`);
  return response.data.data;
};

// Chat Messages
export const sendChatMessage = async (sessionId, promptText, selectedDatasetIds = []) => {
  const response = await apiClient.post(`/chats/${sessionId}/messages`, {
    promptText,
    selectedDatasetIds
  });
  return response.data.data;
};

export const getChatMessages = async (sessionId, limit = 50, skip = 0) => {
  const response = await apiClient.get(`/chats/${sessionId}/messages`, {
    params: { limit, skip }
  });
  return response.data.data;
};

export const getChatMessage = async (sessionId, messageId) => {
  const response = await apiClient.get(`/chats/${sessionId}/messages/${messageId}`);
  return response.data.data;
};

/**
 * Stream a chat message using fetchEventSource for proper header support.
 * @param {string} sessionId - Chat session ID
 * @param {string} promptText - User's message text
 * @param {Array<string>} selectedDatasetIds - Array of dataset IDs
 * @param {Object} eventHandlers - Callbacks for stream events
 * @returns {Object} - Control object with close method (AbortController signal)
 */
export const streamChatMessage = (sessionId, promptText, selectedDatasetIds = [], eventHandlers = {}) => {
  const abortController = new AbortController();

  const setupStream = async () => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error('User not authenticated');
      }
      const token = await currentUser.getIdToken(false);

      const baseUrl = import.meta.env.VITE_API_BASE_URL;
      if (!baseUrl) {
         throw new Error('VITE_API_BASE_URL environment variable is not set.');
      }
      // Construct URL - no need for new URL() here, fetchEventSource takes a string
      let streamUrl = `${baseUrl}/chats/${sessionId}/stream`;
      
      // Append query parameters manually
      const params = new URLSearchParams();
      params.append('promptText', promptText);
      if (selectedDatasetIds.length > 0) {
        params.append('selectedDatasetIds', selectedDatasetIds.join(','));
      }
      streamUrl += `?${params.toString()}`;

      logger.info(`[streamChatMessage] Attempting to connect to SSE: ${streamUrl}`);

      fetchEventSource(streamUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'text/event-stream',
        },
        signal: abortController.signal,
        openWhenHidden: true, // Keep connection open even if tab is backgrounded
        
        onopen: async (response) => {
          if (response.ok && response.headers.get('content-type')?.includes('text/event-stream')) {
            logger.info('[streamChatMessage] SSE Connection established.');
            // Potentially call an onStart handler if needed, though SSE 'start' event is separate
          } else if (response.status >= 400 && response.status < 500 && response.status !== 429) {
            // Handle client-side errors (e.g., 401 Unauthorized, 403 Forbidden)
             const errorText = await response.text(); // Attempt to get error body
             logger.error(`[streamChatMessage] SSE Client Error ${response.status}: ${response.statusText}. Body: ${errorText}`);
             const errorMessage = `Authentication/Authorization failed (${response.status}). Please check credentials or permissions.`;
             if (eventHandlers.onError) eventHandlers.onError({ message: errorMessage, status: response.status });
             throw new Error(errorMessage); // Stop further processing
          } else {
             // Handle other errors (server errors, network issues)
              const errorText = await response.text();
              logger.error(`[streamChatMessage] SSE Server Error ${response.status}: ${response.statusText}. Body: ${errorText}`);
              const errorMessage = `Server error (${response.status}) occurred while connecting to stream.`;
              if (eventHandlers.onError) eventHandlers.onError({ message: errorMessage, status: response.status });
              throw new Error(errorMessage); // Stop further processing
          }
        },

        onmessage: (event) => {
          // --- MORE DETAILED LOGGING --- 
          logger.info(`[streamChatMessage] Raw SSE Message Received: ID=${event.id}, EventType=\'${event.event}\', Data=\'${event.data}\'`);
          // --- END LOGGING ---
          
          try {
             const data = JSON.parse(event.data);
             const eventType = event.event; // The custom event type from the backend

             // --- Log parsed data and type for debugging ---
             logger.debug(`[streamChatMessage] Parsed Event: Type=\'${eventType}\', ParsedData:`, data);
             // --- END LOGGING ---

             // Call the appropriate handler based on the custom event type
             switch (eventType) {
               case 'start':
                 if (eventHandlers.onStart) eventHandlers.onStart(data);
                 break;
               case 'token':
                 if (eventHandlers.onToken) eventHandlers.onToken(data);
                 break;
               case 'tool_call':
                 if (eventHandlers.onToolCall) eventHandlers.onToolCall(data);
                 break;
               case 'tool_result':
                 if (eventHandlers.onToolResult) eventHandlers.onToolResult(data);
                 break;
               case 'generated_code':
                 if (eventHandlers.onGeneratedCode) eventHandlers.onGeneratedCode(data);
                 break;
                case 'thinking':
                  if (eventHandlers.onThinking) eventHandlers.onThinking(data);
                  break;
                case 'user_message_created':
                  if (eventHandlers.onUserMessageCreated) eventHandlers.onUserMessageCreated(data);
                   break;
                 case 'ai_message_created':
                   if (eventHandlers.onAiMessageCreated) eventHandlers.onAiMessageCreated(data);
                   break;
               case 'completed':
                 if (eventHandlers.onCompleted) eventHandlers.onCompleted(data);
                 break;
               case 'error': // Specific 'error' event from the backend stream
                 if (eventHandlers.onError) eventHandlers.onError(data);
                 break;
                case 'end': // Specific 'end' event from the backend stream
                  if (eventHandlers.onEnd) eventHandlers.onEnd(data);
                  // Consider closing the connection here if 'end' is definitive
                  // abortController.abort(); 
                  break;
               default:
                 // --- Log unhandled event types ---
                 logger.warn(`[streamChatMessage] Received unhandled SSE event type: '${eventType}'`);
             }
          } catch (error) {
            logger.error('[streamChatMessage] Error parsing SSE message data:', error, 'Raw data:', event.data);
            // Handle JSON parsing error if needed
          }
        },

        onclose: () => {
          logger.info('[streamChatMessage] SSE Connection closed.');
          // This is called when the connection is intentionally closed or lost.
          // Call onEnd if it hasn't been called by a specific 'end' event?
          if (eventHandlers.onEnd) {
             // Check if completed handler was called to avoid duplicate 'end' signals?
             // Maybe not necessary depending on backend logic.
             // eventHandlers.onEnd({ status: 'closed' });
          }
        },

        onerror: (err) => {
          logger.error('[streamChatMessage] SSE fetchEventSource Error:', err);
          // This handles network errors or errors thrown by onopen/onmessage
          if (eventHandlers.onError) {
            // Avoid double-reporting errors already handled in onopen
            if (!String(err.message).includes('failed (')) { // Basic check
                 eventHandlers.onError({ message: `Streaming connection error: ${err.message || 'Network issue'}` });
            }
          }
          // IMPORTANT: Throwing the error here will stop the reconnection attempts
          // by fetchEventSource. If you want it to retry on network errors,
          // remove the 'throw err;' line or add specific conditions.
          throw err; 
        }
      });

    } catch (error) {
       logger.error('[streamChatMessage] Error setting up fetchEventSource:', error);
       if (eventHandlers.onError) {
         eventHandlers.onError({ message: `Failed to set up streaming: ${error.message}` });
       }
       // Ensure cleanup happens even if initial setup fails
       abortController.abort();
    }
  };

  setupStream();

  // Return control object with a method to close the connection
  return {
    close: () => {
        logger.info('[streamChatMessage] Aborting SSE connection via close().');
        abortController.abort();
    }
  };
}; 