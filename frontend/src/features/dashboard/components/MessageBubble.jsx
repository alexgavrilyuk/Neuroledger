// frontend/src/features/dashboard/components/MessageBubble.jsx
import React, { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
// Import Heroicons separately
import { UserIcon, CpuChipIcon, ExclamationCircleIcon, DocumentChartBarIcon } from '@heroicons/react/24/solid'; 
// Import React Icons (Font Awesome) separately
import { FaCircleNotch, FaExclamationTriangle, FaList, FaSearch, FaCode, FaPlayCircle, FaMicrochip, FaTools, FaCheckCircle, FaTimesCircle } from 'react-icons/fa'; 
import Spinner from '../../../shared/ui/Spinner';
import Button from '../../../shared/ui/Button';
import { useChat } from '../context/ChatContext'; 
// Import logger
import logger from '../../../shared/utils/logger';
import CodeBlock from './CodeBlock'; // Import the CodeBlock component (we'll create this later)

// Define tool display map here as it's used within this component
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
    const { 
      isStreaming,
      streamingMessageId,
    } = useChat();
    
    const bubbleRef = useRef(null);

    useEffect(() => {
      if (message.isStreaming && bubbleRef.current) { 
        bubbleRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    }, [message.aiResponseText, message.isStreaming]);

    useEffect(() => {
        console.log('[MessageBubble Render - Direct Log] Message ID:', message._id, 'Data:', JSON.stringify(message));
    }, [message]);

    const isUser = message.messageType === 'user';
    
    const isError = message.status === 'error';
    const isThinking = message.status === 'thinking';
    const isUsingTool = message.status === 'using_tool';
    const isProcessing = message.status === 'processing' || isThinking || isUsingTool;
    const isCompleted = message.status === 'completed';

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
      const codeBlocks = [];
      let match;
      let lastIndex = 0;
      let textWithoutCode = '';
      
      while ((match = codeBlockRegex.exec(text)) !== null) {
        // Add text before this code block
        textWithoutCode += text.substring(lastIndex, match.index);
        
        // Extract language and code
        const language = match[1] || 'javascript';
        const code = match[2];
        
        // Add a placeholder for the code block
        textWithoutCode += `<CODE_BLOCK_${codeBlocks.length}>`;
        
        // Store the code block
        codeBlocks.push({ language, code });
        
        lastIndex = match.index + match[0].length;
      }
      
      // Add any remaining text
      textWithoutCode += text.substring(lastIndex);
      
      return { textWithoutCode, codeBlocks };
    };

    const renderContent = () => {
        const { textWithoutCode, codeBlocks } = extractCodeBlocks(message.aiResponseText);
        
        if (isUser) {
            return (
                <div className="leading-relaxed">
                    {message.promptText.split('\n').map((line, index, arr) => (
                        <React.Fragment key={index}>
                            {line}
                            {index < arr.length - 1 && <br />}
                        </React.Fragment>
                    ))}
                </div>
            );
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

        const renderMarkdownContent = () => {
             if (!textWithoutCode && codeBlocks.length === 0) return null; // Handle empty case

             const parts = textWithoutCode.split(/<CODE_BLOCK_(\d+)>/);
             return parts.map((part, index) => {
                 if (index % 2 === 0) {
                     // Only render markdown if part is not empty or just whitespace
                     return part.trim() ? <ReactMarkdown key={index}>{part}</ReactMarkdown> : null;
                 } else {
                     const codeBlockIndex = parseInt(part, 10);
                     if (codeBlocks[codeBlockIndex]) {
                         return <CodeBlock key={index} language={codeBlocks[codeBlockIndex].language} code={codeBlocks[codeBlockIndex].code} />;
                     } else {
                         return null; // Should not happen if regex is correct
                     }
                 }
             }).filter(Boolean); // Filter out nulls from empty markdown parts
        };

        let mainContentElement = null;
        const renderedMarkdown = renderMarkdownContent();

        if (message.aiResponseText || codeBlocks.length > 0) {
             mainContentElement = (
                 <div className="prose prose-sm dark:prose-invert max-w-none leading-relaxed">
                     {renderedMarkdown}
                     {/* Show blinking cursor only if actively streaming and not yet complete */}
                     {message.isStreaming && !isCompleted && <span className="inline-block w-2 h-4 bg-gray-700 dark:bg-gray-300 ml-1 animate-blink"></span>}
                 </div>
             );
        } else if (isProcessing && message.isStreaming) {
             // Show indicator if processing but no text received yet
             mainContentElement = (
                 <div className="flex items-center gap-x-2 py-1 text-gray-500 dark:text-gray-400">
                     <FaCircleNotch className={`h-4 w-4 animate-spin`}/>
                     <span className="italic font-medium">
                         Receiving response...
                     </span>
                 </div>
             );
         } else if (isCompleted && !isReportAvailable && !message.aiResponseText) {
             // Handle completed but empty response (not a report)
            mainContentElement = <p className="italic text-gray-500 dark:text-gray-400">No response content.</p>;
         }

        // --- Tool Status Indicator (Live/Active Step) --- 
        let toolStatusIndicator = null;
        if (isThinking) {
            toolStatusIndicator = (
                <div className="mt-2 flex items-center gap-x-2 py-1 text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-600 pt-2">
                    <FaMicrochip className={`h-4 w-4 animate-pulse`}/>
                    <span className="italic font-medium">Thinking...</span>
                </div>
            );
        } else if (isUsingTool && message.toolName) {
           const toolInfo = toolDisplayMap[message.toolName] || toolDisplayMap.default;
           toolStatusIndicator = (
                <div className={`mt-2 border rounded-lg p-2 flex items-center gap-2 text-xs font-medium bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800/50 text-blue-700 dark:text-blue-300`}>
                    <toolInfo.Icon className="h-4 w-4 animate-spin flex-shrink-0" />
                    <span>{toolInfo.text}</span>
                </div>
           );
        }

        // --- Report Button --- 
        let reportButton = null;
        if (isReportAvailable) {
             reportButton = (
                <div className="mt-3 flex items-center border-t border-gray-200 dark:border-gray-600 pt-3">
                    <Button
                        variant="primary"
                        size="sm"
                        onClick={() => onViewReport(message)}
                        leftIcon={DocumentChartBarIcon}
                        className="shadow-soft-md dark:shadow-soft-dark-md transform hover:scale-102 active:scale-98"
                    >
                        View Report
                    </Button>
                </div>
            );
        }

        // --- Render Fragments --- 
        const renderedFragments = (message.fragments || []).map((fragment, index) => {
            if (fragment.type === 'text') {
                // Render markdown for text fragments
                 return (
                     <div key={`frag-${index}-text`} className="prose prose-sm dark:prose-invert max-w-none leading-relaxed">
                         <ReactMarkdown>{fragment.content}</ReactMarkdown>
                     </div>
                 );
            } else if (fragment.type === 'step') {
                // Render the styled step UI element
                const toolInfo = toolDisplayMap[fragment.tool] || toolDisplayMap.default;
                const isSuccess = !fragment.error;
                const statusText = fragment.error ? `Error: ${fragment.error}` : fragment.resultSummary || 'Completed';
                
                return (
                    <div 
                        key={`frag-${index}-step-${fragment.tool}`} 
                        title={statusText} 
                        className={`flex items-center gap-x-2 text-xs p-1.5 rounded mt-2 mb-1 ${isSuccess ? 'text-gray-600 dark:text-gray-300' : 'text-red-600 dark:text-red-300'}`}
                    >
                        {isSuccess ? (
                            <FaCheckCircle className="h-3.5 w-3.5 flex-shrink-0 text-green-500" />
                        ) : (
                            <FaTimesCircle className="h-3.5 w-3.5 flex-shrink-0 text-red-500" />
                        )}
                        <toolInfo.Icon className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="font-medium truncate">{toolInfo.text.replace(/ing\.\.\./, 'ed').replace(/\.\.\./, '')}</span> 
                    </div>
                );
            } else if (fragment.type === 'error') { // Handle potential error fragments 
                 return (
                     <div key={`frag-${index}-error`} className="text-red-600 dark:text-red-300 font-medium flex items-center gap-x-2 mt-2 text-xs">
                         <FaExclamationTriangle className="h-4 w-4 flex-shrink-0" />
                         <span>{fragment.content}</span>
                     </div>
                 );
            }
            return null;
        });

        // --- Final Combined Return --- 
        return (
            <div className="space-y-1"> 
                 {renderedFragments} 
                 {/* Blinking cursor */} 
                 {message.isStreaming && !isUsingTool && !isThinking && <span className="inline-block w-2 h-4 bg-gray-700 dark:bg-gray-300 ml-1 animate-blink"></span>}
                 {/* Live status indicator */} 
                 {toolStatusIndicator} 
                 {/* Report button */} 
                 {reportButton}
             </div>
        );
    };

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