// frontend/src/features/dashboard/components/MessageBubble.jsx
// UPDATED VERSION - Properly handles report display

import React from 'react';
import { UserIcon, CpuChipIcon, ExclamationCircleIcon, DocumentChartBarIcon } from '@heroicons/react/24/solid';
import Spinner from '../../../shared/ui/Spinner';
import Button from '../../../shared/ui/Button';

const MessageBubble = ({ message, onViewReport }) => {
    const isUser = message.type === 'user';
    const isError = message.isError || message.contentType === 'error';
    const isLoading = message.isLoading;
    const isReportAvailable = message.contentType === 'report_available' && message.reportHtml;

    // --- Styles ---
    const bubbleBaseStyle = `max-w-[80%] lg:max-w-[70%] rounded-xl px-4 py-2.5 text-sm shadow-sm`;
    const bubbleAlignment = isUser ? 'ml-auto' : 'mr-auto';
    const bubbleColor = isUser
        ? 'bg-blue-600 text-white'
        : isError
            ? 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-700/50'
            : isReportAvailable
                ? 'bg-gray-100 dark:bg-gray-700/80 text-gray-800 dark:text-gray-100 border border-gray-200 dark:border-gray-600/50'
                : 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100';

    const iconBaseStyle = `h-6 w-6 rounded-full p-1 flex-shrink-0 self-start`;
    const userIconColor = `bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300`;
    const aiIconColor = isError
        ? `bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300`
        : `bg-gray-200 text-gray-600 dark:bg-gray-600 dark:text-gray-300`;

    // --- Content Rendering Logic ---
    const renderContent = () => {
        if (isLoading) {
            return (
                <div className="flex items-center gap-x-2 py-1">
                   <Spinner size="sm" color={isUser ? "text-white" : "text-gray-500"} />
                   <span className="italic text-gray-500 dark:text-gray-400">{message.content || "Processing..."}</span>
                </div>
            );
        }

        // --- Handle Report Available state ---
        if (isReportAvailable) {
            return (
                <div className="space-y-2">
                    <p>{message.content || "Report generated."}</p>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onViewReport(message.reportHtml)} // Pass only the HTML
                        leftIcon={DocumentChartBarIcon}
                    >
                        View Report
                    </Button>
                </div>
            );
        }

        // --- Handle Plain Text (User, Simple AI, Error) ---
        if (typeof message.content === 'string') {
             // Replace newline characters with <br /> for display
             return message.content.split('\n').map((line, index, arr) => (
                <React.Fragment key={index}>
                    {line || (index > 0 && index < arr.length -1 ? '\u00A0' : '')}
                    {index < arr.length - 1 && <br />}
                </React.Fragment>
            ));
        }

        // Fallback for unexpected content
        return <span className="italic text-gray-400">Unsupported message format</span>;
    };

    return (
        <div className={`flex items-start gap-x-3 ${isUser ? 'justify-end' : ''}`}>
            {/* AI/Error Icon */}
            {!isUser && (
                 <div className={`${iconBaseStyle} ${aiIconColor}`}>
                     {isError ? <ExclamationCircleIcon className="h-full w-full" /> : <CpuChipIcon className="h-full w-full" />}
                 </div>
            )}

            {/* Bubble Content */}
            <div className={`${bubbleBaseStyle} ${bubbleAlignment} ${bubbleColor}`}>
                {renderContent()}
            </div>

             {/* User Icon */}
             {isUser && (
                  <div className={`${iconBaseStyle} ${userIconColor}`}>
                      <UserIcon className="h-full w-full" />
                  </div>
             )}
        </div>
    );
};

export default MessageBubble;