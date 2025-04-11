import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { FiCopy, FiCheckCircle } from 'react-icons/fi';
import { FaCircleNotch, FaMicrochip, FaExclamationTriangle, FaList, FaSearch, FaCode, FaPlayCircle } from 'react-icons/fa';
import { PiChartBarDuotone } from 'react-icons/pi';
import { formatRelative } from 'date-fns';
import { useChat } from '../context/ChatContext';
import logger from '../../../shared/utils/logger';

/**
 * Maps agent tool names to user-friendly text and icons.
 */
const toolDisplayMap = {
  list_datasets: { text: 'Accessing dataset list...', Icon: FaList },
  get_dataset_schema: { text: 'Analyzing dataset schema...', Icon: FaSearch },
  // Add Phase 2 tools
  generate_data_extraction_code: { text: 'Preparing data analysis code...', Icon: FaCode },
  execute_backend_code: { text: 'Analyzing data...', Icon: FaPlayCircle },
  // Add more tools as they are implemented
  // generate_report_code: { text: 'Generating report visualization...', Icon: PiChartBarDuotone },
  default: { text: 'Processing step...', Icon: FaCircleNotch }, // Fallback
};

/**
 * Component for displaying a chat message (user or AI)
 */
const ChatMessage = ({ message, onViewReport }) => {
  const [copied, setCopied] = useState(false);
  const { agentMessageStatuses, AGENT_STATUS } = useChat();
  
  // Log the message prop when the component renders using console.log directly
  useEffect(() => {
    // USE console.log FOR MAXIMUM RELIABILITY
    console.log('[ChatMessage Render - Direct Log] Message ID:', message._id, 'Data:', JSON.stringify(message));
    /* logger.debug(`[ChatMessage Render] Message ID: ${message._id}`, {
      type: message.messageType,
      status: message.status,
      hasCode: !!message.aiGeneratedCode,
      codeLength: message.aiGeneratedCode?.length,
    }); */
  }, [message]); // Re-run log if the message prop changes identity
  
  // Format timestamp to a readable date/time with safety check
  let timestamp = '';
  try {
    if (message.createdAt) {
      const date = new Date(message.createdAt);
      if (!isNaN(date.getTime())) {
        timestamp = formatRelative(date, new Date());
      }
    }
  } catch (error) {
    console.error('Error formatting message date:', error);
  }
  
  // Determine if the message has executable report code
  const hasReportCode = message.messageType === 'ai_report' && 
                       message.status === 'completed' && 
                       message.aiGeneratedCode; // Check if code exists
  
  // Handle copying message text to clipboard
  const handleCopy = () => {
    const textToCopy = message.messageType === 'user' 
      ? message.promptText 
      : message.aiResponseText || '';
      
    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy)
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        })
        .catch(err => console.error('Failed to copy text: ', err));
    }
  };
  
  // Get the appropriate message content based on message type and status
  const renderMessageContent = () => {
    if (message.messageType === 'user') {
      return (
        <div className="prose dark:prose-invert max-w-none">
          <p>{message.promptText}</p>
        </div>
      );
    } else {
      // AI message
      if (message.status === 'error' || message.status === 'error_generating' || message.status === 'error_fetching_data') {
        return (
          <div className="text-red-500 dark:text-red-400">
            <p>Error: {message.errorMessage || 'Something went wrong generating this response.'}</p>
          </div>
        );
      } else if (message.status === 'processing') {
        const agentStatus = agentMessageStatuses[message._id];

        if (agentStatus) {
          switch (agentStatus.status) {
            case AGENT_STATUS.THINKING:
              return (
                <div className="flex items-center text-gray-500 dark:text-gray-400">
                  <FaMicrochip className="animate-pulse mr-2 text-blue-500" />
                  <span>Thinking...</span>
                </div>
              );
            case AGENT_STATUS.USING_TOOL:
              const toolInfo = toolDisplayMap[agentStatus.toolName] || toolDisplayMap.default;
              const ToolIcon = toolInfo.Icon;
              return (
                <div className="flex items-center text-gray-500 dark:text-gray-400">
                  <ToolIcon className="animate-spin mr-2" />
                  <span>{toolInfo.text}</span>
                </div>
              );
            case AGENT_STATUS.ERROR:
              return (
                <div className="flex items-center text-orange-500 dark:text-orange-400">
                  <FaExclamationTriangle className="mr-2" />
                  <span>Agent error: {agentStatus.error || 'Processing issue occurred.'}</span>
                </div>
              );
            case AGENT_STATUS.IDLE:
            default:
              return (
                <div className="flex items-center text-gray-500 dark:text-gray-400">
                  <FaCircleNotch className="animate-spin mr-2" />
                  <span>Preparing response...</span>
                </div>
              );
          }
        } else {
          return (
            <div className="flex items-center text-gray-500 dark:text-gray-400">
              <FaCircleNotch className="animate-spin mr-2" />
              <span>Generating response...</span>
            </div>
          );
        }
      } else if (message.status === 'completed') {
        return (
          <div className="prose dark:prose-invert max-w-none">
            <ReactMarkdown>
              {message.aiResponseText || 'No response text available.'}
            </ReactMarkdown>
          </div>
        );
      } else {
        return (
          <div className="flex items-center text-gray-400 dark:text-gray-500">
            <span>Message status unknown: {message.status}</span>
          </div>
        );
      }
    }
  };
  
  // Determine styling based on message type
  const messageStyles = message.messageType === 'user'
    ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-800'
    : 'bg-gray-50 dark:bg-gray-800/50 border-gray-100 dark:border-gray-700';
  
  return (
    <div className={`p-4 rounded-lg border mb-4 ${messageStyles}`}>
      {/* Message header with user/ai indicator and timestamp */}
      <div className="flex justify-between items-center mb-2">
        <div className="font-medium text-sm">
          {message.messageType === 'user' ? 'You' : 'AI Assistant'}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">{timestamp}</div>
      </div>
      
      {/* Message content */}
      {renderMessageContent()}
      
      {/* Action buttons (copy and view report if available) */}
      <div className="flex justify-end gap-2 mt-2">
        {/* Copy button - don't show during loading/errors */}
        {(['completed', 'user'].includes(message.messageType === 'user' ? 'user' : message.status)) && (
          <button
            onClick={handleCopy}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
            title="Copy message"
          >
            {copied ? <FiCheckCircle className="text-green-500" /> : <FiCopy />}
          </button>
        )}
        
        {/* View Report button - Show if completed AI message has generated code */}
        {hasReportCode && (
          <button
            onClick={() => {
                // USE console.log FOR MAXIMUM RELIABILITY
                console.log('[ChatMessage Click - Direct Log] onViewReport clicked for Message ID:', message._id, 'Has Code:', !!message.aiGeneratedCode);
                /* logger.debug(`[ChatMessage Click] onViewReport clicked for Message ID: ${message._id}`, {
                    hasCode: !!message.aiGeneratedCode,
                    codeLength: message.aiGeneratedCode?.length,
                }); */
                onViewReport({
                    code: message.aiGeneratedCode,
                    datasets: message.reportDatasets || []
                });
            }}
            className="flex items-center gap-1 text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 px-2 py-1.5 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20"
          >
            <PiChartBarDuotone />
            <span>View Report</span>
          </button>
        )}
      </div>
    </div>
  );
};

export default ChatMessage; 