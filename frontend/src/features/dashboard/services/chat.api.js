// frontend/src/features/dashboard/services/chat.api.js
// ENTIRE FILE - FULLY UPDATED

import apiClient from '../../../shared/services/apiClient';
import { auth } from '../../../shared/services/firebase';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import logger from '../../../shared/utils/logger';

// Chat Sessions (No changes needed)
export const createChatSession = async (title = "New Chat", teamId = null) => {
  const response = await apiClient.post('/chats', { title, teamId });
  return response.data.data;
};

export const getChatSessions = async (limit = 50, skip = 0) => { // Increased default limit
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

// Chat Messages (No changes needed)
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
 * @param {Object} eventHandlers - Callbacks for stream events (e.g., onToken, onExplanation, onUsingTool, onAgentToolResult, onAgentFinalAnswer, onError, onEnd)
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
      let streamUrl = `${baseUrl}/chats/${sessionId}/stream`;

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
        openWhenHidden: true, // Keep connection open

        onopen: async (response) => {
          if (response.ok && response.headers.get('content-type')?.includes('text/event-stream')) {
            logger.info('[streamChatMessage] SSE Connection established.');
            // Optional: Call an onStart handler if provided
            if (eventHandlers.onStart) eventHandlers.onStart();
          } else {
             // Handle connection errors (4xx, 5xx)
             const errorText = await response.text();
             const status = response.status;
             logger.error(`[streamChatMessage] SSE Connection Error ${status}: ${response.statusText}. Body: ${errorText}`);
             const errorMessage = status >= 500
                ? `Server error (${status}) connecting to stream.`
                : `Connection error (${status}): ${errorText || response.statusText}. Check permissions or session details.`;
             if (eventHandlers.onError) eventHandlers.onError({ message: errorMessage, status: status });
             throw new Error(errorMessage); // Stop further processing
          }
        },

        onmessage: (event) => {
          logger.debug(`[streamChatMessage] Raw SSE Message: Event='${event.event}', Data='${event.data}'`);

          try {
             const data = JSON.parse(event.data);
             // ** CRITICAL: Use event.event to determine the type **
             const eventType = event.event || 'message'; // Default to 'message' if no event type specified

             logger.debug(`[streamChatMessage] Parsed Event: Type='${eventType}', ParsedData:`, data);

             // Call the appropriate handler based on the EXPLICIT event type
             switch (eventType) {
               case 'user_message_created':
                 if (eventHandlers.onUserMessageCreated) eventHandlers.onUserMessageCreated(data);
                 break;
               case 'ai_message_created':
                 if (eventHandlers.onAiMessageCreated) eventHandlers.onAiMessageCreated(data);
                 break;
               case 'agent:explanation': // ** Handle new event **
                 if (eventHandlers.onExplanation) eventHandlers.onExplanation(data);
                 break;
               case 'agent:using_tool':
                 if (eventHandlers.onUsingTool) eventHandlers.onUsingTool(data);
                 break;
               case 'agent:tool_result':
                 if (eventHandlers.onAgentToolResult) eventHandlers.onAgentToolResult(data);
                 break;
               case 'token': // ** Only handle 'token' event specifically for text streaming **
                 if (eventHandlers.onToken) eventHandlers.onToken(data);
                 break;
               case 'agent:final_answer':
                  if (eventHandlers.onAgentFinalAnswer) eventHandlers.onAgentFinalAnswer(data);
                  break;
               case 'agent:error': // Handle specific agent error event
                  if (eventHandlers.onError) eventHandlers.onError({ ...data, type: 'agent' }); // Add type hint
                  break;
               case 'error': // Handle generic stream error event from backend
                 if (eventHandlers.onError) eventHandlers.onError({ ...data, type: 'stream' }); // Add type hint
                 break;
               case 'end':
                 if (eventHandlers.onEnd) eventHandlers.onEnd(data);
                 // Backend signals end, we can close here if desired, or wait for onclose
                 // abortController.abort();
                 break;
               // Deprecated/Old events - Log if they appear
               case 'start':
               case 'agent:thinking':
               case 'agent:status':
               case 'completed':
               case 'finish':
                 logger.warn(`[streamChatMessage] Received deprecated/unhandled SSE event type: '${eventType}'. Ignoring.`);
                 break;
               case 'message': // Handle default 'message' events if backend sends them unexpectedly
                 logger.warn(`[streamChatMessage] Received generic 'message' event. Content:`, data);
                 // Decide how to handle - maybe treat as text token?
                 // if (eventHandlers.onToken) eventHandlers.onToken(data);
                 break;
               default:
                 logger.warn(`[streamChatMessage] Received unknown SSE event type: '${eventType}'. Data:`, data);
             }
          } catch (error) {
            logger.error('[streamChatMessage] Error parsing SSE message data:', error, 'Raw data:', event.data);
          }
        },

        onclose: () => {
          logger.info('[streamChatMessage] SSE Connection closed by server or network.');
          // Call onEnd handler if provided, signalling closure
          if (eventHandlers.onEnd) {
             eventHandlers.onEnd({ status: 'closed' });
          }
        },

        onerror: (err) => {
          logger.error('[streamChatMessage] SSE fetchEventSource Error (Network/Setup):', err);
          if (eventHandlers.onError) {
            // Avoid double-reporting errors already handled in onopen
            if (!String(err.message).includes('connecting to stream')) {
                 eventHandlers.onError({ message: `Streaming connection error: ${err.message || 'Network issue'}`, type: 'network' });
            }
          }
          // IMPORTANT: Stop retries on error. If retries are desired for specific network issues, add logic here.
          throw err;
        }
      });

    } catch (error) {
       logger.error('[streamChatMessage] Error setting up fetchEventSource:', error);
       if (eventHandlers.onError) {
         eventHandlers.onError({ message: `Failed to set up streaming: ${error.message}`, type: 'setup' });
       }
       abortController.abort(); // Ensure cleanup
    }
  };

  setupStream();

  return {
    close: () => {
        logger.info('[streamChatMessage] Aborting SSE connection via close().');
        abortController.abort();
    }
  };
};