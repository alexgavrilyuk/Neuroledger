// frontend/src/features/dashboard/hooks/useChatHistory.js
// ** NEW FILE **
import { useState, useCallback } from 'react';

export const useChatHistory = (initialMessages = []) => {
  const [messages, setMessages] = useState(initialMessages);

  const addMessage = useCallback((message) => {
      // Add unique ID to message for key prop
      const messageWithId = { ...message, id: Date.now() + Math.random() };
    setMessages((prevMessages) => [...prevMessages, messageWithId]);
  }, []);

   // Function to update the content of the last message (e.g., for streaming later)
   const updateLatestMessage = useCallback((newContent) => {
       setMessages((prevMessages) => {
           if (prevMessages.length === 0) return prevMessages;
           const updatedMessages = [...prevMessages];
           const lastMessage = { ...updatedMessages[updatedMessages.length - 1] };
           lastMessage.content = newContent;
           updatedMessages[updatedMessages.length - 1] = lastMessage;
           return updatedMessages;
       });
   }, []);

  return { messages, addMessage, updateLatestMessage, setMessages }; // Also export setMessages for potential resets
};