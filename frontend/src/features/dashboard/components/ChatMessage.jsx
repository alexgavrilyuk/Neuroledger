import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { FiCopy, FiCheckCircle } from 'react-icons/fi';
import { FaCircleNotch } from 'react-icons/fa';
import { PiChartBarDuotone } from 'react-icons/pi';
import { formatRelative } from 'date-fns';

/**
 * Component for displaying a chat message (user or AI)
 */
const ChatMessage = ({ message, onViewReport }) => {
  const [copied, setCopied] = useState(false);
  
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
  
  // Determine if the message has report data that can be viewed
  const hasReport = message.messageType === 'ai_report' && 
    ((message.aiGeneratedCode && message.reportDatasets) || 
     (message.status === 'completed' && message.reportDatasets));
  
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
      if (message.status === 'processing' || message.status === 'generating_code') {
        return (
          <div className="flex items-center text-gray-500 dark:text-gray-400">
            <FaCircleNotch className="animate-spin mr-2" />
            <span>Generating response...</span>
          </div>
        );
      } else if (message.status === 'fetching_data') {
        return (
          <div className="flex items-center text-gray-500 dark:text-gray-400">
            <FaCircleNotch className="animate-spin mr-2" />
            <span>Fetching data for visualization...</span>
          </div>
        );
      } else if (message.status === 'error' || message.status === 'error_generating' || message.status === 'error_fetching_data') {
        return (
          <div className="text-red-500 dark:text-red-400">
            <p>Error: {message.errorMessage || 'Something went wrong generating this response.'}</p>
          </div>
        );
      } else {
        // 'completed' status
        return (
          <div className="prose dark:prose-invert max-w-none">
            <ReactMarkdown>
              {message.aiResponseText || 'No response text available.'}
            </ReactMarkdown>
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
        
        {/* View Report button - only for completed AI messages with report data */}
        {hasReport && (
          <button
            onClick={() => onViewReport({
              code: message.aiGeneratedCode,
              datasets: message.reportDatasets
            })}
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