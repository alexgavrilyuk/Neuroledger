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
    setLoading(true);
    try {
      const data = await getChatSessions();
      setSessions(data);
      // If there are sessions but no current session set, set the first one as current
      if (data.length > 0 && !currentSession) {
        setCurrentSession(data[0]);
      }
    } catch (error) {
      console.error('Error loading chat sessions:', error);
    } finally {
      setLoading(false);
    }
  }, [currentSession]);
  
  /**
   * Load messages for the specified session
   */
  const loadMessages = useCallback(async (sessionId) => {
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
  }, []);

  /**
   * Send a message in the current chat session
   */
  const sendMessage = useCallback(async (promptText, selectedDatasetIds = []) => {
    if (!currentSession?._id) return null;
    
    try {
      setLoading(true);
      const result = await sendChatMessage(
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
        setSessions(prev => prev.map(session =>
          session._id === result.updatedSession._id ? result.updatedSession : session
        ));
      }

      return result;
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [currentSession]);

  /**
   * Create a new chat session
   */
  const createNewSession = useCallback(async (title = "New Chat", teamId = null) => {
    try {
      setLoading(true);
      const newSession = await createChatSession(title, teamId);
      setSessions(prev => [newSession, ...prev]);
      setCurrentSession(newSession);
      setMessages([]);
      return newSession;
    } catch (error) {
      console.error('Error creating chat session:', error);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Delete a chat session
   */
  const deleteSession = useCallback(async (sessionId) => {
    try {
      setLoading(true);
      await deleteChatSession(sessionId);
      setSessions(prev => prev.filter(s => s._id !== sessionId));
      
      if (currentSession?._id === sessionId) {
        // If we're deleting the current session, set the first available one as current
        // or null if no sessions remain
        const remainingSessions = sessions.filter(s => s._id !== sessionId);
        setCurrentSession(remainingSessions.length > 0 ? remainingSessions[0] : null);
        setMessages([]);
      }
      
      return true;
    } catch (error) {
      console.error('Error deleting chat session:', error);
      return false;
    } finally {
      setLoading(false);
    }
  }, [sessions, currentSession]);

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
    sessions,
    currentSession,
    messages,
    loading,
    loadSessions,
    loadMessages,
    setCurrentSession,
    sendMessage,
    createNewSession,
    deleteSession
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