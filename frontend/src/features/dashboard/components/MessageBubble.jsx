// frontend/src/features/dashboard/components/MessageBubble.jsx
// ENTIRE FILE - FULLY UPDATED

import React, { useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { UserIcon, CpuChipIcon, DocumentChartBarIcon, ArrowPathIcon, CheckCircleIcon, ExclamationCircleIcon, ExclamationTriangleIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/solid';
import { FaList, FaSearch, FaCode, FaPlayCircle } from 'react-icons/fa';
import Spinner from '../../../shared/ui/Spinner';
import Button from '../../../shared/ui/Button';
import logger from '../../../shared/utils/logger';
import CodeBlock from './CodeBlock'; // Ensure this component exists and works
import { AGENT_UI_STATUS } from '../context/ChatContext';

// User-friendly tool display map
const toolDisplayMap = {
  list_datasets: { text: 'Accessing dataset list', Icon: FaList },
  get_dataset_schema: { text: 'Analyzing dataset schema', Icon: FaSearch },
  parse_csv_data: { text: 'Loading dataset', Icon: FaSearch },
  generate_analysis_code: { text: 'Preparing analysis code', Icon: FaCode },
  execute_analysis_code: { text: 'Running analysis', Icon: FaPlayCircle },
  generate_report_code: { text: 'Generating report visualization', Icon: DocumentChartBarIcon },
  calculate_financial_ratios: { text: 'Calculating financial ratios', Icon: FaCode },
  ask_user_for_clarification: { text: 'Waiting for your clarification', Icon: ExclamationCircleIcon },
  default: { text: 'Processing step', Icon: FaCode },
};

const MessageBubble = ({ message, onViewReport }) => {
    const [isProcessCollapsed, setIsProcessCollapsed] = useState(true);
    const bubbleRef = useRef(null);

    // Define extractCodeBlocks within the component scope
    const extractCodeBlocks = (text = '') => {
        const codeBlockRegex = /```(?:(\w+)\n)?([\s\S]*?)```/g;
        const codeBlocks = []; let match; let lastIndex = 0; let textWithoutCode = '';
        // Ensure text is a string before processing
        const inputText = String(text || '');
        while ((match = codeBlockRegex.exec(inputText)) !== null) {
            textWithoutCode += inputText.substring(lastIndex, match.index);
            codeBlocks.push({ language: match[1] || 'text', code: match[2].trim() });
            textWithoutCode += `<CODE_BLOCK_${codeBlocks.length - 1}>`;
            lastIndex = codeBlockRegex.lastIndex;
        }
        textWithoutCode += inputText.substring(lastIndex);
        return { textWithoutCode: textWithoutCode.trim(), codeBlocks };
    };

    if (!message) {
        logger.warn('[MessageBubble] Received null or undefined message prop.');
        return null;
    }

    const isUser = message.messageType === 'user';
    const isAi = !isUser;
    const isError = [AGENT_UI_STATUS.ERROR, AGENT_UI_STATUS.INTERRUPTED].includes(message.uiStatus);
    const isCompleted = [AGENT_UI_STATUS.COMPLETED, AGENT_UI_STATUS.REPORT_READY].includes(message.uiStatus);
    const isReportAvailable = message.aiGeneratedCode && message.reportAnalysisData && isCompleted;
    const isClarificationNeeded = message.uiStatus === AGENT_UI_STATUS.CLARIFICATION_NEEDED;

    // Styling
    const bubbleBaseStyle = `max-w-[85%] lg:max-w-[75%] rounded-xl px-4 py-3 text-sm shadow-soft-md dark:shadow-soft-dark-md break-words transition-all duration-200 animate-fadeIn`;
    const bubbleAlignment = isUser ? 'ml-auto' : 'mr-auto';
    const bubbleColor = isUser
        ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white'
        : isError
            ? 'bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-700/50'
            : isClarificationNeeded
                ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-700/50'
                : 'bg-white dark:bg-gray-750 text-gray-800 dark:text-gray-100 border border-gray-200/80 dark:border-gray-700/50';

    const iconBaseStyle = `h-8 w-8 rounded-full p-1.5 flex-shrink-0 self-start mt-1 shadow-soft-sm`;
    const userIconColor = `bg-gradient-to-br from-blue-400 to-blue-500 text-white`;
    const aiIconColor = isError
        ? `bg-gradient-to-br from-red-400 to-red-500 text-white`
        : isClarificationNeeded
          ? `bg-gradient-to-br from-amber-400 to-amber-500 text-white`
          : `bg-gradient-to-br from-gray-200 to-gray-300 text-gray-700 dark:from-gray-600 dark:to-gray-700 dark:text-gray-200`;

    // --- Render Message Fragments (Process Details) ---
    const renderFragments = () => {
        if (!isAi || !Array.isArray(message.fragments) || message.fragments.length === 0) {
            return null;
        }
        return message.fragments.map((fragment, index) => {
            const fragmentKey = `frag-${message._id}-${index}`;
            if (fragment.type === 'text') {
                // Render user explanation text using Markdown
                const { textWithoutCode, codeBlocks } = extractCodeBlocks(fragment.content || '');
                 // If text only contains code block placeholders and no actual text, don't render the markdown wrapper
                 if (!textWithoutCode && codeBlocks.length > 0) {
                     return codeBlocks.map((codeBlock, cbIndex) => (
                         <CodeBlock key={`frag-code-${index}-${cbIndex}`} language={codeBlock.language} code={codeBlock.code} isStreaming={false} />
                     ));
                 }
                 // If there is text content, render it potentially with code blocks
                 const parts = textWithoutCode.split(/<CODE_BLOCK_(\d+)>/);
                 const renderedContent = parts.map((part, partIndex) => {
                     if (partIndex % 2 === 0) {
                         return part.trim() ? (
                             <div key={`text-${partIndex}`} className="prose prose-sm dark:prose-invert max-w-none leading-relaxed">
                                 <ReactMarkdown>{part}</ReactMarkdown>
                             </div>
                         ) : null;
                     }
                     const codeBlockIndex = parseInt(part, 10);
                     const codeBlock = codeBlocks[codeBlockIndex];
                     return codeBlock ? <CodeBlock key={`code-${partIndex}`} language={codeBlock.language} code={codeBlock.code} isStreaming={false} /> : null;
                 }).filter(Boolean);
                 return renderedContent.length > 0 ? <div key={fragmentKey} className="my-2 first:mt-0 last:mb-0">{renderedContent}</div> : null;

            } else if (fragment.type === 'step') {
                // Render tool status indicator
                const toolInfo = toolDisplayMap[fragment.tool] || toolDisplayMap.default;
                const ToolIcon = toolInfo.Icon;
                const isRunning = fragment.status === 'running';
                const isCompletedStep = fragment.status === 'completed';
                const isStepError = fragment.status === 'error';
                let statusText = toolInfo.text;
                let iconColor = 'text-gray-500 dark:text-gray-400';
                let bgColor = 'bg-gray-100 dark:bg-gray-700';
                let StatusIconComponent = ToolIcon;

                if (isRunning) { iconColor = 'text-blue-500 dark:text-blue-400'; bgColor = 'bg-blue-50 dark:bg-blue-900/20'; StatusIconComponent = Spinner; }
                else if (isCompletedStep) { statusText = toolInfo.text.replace(/ing\.\.\.$/, 'ed') + ' - Completed'; iconColor = 'text-green-500 dark:text-green-400'; bgColor = 'bg-green-50 dark:bg-green-900/20'; StatusIconComponent = CheckCircleIcon; }
                else if (isStepError) { statusText = toolInfo.text.replace(/ing\.\.\.$/, 'ed') + ' - Failed'; iconColor = 'text-red-500 dark:text-red-400'; bgColor = 'bg-red-50 dark:bg-red-900/20'; StatusIconComponent = ExclamationCircleIcon; }

                return (
                    <div key={fragmentKey} className={`flex items-center gap-x-2 p-2 my-2 rounded-lg border border-gray-200 dark:border-gray-600/50 ${bgColor}`}>
                        <div className={`flex-shrink-0 h-6 w-6 rounded-full flex items-center justify-center ${bgColor}`}>
                           {StatusIconComponent === Spinner ? <Spinner size="xs" color={iconColor} /> : <StatusIconComponent className={`h-4 w-4 ${iconColor}`} />}
                        </div>
                        <div className="flex-grow text-xs overflow-hidden">
                            <span className="font-medium text-gray-700 dark:text-gray-300 truncate block" title={statusText}>{statusText}</span>
                             {isStepError && fragment.error && ( <p className="text-red-600 dark:text-red-400 text-xs mt-0.5 truncate" title={fragment.error}>{fragment.error}</p> )}
                        </div>
                    </div>
                );
            } else if (fragment.type === 'error') {
                 return (
                     <div key={fragmentKey} className="flex items-center gap-x-2 p-2 my-2 rounded-lg border border-red-200 dark:border-red-700/50 bg-red-50 dark:bg-red-900/20">
                         <ExclamationTriangleIcon className="h-4 w-4 flex-shrink-0 text-red-500" />
                         <p className="text-xs font-medium text-red-700 dark:text-red-300">{fragment.content || 'An error occurred.'}</p>
                     </div>
                 );
            }
            return null;
        });
    };

    // --- Render Final Answer Text (uses aiResponseText) ---
    const renderFinalAnswer = () => {
        // Render only if the message is complete and has text content
        if (!isAi || !isCompleted || !message.aiResponseText?.trim()) return null;

        const { textWithoutCode, codeBlocks } = extractCodeBlocks(message.aiResponseText);

        // If only code blocks exist in the final answer, don't render anything here
        // The report button will handle the display
        if (!textWithoutCode && codeBlocks.length > 0 && isReportAvailable) return null;

        const parts = textWithoutCode.split(/<CODE_BLOCK_(\d+)>/);
        const renderedContent = parts.map((part, partIndex) => {
            if (partIndex % 2 === 0) {
                return part.trim() ? (
                    <div key={`final-text-${partIndex}`} className="prose prose-sm dark:prose-invert max-w-none leading-relaxed">
                        <ReactMarkdown>{part}</ReactMarkdown>
                    </div>
                ) : null;
            }
            const codeBlockIndex = parseInt(part, 10);
            const codeBlock = codeBlocks[codeBlockIndex];
            return codeBlock ? <CodeBlock key={`final-code-${partIndex}`} language={codeBlock.language} code={codeBlock.code} isStreaming={false} /> : null;
        }).filter(Boolean);

        if (renderedContent.length === 0 && !isReportAvailable) {
             return <p className="italic text-gray-500 dark:text-gray-400 text-sm">Analysis complete.</p>;
        }

        return <div className="space-y-2">{renderedContent}</div>;
    };

    // --- Render View Report Button ---
    const renderReportButton = () => {
        if (!isAi || !isReportAvailable) return null;
        return (
             <div className="mt-3 flex items-center border-t border-gray-200/80 dark:border-gray-700/50 pt-3">
                <Button
                    variant="primary" size="sm"
                    onClick={() => onViewReport({ code: message.aiGeneratedCode, analysisData: message.reportAnalysisData })}
                    leftIcon={DocumentChartBarIcon}
                    className="shadow-soft-md dark:shadow-soft-dark-md transform hover:scale-102 active:scale-98"
                > View Report </Button>
            </div>
        );
    };

    // Determine if the collapsible section should be shown
    const showProcessDetails = isAi && Array.isArray(message.fragments) && message.fragments.length > 0;
    // Determine if the final content area should be shown
    const showFinalContentArea = isAi && (isCompleted || isClarificationNeeded || isError);

    return (
        <div className={`flex items-start gap-x-3 my-3 lg:my-4`} ref={bubbleRef}>
            {/* AI Icon */}
            {!isUser && ( <div className={`${iconBaseStyle} ${aiIconColor}`}> <CpuChipIcon className="h-full w-full" /> </div> )}

            {/* Main Bubble Content */}
            <div className={`${bubbleBaseStyle} ${bubbleAlignment} ${bubbleColor}`}>
                {/* User Message Content */}
                {isUser && (
                    <div className="leading-relaxed whitespace-pre-wrap">{message.promptText}</div>
                )}

                {/* AI: Collapsible Process Details */}
                {showProcessDetails && (
                    <details className="group" open={!isProcessCollapsed} onToggle={(e) => setIsProcessCollapsed(!e.target.open)}>
                         <summary
                            className="list-none -mx-1 px-1 py-1 flex items-center justify-between cursor-pointer text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded group"
                        >
                            <span className="font-medium">Show Process Details</span>
                             {isProcessCollapsed ? (
                                <ChevronDownIcon className="h-4 w-4 transition-transform duration-200" />
                             ) : (
                                <ChevronUpIcon className="h-4 w-4 transition-transform duration-200" />
                             )}
                        </summary>
                         <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isProcessCollapsed ? 'max-h-0 opacity-0' : 'max-h-[600px] opacity-100 mt-2 border-t border-dashed border-gray-200 dark:border-gray-600/50 pt-2 overflow-y-auto custom-scrollbar'}`}>
                            {/* Render the fragments which contain explanations and step statuses */}
                            {renderFragments()}
                         </div>
                    </details>
                )}

                {/* AI: Final Answer / Report Area */}
                {showFinalContentArea && (
                    <div className={`${showProcessDetails ? 'mt-3 pt-3 border-t border-gray-200/80 dark:border-gray-700/50' : ''}`}>
                        {/* Render final text OR error OR clarification message */}
                        {isError && message.errorMessage && (
                             <div className="text-red-600 dark:text-red-300 font-medium flex items-center gap-x-2">
                                 <ExclamationTriangleIcon className="h-4 w-4 flex-shrink-0" />
                                 <span>Error: {message.errorMessage}</span>
                             </div>
                        )}
                         {isClarificationNeeded && (
                              <div className="text-amber-700 dark:text-amber-300 font-medium flex items-center gap-x-2">
                                  <ExclamationCircleIcon className="h-4 w-4 flex-shrink-0" />
                                  <span>{message.aiResponseText || 'Waiting for your clarification...'}</span>
                              </div>
                         )}
                        {/* Render final answer text only if completed and not error/clarification */}
                        {!isError && !isClarificationNeeded && renderFinalAnswer()}
                        {/* Render report button if available */}
                        {renderReportButton()}
                    </div>
                )}
            </div>
            {/* User Icon */}
            {isUser && ( <div className={`${iconBaseStyle} ${userIconColor}`}> <UserIcon className="h-full w-full" /> </div> )}
        </div>
    );
};

export default MessageBubble;