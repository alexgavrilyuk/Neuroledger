import React, { useState } from 'react';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { vs2015 } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import { formatDistanceToNow } from 'date-fns';
import Modal from '../../../shared/ui/Modal';
import ReportViewer from '../../report_display/components/ReportViewer';
import Button from '../../../shared/ui/Button';
import { DocumentChartBarIcon } from '@heroicons/react/24/outline';

/**
 * Displays a single chat message with support for different message types and states
 */
const ChatMessage = ({ message }) => {
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  // Determine if this is a user message or AI response
  const isUserMessage = message.messageType === 'user';
  
  // Format the message timestamp
  const formattedTime = message.createdAt 
    ? formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })
    : '';
  
  // Handle different message statuses
  const isLoading = message.status === 'processing' || message.status === 'generating_code' || message.status === 'fetching_data';
  const isError = message.status === 'error' || message.status === 'error_generating' || message.status === 'error_executing' || message.status === 'error_fetching_data';
  const isCompleteReport = message.status === 'completed' && message.messageType === 'ai_report' && message.aiGeneratedCode && message.reportDatasets;
  
  // Extract and format the code content
  const codeContent = message.aiGeneratedCode || '';
  
  return (
    <>
      <div className={`flex flex-col mb-4 ${isUserMessage ? 'items-end' : 'items-start'}`}>
        <div className={`max-w-[85%] rounded-lg p-3 ${
          isUserMessage 
            ? 'bg-blue-100 dark:bg-blue-800 text-blue-900 dark:text-blue-100' 
            : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
        }`}>
          {/* User message content */}
          {isUserMessage && (
            <p className="whitespace-pre-wrap">{message.promptText}</p>
          )}
          
          {/* AI message content - loading state */}
          {!isUserMessage && isLoading && (
            <div className="flex items-center space-x-2">
              <div className="animate-pulse flex space-x-2">
                <div className="h-2 w-2 bg-gray-400 dark:bg-gray-500 rounded-full"></div>
                <div className="h-2 w-2 bg-gray-400 dark:bg-gray-500 rounded-full"></div>
                <div className="h-2 w-2 bg-gray-400 dark:bg-gray-500 rounded-full"></div>
              </div>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {message.status === 'fetching_data' ? 'Fetching report data...' : 'Generating response...'}
              </span>
            </div>
          )}
          
          {/* AI message content - error state */}
          {!isUserMessage && isError && (
            <div className="text-red-500 dark:text-red-400">
              <p className="font-medium">Error: {message.status.replace('error_', '').replace('_', ' ')}</p>
              <p className="text-sm mt-1">{message.errorMessage || 'An unknown error occurred'}</p>
            </div>
          )}
          
          {/* AI message content - completed state with report button */}
          {!isUserMessage && isCompleteReport && (
            <div className="flex flex-col items-start">
              <p className="text-sm mb-2">AI report generated.</p>
              <Button
                onClick={() => setIsReportModalOpen(true)}
                size="sm"
                variant="secondary"
                leftIcon={DocumentChartBarIcon}
              >
                View Report
              </Button>
            </div>
          )}
          
          {/* AI message content - completed state with ONLY code (fallback, if reportDatasets missing) */}
          {!isUserMessage && message.status === 'completed' && !isCompleteReport && codeContent && (
             <div className="w-full overflow-hidden mt-2">
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">(Generated code - Report data missing)</p>
                <SyntaxHighlighter
                  language="javascript"
                  style={vs2015}
                  className="rounded-md text-sm"
                  wrapLines={true}
                  customStyle={{ 
                    backgroundColor: 'rgb(30, 30, 30)', 
                    padding: '1rem',
                    marginTop: '0.5rem',
                    marginBottom: '0.5rem',
                    maxHeight: '400px',
                    overflowY: 'auto'
                  }}
                >
                  {codeContent}
                </SyntaxHighlighter>
              </div>
          )}
          
          {/* AI message content - completed state with text */}
          {!isUserMessage && message.status === 'completed' && !codeContent && message.aiResponseText && (
            <p className="whitespace-pre-wrap">{message.aiResponseText}</p>
          )}
        </div>
        
        {/* Message metadata */}
        <div className={`text-xs text-gray-500 dark:text-gray-400 mt-1 ${
          isUserMessage ? 'text-right' : ''
        }`}>
          {isUserMessage ? 'You' : 'AI'} • {formattedTime}
        </div>
      </div>

      {/* Report Viewer Modal */}
      {isCompleteReport && (
        <Modal isOpen={isReportModalOpen} onClose={() => setIsReportModalOpen(false)} size="2xl">
          <Modal.Header>Generated Report</Modal.Header>
          <Modal.Body padding="none"> {/* Remove padding for full iframe */}
            {console.log(`[ChatMessage] Rendering ReportViewer with reportInfo:`, { code: message.aiGeneratedCode, datasets: message.reportDatasets })}
            <ReportViewer 
              reportInfo={{ 
                  code: message.aiGeneratedCode, 
                  datasets: message.reportDatasets 
              }} 
              // themeName prop could be passed from context if needed
            />
          </Modal.Body>
          <Modal.Footer align="right">
            <Button variant="secondary" onClick={() => setIsReportModalOpen(false)}>
              Close
            </Button>
          </Modal.Footer>
        </Modal>
      )}
    </>
  );
};

export default ChatMessage; 