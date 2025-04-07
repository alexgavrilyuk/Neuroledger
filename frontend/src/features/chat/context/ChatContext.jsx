// frontend/src/features/chat/context/ChatContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getChatSessions, getChatMessages, sendChatMessage, createChatSession, deleteChatSession } from '../services/chat.api';
import { useSocket } from '../hooks/useSocket';
import logger from '../../../shared/utils/logger';

const ChatContext = createContext();

/**
 * Provider component for chat state management
 */
export const ChatProvider = ({ children }) => {
  const [sessions, setSessions] = useState([]);
  const [currentSession, setCurrentSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const { connectSocket, subscribeToEvents } = useSocket();
  
  /**
   * Load user's chat sessions
   */
  const loadSessions = async () => {
    setLoading(true);
    try {
      const data = await getChatSessions();
      setSessions(data);
    } catch (error) {
      console.error('Error loading chat sessions:', error);
    } finally {
      setLoading(false);
    }
  };
  
  /**
   * Load messages for the current session
   */
  const loadMessages = async (sessionId) => {
    if (!sessionId) return;
    
    setLoading(true);
    try {
      const data = await getChatMessages(sessionId);
      setMessages(data);
    } catch (error) {
      console.error('Error loading chat messages:', error);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Send a message in the current chat session
   */
  const sendMessage = async (promptText, selectedDatasetIds = []) => {
    if (!currentSession?._id) return null;
    
    try {
      const result = await sendChatMessage(
        currentSession._id,
        promptText,
        selectedDatasetIds
      );
      
      // Add the new messages to the current message list
      setMessages(prev => [...prev, result.userMessage, result.aiMessage]);
      
      return result;
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  };

  /**
   * Create a new chat session
   */
  const createNewSession = async (title = "New Chat", teamId = null) => {
    try {
      const newSession = await createChatSession(title, teamId);
      setSessions(prev => [newSession, ...prev]);
      setCurrentSession(newSession);
      setMessages([]);
      return newSession;
    } catch (error) {
      console.error('Error creating chat session:', error);
      return null;
    }
  };

  /**
   * Delete a chat session
   */
  const deleteSession = async (sessionId) => {
    try {
      await deleteChatSession(sessionId);
      setSessions(prev => prev.filter(s => s._id !== sessionId));
      
      if (currentSession?._id === sessionId) {
        setCurrentSession(null);
        setMessages([]);
      }
      
      return true;
    } catch (error) {
      console.error('Error deleting chat session:', error);
      return false;
    }
  };

  // NEW: Function to update the current session data in the context
  const updateCurrentSessionData = useCallback((updatedSessionData) => {
    setCurrentSession(prev => prev ? { ...prev, ...updatedSessionData } : null);
    // Update the session in the main list as well
    setSessions(prevSessions => prevSessions.map(s => 
      s._id === updatedSessionData._id ? { ...s, ...updatedSessionData } : s
    ));
  }, []);
  
  // Set up socket listeners for real-time updates
  useEffect(() => {
    let cleanupFunction = null;
    
    const setupSocket = async () => {
      await connectSocket();
      
      const unsubscribe = subscribeToEvents({
        'chat:message:completed': (data) => {
          logger.debug(`[WS Received] chat:message:completed - Session: ${data.sessionId}, Message ID: ${data.message?._id}, Has reportDatasets?: ${!!data.message?.reportDatasets}, Datasets: ${JSON.stringify(data.message?.reportDatasets)}`);
          
          if (data.sessionId === currentSession?._id) {
            setMessages(prev => 
              prev.map(msg => 
                msg._id === data.message._id ? data.message : msg
              )
            );
          }
        },
        'chat:message:error': (data) => {
          logger.debug(`[WS Received] chat:message:error - Session: ${data.sessionId}, Message ID: ${data.messageId}, Error: ${data.error}`);
          
          if (data.sessionId === currentSession?._id) {
            setMessages(prev => 
              prev.map(msg => 
                msg._id === data.messageId ? {...msg, status: 'error', errorMessage: data.error} : msg
              )
            );
          }
        },
        'chat:message:fetching_data': (data) => {
          logger.debug(`[WS Received] chat:message:fetching_data - Session: ${data.sessionId}, Message ID: ${data.messageId}`);
          if (data.sessionId === currentSession?._id) {
            setMessages(prev => 
              prev.map(msg => 
                msg._id === data.messageId ? { ...msg, status: 'fetching_data' } : msg
              )
            );
          }
        }
      });
      
      cleanupFunction = unsubscribe;
      return unsubscribe;
    };
    
    setupSocket().catch(err => {
      console.error('Error setting up socket connection:', err);
    });
    
    return () => {
      if (cleanupFunction) {
        cleanupFunction();
      }
    };
  }, [currentSession]);
  
  // Load messages when current session changes
  useEffect(() => {
    if (currentSession?._id) {
      loadMessages(currentSession._id);
    }
  }, [currentSession]);
  
  return (
    <ChatContext.Provider
      value={{
        sessions,
        currentSession,
        messages,
        loading,
        loadSessions,
        loadMessages,
        setCurrentSession,
        sendMessage,
        createNewSession,
        deleteSession,
        updateCurrentSessionData
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => useContext(ChatContext); 