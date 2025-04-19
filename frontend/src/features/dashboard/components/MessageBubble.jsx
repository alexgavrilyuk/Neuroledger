// ================================================================================
// FILE: frontend/src/features/dashboard/components/MessageBubble.jsx
// PURPOSE: Renders a single chat message bubble (user or AI).
// PHASE 5 UPDATE: Refined step fragment rendering to show attempts.
// ================================================================================
import React, { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { UserIcon, CpuChipIcon, ExclamationCircleIcon, DocumentChartBarIcon } from '@heroicons/react/24/solid';
import { FaCircleNotch, FaExclamationTriangle, FaList, FaSearch, FaCode, FaPlayCircle, FaMicrochip, FaTools, FaCheckCircle, FaTimesCircle } from 'react-icons/fa';
import Spinner from '../../../shared/ui/Spinner';
import Button from '../../../shared/ui/Button';
import logger from '../../../shared/utils/logger';
import CodeBlock from './CodeBlock';

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

    useEffect(() => {
        // console.log(`[MessageBubble Render - Direct Log] ID: ${message?._id}, Status: ${message?.status}, Streaming: ${message?.isStreaming}, Fragments: ${message?.fragments?.length}, Code: ${!!message?.aiGeneratedCode}, Thinking: ${!!message?.thinkingText}`);
    }, [message]);

    if (!message) {
        logger.warn('[MessageBubble] Received null or undefined message prop.');
        return null;
    }

    const isUser = message.messageType === 'user';
    const isError = message.status === 'error';
    const isCompleted = message.status === 'completed';
    const isStreaming = !!message.isStreaming;
    const isThinkingDisplay = message.status === 'thinking_display';

    const isReportAvailable = message.messageType === 'ai_report' &&
                              isCompleted &&
                              message.aiGeneratedCode;

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

    const extractCodeBlocks = (text) => {
        if (!text) return { textWithoutCode: '', codeBlocks: [] };
        const codeBlockRegex = /```(?:(\w+)\n)?([\s\S]*?)```/g;
        const codeBlocks = []; let match; let lastIndex = 0; let textWithoutCode = '';
        while ((match = codeBlockRegex.exec(text)) !== null) {
            textWithoutCode += text.substring(lastIndex, match.index);
            const language = match[1] || 'javascript'; const code = match[2];
            textWithoutCode += `<CODE_BLOCK_${codeBlocks.length}>`; codeBlocks.push({ language, code });
            lastIndex = match.index + match[0].length;
        }
        textWithoutCode += text.substring(lastIndex);
        return { textWithoutCode, codeBlocks };
    };

    const renderContent = () => {
        if (isUser) {
            return ( <div className="leading-relaxed"> {message.promptText.split('\n').map((line, index, arr) => ( <React.Fragment key={index}> {line}{index < arr.length - 1 && <br />} </React.Fragment> ))} </div> );
        }
        if (isError) {
            const errorMsg = message.errorMessage || "An unexpected error occurred."; const errorCodePart = message.errorCode ? ` (Code: ${message.errorCode})` : '';
            return ( <div className="text-red-600 dark:text-red-300 font-medium flex items-center gap-x-2"> <FaExclamationTriangle className="h-4 w-4 flex-shrink-0" /> <span>Error: {errorMsg}{errorCodePart}</span> </div> );
        }
        if (isThinkingDisplay && message.thinkingText) {
            return ( <div className="my-1 p-3 bg-gray-100 dark:bg-gray-700/50 rounded-md border border-gray-200 dark:border-gray-600/50 text-xs text-gray-600 dark:text-gray-400"> <p><strong className="not-italic text-gray-700 dark:text-gray-300 mr-1">Thinking:</strong><span className="italic">{message.thinkingText}</span></p> </div> );
        }

        // Render Fragments
        const renderedFragments = (message.fragments || []).map((fragment, index) => {
             if (fragment.type === 'text') {
                 const { textWithoutCode, codeBlocks } = extractCodeBlocks(fragment.content);
                 if (!textWithoutCode.trim() && codeBlocks.length === 0) return null;
                 const parts = textWithoutCode.split(/<CODE_BLOCK_(\d+)>/);
                 return (
                     <div key={`frag-${index}-text`} className="prose prose-sm dark:prose-invert max-w-none leading-relaxed">
                         {parts.map((part, partIndex) => {
                             if (partIndex % 2 === 0) return part.trim() ? <ReactMarkdown key={partIndex}>{part}</ReactMarkdown> : null;
                             const codeBlockIndex = parseInt(part, 10); const codeBlock = codeBlocks[codeBlockIndex];
                             return codeBlock ? <CodeBlock key={partIndex} language={codeBlock.language} code={codeBlock.code} isStreaming={isStreaming} /> : null;
                         }).filter(Boolean)}
                     </div>
                 );
             } else if (fragment.type === 'step') {
                 const toolInfo = toolDisplayMap[fragment.tool] || toolDisplayMap.default;
                 const isSuccess = !fragment.error;
                 const errorDisplay = fragment.error ? `Error: ${fragment.error}${fragment.errorCode ? ` (${fragment.errorCode})` : ''}` : null;
                 const statusText = errorDisplay || fragment.resultSummary || 'Completed';
                 const isRunning = fragment.status === 'running'; // Check if the step is currently running
                 // PHASE 5: Add attempt indicator if available (might need modification if backend step structure differs)
                 const attemptText = fragment.attempt > 1 ? ` (Attempt ${fragment.attempt})` : '';

                 return (
                     <div key={`frag-${index}-step-${fragment.tool}`} title={statusText}
                          className={`flex items-center gap-x-2 text-xs p-1.5 rounded mt-2 mb-1 transition-colors duration-200 ${
                              isRunning ? 'text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 animate-pulse' :
                              isSuccess ? 'text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/50' :
                              'text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-900/30'
                          }`}>
                         {isRunning ? <Spinner size="xs" className="h-3.5 w-3.5 flex-shrink-0" /> :
                          isSuccess ? <FaCheckCircle className="h-3.5 w-3.5 flex-shrink-0 text-green-500" /> :
                          <FaTimesCircle className="h-3.5 w-3.5 flex-shrink-0 text-red-500" />
                         }
                         <toolInfo.Icon className="h-3.5 w-3.5 flex-shrink-0" />
                         <span className="font-medium truncate">{toolInfo.text.replace(/ing\.\.\./, 'ed').replace(/\.\.\./, '')}{attemptText}</span>
                         {fragment.errorCode && <span className="text-xs opacity-70">({fragment.errorCode})</span>}
                     </div>
                 );
             } else if (fragment.type === 'error') {
                 return ( <div key={`frag-${index}-error`} className="text-red-600 dark:text-red-300 font-medium flex items-center gap-x-2 mt-2 text-xs"> <FaExclamationTriangle className="h-4 w-4 flex-shrink-0" /> <span>{fragment.content}{fragment.errorCode ? ` (${fragment.errorCode})` : ''}</span> </div> );
             }
             return null;
         }).filter(Boolean);

        // Loading / Tool Indicators
        let statusIndicator = null;
        if (!isThinkingDisplay && !isCompleted && !isError && isStreaming) {
             // Don't show generic "Thinking..." if fragments are already rendering steps/text
             const showGenericThinking = message.status === 'thinking' && renderedFragments.length === 0;
             const showGenericProcessing = message.status === 'processing' && renderedFragments.length === 0;

             if (showGenericThinking) {
                 statusIndicator = ( <div className="flex items-center gap-x-2 py-1 text-gray-500 dark:text-gray-400 text-xs"> <FaMicrochip className={`h-3.5 w-3.5 animate-pulse text-blue-500`}/> <span className="italic font-medium">Thinking...</span> </div> );
             } else if (showGenericProcessing) {
                  statusIndicator = ( <div className="flex items-center gap-x-2 py-1 text-gray-500 dark:text-gray-400 text-xs"> <FaCircleNotch className="h-3.5 w-3.5 animate-spin"/> <span className="italic font-medium">Preparing response...</span> </div> );
             }
             // 'using_tool' status is now handled by the step fragment rendering above
        }

        let reportButton = null;
        if (isReportAvailable) {
            reportButton = ( <div className="mt-3 flex items-center border-t border-gray-200/80 dark:border-gray-700/50 pt-3"> <Button variant="primary" size="sm" onClick={() => { logger.debug(`[MessageBubble Click] onViewReport called for ID: ${message._id}`); onViewReport(message); }} leftIcon={DocumentChartBarIcon} className="shadow-soft-md dark:shadow-soft-dark-md transform hover:scale-102 active:scale-98"> View Report </Button> </div> );
        }

        return (
            <div className="space-y-1">
                {renderedFragments}
                {isStreaming && !isCompleted && !isError && !isThinkingDisplay && renderedFragments.length > 0 && renderedFragments[renderedFragments.length-1]?.type !== 'step' && <span className="inline-block w-2 h-4 bg-gray-700 dark:bg-gray-300 ml-1 animate-blink"></span>}
                {statusIndicator}
                {reportButton}
                {isCompleted && !isReportAvailable && renderedFragments.length === 0 && ( <p className="italic text-gray-500 dark:text-gray-400 text-sm">No response content.</p> )}
            </div>
        );
    };

    return (
        <div className={`flex items-start gap-x-3 my-3 lg:my-4`} ref={bubbleRef}>
            {!isUser && ( <div className={`${iconBaseStyle} ${aiIconColor}`}> <CpuChipIcon className="h-full w-full" /> </div> )}
            <div className={`${bubbleBaseStyle} ${bubbleAlignment} ${bubbleColor}`}> {renderContent()} </div>
            {isUser && ( <div className={`${iconBaseStyle} ${userIconColor}`}> <UserIcon className="h-full w-full" /> </div> )}
        </div>
    );
};

export default MessageBubble;