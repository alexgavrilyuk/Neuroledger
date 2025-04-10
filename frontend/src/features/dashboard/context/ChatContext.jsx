// frontend/src/features/dashboard/context/ChatContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  createChatSession as apiCreateChatSession,
  getChatSessions as apiGetChatSessions,
  getChatSession as apiGetChatSession,
  updateChatSession as apiUpdateChatSession,
  deleteChatSession as apiDeleteChatSession,
  sendChatMessage as apiSendChatMessage,
  getChatMessages as apiGetChatMessages,
} from '../services/chat.api';
import { useSocket } from '../hooks/useSocket';
import logger from '../../../shared/utils/logger';

const ChatContext = createContext();

/**
 * Provider component for chat state management
 */
export const ChatProvider = ({ children }) => {
  const [chatSessions, setChatSessions] = useState([]);
  const [currentSession, setCurrentSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [error, setError] = useState(null);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const { connectSocket, subscribeToEvents } = useSocket();
  
  // Connect to socket when component mounts
  useEffect(() => {
    connectSocket().catch(error => {
      console.error('Error connecting to socket:', error);
    });
  }, [connectSocket]);

  /**
   * Load user's chat sessions
   */
  const loadSessions = useCallback(async () => {
    setIsLoadingSessions(true);
    try {
      const data = await apiGetChatSessions();
      setChatSessions(data);
      // If there are sessions but no current session set, set the first one as current
      if (data.length > 0 && !currentSession) {
        setCurrentSession(data[0]);
      }
    } catch (error) {
      console.error('Error loading chat sessions:', error);
    } finally {
      setIsLoadingSessions(false);
    }
  }, [currentSession]);
  
  /**
   * Load messages for the specified session
   */
  const loadMessages = useCallback(async (sessionId) => {
    if (!sessionId) return;
    
    setIsLoadingMessages(true);
    try {
      const data = await apiGetChatMessages(sessionId);
      setMessages(data);
    } catch (error) {
      console.error('Error loading chat messages:', error);
    } finally {
      setIsLoadingMessages(false);
    }
  }, []);

  /**
   * Send a message in the current chat session
   */
  const sendMessage = useCallback(async (promptText, selectedDatasetIds = []) => {
    if (!currentSession?._id) return null;
    
    try {
      setIsSendingMessage(true);
      const result = await apiSendChatMessage(
        currentSession._id,
        promptText,
        selectedDatasetIds
      );
      
      // Add the new messages to the current message list
      setMessages(prev => [...prev, result.userMessage, result.aiMessage]);
      
      // Update the current session with new data if available
      if (result.updatedSession) {
        setCurrentSession(result.updatedSession);
        // Also update the session in sessions list
        setChatSessions(prev => prev.map(session =>
          session._id === result.updatedSession._id ? result.updatedSession : session
        ));
      }

      return result;
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    } finally {
      setIsSendingMessage(false);
    }
  }, [currentSession]);

  /**
   * Create a new chat session
   */
  const createNewSession = useCallback(async (title = "New Chat", teamId = null) => {
    try {
      setIsLoadingSessions(true);
      const newSession = await apiCreateChatSession(title, teamId);
      setChatSessions(prev => [newSession, ...prev]);
      setCurrentSession(newSession);
      setMessages([]);
      return newSession;
    } catch (error) {
      console.error('Error creating chat session:', error);
      return null;
    } finally {
      setIsLoadingSessions(false);
    }
  }, []);

  /**
   * Update Chat Session Title
   */
  const updateChatSessionTitle = useCallback(async (sessionId, newTitle) => {
    setError(null);
    try {
      const updatedSession = await apiUpdateChatSession(sessionId, newTitle);
      setChatSessions(prevSessions =>
        prevSessions.map(session =>
          session._id === sessionId ? { ...session, title: updatedSession.title } : session
        )
      );
      if (currentSession && currentSession._id === sessionId) {
        setCurrentSession(prev => ({ ...prev, title: updatedSession.title }));
      }
      return updatedSession;
    } catch (err) {
      console.error("Error updating chat session title:", err);
      setError(err.message || 'Failed to update chat title.');
      throw err;
    }
  }, [currentSession]);

  /**
   * Delete Chat Session
   */
  const deleteChatSession = useCallback(async (sessionId) => {
    setError(null);
    try {
      await apiDeleteChatSession(sessionId);
      setChatSessions(prevSessions =>
        prevSessions.filter(session => session._id !== sessionId)
      );
      if (currentSession && currentSession._id === sessionId) {
        setCurrentSession(null);
        setMessages([]);
      }
      setChatSessions(prevSessions => {
        if (prevSessions.length === 0) {
            setCurrentSession(null);
            setMessages([]);
        }
        return prevSessions;
       });
    } catch (err) {
      console.error("Error deleting chat session:", err);
      setError(err.message || 'Failed to delete chat session.');
      throw err;
    }
  }, [currentSession]);

  // Set up socket listeners for real-time updates
  useEffect(() => {
    const setupListeners = async () => {
      try {
        const unsubscribe = subscribeToEvents({
          'chat:message:completed': (data) => {
            logger.debug(`[WS Received] chat:message:completed - Session: ${data.sessionId}, Message ID: ${data.message?._id}`);

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

        return unsubscribe;
      } catch (error) {
        console.error('Error setting up socket listeners:', error);
        return null;
      }
    };

    // Only set up listeners if we have a current session
    if (currentSession?._id) {
      const unsubscribePromise = setupListeners();

      return () => {
        unsubscribePromise.then(unsubscribe => {
          if (unsubscribe) unsubscribe();
        });
      };
    }
  }, [currentSession, subscribeToEvents]);
  
  const contextValue = {
    chatSessions,
    currentSession,
    messages,
    isLoadingSessions,
    isLoadingMessages,
    isSendingMessage,
    error,
    loadSessions,
    loadMessages,
    setCurrentSession,
    sendMessage,
    createNewSession,
    updateChatSessionTitle,
    deleteChatSession,
  };

  return (
    <ChatContext.Provider value={contextValue}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};