// frontend/src/features/dashboard/components/MessageBubble.jsx
// --- UPDATED FILE ---

import React, { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown'; // Keep the import
import { UserIcon, CpuChipIcon, ExclamationCircleIcon, DocumentChartBarIcon } from '@heroicons/react/24/solid';
import {
  FaCircleNotch, FaExclamationTriangle, FaList, FaSearch, FaCode,
  FaPlayCircle, FaMicrochip, FaTools, FaCheckCircle, FaTimesCircle
} from 'react-icons/fa'; // Keep relevant icons
import Spinner from '../../../shared/ui/Spinner';
import Button from '../../../shared/ui/Button';
import logger from '../../../shared/utils/logger';
import CodeBlock from './CodeBlock'; // Assume CodeBlock is updated for streaming etc.
import { AGENT_UI_STATUS } from '../context/ChatContext'; // Import UI statuses

// User-friendly tool display map (keep as before)
const toolDisplayMap = {
  list_datasets: { text: 'Accessing dataset list...', Icon: FaList },
  get_dataset_schema: { text: 'Analyzing dataset schema...', Icon: FaSearch },
  parse_csv_data: { text: 'Parsing CSV data...', Icon: FaSearch },
  generate_analysis_code: { text: 'Generating analysis code...', Icon: FaCode },
  execute_analysis_code: { text: 'Running analysis...', Icon: FaPlayCircle },
  generate_report_code: { text: 'Generating report visualization...', Icon: DocumentChartBarIcon },
  calculate_financial_ratios: { text: 'Calculating financial ratios...', Icon: FaCode }, // PHASE 7
  ask_user_for_clarification: { text: 'Waiting for clarification...', Icon: FaMicrochip }, // PHASE 9
  default: { text: 'Processing step...', Icon: FaTools },
};

const MessageBubble = ({ message, onViewReport }) => {
    const bubbleRef = useRef(null);

    // Log message on render (keep for debugging)
    useEffect(() => {
        console.log(`[MessageBubble Render] ID: ${message?._id}, UI Status: ${message?.uiStatus}, IsStreaming: ${message?.isStreaming}, HasCode: ${!!message?.aiGeneratedCode}, HasData: ${!!message?.reportAnalysisData}, Text Len: ${message?.aiResponseText?.length}`);
    }, [message]);

    if (!message) {
        logger.warn('[MessageBubble] Received null or undefined message prop.');
        return null;
    }

    const isUser = message.messageType === 'user';
    const isAi = !isUser;
    const isError = message.uiStatus === AGENT_UI_STATUS.ERROR;
    const isReportAvailable = message.aiGeneratedCode && message.reportAnalysisData && message.uiStatus === AGENT_UI_STATUS.REPORT_READY;
    const isCompletedTextOnly = message.uiStatus === AGENT_UI_STATUS.COMPLETED;
    const isProcessing = [
        AGENT_UI_STATUS.PROCESSING,
        AGENT_UI_STATUS.THINKING,
        AGENT_UI_STATUS.USING_TOOL,
        AGENT_UI_STATUS.STREAMING_TEXT,
    ].includes(message.uiStatus);

    // Styling based on user/AI and status
    const bubbleBaseStyle = `max-w-[80%] lg:max-w-[70%] rounded-xl px-4 py-3 text-sm shadow-soft-md dark:shadow-soft-dark-md break-words transition-all duration-200 animate-fadeIn`;
    const bubbleAlignment = isUser ? 'ml-auto' : 'mr-auto';
    const bubbleColor = isUser
        ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white'
        : isError
            ? 'bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-700/50'
            : (isReportAvailable || isCompletedTextOnly)
                ? 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 border border-gray-200/80 dark:border-gray-700/50'
                : 'bg-gray-100 dark:bg-gray-750 text-gray-700 dark:text-gray-200 border border-gray-200/80 dark:border-gray-700/50'; // Different color for processing states

    const iconBaseStyle = `h-8 w-8 rounded-full p-1.5 flex-shrink-0 self-start mt-1 shadow-soft-sm`;
    const userIconColor = `bg-gradient-to-br from-blue-400 to-blue-500 text-white`;
    const aiIconColor = isError
        ? `bg-gradient-to-br from-red-400 to-red-500 text-white`
        : `bg-gradient-to-br from-gray-200 to-gray-300 text-gray-700 dark:from-gray-600 dark:to-gray-700 dark:text-gray-200`;

    // Render the status indicator separately
    const renderStatusIndicator = () => {
        if (!isAi || isCompletedTextOnly || isReportAvailable || isError) return null; // Don't show for final states or user

        let statusText = "Preparing response...";
        let StatusIcon = Spinner;
        let iconProps = { size: "xs", className: "h-3.5 w-3.5 flex-shrink-0" };

        switch (message.uiStatus) {
            case AGENT_UI_STATUS.THINKING:
                statusText = "Thinking...";
                StatusIcon = FaMicrochip;
                iconProps = { className: "h-3.5 w-3.5 flex-shrink-0 text-blue-500 animate-pulse" };
                break;
            case AGENT_UI_STATUS.USING_TOOL:
                const toolInfo = toolDisplayMap[message.currentToolName] || toolDisplayMap.default;
                StatusIcon = toolInfo.Icon;
                statusText = toolInfo.text;
                iconProps = { className: `h-3.5 w-3.5 flex-shrink-0 ${message.currentToolStatus === 'running' ? 'animate-spin' : ''}` };
                break;
            case AGENT_UI_STATUS.STREAMING_TEXT:
                // Show last completed/errored tool status *while* streaming text
                if (message.currentToolName && message.currentToolStatus !== 'running') {
                    const lastToolInfo = toolDisplayMap[message.currentToolName] || toolDisplayMap.default;
                    const isSuccess = message.currentToolStatus === 'completed';
                    StatusIcon = isSuccess ? FaCheckCircle : FaTimesCircle;
                    statusText = `${lastToolInfo.text.replace(/ing\.\.\./, 'ed')} ${isSuccess ? 'successfully' : 'failed'}`;
                    iconProps = { className: `h-3.5 w-3.5 flex-shrink-0 ${isSuccess ? 'text-green-500' : 'text-red-500'}` };
                } else {
                    // If no recent tool or tool was still running when text started, show generic streaming
                    statusText = "Generating response...";
                    StatusIcon = FaCircleNotch; // Or a different icon for streaming text
                    iconProps = { className: "h-3.5 w-3.5 flex-shrink-0 animate-spin" };
                }
                break;
             case AGENT_UI_STATUS.INTERRUPTED:
                 statusText = "Response interrupted.";
                 StatusIcon = FaExclamationTriangle;
                 iconProps = { className: "h-3.5 w-3.5 flex-shrink-0 text-amber-500" };
                 break;
             case AGENT_UI_STATUS.PROCESSING: // Initial state
             default:
                 statusText = "Preparing response...";
                 StatusIcon = Spinner;
                 iconProps = { size: "xs", className: "h-3.5 w-3.5 flex-shrink-0" };
                 break;
        }

        return (
            <div className="flex items-center gap-x-2 py-1 text-gray-500 dark:text-gray-400 text-xs italic mt-1 border-t border-dashed border-gray-200 dark:border-gray-600/50 pt-2">
                <StatusIcon {...iconProps} />
                <span className="font-medium">{statusText}</span>
            </div>
        );
    };

    // Helper to extract code blocks (simple version - keep as before)
    const extractCodeBlocks = (text = '') => {
        const codeBlockRegex = /```(?:(\w+)\n)?([\s\S]*?)```/g;
        const codeBlocks = []; let match; let lastIndex = 0; let textWithoutCode = '';
        while ((match = codeBlockRegex.exec(text)) !== null) {
            textWithoutCode += text.substring(lastIndex, match.index);
            codeBlocks.push({ language: match[1] || 'text', code: match[2] });
            textWithoutCode += `<CODE_BLOCK_${codeBlocks.length - 1}>`;
            lastIndex = codeBlockRegex.lastIndex;
        }
        textWithoutCode += text.substring(lastIndex);
        return { textWithoutCode, codeBlocks };
    };

    // Function to render the main message content (text and code blocks)
    const renderMessageBody = () => {
        if (isUser) {
            return <div className="leading-relaxed whitespace-pre-wrap">{message.promptText}</div>;
        }
        if (isError) {
            const errorMsg = message.errorMessage || "An unexpected error occurred.";
            return (
                <div className="text-red-600 dark:text-red-300 font-medium flex items-center gap-x-2">
                    <FaExclamationTriangle className="h-4 w-4 flex-shrink-0" />
                    <span>Error: {errorMsg}</span>
                </div>
            );
        }
        // Only render text/code if we have some OR if it's completed (even if empty)
        if (message.aiResponseText || isCompletedTextOnly || isReportAvailable) {
            const { textWithoutCode, codeBlocks } = extractCodeBlocks(message.aiResponseText);
            const parts = textWithoutCode.split(/<CODE_BLOCK_(\d+)>/);
            const renderedContent = parts.map((part, partIndex) => {
                if (partIndex % 2 === 0) {
                    return part.trim() ? (
                        // Apply className to wrapper div
                        <div key={`text-${partIndex}`} className="prose prose-sm dark:prose-invert max-w-none leading-relaxed">
                            <ReactMarkdown>{part}</ReactMarkdown>
                        </div>
                    ) : null;
                }
                const codeBlockIndex = parseInt(part, 10); const codeBlock = codeBlocks[codeBlockIndex];
                return codeBlock ? <CodeBlock key={`code-${partIndex}`} language={codeBlock.language} code={codeBlock.code} isStreaming={false} /> : null;
            }).filter(Boolean);

             return (
                 <div className="space-y-2">
                     {renderedContent.length > 0 ? renderedContent : (isCompletedTextOnly && !isReportAvailable ? <p className="italic text-gray-500 dark:text-gray-400 text-sm">Processing complete.</p> : null)}
                     {/* Streaming cursor only shown if actively streaming text */ }
                     {message.uiStatus === AGENT_UI_STATUS.STREAMING_TEXT && <span className="inline-block w-2 h-4 bg-gray-700 dark:bg-gray-300 ml-1 animate-blink"></span>}
                 </div>
             );
        }

        // If processing but no text yet, return null (status indicator handles display)
        return null;
    };

    // Render View Report Button
    const renderReportButton = () => {
        if (!isReportAvailable) return null;
        return (
             <div className="mt-3 flex items-center border-t border-gray-200/80 dark:border-gray-700/50 pt-3">
                <Button
                    variant="primary" size="sm"
                    onClick={() => {
                         logger.debug(`[MessageBubble Click] onViewReport called for ID: ${message._id}`);
                         // Pass the needed info directly
                         onViewReport({
                             code: message.aiGeneratedCode,
                             analysisData: message.reportAnalysisData // Ensure this field name is correct
                         });
                    }}
                    leftIcon={DocumentChartBarIcon}
                    className="shadow-soft-md dark:shadow-soft-dark-md transform hover:scale-102 active:scale-98"
                > View Report </Button>
            </div>
        );
    };


    return (
        <div className={`flex items-start gap-x-3 my-3 lg:my-4`} ref={bubbleRef}>
            {!isUser && ( <div className={`${iconBaseStyle} ${aiIconColor}`}> <CpuChipIcon className="h-full w-full" /> </div> )}
            <div className={`${bubbleBaseStyle} ${bubbleAlignment} ${bubbleColor}`}>
                 {renderMessageBody()}
                 {renderStatusIndicator()}
                 {renderReportButton()} {/* Render the button */}
            </div>
            {isUser && ( <div className={`${iconBaseStyle} ${userIconColor}`}> <UserIcon className="h-full w-full" /> </div> )}
        </div>
    );
};

export default MessageBubble;