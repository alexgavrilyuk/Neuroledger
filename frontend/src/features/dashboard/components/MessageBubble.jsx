// frontend/src/features/dashboard/components/MessageBubble.jsx
// ** NEW FILE **
import React from 'react';
import { UserIcon, CpuChipIcon } from '@heroicons/react/24/solid'; // Solid icons for bubbles
import Spinner from '../../../shared/ui/Spinner'; // Import Spinner

const MessageBubble = ({ message }) => {
    const isUser = message.type === 'user';
    const isError = message.isError; // Check for error flag
    const isLoading = message.isLoading; // Check for loading flag

    // Base styles common to both types
    const bubbleBaseStyle = `max-w-[80%] lg:max-w-[70%] rounded-xl px-4 py-2.5 text-sm shadow-sm`;

    // Styles specific to user vs AI
    const bubbleAlignment = isUser ? 'ml-auto' : 'mr-auto';
    const bubbleColor = isUser
        ? 'bg-blue-600 text-white'
        : isError
            ? 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-700/50' // Error specific style
            : 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100';

     // Icon specific styles
     const iconBaseStyle = `h-6 w-6 rounded-full p-1 flex-shrink-0`;
     const userIconColor = `bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300`;
     const aiIconColor = `bg-gray-200 text-gray-600 dark:bg-gray-600 dark:text-gray-300`;

    return (
        <div className={`flex items-start gap-x-3 ${isUser ? 'justify-end' : ''}`}>
            {/* Icon */}
            {!isUser && (
                 <div className={`${iconBaseStyle} ${aiIconColor}`}>
                     <CpuChipIcon className="h-full w-full" />
                 </div>
            )}

            {/* Bubble Content */}
            <div className={`${bubbleBaseStyle} ${bubbleAlignment} ${bubbleColor}`}>
                {isLoading ? (
                     <div className="flex items-center justify-center h-5">
                        <Spinner size="sm" color={isUser ? "text-white" : "text-gray-500"} />
                     </div>
                 ) : typeof message.content === 'string' && message.content.trim() === '' && !isLoading ? (
                     <span className="italic text-gray-400">Empty response</span>
                 ) : typeof message.content === 'string' ? (
                     // Render simple text, potentially handle markdown later
                      // Replace newline characters with <br /> for display
                      message.content.split('\n').map((line, index, arr) => (
                        <React.Fragment key={index}>
                            {line}
                            {index < arr.length - 1 && <br />}
                        </React.Fragment>
                    ))
                 ) : (
                     // Placeholder for structured content/artefacts later
                     <span className="italic">Unsupported message content</span>
                 )}
            </div>

             {/* Icon */}
             {isUser && (
                  <div className={`${iconBaseStyle} ${userIconColor}`}>
                      <UserIcon className="h-full w-full" />
                  </div>
             )}

        </div>
    );
};

export default MessageBubble;