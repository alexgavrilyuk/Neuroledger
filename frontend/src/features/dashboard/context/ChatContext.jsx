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
  // --> We will now directly update the message object instead of this separate state
  // const [agentMessageStatuses, setAgentMessageStatuses] = useState({});

  // NEW State: Track streaming status for the current streaming response
  const [isStreaming, setIsStreaming] = useState(false);
  // Streaming message/token state
  const [streamingMessageId, setStreamingMessageId] = useState(null); // ID of the message BEING streamed
  // Stream controller (for cleanup)
  const [streamController, setStreamController] = useState(null);
  const [streamError, setStreamError] = useState(null);
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
        logger.info('[ChatContext Cleanup] Aborting active stream controller.');
        streamController.close();
        setStreamController(null);
        setIsStreaming(false);
        currentStreamingIdRef.current = null;
      }
    };
  }, [currentSession, streamController]); // Depend on streamController as well

  /**
   * Load user's chat sessions
   */
  const loadSessions = useCallback(async () => {
    setIsLoadingSessions(true);
    setError(null); // Clear previous errors
    try {
      const data = await apiGetChatSessions();
      setChatSessions(data || []); // Ensure it's an array
      // Select the first session if none is currently selected and data exists
      if (data && data.length > 0 && !currentSession) {
        setCurrentSession(data[0]);
      } else if (!data || data.length === 0) {
         setCurrentSession(null); // Ensure currentSession is null if no sessions exist
      }
    } catch (err) {
      logger.error('Error loading chat sessions:', err);
      setError(err.message || 'Failed to load chat sessions.');
      setChatSessions([]);
      setCurrentSession(null);
    } finally {
      setIsLoadingSessions(false);
    }
  }, [currentSession]); // Keep dependency if initial selection logic relies on it

  /**
   * Load messages for the specified session
   */
  const loadMessages = useCallback(async (sessionId) => {
    if (!sessionId) return;
    setIsLoadingMessages(true);
    setMessages([]); // Clear old messages
    // setAgentMessageStatuses({}); // Clear old agent statuses
    setError(null); // Clear previous errors
    try {
      const data = await apiGetChatMessages(sessionId);
      // Map fetched messageFragments to fragments
      const messagesWithFragments = (data || []).map(msg => ({ // Ensure data is an array
          ...msg,
          fragments: msg.messageFragments || [], // Use fetched fragments, default to empty array
          // Ensure aiResponseText is populated from fragments for older messages or as fallback
          aiResponseText: msg.aiResponseText || (msg.messageFragments || [])
                            .filter(f => f.type === 'text')
                            .map(f => f.content)
                            .join(''),
      }));
      setMessages(messagesWithFragments);
    } catch (err) {
      logger.error('Error loading chat messages:', err);
      setError(err.message || 'Failed to load messages.');
      setMessages([]); // Clear messages on error
    } finally {
      setIsLoadingMessages(false);
    }
  }, []);

  /**
   * Send a message in the current chat session using the standard API (non-streaming)
   * DEPRECATED IN FAVOR OF STREAMING - Kept for potential fallback/reference
   */
  const sendMessage = useCallback(async (promptText, selectedDatasetIds = []) => {
    // ... (keep existing non-streaming logic if needed, or remove) ...
     logger.warn('[ChatContext] sendMessage (non-streaming) is deprecated. Use sendStreamingMessage.');
     // Simplified version just calling streaming for now
     return sendStreamingMessage(promptText, selectedDatasetIds);
  }, [currentSession]);


  /**
   * Centralized state update logic for streaming messages
   */
  const updateStreamingMessage = useCallback((id, updateFn) => {
    setMessages(prevMessages =>
        prevMessages.map(msg => (msg._id === id ? updateFn(msg) : msg))
    );
  }, []);


  /**
   * Send a message in the current chat session using streaming API
   */
  const sendStreamingMessage = useCallback(async (promptText, selectedDatasetIds = []) => {
    if (!currentSession?._id) {
      logger.error('Cannot send streaming message: No current session.');
      return null;
    }
    if (isStreaming) {
        logger.warn('[ChatContext] Ignoring sendStreamingMessage call, already streaming.');
        return; // Don't start a new stream if one is active
    }

    // Abort previous controller if it exists (safety check)
    if (streamController) {
      streamController.close();
    }

    setError(null);
    setStreamError(null);
    setIsSendingMessage(true); // Indicate submission process started
    setIsStreaming(true); // Mark streaming as active
    setStreamingMessageId(null); // Clear previous streaming ID
    currentStreamingIdRef.current = null; // Clear ref

    try {
      // Define event handlers using the centralized updater
      const eventHandlers = {
        onUserMessageCreated: (data) => {
          logger.info(`User message created: ${data.messageId}`);
          const userMessage = {
            _id: data.messageId,
            messageType: 'user',
            promptText,
            selectedDatasetIds: selectedDatasetIds, // Store datasets used for this prompt
            status: 'completed',
            createdAt: new Date().toISOString(), // Use ISO string for consistency
            fragments: [],
            steps: [],
          };
          setMessages(prev => [...prev, userMessage]);
        },

        onAiMessageCreated: (data) => {
          logger.info(`AI message created: ${data.messageId}, status: ${data.status}`);
          const aiMessage = {
            _id: data.messageId,
            messageType: 'ai_report',
            status: data.status || 'processing', // Use status from event or default
            aiResponseText: '', // Initialize empty text
            fragments: [],
            steps: [],
            createdAt: new Date().toISOString(),
            isStreaming: true,
            // Tool state initialization
            toolName: null,
            toolInput: null,
            toolStatus: null,
            toolOutput: null,
            toolError: null,
          };
          setMessages(prev => [...prev, aiMessage]);
          // --- Set the ref and state ID ---
          setStreamingMessageId(data.messageId);
          currentStreamingIdRef.current = data.messageId;
          // --- End set ref ---
          setIsSendingMessage(false); // Sending complete, now streaming begins
        },

        onThinking: () => {
          const currentId = currentStreamingIdRef.current;
          if (currentId) {
            updateStreamingMessage(currentId, msg => ({
                ...msg,
                status: 'thinking',
                toolName: null,
                toolStatus: null,
                isStreaming: true // Ensure streaming flag is true
            }));
          }
        },

        onUsingTool: (data) => {
          const currentId = currentStreamingIdRef.current;
          logger.info(`[ChatContext onUsingTool] Agent using tool: ${data.toolName} (for ref ID: ${currentId})`);
          if (currentId) {
            const newStep = { // Create the step structure
                tool: data.toolName,
                args: data.args,
                attempt: (messages.find(m => m._id === currentId)?.steps?.filter(s => s.tool === data.toolName).length || 0) + 1,
                resultSummary: 'Running...', // Initial status
                error: null
            };
            updateStreamingMessage(currentId, msg => ({
                ...msg,
                status: 'using_tool',
                toolName: data.toolName,
                toolInput: data.args,
                toolStatus: 'running',
                toolOutput: null,
                toolError: null,
                steps: [...(msg.steps || []), newStep], // Add the step to the message
                isStreaming: true // Ensure streaming flag is true
            }));
          }
        },

        onToken: (data) => {
            const currentId = currentStreamingIdRef.current;
            if (currentId && data.content) {
                updateStreamingMessage(currentId, msg => {
                    // Ensure fragments array exists
                    const currentFragments = msg.fragments || [];
                    const lastFragment = currentFragments[currentFragments.length - 1];
                    let updatedFragments;

                    if (lastFragment && lastFragment.type === 'text') {
                        // Append to last text fragment
                        updatedFragments = [...currentFragments];
                        updatedFragments[currentFragments.length - 1] = {
                            ...lastFragment,
                            content: lastFragment.content + data.content
                        };
                    } else {
                        // Add new text fragment
                        updatedFragments = [...currentFragments, { type: 'text', content: data.content }];
                    }
                    // Also update the flat aiResponseText for simplicity if needed elsewhere
                    const updatedText = updatedFragments.filter(f => f.type === 'text').map(f => f.content).join('');

                    return { ...msg, fragments: updatedFragments, aiResponseText: updatedText, isStreaming: true };
                });
                setLastTokenTimestamp(Date.now());
            } else if (currentId && !data.content) {
                 logger.debug(`[ChatContext onToken] Received token event for ${currentId} but content was empty.`);
            }
        },

        onAgentToolResult: (data) => {
            const currentId = currentStreamingIdRef.current;
            logger.info(`[ChatContext onAgentToolResult] Agent tool result: ${data.toolName}, summary: ${data.resultSummary} (for ID: ${currentId})`);
            if (currentId) {
                const newStepFragment = { // Fragment for UI display
                    type: 'step',
                    tool: data.toolName,
                    resultSummary: data.resultSummary,
                    error: data.error || null,
                    status: data.error ? 'error' : 'completed'
                };
                updateStreamingMessage(currentId, msg => {
                    // Update the internal 'steps' array for persistence
                    const updatedInternalSteps = (msg.steps || []).map((step, index, arr) => {
                        // Find the last step matching the tool name (handles retries better)
                        if (step.tool === data.toolName && index === arr.length -1) {
                            return { ...step, resultSummary: data.resultSummary, error: data.error || null };
                        }
                        return step;
                    });
                    // Ensure fragments exists before spreading
                    const currentFragments = msg.fragments || [];
                    return {
                        ...msg,
                        status: 'thinking', // Go back to thinking after tool use
                        fragments: [...currentFragments, newStepFragment], // Add the step fragment for UI
                        steps: updatedInternalSteps, // Update the internal steps array
                        // Reset tool-specific status fields
                        toolName: null,
                        toolStatus: null,
                        toolInput: null,
                        toolOutput: null,
                        toolError: null,
                        isStreaming: true // Ensure streaming flag is true
                    };
                });
            }
        },

        onAgentFinalAnswer: (data) => {
            const currentId = currentStreamingIdRef.current;
            logger.info(`[ChatContext onAgentFinalAnswer] Received final answer (for ID: ${currentId}). Code: ${!!data.aiGeneratedCode}, Data: ${!!data.analysisResult}`);
            if (currentId) {
                 const finalAnswerText = data.text || '';
                 const generatedCode = data.aiGeneratedCode || null;
                 const analysisData = data.analysisResult || null;

                 updateStreamingMessage(currentId, msg => {
                      // Ensure fragments exists before spreading
                     const currentFragments = msg.fragments || [];
                     let updatedFragments = [...currentFragments];
                     // Append or add the final text fragment
                      const lastFragment = updatedFragments[updatedFragments.length - 1];
                     if (lastFragment && lastFragment.type === 'text') {
                         updatedFragments[updatedFragments.length - 1].content += finalAnswerText; // Append if last was text
                     } else if (finalAnswerText) {
                         updatedFragments.push({ type: 'text', content: finalAnswerText }); // Add new text fragment
                     }
                     // Update the flat aiResponseText
                     const updatedText = updatedFragments.filter(f => f.type === 'text').map(f => f.content).join('');

                     return {
                         ...msg,
                         fragments: updatedFragments,
                         aiResponseText: updatedText, // Update flat text
                         status: 'completed',
                         isStreaming: false, // Streaming is finished
                         aiGeneratedCode: generatedCode,
                         reportAnalysisData: analysisData,
                          // Clear transient tool status fields
                         toolName: null,
                         toolStatus: null,
                         toolInput: null,
                         toolOutput: null,
                         toolError: null,
                     };
                 });

                // --- THIS IS THE POINT TO RESET STREAMING STATE ---
                logger.info(`[ChatContext] Resetting streaming state after final answer for ${currentId}`);
                setIsStreaming(false);
                setIsSendingMessage(false);
                setStreamingMessageId(null);
                currentStreamingIdRef.current = null; // Reset the ref
                if (streamController) {
                     logger.debug('[ChatContext] Closing stream controller after final answer.');
                     streamController.close();
                     setStreamController(null);
                }
            }
        },

        // --- Modified Handlers (Do NOT reset currentStreamingIdRef.current) ---
        onCompleted: (data) => { // From LLM stream finishing
             const finalMsgId = data.messageId || currentStreamingIdRef.current;
             logger.info(`LLM Stream completed event received for message: ${finalMsgId || 'UNKNOWN'}`);
             // Note: Don't change message status or reset streaming state here,
             // wait for agent:final_answer or agent:error
        },
        onError: (data) => { // From SSE stream or agent error event
             const errorMsgId = currentStreamingIdRef.current;
             const errorMessage = data.error || data.message;
             logger.error(`Streaming error received: ${errorMessage} (for ref ID: ${errorMsgId || 'UNKNOWN'})`);
             setStreamError(errorMessage);

             if (errorMsgId) {
                 updateStreamingMessage(errorMsgId, msg => ({
                     ...msg,
                     status: 'error',
                     errorMessage: errorMessage,
                     isStreaming: false, // Stop streaming on error
                     toolName: null, toolInput: null, toolStatus: 'error', toolOutput: null, toolError: errorMessage,
                 }));
             }
             // --- Reset state ONLY IF final answer hasn't already done so ---
             if (currentStreamingIdRef.current) {
                  logger.info(`[ChatContext onError] Resetting streaming state due to error for ${errorMsgId}`);
                  setIsStreaming(false);
                  setIsSendingMessage(false);
                  setStreamingMessageId(null);
                  currentStreamingIdRef.current = null; // Reset ref on error
                  if (streamController) {
                      logger.debug('[ChatContext onError] Closing stream controller due to error.');
                      streamController.close();
                      setStreamController(null);
                  }
             } else {
                 logger.warn(`[ChatContext onError] Error event received, but currentStreamingIdRef was already null.`);
             }
        },
        onEnd: () => { // SSE connection closed
            logger.info('Streaming connection ended event received');
             // --- Reset state ONLY IF final answer/error hasn't already done so ---
             if (currentStreamingIdRef.current) {
                  const lastMsgId = currentStreamingIdRef.current;
                  logger.info(`[ChatContext onEnd] Resetting streaming state due to connection end for ${lastMsgId}`);
                  // Optionally mark the message as interrupted if it wasn't completed?
                  updateStreamingMessage(lastMsgId, msg => msg.status !== 'completed' && msg.status !== 'error' ? ({ ...msg, isStreaming: false, status: msg.status === 'processing' ? 'interrupted' : msg.status }) : msg);

                  setIsStreaming(false);
                  setIsSendingMessage(false);
                  setStreamingMessageId(null);
                  currentStreamingIdRef.current = null; // Reset ref on end
                  setStreamController(null); // Clear controller ref
             } else {
                  logger.warn(`[ChatContext onEnd] End event received, but currentStreamingIdRef was already null.`);
             }
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
      const errorMsg = err.message || 'Failed to start streaming chat.';
      setError(errorMsg); // Set context-level error
      setStreamError(errorMsg); // Set specific stream error
      setIsStreaming(false);
      setIsSendingMessage(false);
      setStreamingMessageId(null);
      currentStreamingIdRef.current = null;
      setStreamController(null);
      throw err; // Re-throw for the component to potentially handle
    }
  }, [currentSession, streamController, isStreaming, updateStreamingMessage]); // Added isStreaming and updateStreamingMessage


  /**
   * Create a new chat session
   */
  const createNewSession = useCallback(async (title = "New Chat", teamId = null) => {
    // Abort any active stream before creating/switching session
    if (streamController) {
         logger.info('[ChatContext createNewSession] Aborting active stream before creating new session.');
         streamController.close();
         setStreamController(null);
         setIsStreaming(false);
         currentStreamingIdRef.current = null;
    }

    setError(null);
    setIsLoadingSessions(true);
    try {
      const newSession = await apiCreateChatSession(title, teamId);
      setChatSessions(prev => [newSession, ...prev].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))); // Add and re-sort
      setCurrentSession(newSession);
      setMessages([]);
      // setAgentMessageStatuses({}); // Clear agent statuses
      return newSession;
    } catch (err) {
      logger.error('Error creating chat session:', err);
      setError(err.message || 'Failed to create chat session.');
      return null;
    } finally {
      setIsLoadingSessions(false);
    }
  }, [streamController]); // Added streamController dependency

  /**
   * Update Chat Session Title
   */
  const updateChatSessionTitle = useCallback(async (sessionId, newTitle) => {
    setError(null);
    try {
      const updatedSession = await apiUpdateChatSession(sessionId, newTitle);
      setChatSessions(prevSessions =>
        prevSessions.map(session =>
          session._id === sessionId ? { ...session, title: updatedSession.title, updatedAt: updatedSession.updatedAt } : session
        ).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)) // Re-sort after update
      );
      if (currentSession && currentSession._id === sessionId) {
        setCurrentSession(prev => ({ ...prev, title: updatedSession.title, updatedAt: updatedSession.updatedAt }));
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
     // Abort any active stream if deleting the current session
     if (currentSession?._id === sessionId && streamController) {
         logger.info('[ChatContext deleteChatSession] Aborting active stream before deleting current session.');
         streamController.close();
         setStreamController(null);
         setIsStreaming(false);
         currentStreamingIdRef.current = null;
     }
    setError(null);
    try {
      await apiDeleteChatSession(sessionId);
      const remainingSessions = chatSessions.filter(session => session._id !== sessionId);
      setChatSessions(remainingSessions);
      if (currentSession && currentSession._id === sessionId) {
        // Select the next session or null if none remain (most recently updated first)
        setCurrentSession(remainingSessions.length > 0 ? remainingSessions[0] : null);
        setMessages([]);
        // setAgentMessageStatuses({});
      }
    } catch (err) {
      logger.error("Error deleting chat session:", err);
      setError(err.message || 'Failed to delete chat session.');
      throw err;
    }
  }, [currentSession, chatSessions, streamController]); // Added streamController dependency

  // Function to open the report modal
  const openReportModal = useCallback((data) => {
    if (data && data.code) {
      logger.info('Opening report modal.');
      logger.debug('Report data received by openReportModal:', {
        hasCode: !!data.code,
        codeLength: data.code?.length,
        hasAnalysisData: !!data.analysisData, // Check new field
      });
      // Ensure datasets is always an array, even if null/undefined initially
      // Pass analysisData instead of datasets
      setReportModalData({ code: data.code, analysisData: data.analysisData || {} });
      setIsReportModalOpen(true);
    } else {
      logger.error('Attempted to open report modal without code or data object.', data);
    }
  }, []);

  // Function to close the report modal
  const closeReportModal = useCallback(() => {
    logger.info('Closing report modal.');
    setIsReportModalOpen(false);
    setTimeout(() => {
       setReportModalData({ code: null, analysisData: null }); // Clear analysisData too
    }, 300);
  }, []);

  // Effect to load messages when currentSession changes
  useEffect(() => {
    // Abort active stream when changing session
    if (streamController) {
         logger.info('[ChatContext Session Change] Aborting active stream.');
         streamController.close();
         setStreamController(null);
         setIsStreaming(false);
         currentStreamingIdRef.current = null;
    }
    if (currentSession?._id) {
      loadMessages(currentSession._id);
    } else {
        setMessages([]); // Clear messages if no session selected
    }
  }, [currentSession, loadMessages, streamController]);

  // Set up socket listeners for real-time updates (NON-STREAMING)
  // This might be redundant if SSE handles all updates, but kept for now
  useEffect(() => {
    const setupListeners = () => {
      try {
        logger.info(`Setting up WebSocket listeners for session: ${currentSession?._id}`);
        const listeners = {
          // --- Final Message Updates (WebSocket Fallback/Confirmation) ---
          'chat:message:completed': (data) => {
            // Only update if it's for the current session AND not currently streaming this message
             if (data.sessionId !== currentSession?._id || currentStreamingIdRef.current === data.message?._id) return;
             logger.debug(`[WS Received] chat:message:completed - Message ID: ${data.message?._id}`);
             // Update the specific message, ensuring fragments/steps are included
             setMessages(prev =>
                 prev.map(msg =>
                     msg._id === data.message._id ? { ...data.message, isStreaming: false } : msg // Mark as not streaming
                 )
             );
          },
          'chat:message:error': (data) => {
             // Only update if it's for the current session AND not currently streaming this message
             if (data.sessionId !== currentSession?._id || currentStreamingIdRef.current === data.messageId) return;
             logger.error(`[WS Received] chat:message:error - Message ID: ${data.messageId}, Error: ${data.error}`);
             setMessages(prev =>
                 prev.map(msg =>
                     msg._id === data.messageId ? {...msg, status: 'error', errorMessage: data.error, isStreaming: false} : msg
                 )
             );
          },
        };
        const unsubscribe = subscribeToEvents(listeners);
        return () => {
          if (unsubscribe) {
            logger.info(`Cleaning up WebSocket listeners for session: ${currentSession?._id}`);
            unsubscribe();
          }
        };
      } catch (error) {
        logger.error('Error setting up WebSocket listeners:', error);
        return undefined;
      }
    };
    let cleanup;
    if (currentSession?._id) {
      cleanup = setupListeners();
    }
    return () => { if (cleanup) cleanup(); };
  }, [currentSession, subscribeToEvents]); // Depend on currentSession


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
    sendMessage, // Kept for potential future use/fallback
    sendStreamingMessage,
    createNewSession,
    updateChatSessionTitle,
    deleteChatSession,
    // agentMessageStatuses, // Removed, status is on the message object now
    AGENT_STATUS, // Export enum for use in components
    isStreaming,
    streamingMessageId,
    streamError,
    // currentToolCall, // Tool info is now directly on the message object
    // lastToolResult,
    // generatedCode,
    STREAMING_STATUS, // Export enum
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
        size="xl" // Use a large size for reports
      >
        {/* Render ReportViewer inside the modal only when open and data is ready */}
        {isReportModalOpen && reportModalData.code && (
          <div className="h-[70vh] overflow-y-auto"> {/* Add fixed height and scroll */}
             <ReportViewer
               key={reportModalData.code} // Force re-mount when code changes
               // Pass analysisData instead of datasets
               reportInfo={{ code: reportModalData.code, analysisData: reportModalData.analysisData }}
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