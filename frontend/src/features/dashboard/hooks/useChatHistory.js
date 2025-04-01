// frontend/src/features/dashboard/hooks/useChatHistory.js
// ** UPDATED FILE - No structural change needed, but ensure IDs are robust **
import { useState, useCallback } from 'react';
import logger from '../../../shared/utils/logger'; // Use logger

export const useChatHistory = (initialMessages = []) => {
  const [messages, setMessages] = useState(initialMessages);

  const addMessage = useCallback((message) => {
      // Ensure a robust unique ID
      const messageWithId = { ...message, id: message.id || `${message.type}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}` };
      logger.debug('useChatHistory: Adding message:', messageWithId);
      setMessages((prevMessages) => [...prevMessages, messageWithId]);
      return messageWithId.id; // Return the ID used
  }, []);

   // Function to update a specific message by ID
   const updateMessageById = useCallback((messageId, updates) => {
       logger.debug(`useChatHistory: Updating message ID ${messageId} with:`, updates);
       setMessages((prevMessages) => {
           const msgIndex = prevMessages.findIndex(m => m.id === messageId);
           if (msgIndex === -1) {
               logger.warn(`useChatHistory: Message with ID ${messageId} not found for update.`);
               return prevMessages;
           }
           const updatedMessages = [...prevMessages];
           updatedMessages[msgIndex] = { ...updatedMessages[msgIndex], ...updates, isLoading: false }; // Always set isLoading false on update
           return updatedMessages;
       });
   }, []);

   // Optional: Clear loading flags if any get stuck (though updateMessageById should handle it)
   const clearAllLoadingFlags = useCallback(() => {
        setMessages(prev => prev.map(m => m.isLoading ? {...m, isLoading: false} : m));
   }, []);

  return { messages, addMessage, updateMessageById, setMessages, clearAllLoadingFlags }; // Export update function
};