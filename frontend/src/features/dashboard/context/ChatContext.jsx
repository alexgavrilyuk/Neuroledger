// frontend/src/features/dashboard/context/ChatContext.jsx
// --- UPDATED FILE ---

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  createChatSession as apiCreateChatSession,
  getChatSessions as apiGetChatSessions,
  updateChatSession as apiUpdateChatSession,
  deleteChatSession as apiDeleteChatSession,
  getChatMessages as apiGetChatMessages,
  streamChatMessage as apiStreamChatMessage,
} from '../services/chat.api';
import { useSocket } from '../hooks/useSocket';
import logger from '../../../shared/utils/logger';
import Modal from '../../../shared/ui/Modal';
import ReportViewer from '../../report_display/components/ReportViewer';
import { useAuth } from '../../../shared/hooks/useAuth';

const ChatContext = createContext();

// Define more descriptive agent statuses for UI
export const AGENT_UI_STATUS = {
  IDLE: 'idle', // Not actively processing
  PROCESSING: 'processing', // Initial state before first event
  THINKING: 'thinking', // Generic thinking state
  USING_TOOL: 'using_tool', // Currently executing a specific tool
  TOOL_COMPLETED: 'tool_completed', // Tool finished, agent thinking about next step (Internal state, maybe map to THINKING for UI)
  STREAMING_TEXT: 'streaming_text', // Streaming final text response
  REPORT_READY: 'report_ready', // Final state, report available
  COMPLETED: 'completed', // Final state, text only
  ERROR: 'error', // Agent encountered an error
  INTERRUPTED: 'interrupted', // Stream closed unexpectedly
};

