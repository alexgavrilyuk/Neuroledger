// ================================================================================
// FILE: NeuroLedger copy/frontend/src/features/dashboard/context/ChatContext.jsx
// PURPOSE: Manages chat state (sessions, messages), API calls, and real-time updates.
// VERSION: Fixed - Added checks to prevent duplicate message additions from SSE
//          and prevented loadMessages during active streaming.
// ================================================================================

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

const ChatContext = createContext();

const AGENT_STATUS = {
  IDLE: 'idle',
  THINKING: 'thinking',
  USING_TOOL: 'using_tool',
  ERROR: 'error',
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

  const { connectSocket, subscribeToEvents } = useSocket();

  useEffect(() => {
    connectSocket().catch(error => {
      logger.error('Error connecting to socket:', error);
    });
  }, [connectSocket]);

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

  const loadSessions = useCallback(async () => {
    setIsLoadingSessions(true);
    setError(null);
    try {
      const data = await apiGetChatSessions();
      const sortedData = (data || []).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      setChatSessions(sortedData);
      // Avoid changing session if one is already selected and active
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
  }, [currentSession]); // Keep currentSession dependency

  const loadMessages = useCallback(async (sessionId) => {
    if (!sessionId) return;
    // ---- FIX: Prevent loading historical messages if streaming is active ----
    if (isStreaming && currentSession?._id === sessionId) {
        logger.warn(`[ChatContext loadMessages] Skipped loading messages for ${sessionId} because streaming is active.`);
        return;
    }
    // ---- END FIX ----
    setIsLoadingMessages(true);
    setMessages([]);
    setError(null);
    try {
      const data = await apiGetChatMessages(sessionId);
      const messagesWithFragments = (data || []).map(msg => ({
          ...msg,
          fragments: msg.messageFragments || [],
          aiResponseText: msg.aiResponseText || (msg.messageFragments || [])
                            .filter(f => f.type === 'text')
                            .map(f => f.content)
                            .join(''),
          isStreaming: false,
      }));
      setMessages(messagesWithFragments);
    } catch (err) {
      logger.error('Error loading chat messages:', err);
      setError(err.message || 'Failed to load messages.');
      setMessages([]);
    } finally {
      setIsLoadingMessages(false);
    }
  }, [isStreaming, currentSession]); // Added isStreaming and currentSession dependencies

  const updateMessage = useCallback((id, updateData) => {
      setMessages(prevMessages =>
          prevMessages.map(msg =>
              msg?._id === id ? { ...msg, ...updateData } : msg
          )
      );
  }, []);

  const sendStreamingMessage = useCallback(async (promptText, selectedDatasetIds = []) => {
    if (!currentSession?._id) {
      logger.error('Cannot send streaming message: No current session.'); return null;
    }
    if (isStreaming) {
      logger.warn('[ChatContext] Ignoring sendStreamingMessage call, already streaming.'); return;
    }
    if (streamController) streamController.close();

    setError(null); setStreamError(null); setIsSendingMessage(true);
    setIsStreaming(true); setStreamingMessageId(null); currentStreamingIdRef.current = null;

    try {
      const eventHandlers = {
        onUserMessageCreated: (data) => {
          const userMessage = {
            _id: data.messageId, messageType: 'user', promptText, selectedDatasetIds,
            status: 'completed', createdAt: new Date().toISOString(),
            fragments: [], steps: [], isStreaming: false,
          };
          // --- FIX: Check if message already exists before adding ---
          setMessages(prev => {
              if (prev.some(msg => msg._id === userMessage._id)) {
                  logger.warn(`[SSE Handler] User message ${userMessage._id} already exists. Skipping add.`);
                  return prev;
              }
              return [...prev, userMessage];
          });
          // --- END FIX ---
        },
        onAiMessageCreated: (data) => {
          const aiMessage = {
            _id: data.messageId, messageType: 'ai_report',
            status: data.status || 'processing', aiResponseText: '',
            fragments: [], steps: [], createdAt: new Date().toISOString(),
            isStreaming: true,
            toolName: null, toolInput: null, toolStatus: null, toolOutput: null, toolError: null,
          };
          // --- FIX: Check if message already exists before adding ---
          setMessages(prev => {
              if (prev.some(msg => msg._id === aiMessage._id)) {
                  logger.warn(`[SSE Handler] AI message ${aiMessage._id} already exists. Skipping add.`);
                  return prev;
              }
              return [...prev, aiMessage];
          });
          // --- END FIX ---
          setStreamingMessageId(data.messageId);
          currentStreamingIdRef.current = data.messageId;
          setIsSendingMessage(false);
        },
        onThinking: () => {
          const currentId = currentStreamingIdRef.current;
          if (currentId) {
            logger.debug(`[SSE Handler] Thinking... (Msg ID: ${currentId})`);
            setMessages(prevMessages => prevMessages.map(msg =>
                msg._id === currentId ? { ...msg, status: 'thinking', toolName: null, toolStatus: null, isStreaming: true } : msg
            ));
          }
        },
        onUsingTool: (data) => {
          const currentId = currentStreamingIdRef.current;
          logger.info(`[SSE Handler] Using Tool: ${data.toolName} (Msg ID: ${currentId})`, { args: data.args });
          if (currentId) {
             const newStep = {
                 tool: data.toolName, args: data.args, attempt: 1, resultSummary: 'Running...', error: null
             };
             setMessages(prevMessages => prevMessages.map(msg => {
                 if (msg._id !== currentId) return msg;
                 const existingSteps = msg.steps || [];
                 return {
                     ...msg, status: 'using_tool', toolName: data.toolName, toolInput: data.args, toolStatus: 'running',
                     toolOutput: null, toolError: null, steps: [...existingSteps, newStep], isStreaming: true
                 };
             }));
          }
        },
        onToken: (data) => {
          const currentId = currentStreamingIdRef.current;
          if (currentId && data.content) {
              setMessages(prevMessages => prevMessages.map(msg => {
                  if (msg._id !== currentId) return msg;
                  const currentFragments = msg.fragments || [];
                  let updatedFragments;
                  const lastFragment = currentFragments[currentFragments.length - 1];
                  if (lastFragment && lastFragment.type === 'text') {
                      updatedFragments = [...currentFragments];
                      updatedFragments[currentFragments.length - 1] = { ...lastFragment, content: lastFragment.content + data.content };
                  } else {
                      updatedFragments = [...currentFragments, { type: 'text', content: data.content }];
                  }
                  const updatedText = updatedFragments.filter(f => f.type === 'text').map(f => f.content).join('');
                  return { ...msg, fragments: updatedFragments, aiResponseText: updatedText, isStreaming: true };
              }));
              setLastTokenTimestamp(Date.now());
          }
        },
        onAgentToolResult: (data) => {
            const currentId = currentStreamingIdRef.current;
            logger.info(`[SSE Handler] Tool Result: ${data.toolName}, Summary: ${data.resultSummary}, Error: ${data.error} (Msg ID: ${currentId})`);
            if (currentId) {
                const newStepFragment = {
                    type: 'step', tool: data.toolName, resultSummary: data.resultSummary,
                    error: data.error || null, status: data.error ? 'error' : 'completed'
                };
                setMessages(prevMessages => prevMessages.map(msg => {
                    if (msg._id !== currentId) return msg;
                    const currentSteps = msg.steps || [];
                    const updatedInternalSteps = currentSteps.map((step, index, arr) => {
                        if (step.tool === data.toolName && index === arr.length - 1) {
                            return { ...step, resultSummary: data.resultSummary, error: data.error || null };
                        }
                        return step;
                    });
                     const currentFragments = msg.fragments || [];
                    return {
                        ...msg, status: 'thinking', fragments: [...currentFragments, newStepFragment], steps: updatedInternalSteps,
                        toolName: null, toolStatus: null, toolInput: null, toolOutput: null, toolError: null, isStreaming: true
                    };
                }));
            }
        },
        onAgentFinalAnswer: (data) => {
            const currentId = currentStreamingIdRef.current;
            logger.info(`[SSE Handler] Final Answer Received (Msg ID: ${currentId}) Code: ${!!data.aiGeneratedCode}, Data: ${!!data.analysisResult}`);
            if (currentId) {
                 const finalAnswerText = data.text || '';
                 setMessages(prevMessages => prevMessages.map(msg => {
                     if (msg._id !== currentId) return msg;
                     const currentFragments = msg.fragments || [];
                     let updatedFragments = [...currentFragments];
                     const lastFragment = updatedFragments[updatedFragments.length - 1];
                     if (lastFragment && lastFragment.type === 'text') {
                         updatedFragments[updatedFragments.length - 1].content += finalAnswerText;
                     } else if (finalAnswerText) {
                         updatedFragments.push({ type: 'text', content: finalAnswerText });
                     }
                     const updatedText = updatedFragments.filter(f => f.type === 'text').map(f => f.content).join('');
                     return {
                         ...msg, fragments: updatedFragments, aiResponseText: updatedText,
                         status: 'completed', isStreaming: false,
                         aiGeneratedCode: data.aiGeneratedCode || null, reportAnalysisData: data.analysisResult || null,
                         toolName: null, toolStatus: null, toolInput: null, toolOutput: null, toolError: null,
                     };
                 }));
                 setIsStreaming(false); setIsSendingMessage(false); setStreamingMessageId(null);
                 currentStreamingIdRef.current = null;
                 if (streamController) { streamController.close(); setStreamController(null); }
            }
        },
        onError: (data) => {
          const currentId = currentStreamingIdRef.current;
          const errorMessage = data.error || data.message || 'An unknown streaming error occurred.';
          logger.error(`[SSE Handler] Error event: ${errorMessage} (Msg ID: ${currentId})`);
          setStreamError(errorMessage);
          if (currentId) {
            updateMessage(currentId, {
                status: 'error', errorMessage: errorMessage, isStreaming: false,
                toolName: null, toolStatus: 'error', toolError: errorMessage
            });
          }
          if (currentStreamingIdRef.current) {
            setIsStreaming(false); setIsSendingMessage(false); setStreamingMessageId(null);
            currentStreamingIdRef.current = null;
            if (streamController) { streamController.close(); setStreamController(null); }
          }
        },
        // --- ADDED onFinish handler ---
        onFinish: (data) => {
            const currentId = currentStreamingIdRef.current;
            logger.debug(`[SSE Handler] Finish event received (Reason: ${data?.finishReason}) (Msg ID: ${currentId})`);
            // No state change needed usually, handled by final_answer/end/error
        },
        // --- END Added handler ---
        onEnd: (data) => {
          const currentId = currentStreamingIdRef.current;
          logger.info(`[SSE Handler] End event / Connection closed. Status: ${data?.status || 'closed'} (Msg ID: ${currentId})`);
          if (currentId) {
              setMessages(prev => prev.map(msg =>
                 (msg._id === currentId && (msg.status === 'processing' || msg.status === 'thinking' || msg.status === 'using_tool'))
                 ? { ...msg, isStreaming: false, status: 'interrupted' }
                 : { ...msg, isStreaming: msg._id === currentId ? false : msg.isStreaming }
              ));
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

  // --- Non-Streaming sendMessage (DEPRECATED but kept) ---
  const sendMessage = useCallback(async (promptText, selectedDatasetIds = []) => {
    logger.warn('[ChatContext] sendMessage (non-streaming) is deprecated. Use sendStreamingMessage.');
    return sendStreamingMessage(promptText, selectedDatasetIds);
  }, [sendStreamingMessage]);

  // --- Session Management Callbacks ---
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
        setMessages([]);
      }
    } catch (err) {
      logger.error("Error deleting chat session:", err);
      setError(err.message || 'Failed to delete chat session.'); throw err;
    }
  }, [currentSession, chatSessions, streamController]);

  // --- Report Modal Logic ---
  const openReportModal = useCallback((data) => {
    if (data && data.code) {
      logger.info('Opening report modal.');
      logger.debug('Report data received by openReportModal:', { hasCode: !!data.code, codeLength: data.code?.length, hasAnalysisData: !!data.analysisData });
      setReportModalData({ code: data.code, analysisData: data.analysisData || {} });
      setIsReportModalOpen(true);
    } else { logger.error('Attempted to open report modal without code or data object.', data); }
  }, []);
  const closeReportModal = useCallback(() => {
    logger.info('Closing report modal.'); setIsReportModalOpen(false);
    setTimeout(() => { setReportModalData({ code: null, analysisData: null }); }, 300);
  }, []);

  // --- Load Sessions on Mount ---
  useEffect(() => { loadSessions(); }, [loadSessions]);

  // --- Load Messages on Session Change ---
  useEffect(() => {
    if (streamController) {
      logger.info('[ChatContext Session Change] Aborting active stream.');
      streamController.close(); setStreamController(null); setIsStreaming(false); currentStreamingIdRef.current = null;
    }
    if (currentSession?._id) { loadMessages(currentSession._id); }
    else { setMessages([]); }
  }, [currentSession, loadMessages, streamController]); // loadMessages dependency is correct

  // --- WebSocket Listeners (Simplified) ---
  useEffect(() => {
    const setupListeners = () => {
      try {
        logger.info(`Setting up WebSocket listeners for session: ${currentSession?._id}`);
        const listeners = {
          'chat:message:completed': (data) => {
            if (data.sessionId !== currentSession?._id || currentStreamingIdRef.current === data.message?._id) return;
            logger.debug(`[WS Received] chat:message:completed (non-streaming) - ID: ${data.message?._id}`);
            // Ensure the update preserves potentially built fragments/steps if SSE partially ran then failed
            setMessages(prev => prev.map(msg =>
                msg._id === data.message._id ? {
                    ...msg, // Keep existing fields (like fragments/steps)
                    ...data.message, // Overlay with final data from WebSocket
                    isStreaming: false // Ensure streaming is marked as false
                } : msg
            ));
          },
          'chat:message:error': (data) => {
             if (data.sessionId !== currentSession?._id || currentStreamingIdRef.current === data.messageId) return;
             logger.error(`[WS Received] chat:message:error (non-streaming) - ID: ${data.messageId}, Error: ${data.error}`);
             setMessages(prev => prev.map(msg =>
                 msg._id === data.messageId ? {
                     ...msg, // Keep existing fields
                     status: 'error',
                     errorMessage: data.error,
                     isStreaming: false
                 } : msg
             ));
          },
        };
        const unsubscribe = subscribeToEvents(listeners);
        return () => { if (unsubscribe) { logger.info(`Cleaning up WebSocket listeners for session: ${currentSession?._id}`); unsubscribe(); } };
      } catch (error) { logger.error('Error setting up WebSocket listeners:', error); return undefined; }
    };
    let cleanup;
    // Only setup listeners if there's a current session
    if (currentSession?._id) {
       cleanup = setupListeners();
    }
    return () => { if (cleanup) cleanup(); };
    // Dependencies: currentSession changes, subscribeToEvents should be stable
  }, [currentSession, subscribeToEvents]);

  // --- Context Value ---
  const contextValue = {
    chatSessions, currentSession, messages,
    isLoadingSessions, isLoadingMessages, isSendingMessage, error,
    loadSessions, loadMessages, setCurrentSession,
    sendMessage, // Keep deprecated non-streaming send
    sendStreamingMessage, createNewSession, updateChatSessionTitle, deleteChatSession,
    isStreaming, streamingMessageId, streamError, lastTokenTimestamp, // Streaming state
    isReportModalOpen, reportModalData, openReportModal, closeReportModal, // Report modal state
    AGENT_STATUS, // Export enum for convenience
  };

  return (
    <ChatContext.Provider value={contextValue}>
      {children}
      {/* Report Modal Rendering */}
      <Modal isOpen={isReportModalOpen} onClose={closeReportModal} title="Generated Report" size="xl">
        {isReportModalOpen && reportModalData.code && (
          <div className="h-[70vh] overflow-y-auto">
             <ReportViewer
               key={reportModalData.code}
               reportInfo={{ code: reportModalData.code, analysisData: reportModalData.analysisData }}
            />
          </div>
        )}
      </Modal>
    </ChatContext.Provider>
  );
};

// useChat hook remains the same
export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};