// ================================================================================
// FILE: NeuroLedger copy/frontend/src/features/dashboard/components/MessageBubble.jsx
// PURPOSE: Renders a single chat message bubble (user or AI).
// PHASE 5 UPDATE: Remove dependency on agentMessageStatuses. Render based on
//                 message object properties (status, toolName, fragments, etc.).
// ================================================================================
import React, { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { UserIcon, CpuChipIcon, ExclamationCircleIcon, DocumentChartBarIcon } from '@heroicons/react/24/solid';
import { FaCircleNotch, FaExclamationTriangle, FaList, FaSearch, FaCode, FaPlayCircle, FaMicrochip, FaTools, FaCheckCircle, FaTimesCircle } from 'react-icons/fa';
import Spinner from '../../../shared/ui/Spinner';
import Button from '../../../shared/ui/Button';
// ** PHASE 5: REMOVE useChat import if only used for agentMessageStatuses **
// import { useChat } from '../context/ChatContext';
import logger from '../../../shared/utils/logger';
import CodeBlock from './CodeBlock'; // Keep CodeBlock import

// Tool display map remains the same
const toolDisplayMap = {
  list_datasets: { text: 'Accessing dataset list...', Icon: FaList },
  get_dataset_schema: { text: 'Analyzing dataset schema...', Icon: FaSearch },
  parse_csv_data: { text: 'Parsing CSV data...', Icon: FaSearch },
  generate_data_extraction_code: { text: 'Preparing data analysis code...', Icon: FaCode },
  execute_backend_code: { text: 'Analyzing data...', Icon: FaPlayCircle },
  generate_analysis_code: { text: 'Generating analysis code...', Icon: FaCode },
  execute_analysis_code: { text: 'Running analysis...', Icon: FaPlayCircle },
  generate_report_code: { text: 'Generating report visualization...', Icon: DocumentChartBarIcon },
  answer_user: { text: 'Formulating answer...', Icon: CpuChipIcon },
  default: { text: 'Processing step...', Icon: FaCircleNotch },
};

const MessageBubble = ({ message, onViewReport }) => {
    const bubbleRef = useRef(null);
    // ** PHASE 5: REMOVE useChat hook call if only used for agentMessageStatuses **
    // const { agentMessageStatuses, AGENT_STATUS } = useChat(); // REMOVED

    // Logging message on render (useful for debugging state)
    useEffect(() => {
        // Use console.log for reliability during complex state changes
        console.log(`[MessageBubble Render - Direct Log] ID: ${message?._id}, Status: ${message?.status}, Streaming: ${message?.isStreaming}, Fragments: ${message?.fragments?.length}, Code: ${!!message?.aiGeneratedCode}`);
        /* logger.debug(`[MessageBubble Render] ID: ${message?._id}`, {
            status: message?.status,
            isStreaming: message?.isStreaming,
            fragmentCount: message?.fragments?.length,
            hasCode: !!message?.aiGeneratedCode,
        }); */
    }, [message]); // Log whenever the message object changes

    if (!message) {
        logger.warn('[MessageBubble] Received null or undefined message prop.');
        return null; // Don't render if message is invalid
    }

    const isUser = message.messageType === 'user';
    const isError = message.status === 'error'; // Check directly on message
    const isCompleted = message.status === 'completed';
    // Use isStreaming flag directly from message object
    const isStreaming = !!message.isStreaming;

    // Check if report should be available (completed AI message with code)
    const isReportAvailable = message.messageType === 'ai_report' &&
                              isCompleted &&
                              message.aiGeneratedCode;

    // --- Styling (no change needed) ---
    const bubbleBaseStyle = `max-w-[80%] lg:max-w-[70%] rounded-xl px-4 py-3 text-sm shadow-soft-md dark:shadow-soft-dark-md break-words transition-all duration-200 animate-fadeIn`;
    const bubbleAlignment = isUser ? 'ml-auto' : 'mr-auto';
    const bubbleColor = isUser
        ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white'
        : isError
            ? 'bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-700/50'
            : isReportAvailable
                ? 'bg-gradient-subtle-light dark:bg-gradient-subtle-dark text-gray-800 dark:text-gray-100 border border-gray-200 dark:border-gray-600/50'
                : 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 border border-gray-200/80 dark:border-gray-700/50';

    const iconBaseStyle = `h-8 w-8 rounded-full p-1.5 flex-shrink-0 self-start mt-1 shadow-soft-sm`;
    const userIconColor = `bg-gradient-to-br from-blue-400 to-blue-500 text-white`;
    const aiIconColor = isError
        ? `bg-gradient-to-br from-red-400 to-red-500 text-white`
        : `bg-gradient-to-br from-gray-200 to-gray-300 text-gray-700 dark:from-gray-600 dark:to-gray-700 dark:text-gray-200`;

    // Code block extraction (no change needed)
    const extractCodeBlocks = (text) => {
        // ... (keep existing logic) ...
        if (!text) return { textWithoutCode: '', codeBlocks: [] };
        const codeBlockRegex = /```(?:(\w+)\n)?([\s\S]*?)```/g;
        const codeBlocks = [];
        let match;
        let lastIndex = 0;
        let textWithoutCode = '';
        while ((match = codeBlockRegex.exec(text)) !== null) {
            textWithoutCode += text.substring(lastIndex, match.index);
            const language = match[1] || 'javascript';
            const code = match[2];
            textWithoutCode += `<CODE_BLOCK_${codeBlocks.length}>`;
            codeBlocks.push({ language, code });
            lastIndex = match.index + match[0].length;
        }
        textWithoutCode += text.substring(lastIndex);
        return { textWithoutCode, codeBlocks };
    };

    // --- Render Content (Phase 5 Updates) ---
    const renderContent = () => {
        if (isUser) {
            return (
                <div className="leading-relaxed">
                    {message.promptText.split('\n').map((line, index, arr) => (
                        <React.Fragment key={index}>
                            {line}{index < arr.length - 1 && <br />}
                        </React.Fragment>
                    ))}
                </div>
            );
        }

        // AI Message Logic - Render based on message.status and message.fragments
        if (isError) {
            const errorMsg = message.errorMessage || "An unexpected error occurred.";
            return (
                <div className="text-red-600 dark:text-red-300 font-medium flex items-center gap-x-2">
                    <FaExclamationTriangle className="h-4 w-4 flex-shrink-0" />
                    <span>Error: {errorMsg}</span>
                </div>
            );
        }

        // --- Render Fragments (Directly from message.fragments) ---
        const renderedFragments = (message.fragments || []).map((fragment, index) => {
             // Keep existing fragment rendering logic (text, step, error)
             if (fragment.type === 'text') {
                 const { textWithoutCode, codeBlocks } = extractCodeBlocks(fragment.content);
                 if (!textWithoutCode.trim() && codeBlocks.length === 0) return null;
                 const parts = textWithoutCode.split(/<CODE_BLOCK_(\d+)>/);
                 return (
                     <div key={`frag-${index}-text`} className="prose prose-sm dark:prose-invert max-w-none leading-relaxed">
                         {parts.map((part, partIndex) => {
                             if (partIndex % 2 === 0) {
                                 return part.trim() ? <ReactMarkdown key={partIndex}>{part}</ReactMarkdown> : null;
                             } else {
                                 const codeBlockIndex = parseInt(part, 10);
                                 const codeBlock = codeBlocks[codeBlockIndex];
                                 return codeBlock ? <CodeBlock key={partIndex} language={codeBlock.language} code={codeBlock.code} /> : null;
                             }
                         }).filter(Boolean)}
                     </div>
                 );
             } else if (fragment.type === 'step') {
                 const toolInfo = toolDisplayMap[fragment.tool] || toolDisplayMap.default;
                 const isSuccess = !fragment.error;
                 const statusText = fragment.error ? `Error: ${fragment.error}` : fragment.resultSummary || 'Completed';
                 return (
                     <div key={`frag-${index}-step-${fragment.tool}`} title={statusText}
                          className={`flex items-center gap-x-2 text-xs p-1.5 rounded mt-2 mb-1 ${isSuccess ? 'text-gray-600 dark:text-gray-300' : 'text-red-600 dark:text-red-300'}`}>
                         {isSuccess ? <FaCheckCircle className="h-3.5 w-3.5 flex-shrink-0 text-green-500" /> : <FaTimesCircle className="h-3.5 w-3.5 flex-shrink-0 text-red-500" />}
                         <toolInfo.Icon className="h-3.5 w-3.5 flex-shrink-0" />
                         <span className="font-medium truncate">{toolInfo.text.replace(/ing\.\.\./, 'ed').replace(/\.\.\./, '')}</span>
                     </div>
                 );
             } else if (fragment.type === 'error') {
                 return (
                      <div key={`frag-${index}-error`} className="text-red-600 dark:text-red-300 font-medium flex items-center gap-x-2 mt-2 text-xs">
                          <FaExclamationTriangle className="h-4 w-4 flex-shrink-0" />
                          <span>{fragment.content}</span>
                      </div>
                  );
             }
             return null;
         }).filter(Boolean);

        // --- Loading / Thinking / Tool Indicators (based on message.status) ---
        let statusIndicator = null;
        if (!isCompleted && !isError && isStreaming) { // Show indicators only while streaming/processing
             if (message.status === 'thinking') {
                statusIndicator = (
                     <div className="flex items-center gap-x-2 py-1 text-gray-500 dark:text-gray-400 text-xs">
                         <FaMicrochip className={`h-3.5 w-3.5 animate-pulse text-blue-500`}/>
                         <span className="italic font-medium">Thinking...</span>
                     </div>
                 );
             } else if (message.status === 'using_tool' && message.toolName) {
                 const toolInfo = toolDisplayMap[message.toolName] || toolDisplayMap.default;
                 statusIndicator = (
                      <div className={`mt-1 border rounded-lg p-1.5 flex items-center gap-2 text-xs font-medium bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800/50 text-blue-700 dark:text-blue-300`}>
                          <toolInfo.Icon className="h-3.5 w-3.5 animate-spin flex-shrink-0" />
                          <span>{toolInfo.text}</span>
                      </div>
                 );
             } else if (message.status === 'processing') { // Initial processing before fragments/thinking
                  statusIndicator = (
                     <div className="flex items-center gap-x-2 py-1 text-gray-500 dark:text-gray-400 text-xs">
                         <FaCircleNotch className="h-3.5 w-3.5 animate-spin"/>
                         <span className="italic font-medium">Preparing response...</span>
                     </div>
                 );
             }
        }

        // --- Report Button (based on isReportAvailable) ---
        let reportButton = null;
        if (isReportAvailable) {
            reportButton = (
                <div className="mt-3 flex items-center border-t border-gray-200/80 dark:border-gray-700/50 pt-3">
                    <Button
                        variant="primary" size="sm"
                        onClick={() => {
                            logger.debug(`[MessageBubble Click] onViewReport called for ID: ${message._id}`);
                            onViewReport(message); // Pass the whole message object
                        }}
                        leftIcon={DocumentChartBarIcon}
                        className="shadow-soft-md dark:shadow-soft-dark-md transform hover:scale-102 active:scale-98"
                    >
                        View Report
                    </Button>
                </div>
            );
        }

        // --- Combine Rendered Elements ---
        return (
            <div className="space-y-1">
                {renderedFragments}
                {/* Show blinking cursor ONLY if actively streaming */}
                {isStreaming && !isCompleted && !isError && <span className="inline-block w-2 h-4 bg-gray-700 dark:bg-gray-300 ml-1 animate-blink"></span>}
                {/* Show status indicator if applicable */}
                {statusIndicator}
                {reportButton}
                {/* Handle completed but empty response case */}
                {isCompleted && !isReportAvailable && renderedFragments.length === 0 && (
                     <p className="italic text-gray-500 dark:text-gray-400 text-sm">No response content.</p>
                 )}
            </div>
        );
    };
    // --- End renderContent ---

    return (
        <div className={`flex items-start gap-x-3 my-3 lg:my-4`} ref={bubbleRef}>
            {!isUser && (
                <div className={`${iconBaseStyle} ${aiIconColor}`}>
                    <CpuChipIcon className="h-full w-full" />
                </div>
            )}
            <div className={`${bubbleBaseStyle} ${bubbleAlignment} ${bubbleColor}`}>
                {renderContent()}
            </div>
            {isUser && (
                <div className={`${iconBaseStyle} ${userIconColor}`}>
                    <UserIcon className="h-full w-full" />
                </div>
            )}
        </div>
    );
};

export default MessageBubble;