export const ChatProvider = ({ children }) => {
  const [chatSessions, setChatSessions] = useState([]);
  const [currentSession, setCurrentSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [error, setError] = useState(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState(null);
  const [streamController, setStreamController] = useState(null);
  const [streamError, setStreamError] = useState(null);
  const [lastTokenTimestamp, setLastTokenTimestamp] = useState(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportModalData, setReportModalData] = useState({ code: null, analysisData: null });

  const currentStreamingIdRef = useRef(null);

  const { connectSocket, subscribeToEvents } = useSocket(); // WebSocket connection (optional use)
  const { themeName } = useAuth(); // Get themeName from Auth context

  // Connect WebSocket on mount (optional)
  useEffect(() => {
    connectSocket().catch(error => {
      logger.error('Error connecting to socket:', error);
    });
  }, [connectSocket]);

  // Abort stream controller on unmount or session change
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
  }, [currentSession, streamController]);

  // Load chat sessions
  const loadSessions = useCallback(async () => {
    setIsLoadingSessions(true);
    setError(null);
    try {
      const data = await apiGetChatSessions();
      const sortedData = (data || []).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      setChatSessions(sortedData);
      if (!currentSession && sortedData.length > 0) {
        setCurrentSession(sortedData[0]);
      } else if (sortedData.length === 0) {
        setCurrentSession(null);
        setMessages([]);
      }
    } catch (err) {
      logger.error('Error loading chat sessions:', err);
      setError(err.message || 'Failed to load chat sessions.');
      setChatSessions([]);
      setCurrentSession(null);
    } finally {
      setIsLoadingSessions(false);
    }
  }, [currentSession]); // Dependency on currentSession to handle initial load

  // Load messages for a specific session
  const loadMessages = useCallback(async (sessionId) => {
    if (!sessionId) return;
    if (isStreaming && currentSession?._id === sessionId) {
      logger.warn(`[ChatContext loadMessages] Skipped loading messages for ${sessionId} because streaming is active.`);
      return;
    }
    setIsLoadingMessages(true);
    setMessages([]); // Clear previous messages
    setError(null);
    try {
      const data = await apiGetChatMessages(sessionId);
      // Initialize messages with defaults for UI state
      const messagesWithState = (data || []).map(msg => ({
        ...msg,
        // Initialize UI-specific state fields
        uiStatus: msg.status === 'completed'
                    ? (msg.aiGeneratedCode && msg.reportAnalysisData ? AGENT_UI_STATUS.REPORT_READY : AGENT_UI_STATUS.COMPLETED)
                    : msg.status === 'error' ? AGENT_UI_STATUS.ERROR
                    : AGENT_UI_STATUS.IDLE, // Default for history items
        currentToolName: null,
        currentToolStatus: null,
        currentToolError: null,
        thinkingText: null, // Don't store raw thinking for display
        isStreaming: false, // History items are not streaming
        // Ensure fragments exist (though we primarily use aiResponseText now for display)
        fragments: msg.messageFragments || [],
        aiResponseText: msg.aiResponseText || (msg.messageFragments || [])
                           .filter(f => f.type === 'text')
                           .map(f => f.content)
                           .join(''),
      }));
      setMessages(messagesWithState);
    } catch (err) {
      logger.error('Error loading chat messages:', err);
      setError(err.message || 'Failed to load messages.');
      setMessages([]);
    } finally {
      setIsLoadingMessages(false);
    }
  }, [isStreaming, currentSession]); // Dependencies

  // Update a specific message in the state
  const updateMessage = useCallback((id, updateData) => {
    setMessages(prevMessages =>
      prevMessages.map(msg =>
        msg?._id === id ? { ...msg, ...updateData } : msg
      )
    );
  }, []);

  // Send a message via SSE
  const sendStreamingMessage = useCallback(async (promptText, selectedDatasetIds = []) => {
    if (!currentSession?._id) { logger.error('Cannot send streaming message: No current session.'); return null; }
    if (isStreaming) { logger.warn('[ChatContext] Ignoring sendStreamingMessage call, already streaming.'); return; }
    if (streamController) streamController.close(); // Close any previous controller

    setError(null); setStreamError(null); setIsSendingMessage(true);
    setIsStreaming(true); setStreamingMessageId(null); currentStreamingIdRef.current = null;

    try {
      const eventHandlers = {
        // User message created confirmation
        onUserMessageCreated: (data) => {
          const userMessage = {
            _id: data.messageId, messageType: 'user', promptText, selectedDatasetIds,
            status: 'completed', createdAt: new Date().toISOString(),
            fragments: [], steps: [], isStreaming: false, uiStatus: AGENT_UI_STATUS.COMPLETED
          };
          setMessages(prev => {
            // Prevent duplicate additions if event arrives multiple times
            if (prev.some(msg => msg._id === userMessage._id)) return prev;
            return [...prev, userMessage];
          });
        },
        // AI message placeholder created
        onAiMessageCreated: (data) => {
          const aiMessage = {
            _id: data.messageId, messageType: 'ai_report', status: 'processing',
            aiResponseText: '', fragments: [], steps: [],
            createdAt: new Date().toISOString(), isStreaming: true,
            // Initialize UI state
            uiStatus: AGENT_UI_STATUS.PROCESSING, // Start with processing
            currentToolName: null, currentToolStatus: null, currentToolError: null, thinkingText: null,
          };
          setMessages(prev => {
            if (prev.some(msg => msg._id === aiMessage._id)) return prev;
            return [...prev, aiMessage];
          });
          setStreamingMessageId(data.messageId);
          currentStreamingIdRef.current = data.messageId;
          setIsSendingMessage(false);
        },
        // Agent is thinking
        onThinking: (data) => {
          const currentId = currentStreamingIdRef.current;
          if (currentId) {
            logger.debug(`[SSE Handler] Thinking... (Msg ID: ${currentId})`);
            updateMessage(currentId, {
                 uiStatus: AGENT_UI_STATUS.THINKING,
                 isStreaming: true,
                 currentToolName: null,
                 currentToolStatus: null,
                 currentToolError: null,
             });
          }
        },
        // Agent is using a tool
        onUsingTool: (data) => {
          const currentId = currentStreamingIdRef.current;
          logger.info(`[SSE Handler] Using Tool: ${data.toolName} (Msg ID: ${currentId})`, { args: data.args });
          if (currentId) {
            // Update the message state to show the tool being used
            updateMessage(currentId, {
                uiStatus: AGENT_UI_STATUS.USING_TOOL,
                currentToolName: data.toolName,
                currentToolStatus: 'running',
                currentToolError: null,
                isStreaming: true,
                // Optionally clear aiResponseText if you don't want text during tool use
                // aiResponseText: '',
            });
          }
        },
        // Agent tool result received
        onAgentToolResult: (data) => {
          const currentId = currentStreamingIdRef.current;
          logger.info(`[SSE Handler] Tool Result: ${data.toolName}, Summary: ${data.resultSummary}, Error: ${data.error}, Code: ${data.errorCode} (Msg ID: ${currentId})`);
          if (currentId) {
             // Go back to thinking state *after* showing tool result briefly
             updateMessage(currentId, {
                  uiStatus: AGENT_UI_STATUS.THINKING, // Change UI status back to thinking
                  currentToolName: data.toolName, // Keep tool name to potentially show result status
                  currentToolStatus: data.error ? 'error' : 'completed',
                  currentToolError: data.error || null, // Store error if present
                  isStreaming: true,
              });
          }
        },
        // Streaming text token received
        onToken: (data) => {
          const currentId = currentStreamingIdRef.current;
          if (currentId && data.content) {
            setMessages(prevMessages => prevMessages.map(msg => {
              if (msg._id !== currentId) return msg;
              const newText = (msg.aiResponseText || '') + data.content;
              return {
                ...msg,
                aiResponseText: newText,
                uiStatus: AGENT_UI_STATUS.STREAMING_TEXT, // Explicitly set status
                isStreaming: true,
                // Keep tool status briefly visible while text streams? Or clear?
                // Let's clear it for now to prioritize text display
                // currentToolName: null, currentToolStatus: null, currentToolError: null,
              };
            }));
            setLastTokenTimestamp(Date.now());
          }
        },
        // Final answer received from agent
        onAgentFinalAnswer: (data) => {
          const currentId = currentStreamingIdRef.current;
          logger.info(`[SSE Handler] Final Answer Received (Msg ID: ${currentId}) Code: ${!!data.aiGeneratedCode}, Data: ${!!data.analysisResult}`);
          if (currentId) {
            const finalAnswerText = data.text || '';
            updateMessage(currentId, {
                aiResponseText: finalAnswerText, // Set final text
                status: 'completed', // Backend status
                uiStatus: data.aiGeneratedCode && data.analysisResult ? AGENT_UI_STATUS.REPORT_READY : AGENT_UI_STATUS.COMPLETED,
                isStreaming: false,
                aiGeneratedCode: data.aiGeneratedCode || null,
                reportAnalysisData: data.analysisResult || null, // Store analysis data
                // Clear temporary UI states
                currentToolName: null, currentToolStatus: null, currentToolError: null,
            });
            // Clean up stream
            setIsStreaming(false); setIsSendingMessage(false); setStreamingMessageId(null);
            currentStreamingIdRef.current = null;
            if (streamController) { streamController.close(); setStreamController(null); }
          }
        },
        // Error event from stream
        onError: (data) => {
          const currentId = currentStreamingIdRef.current;
          const errorMessage = data.error || data.message || 'An unknown streaming error occurred.';
          logger.error(`[SSE Handler] Error event: ${errorMessage} (Msg ID: ${currentId})`);
          setStreamError(errorMessage);
          if (currentId) {
            updateMessage(currentId, {
              status: 'error', errorMessage: errorMessage,
              uiStatus: AGENT_UI_STATUS.ERROR,
              isStreaming: false,
              // Clear temporary UI states
              currentToolName: null, currentToolStatus: null, currentToolError: null,
            });
          }
          // Clean up stream
          if (currentStreamingIdRef.current) {
            setIsStreaming(false); setIsSendingMessage(false); setStreamingMessageId(null);
            currentStreamingIdRef.current = null;
            if (streamController) { streamController.close(); setStreamController(null); }
          }
        },
        // Stream ended event (connection closed)
        onEnd: (data) => {
          const currentId = currentStreamingIdRef.current;
          logger.info(`[SSE Handler] End event / Connection closed. Status: ${data?.status || 'closed'} (Msg ID: ${currentId})`);
          if (currentId) {
            // Check the *final* status of the message before marking as interrupted
            setMessages(prev => prev.map(msg => {
              if (msg._id !== currentId) return msg;
              // If it wasn't completed or errored by the agent, mark as interrupted
              if (![AGENT_UI_STATUS.COMPLETED, AGENT_UI_STATUS.REPORT_READY, AGENT_UI_STATUS.ERROR].includes(msg.uiStatus)) {
                return { ...msg, isStreaming: false, uiStatus: AGENT_UI_STATUS.INTERRUPTED, status: 'error', errorMessage: 'Connection closed unexpectedly.' };
              }
              // Otherwise, just ensure streaming is off
              return { ...msg, isStreaming: false };
            }));
            // Clean up stream state regardless
            setIsStreaming(false); setIsSendingMessage(false); setStreamingMessageId(null);
            currentStreamingIdRef.current = null; setStreamController(null);
          }
        }
      };

      const controller = apiStreamChatMessage(
        currentSession._id, promptText, selectedDatasetIds, eventHandlers
      );
      setStreamController(controller);
      return { success: true };
    } catch (err) {
      logger.error('Error starting streaming chat:', err);
      const errorMsg = err.message || 'Failed to start streaming chat.';
      setError(errorMsg); setStreamError(errorMsg); setIsStreaming(false);
      setIsSendingMessage(false); setStreamingMessageId(null); currentStreamingIdRef.current = null;
      setStreamController(null); throw err;
    }
  }, [currentSession, streamController, isStreaming, updateMessage]);

  // Deprecated non-streaming send function - NOW CORRECTLY DEFINED WITH useCallback
  const sendMessage = useCallback(async (promptText, selectedDatasetIds = []) => {
    logger.warn('[ChatContext] sendMessage (non-streaming) is deprecated. Use sendStreamingMessage.');
    // It's already wrapped in useCallback, just call the streaming version
    return sendStreamingMessage(promptText, selectedDatasetIds);
  }, [sendStreamingMessage]); // Dependency on sendStreamingMessage is correct


  // Create a new chat session
  const createNewSession = useCallback(async (title = "New Chat", teamId = null) => {
    if (streamController) {
      logger.info('[ChatContext createNewSession] Aborting active stream before creating new session.');
      streamController.close(); setStreamController(null); setIsStreaming(false); currentStreamingIdRef.current = null;
    }
    setError(null); setIsLoadingSessions(true);
    try {
      const newSession = await apiCreateChatSession(title, teamId);
      setChatSessions(prev => [newSession, ...prev].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)));
      setCurrentSession(newSession); setMessages([]);
      return newSession;
    } catch (err) {
      logger.error('Error creating chat session:', err);
      setError(err.message || 'Failed to create chat session.'); return null;
    } finally { setIsLoadingSessions(false); }
  }, [streamController]);

  // Update chat session title
  const updateChatSessionTitle = useCallback(async (sessionId, newTitle) => {
    setError(null);
    try {
      const updatedSession = await apiUpdateChatSession(sessionId, newTitle);
      setChatSessions(prev =>
        prev.map(s => s._id === sessionId ? { ...s, title: updatedSession.title, updatedAt: updatedSession.updatedAt } : s)
            .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      );
      if (currentSession?._id === sessionId) {
        setCurrentSession(prev => ({ ...prev, title: updatedSession.title, updatedAt: updatedSession.updatedAt }));
      }
      return updatedSession;
    } catch (err) {
      logger.error("Error updating chat session title:", err);
      setError(err.message || 'Failed to update chat title.'); throw err;
    }
  }, [currentSession]);

  // Delete chat session
  const deleteChatSession = useCallback(async (sessionId) => {
     if (currentSession?._id === sessionId && streamController) {
       logger.info('[ChatContext deleteChatSession] Aborting active stream before deleting current session.');
       streamController.close(); setStreamController(null); setIsStreaming(false); currentStreamingIdRef.current = null;
     }
    setError(null);
    try {
      await apiDeleteChatSession(sessionId);
      const remainingSessions = chatSessions.filter(s => s._id !== sessionId);
      setChatSessions(remainingSessions);
      if (currentSession?._id === sessionId) {
        const nextSession = remainingSessions.length > 0 ? remainingSessions[0] : null;
        setCurrentSession(nextSession);
        setMessages([]); // Clear messages when session deleted
      }
    } catch (err) {
      logger.error("Error deleting chat session:", err);
      setError(err.message || 'Failed to delete chat session.'); throw err;
    }
  }, [currentSession, chatSessions, streamController]);

  // --- Report Modal Handling ---
  const openReportModal = useCallback((messageData) => {
    if (messageData && messageData.code && messageData.analysisData) {
      logger.info('Opening report modal.');
      setReportModalData({ code: messageData.code, analysisData: messageData.analysisData || {} });
      setIsReportModalOpen(true);
    } else { logger.error('Attempted to open report modal without code or analysisData.', messageData); }
  }, []);

  const closeReportModal = useCallback(() => {
    logger.info('Closing report modal.'); setIsReportModalOpen(false);
    setTimeout(() => { setReportModalData({ code: null, analysisData: null }); }, 300); // Delay reset for animation
  }, []);
  // --- End Report Modal Handling ---

  // Initial load of sessions
  useEffect(() => { loadSessions(); }, [loadSessions]);

  // Load messages when session changes, abort stream if active
  useEffect(() => {
    if (streamController) {
      logger.info('[ChatContext Session Change] Aborting active stream.');
      streamController.close(); setStreamController(null); setIsStreaming(false); currentStreamingIdRef.current = null;
    }
    if (currentSession?._id) { loadMessages(currentSession._id); }
    else { setMessages([]); } // Clear messages if no session selected
  }, [currentSession?._id, loadMessages, streamController]); // Added currentSession._id dependency

  // Setup WebSocket listeners (optional, for background updates)
  useEffect(() => {
    // WebSocket logic removed for clarity, focus on SSE
  }, [currentSession, subscribeToEvents, updateMessage]);


  // --- MOVED contextValue DEFINITION TO THE END ---
  const contextValue = {
    chatSessions, currentSession, messages,
    isLoadingSessions, isLoadingMessages, isSendingMessage, error,
    loadSessions, loadMessages, setCurrentSession,
    sendMessage, // Include the deprecated function for now
    sendStreamingMessage,
    createNewSession, updateChatSessionTitle, deleteChatSession,
    isStreaming, streamingMessageId, streamError, lastTokenTimestamp,
    isReportModalOpen, reportModalData, openReportModal, closeReportModal,
    AGENT_UI_STATUS, // Export the UI status enum
  };
  // --- END MOVE ---

  return (
    <ChatContext.Provider value={contextValue}>
      {children}
      {/* Report Modal */}
      <Modal isOpen={isReportModalOpen} onClose={closeReportModal} title="Generated Report" size="xl">
        {isReportModalOpen && reportModalData.code && (
          <div className="h-[70vh] overflow-y-auto">
            <ReportViewer
              // Force remount on new report by changing the key
              key={reportModalData.code + JSON.stringify(reportModalData.analysisData)}
              reportInfo={{ code: reportModalData.code, analysisData: reportModalData.analysisData }}
              themeName={themeName || 'light'}
            />
          </div>
        )}
      </Modal>
    </ChatContext.Provider>
  );
};

// Custom hook to consume the context
export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};