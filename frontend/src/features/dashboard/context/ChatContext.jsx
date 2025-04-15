// frontend/src/features/dashboard/context/ChatContext.jsx
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  createChatSession as apiCreateChatSession,
  getChatSessions as apiGetChatSessions,
  getChatSession as apiGetChatSession,
  updateChatSession as apiUpdateChatSession,
  deleteChatSession as apiDeleteChatSession,
  sendChatMessage as apiSendChatMessage,
  getChatMessages as apiGetChatMessages,
  streamChatMessage as apiStreamChatMessage,
} from '../services/chat.api';
import { useSocket } from '../hooks/useSocket';
import logger from '../../../shared/utils/logger';
// Use the shared Modal component and the existing ReportViewer
import Modal from '../../../shared/ui/Modal'; 
import ReportViewer from '../../report_display/components/ReportViewer';

const ChatContext = createContext();

// Define Agent Status types
const AGENT_STATUS = {
  IDLE: 'idle',
  THINKING: 'thinking',
  USING_TOOL: 'using_tool',
  ERROR: 'error',
};

// Define Streaming Status types
const STREAMING_STATUS = {
  INACTIVE: 'inactive',
  ACTIVE: 'active',
  ERROR: 'error',
  COMPLETED: 'completed',
};

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
  // NEW State: Track agent status for each message being processed
  // Maps messageId to { status: AGENT_STATUS, toolName?: string, error?: string }
  const [agentMessageStatuses, setAgentMessageStatuses] = useState({});

  // NEW State: Track streaming status for the current streaming response
  const [isStreaming, setIsStreaming] = useState(false);
  // Streaming message/token state
  const [streamingMessageId, setStreamingMessageId] = useState(null);
  // Streaming tool state
  const [currentToolCall, setCurrentToolCall] = useState(null);
  const [lastToolResult, setLastToolResult] = useState(null);
  // Streaming code state
  const [generatedCode, setGeneratedCode] = useState(null);
  const [streamError, setStreamError] = useState(null);
  // Stream controller (for cleanup)
  const [streamController, setStreamController] = useState(null);
  const [lastTokenTimestamp, setLastTokenTimestamp] = useState(null);

  // NEW State for Report Modal
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportModalData, setReportModalData] = useState({ code: null, datasets: null });

  // --- Add Ref to track current streaming ID immediately --- 
  const currentStreamingIdRef = useRef(null);

  const { connectSocket, subscribeToEvents } = useSocket();

  // Connect to socket when component mounts
  useEffect(() => {
    connectSocket().catch(error => {
      logger.error('Error connecting to socket:', error);
    });
    // Note: Disconnect logic might be needed elsewhere, e.g., on logout
  }, [connectSocket]);

  // Cleanup streaming on unmount or session change
  useEffect(() => {
    return () => {
      if (streamController) {
        streamController.close();
      }
    };
  }, [currentSession]);

  /**
   * Load user's chat sessions
   */
  const loadSessions = useCallback(async () => {
    setIsLoadingSessions(true);
    try {
      const data = await apiGetChatSessions();
      setChatSessions(data);
      // Select the first session if none is currently selected
      if (data.length > 0 && !currentSession) {
        setCurrentSession(data[0]);
      }
    } catch (err) {
      logger.error('Error loading chat sessions:', err);
      setError(err.message || 'Failed to load chat sessions.');
    } finally {
      setIsLoadingSessions(false);
    }
  }, [currentSession]); // Dependency on currentSession might be removed if logic changes

  /**
   * Load messages for the specified session
   */
  const loadMessages = useCallback(async (sessionId) => {
    if (!sessionId) return;
    setIsLoadingMessages(true);
    setMessages([]); // Clear old messages
    setAgentMessageStatuses({}); // Clear agent statuses for the new session
    try {
      const data = await apiGetChatMessages(sessionId);
      setMessages(data);
    } catch (err) {
      logger.error('Error loading chat messages:', err);
      setError(err.message || 'Failed to load messages.');
    } finally {
      setIsLoadingMessages(false);
    }
  }, []);

  /**
   * Send a message in the current chat session using the standard API
   */
  const sendMessage = useCallback(async (promptText, selectedDatasetIds = []) => {
    if (!currentSession?._id) return null;
    setError(null);
    setIsSendingMessage(true);
    try {
      const result = await apiSendChatMessage(
        currentSession._id,
        promptText,
        selectedDatasetIds
      );

      // Add the user message immediately
      setMessages(prev => [...prev, result.userMessage]);

      // Add the AI placeholder and set its initial agent status
      setMessages(prev => [...prev, result.aiMessage]);
      setAgentMessageStatuses(prev => ({
        ...prev,
        [result.aiMessage._id]: { status: AGENT_STATUS.IDLE } // Start as idle before agent:thinking
      }));

      // Update the current session if needed (e.g., associatedDatasetIds)
      if (result.updatedSession) {
        setCurrentSession(result.updatedSession);
        setChatSessions(prev => prev.map(session =>
          session._id === result.updatedSession._id ? result.updatedSession : session
        ));
      }

      return result;
    } catch (err) {
      logger.error('Error sending message:', err);
      setError(err.message || 'Failed to send message.');
      // Optionally remove the placeholder AI message on send failure?
      throw err;
    } finally {
      setIsSendingMessage(false);
    }
  }, [currentSession]);

  /**
   * Send a message in the current chat session using streaming API
   */
  const sendStreamingMessage = useCallback(async (promptText, selectedDatasetIds = []) => {
    if (!currentSession?._id) return null;
    
    if (streamController) {
      streamController.close();
    }

    setError(null);
    setIsSendingMessage(true);
    setIsStreaming(true);
    // Reset state AND ref
    setStreamingMessageId(null);
    currentStreamingIdRef.current = null; 
    setCurrentToolCall(null);
    setLastToolResult(null);
    setGeneratedCode(null);
    setStreamError(null);
    setLastTokenTimestamp(null);

    try {
      const eventHandlers = {
        onUserMessageCreated: (data) => {
          logger.info(`User message created: ${data.messageId}`);
          // Add the user message to the chat
          const userMessage = {
            _id: data.messageId,
            messageType: 'user',
            promptText,
            status: 'completed',
            createdAt: new Date()
          };
          setMessages(prev => [...prev, userMessage]);
        },

        onAiMessageCreated: (data) => {
          logger.info(`AI message created: ${data.messageId}`);
          const aiMessage = {
            _id: data.messageId,
            messageType: 'ai_report',
            aiResponseText: '',
            status: 'processing',
            createdAt: new Date(),
            isStreaming: true // Add flag to indicate this is a streaming message
          };
          setMessages(prev => [...prev, aiMessage]);
          // --- Set both state and ref --- 
          setStreamingMessageId(data.messageId);
          currentStreamingIdRef.current = data.messageId;
          logger.debug(`[ChatContext onAiMessageCreated] Set currentStreamingIdRef to: ${currentStreamingIdRef.current}`);
        },

        onThinking: () => {
          // --- Use Ref for immediate ID access --- 
          const currentId = currentStreamingIdRef.current;
          if (currentId) {
              logger.debug(`[ChatContext onThinking] Updating status for ID: ${currentId}`);
              setMessages(prevMessages =>
                  prevMessages.map(msg =>
                      msg._id === currentId
                          ? { ...msg, status: 'thinking' }
                          : msg
                  )
              );
          } else {
              logger.warn('[ChatContext onThinking] currentStreamingIdRef is null.');
          }
          // Keep agentMessageStatuses for broader state if needed (using state ID is okay here)
          if (streamingMessageId) {
             setAgentMessageStatuses(prev => ({
               ...prev,
               [streamingMessageId]: { status: AGENT_STATUS.THINKING }
             }));
          }
        },

        onToken: (data) => {
          // --- Use Ref for immediate ID access --- 
          const currentId = currentStreamingIdRef.current;
          if (currentId && data.content) {
            logger.debug(`[ChatContext onToken] Received token for ref ID: ${currentId}. Content: "${data.content}"`);
            setMessages(prevMessages => {
              logger.debug(`[ChatContext onToken] Updating messages state. Prev length: ${prevMessages.length}`);
              return prevMessages.map(msg => {
                if (msg._id === currentId) {
                  const oldText = msg.aiResponseText || '';
                  const newText = oldText + data.content;
                  const newMsg = { 
                    ...msg, 
                    aiResponseText: newText 
                  };
                  logger.debug(`[ChatContext onToken] Appending to msg ${msg._id} (via ref). Old length: ${oldText.length}, New length: ${newText.length}`);
                  return newMsg;
                }
                return msg;
              })
            });
            setLastTokenTimestamp(Date.now());
          } else if (!data.content) {
              logger.debug('[ChatContext onToken] Received token event with no content.', data);
          } else if (!currentId) {
              logger.warn('[ChatContext onToken] Received token but currentStreamingIdRef is null. Content:', data.content);
          }
        },

        onToolCall: (data) => {
          // --- Use Ref for immediate ID access --- 
          const currentId = currentStreamingIdRef.current;
          logger.info(`Tool call: ${data.toolName} (for ref ID: ${currentId})`);
          if (currentId) {
            setMessages(prevMessages =>
              prevMessages.map(msg =>
                msg._id === currentId
                  ? { 
                      ...msg, 
                      toolName: data.toolName,
                      toolInput: data.input,
                      toolStatus: 'running',
                      toolOutput: null,
                      toolError: null,
                      status: 'using_tool'
                    } 
                  : msg
              )
            );
          } else {
              logger.warn('[ChatContext onToolCall] currentStreamingIdRef is null, cannot update message state.');
          }
          setLastToolResult(null);
        },

        onToolResult: (data) => {
          // --- Use Ref for immediate ID access --- 
          const currentId = currentStreamingIdRef.current;
          logger.info(`Tool result: ${data.toolName}, status: ${data.status} (for ref ID: ${currentId})`);
          if (currentId) {
            setMessages(prevMessages =>
              prevMessages.map(msg =>
                msg._id === currentId
                  ? { 
                      ...msg, 
                      toolStatus: data.status,
                      toolOutput: data.output,
                      toolError: data.error,
                    } 
                  : msg
              )
            );
          } else {
              logger.warn('[ChatContext onToolResult] currentStreamingIdRef is null, cannot update message state.');
          }
        },

        onGeneratedCode: (data) => {
          // --- Use Ref for immediate ID access --- 
          const currentId = currentStreamingIdRef.current;
          logger.info(`Generated code for message (ref ID: ${currentId})`);
          if (currentId) {
            setMessages(prev => prev.map(msg => 
              msg._id === currentId 
                ? { ...msg, aiGeneratedCode: data.code } 
                : msg
            ));
          } else {
              logger.warn('[ChatContext onGeneratedCode] currentStreamingIdRef is null, cannot update message state.');
          }
          setGeneratedCode(data.code); // Keep separate state for potential direct use
        },

        onCompleted: (data) => {
          // --- Use Ref for immediate ID access (but also use event data if available) --- 
          const finalMsgId = data.messageId || currentStreamingIdRef.current;
          logger.info(`Streaming completed for message: ${finalMsgId}`);
          if (finalMsgId) {
            setMessages(prev => prev.map(msg => 
              msg._id === finalMsgId 
                ? { 
                    ...msg, 
                    status: 'completed', 
                    ...(data.finalContent !== undefined && { aiResponseText: data.finalContent }), 
                    isStreaming: false,
                    toolName: undefined, toolInput: undefined, toolStatus: undefined, toolOutput: undefined, toolError: undefined
                  } 
                : msg
            ));
          }
          // --- Reset state and ref --- 
          setIsStreaming(false);
          setIsSendingMessage(false);
          setStreamingMessageId(null); 
          currentStreamingIdRef.current = null; 
          setStreamController(null);
        },

        onError: (data) => {
          // --- Use Ref for immediate ID access --- 
           const errorMsgId = currentStreamingIdRef.current; // Use ref ID primarily
          logger.error(`Streaming error: ${data.message} (for ref ID: ${errorMsgId})`);
          setStreamError(data.message);
          if (errorMsgId) {
            setMessages(prev => prev.map(msg => 
              msg._id === errorMsgId 
                ? { 
                    ...msg, 
                    status: 'error', 
                    errorMessage: data.message,
                    isStreaming: false,
                    toolName: undefined, toolInput: undefined, toolStatus: 'error', toolOutput: undefined, toolError: data.message 
                  } 
                : msg
            ));
          }
          // --- Reset state and ref --- 
          setIsStreaming(false);
          setIsSendingMessage(false);
          setStreamingMessageId(null); 
          currentStreamingIdRef.current = null; 
          setStreamController(null);
        },

        onEnd: () => {
          logger.info('Streaming connection ended');
          // --- Reset state and ref --- 
          setIsStreaming(false);
          setIsSendingMessage(false);
          setStreamingMessageId(null); 
          currentStreamingIdRef.current = null; 
          setStreamController(null);
        }
      };

      // Start the streaming request
      const controller = apiStreamChatMessage(
        currentSession._id,
        promptText,
        selectedDatasetIds,
        eventHandlers
      );

      // Store the controller for cleanup
      setStreamController(controller);

      return { success: true };
    } catch (err) {
      logger.error('Error starting streaming chat:', err);
      setError(err.message || 'Failed to start streaming chat.');
      setIsStreaming(false);
      setIsSendingMessage(false);
      setStreamingMessageId(null); 
      currentStreamingIdRef.current = null; 
      setStreamController(null);
      throw err;
    }
  }, [currentSession, streamController]);

  /**
   * Create a new chat session
   */
  const createNewSession = useCallback(async (title = "New Chat", teamId = null) => {
    setError(null);
    setIsLoadingSessions(true);
    try {
      const newSession = await apiCreateChatSession(title, teamId);
      setChatSessions(prev => [newSession, ...prev]);
      setCurrentSession(newSession);
      setMessages([]);
      setAgentMessageStatuses({}); // Clear agent statuses
      return newSession;
    } catch (err) {
      logger.error('Error creating chat session:', err);
      setError(err.message || 'Failed to create chat session.');
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
      logger.error("Error updating chat session title:", err);
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
      const remainingSessions = chatSessions.filter(session => session._id !== sessionId);
      setChatSessions(remainingSessions);
      if (currentSession && currentSession._id === sessionId) {
        // Select the next session or null if none remain
        setCurrentSession(remainingSessions[0] || null);
        setMessages([]);
        setAgentMessageStatuses({});
      }
    } catch (err) {
      logger.error("Error deleting chat session:", err);
      setError(err.message || 'Failed to delete chat session.');
      throw err;
    }
  }, [currentSession, chatSessions]);

  // Function to open the report modal
  const openReportModal = useCallback((data) => {
    if (data && data.code) {
      logger.info('Opening report modal.');
      // ---- ADD DEBUG LOG ----
      logger.debug('Report data received by openReportModal:', { 
        hasCode: !!data.code, 
        codeLength: data.code?.length, 
        hasDatasets: !!data.datasets, 
        datasetsLength: data.datasets?.length 
      });
      // ---- END DEBUG LOG ----
      // Ensure datasets is always an array, even if null/undefined initially
      setReportModalData({ code: data.code, datasets: data.datasets || [] });
      setIsReportModalOpen(true);
    } else {
      logger.error('Attempted to open report modal without code or data object.', data);
      // Optionally, show a user-facing error notification here
    }
  }, []);

  // Function to close the report modal
  const closeReportModal = useCallback(() => {
    logger.info('Closing report modal.');
    setIsReportModalOpen(false);
    // Delay clearing data slightly to avoid flicker during modal close animation
    setTimeout(() => {
       setReportModalData({ code: null, datasets: null });
    }, 300); // Adjust delay based on modal animation duration
  }, []);

  // Effect to load messages when currentSession changes
  useEffect(() => {
    if (currentSession?._id) {
      loadMessages(currentSession._id);
    }
  }, [currentSession, loadMessages]);

  // Set up socket listeners for real-time updates
  useEffect(() => {
    const setupListeners = () => {
      try {
        logger.info(`Setting up socket listeners for session: ${currentSession?._id}`);
        const listeners = {
          // --- Agent Status Updates --- 
          'agent:thinking': (data) => {
            if (data.sessionId !== currentSession?._id) return;
            logger.debug(`[WS Received] agent:thinking - Message ID: ${data.messageId}`);
            setAgentMessageStatuses(prev => ({
              ...prev,
              [data.messageId]: { status: AGENT_STATUS.THINKING, toolName: null, error: null },
            }));
          },
          'agent:using_tool': (data) => {
            if (data.sessionId !== currentSession?._id) return;
            logger.debug(`[WS Received] agent:using_tool - Message ID: ${data.messageId}, Tool: ${data.toolName}`);
            setAgentMessageStatuses(prev => ({
              ...prev,
              [data.messageId]: { status: AGENT_STATUS.USING_TOOL, toolName: data.toolName, error: null },
            }));
          },
          'agent:tool_result': (data) => {
            if (data.sessionId !== currentSession?._id) return;
            logger.debug(`[WS Received] agent:tool_result - Message ID: ${data.messageId}, Tool: ${data.toolName}, Summary: ${data.resultSummary}`);
            // Revert status to thinking after tool use, let UI decide how to show summary briefly
            setAgentMessageStatuses(prev => ({
              ...prev,
              [data.messageId]: { status: AGENT_STATUS.THINKING, toolName: null, error: null }, // Back to thinking
            }));
          },
          'agent:error': (data) => {
            if (data.sessionId !== currentSession?._id) return;
            logger.warn(`[WS Received] agent:error - Message ID: ${data.messageId}, Error: ${data.error}`);
            setAgentMessageStatuses(prev => ({
              ...prev,
              [data.messageId]: { status: AGENT_STATUS.ERROR, toolName: null, error: data.error },
            }));
            // Agent loop error might be followed by chat:message:error, which finalizes the message state
          },

          // --- Final Message Updates --- 
          'chat:message:completed': (data) => {
            if (data.sessionId !== currentSession?._id) return;
            logger.debug(`[WS Received] chat:message:completed - Message ID: ${data.message?._id}`);
            
            // ---- ADD DEBUG LOG ----
            if (data.message) {
                logger.debug('[Chat Context] Received completed message data via socket:', { 
                    messageId: data.message._id, 
                    status: data.message.status, 
                    hasCode: !!data.message.aiGeneratedCode, 
                    codeLength: data.message.aiGeneratedCode?.length 
                });
            } else {
                logger.warn('[Chat Context] Received chat:message:completed event without message data.', data);
            }
            // ---- END DEBUG LOG ----
            
            setMessages(prev =>
              prev.map(msg =>
                msg._id === data.message._id ? data.message : msg
              )
            );
            // Clear agent status for this message ID
            setAgentMessageStatuses(prev => {
              const newState = { ...prev };
              delete newState[data.message._id];
              return newState;
            });
          },
          'chat:message:error': (data) => {
            if (data.sessionId !== currentSession?._id) return;
            logger.error(`[WS Received] chat:message:error - Message ID: ${data.messageId}, Error: ${data.error}`);
            setMessages(prev =>
              prev.map(msg =>
                msg._id === data.messageId ? {...msg, status: 'error', errorMessage: data.error} : msg
              )
            );
             // Clear agent status for this message ID
             setAgentMessageStatuses(prev => {
              const newState = { ...prev };
              delete newState[data.messageId];
              return newState;
            });
          },
          // 'chat:message:fetching_data' and 'chat:message:processing' are deprecated
        };

        const unsubscribe = subscribeToEvents(listeners);

        // Cleanup function
        return () => {
          if (unsubscribe) {
            logger.info(`Cleaning up socket listeners for session: ${currentSession?._id}`);
            unsubscribe();
          }
        };
      } catch (error) {
        logger.error('Error setting up socket listeners:', error);
        return undefined; // Return undefined or similar to indicate no cleanup needed
      }
    };

    let cleanup;
    if (currentSession?._id) {
      cleanup = setupListeners();
    }

    return () => {
      if (cleanup) cleanup();
    };
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
    sendStreamingMessage, // Add streaming method
    createNewSession,
    updateChatSessionTitle,
    deleteChatSession,
    agentMessageStatuses, // Expose agent statuses
    AGENT_STATUS, // Expose constants
    // Streaming state
    isStreaming,
    streamingMessageId,
    currentToolCall,
    lastToolResult,
    generatedCode,
    streamError,
    STREAMING_STATUS,
    // Expose modal state and functions
    isReportModalOpen,
    reportModalData,
    openReportModal,
    closeReportModal,
    lastTokenTimestamp,
  };

  return (
    <ChatContext.Provider value={contextValue}>
      {children}
      {/* Render the generic Modal conditionally */}
      <Modal
        isOpen={isReportModalOpen}
        onClose={closeReportModal}
        title="Generated Report"
        size="4xl" // Use a large size for reports
      >
        {/* Render ReportViewer inside the modal only when open and data is ready */}
        {isReportModalOpen && reportModalData.code && (
          <div className="mt-4 h-[70vh] overflow-y-auto"> {/* Add fixed height and scroll */}
             <ReportViewer
               // ---- ADD KEY ----
               key={reportModalData.code} // Force re-mount when code changes
               // ---- END KEY ----
               // Pass code and datasets via a single prop if ReportViewer expects that,
               // or individually. Adjust based on ReportViewer's actual props.
               // Assuming it takes separate props based on architecture doc examples:
               code={reportModalData.code}
               datasets={reportModalData.datasets} 
               // Example if it takes a single prop:
               // reportInfo={reportModalData} 
            />
          </div>
        )}
      </Modal>
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