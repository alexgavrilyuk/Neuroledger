// frontend/src/features/dashboard/context/ChatContext.jsx
// ENTIRE FILE - FULLY UPDATED

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  createChatSession as apiCreateChatSession,
  getChatSessions as apiGetChatSessions,
  updateChatSession as apiUpdateChatSession,
  deleteChatSession as apiDeleteChatSession,
  getChatMessages as apiGetChatMessages,
  streamChatMessage as apiStreamChatMessage,
} from '../services/chat.api';
import { useAuth } from '../../../shared/hooks/useAuth'; // Correct path if needed
import logger from '../../../shared/utils/logger';
import Modal from '../../../shared/ui/Modal';
import ReportViewer from '../../report_display/components/ReportViewer';
import { useTheme } from '../../../shared/hooks/useTheme'; // Import useTheme

const ChatContext = createContext();

export const AGENT_UI_STATUS = {
  IDLE: 'idle',
  PROCESSING: 'processing',
  THINKING: 'thinking',
  USING_TOOL: 'using_tool',
  STREAMING_TEXT: 'streaming_text', // Keep for potential future use, but won't be primary display mechanism now
  REPORT_READY: 'report_ready',
  COMPLETED: 'completed',
  ERROR: 'error',
  INTERRUPTED: 'interrupted',
  CLARIFICATION_NEEDED: 'clarification_needed',
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
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportModalData, setReportModalData] = useState({ code: null, analysisData: null });

  const currentStreamingIdRef = useRef(null);
  const { themeName } = useTheme();

  // Abort stream controller on unmount or session change
  useEffect(() => {
    return () => {
      if (currentStreamingIdRef.current && streamController) {
        logger.info('[ChatContext Cleanup] Aborting active stream controller on unmount/session change.');
        streamController.close();
        setStreamController(null);
        setIsStreaming(false);
        currentStreamingIdRef.current = null;
      }
    };
  }, [currentSession?._id, streamController]);

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
      } else if (currentSession && !sortedData.some(s => s._id === currentSession._id)) {
         const nextSession = sortedData.length > 0 ? sortedData[0] : null;
         setCurrentSession(nextSession);
         setMessages([]);
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
  }, [currentSession]);

  // Load messages for a specific session
  const loadMessages = useCallback(async (sessionId) => {
    if (!sessionId) { setMessages([]); return; }
    setIsLoadingMessages(true);
    setMessages([]);
    setError(null);
    try {
      const data = await apiGetChatMessages(sessionId);
      const messagesWithState = (data || []).map(msg => ({
        ...msg,
        uiStatus: msg.status === 'completed'
          ? (msg.aiGeneratedCode && msg.reportAnalysisData ? AGENT_UI_STATUS.REPORT_READY : AGENT_UI_STATUS.COMPLETED)
          : msg.status === 'error' ? AGENT_UI_STATUS.ERROR
          : msg.status === 'awaiting_user_input' ? AGENT_UI_STATUS.CLARIFICATION_NEEDED
          : AGENT_UI_STATUS.IDLE,
        fragments: msg.messageFragments || [],
        aiResponseText: msg.aiResponseText || '',
        isStreaming: false, // History items are never streaming initially
      }));
      setMessages(messagesWithState);
    } catch (err) {
      logger.error('Error loading chat messages:', err);
      setError(err.message || 'Failed to load messages.');
      setMessages([]);
    } finally {
      setIsLoadingMessages(false);
    }
  }, []);

  // Update a specific message in the state using its _id
  const updateMessage = useCallback((id, updateData) => {
    setMessages(prevMessages =>
      prevMessages.map(msg =>
        msg?._id === id ? { ...msg, ...updateData } : msg
      )
    );
  }, []);

   // Append fragment to a message
   const appendFragment = useCallback((id, fragment) => {
       setMessages(prevMessages =>
           prevMessages.map(msg => {
               if (msg?._id === id) {
                   const currentFragments = Array.isArray(msg.fragments) ? msg.fragments : [];
                   return { ...msg, fragments: [...currentFragments, fragment] };
               }
               return msg;
           })
       );
   }, []);

   // Update the last fragment of a specific type
   const updateLastFragmentOfType = useCallback((id, fragmentType, updates) => {
       setMessages(prevMessages =>
           prevMessages.map(msg => {
               if (msg?._id === id && Array.isArray(msg.fragments)) {
                   const fragments = [...msg.fragments];
                   const lastIndex = fragments.reduce((lastIdx, currentFrag, currentIdx) => {
                       return currentFrag.type === fragmentType ? currentIdx : lastIdx;
                   }, -1);
                   if (lastIndex !== -1) {
                       fragments[lastIndex] = { ...fragments[lastIndex], ...updates };
                       return { ...msg, fragments };
                   }
                   logger.warn(`[ChatContext] updateLastFragmentOfType: No fragment of type '${fragmentType}' found for message ${id}`);
               }
               return msg;
           })
       );
   }, []);

   // ** MODIFIED: This function should NO LONGER update fragments or aiResponseText **
   // It only logs the received token for debugging if needed.
   const appendTextToken = useCallback((id, token) => {
        // logger.debug(`[ChatContext appendTextToken] Received token for ${id}: "${token}" - IGNORING for fragment update.`);
        // NO LONGER UPDATES STATE HERE
   }, []);


  // Send a message via SSE - with CORRECTED event handlers
  const sendStreamingMessage = useCallback(async (promptText, selectedDatasetIds = []) => {
    if (!currentSession?._id) { logger.error('Cannot send streaming message: No current session.'); return null; }
    if (isStreaming) { logger.warn('[ChatContext] Ignoring sendStreamingMessage call, already streaming.'); return; }
    if (streamController) { logger.warn('[ChatContext] Closing previous stream controller.'); streamController.close(); setStreamController(null); }

    setError(null); setStreamError(null); setIsSendingMessage(true);
    setIsStreaming(true); setStreamingMessageId(null); currentStreamingIdRef.current = null;

    try {
      // --- Event Handlers ---
      const eventHandlers = {
        onUserMessageCreated: (data) => {
          const userMessage = {
            _id: data.messageId, messageType: 'user', promptText, selectedDatasetIds,
            status: 'completed', createdAt: new Date().toISOString(),
            fragments: [], isStreaming: false, uiStatus: AGENT_UI_STATUS.COMPLETED
          };
          setMessages(prev => prev.some(msg => msg._id === userMessage._id) ? prev : [...prev, userMessage]);
        },
        onAiMessageCreated: (data) => {
          const aiMessage = {
            _id: data.messageId, messageType: 'ai_report', status: 'processing',
            aiResponseText: '', fragments: [], // Start with empty fragments
            createdAt: new Date().toISOString(), isStreaming: true,
            uiStatus: AGENT_UI_STATUS.PROCESSING,
          };
          setMessages(prev => prev.some(msg => msg._id === aiMessage._id) ? prev : [...prev, aiMessage]);
          setStreamingMessageId(data.messageId);
          currentStreamingIdRef.current = data.messageId;
          setIsSendingMessage(false);
        },
        onExplanation: (data) => {
            const currentId = currentStreamingIdRef.current;
            if (currentId && data.explanation) {
                logger.debug(`[SSE Handler] Explanation (Msg ID: ${currentId}): ${data.explanation}`);
                // Add the user-facing explanation as a text fragment
                appendFragment(currentId, { type: 'text', content: data.explanation });
                updateMessage(currentId, { uiStatus: AGENT_UI_STATUS.THINKING, isStreaming: true });
            }
        },
        onUsingTool: (data) => {
          const currentId = currentStreamingIdRef.current;
          if (currentId) {
            logger.info(`[SSE Handler] Using Tool: ${data.toolName} (Msg ID: ${currentId})`);
             // Add a step fragment indicating the tool is running
             appendFragment(currentId, {
                 type: 'step', tool: data.toolName, status: 'running',
                 resultSummary: `Running ${data.toolName}...`, error: null, errorCode: null
             });
             updateMessage(currentId, { uiStatus: AGENT_UI_STATUS.USING_TOOL, isStreaming: true });
          }
        },
        onAgentToolResult: (data) => {
          const currentId = currentStreamingIdRef.current;
          if (currentId) {
            logger.info(`[SSE Handler] Tool Result: ${data.toolName}, Summary: ${data.resultSummary}, Error: ${data.error}, Code: ${data.errorCode} (Msg ID: ${currentId})`);
            // Update the last step fragment for this tool with the result
            updateLastFragmentOfType(currentId, 'step', {
                status: data.error ? 'error' : 'completed',
                resultSummary: data.resultSummary,
                error: data.error || null,
                errorCode: data.errorCode || null,
            });
            // Go back to thinking/processing state after tool result
            updateMessage(currentId, { uiStatus: AGENT_UI_STATUS.THINKING, isStreaming: true });
          }
        },
        // ** MODIFIED: Token handler no longer updates state directly **
        onToken: (data) => {
          // logger.debug(`[SSE Handler] Token Received (Msg ID: ${currentStreamingIdRef.current}): "${data.content}" - IGNORING for direct update.`);
          // We rely on onAgentFinalAnswer to set the final text content now.
          // appendTextToken(currentStreamingIdRef.current, data.content); // DO NOT CALL THIS
        },
        onAgentFinalAnswer: (data) => {
          const currentId = currentStreamingIdRef.current;
          logger.info(`[SSE Handler] Final Answer Received (Msg ID: ${currentId})`);
          if (currentId) {
             // ** If there's final answer text, ensure it's added as the last fragment **
             // This handles cases where the final answer wasn't streamed token by token
             if (data.text && typeof data.text === 'string') {
                  appendFragment(currentId, { type: 'text', content: data.text });
             }
            // Update the overall message state to completed/report_ready
            updateMessage(currentId, {
                status: 'completed',
                uiStatus: data.aiGeneratedCode && data.analysisData ? AGENT_UI_STATUS.REPORT_READY : AGENT_UI_STATUS.COMPLETED,
                isStreaming: false,
                aiGeneratedCode: data.aiGeneratedCode || null,
                reportAnalysisData: data.analysisResult || null,
                errorMessage: null,
                aiResponseText: data.text || '', // Store the final complete text
            });
            // Clean up stream state
            setIsStreaming(false); setIsSendingMessage(false); setStreamingMessageId(null);
            currentStreamingIdRef.current = null;
            if (streamController) { streamController.close(); setStreamController(null); }
          }
        },
        onError: (data) => {
          const currentId = currentStreamingIdRef.current;
          const errorMessage = data.error || data.message || 'An unknown streaming error occurred.';
          logger.error(`[SSE Handler] Error event: ${errorMessage} (Msg ID: ${currentId}) Type: ${data.type}`);
          setStreamError(errorMessage);
          if (currentId) {
             appendFragment(currentId, { type: 'error', content: errorMessage, errorCode: data.errorCode });
            updateMessage(currentId, { status: 'error', errorMessage: errorMessage, uiStatus: AGENT_UI_STATUS.ERROR, isStreaming: false });
          }
          // Clean up stream state
          if (currentStreamingIdRef.current) {
            setIsStreaming(false); setIsSendingMessage(false); setStreamingMessageId(null);
            currentStreamingIdRef.current = null;
            if (streamController) { streamController.close(); setStreamController(null); }
          }
        },
        onEnd: (data) => {
          const currentId = currentStreamingIdRef.current;
          logger.info(`[SSE Handler] End event / Connection closed. Status: ${data?.status || 'closed'} (Msg ID: ${currentId})`);
          if (currentId) {
            // Check final status, mark as interrupted if not properly completed/errored
            setMessages(prev => prev.map(msg => {
              if (msg._id !== currentId) return msg;
              if (![AGENT_UI_STATUS.COMPLETED, AGENT_UI_STATUS.REPORT_READY, AGENT_UI_STATUS.ERROR].includes(msg.uiStatus)) {
                logger.warn(`[ChatContext] Marking message ${currentId} as interrupted.`);
                const fragments = [...(msg.fragments || []), { type: 'error', content: 'Connection closed unexpectedly.', errorCode: 'STREAM_CLOSED' }];
                return { ...msg, isStreaming: false, fragments, uiStatus: AGENT_UI_STATUS.INTERRUPTED, status: 'error', errorMessage: 'Connection closed unexpectedly.' };
              }
              return { ...msg, isStreaming: false };
            }));
            // Clean up stream state
            setIsStreaming(false); setIsSendingMessage(false); setStreamingMessageId(null);
            currentStreamingIdRef.current = null; setStreamController(null);
          }
        }
      };
      // --- End Event Handlers ---

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
  }, [currentSession, streamController, isStreaming, updateMessage, appendFragment, updateLastFragmentOfType]); // Removed appendTextToken dep

  // Deprecated sendMessage
  const sendMessage = useCallback(async (promptText, selectedDatasetIds = []) => {
    logger.warn('[ChatContext] sendMessage (non-streaming) is deprecated. Use sendStreamingMessage.');
    return sendStreamingMessage(promptText, selectedDatasetIds);
  }, [sendStreamingMessage]);

  // --- Other context functions (createNewSession, updateChatSessionTitle, deleteChatSession, Report Modal) remain unchanged ---
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
        // Use loadSessions to refresh and select the next appropriate session after deletion
        loadSessions();
        } catch (err) {
        logger.error("Error deleting chat session:", err);
        setError(err.message || 'Failed to delete chat session.'); throw err;
        }
    }, [currentSession?._id, loadSessions, streamController]);

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
        setTimeout(() => { setReportModalData({ code: null, analysisData: null }); }, 300);
    }, []);
    // --- End Report Modal Handling ---

  // Initial load of sessions
  useEffect(() => { loadSessions(); }, [loadSessions]);

  // Load messages when session changes
  useEffect(() => {
    if (currentSession?._id) { loadMessages(currentSession._id); }
    else { setMessages([]); }
  }, [currentSession?._id, loadMessages]);

  const contextValue = {
    chatSessions, currentSession, messages,
    isLoadingSessions, isLoadingMessages, isSendingMessage, error,
    loadSessions, loadMessages, setCurrentSession,
    sendMessage, sendStreamingMessage,
    createNewSession, updateChatSessionTitle, deleteChatSession,
    isStreaming, streamingMessageId, streamError,
    isReportModalOpen, reportModalData, openReportModal, closeReportModal,
    AGENT_UI_STATUS,
  };

  return (
    <ChatContext.Provider value={contextValue}>
      {children}
      <Modal isOpen={isReportModalOpen} onClose={closeReportModal} title="Generated Report" size="xl">
        {isReportModalOpen && reportModalData.code && (
          <div className="h-[70vh] overflow-y-auto">
            <ReportViewer
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

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};