// frontend/src/features/dashboard/components/ChatInterface.jsx
// --- UPDATED FILE ---

import React from 'react';
import MessageBubble from './MessageBubble';
import Spinner from '../../../shared/ui/Spinner';
import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline';
import { useChat } from '../context/ChatContext'; // Keep useChat for context info maybe

const ChatInterface = ({ messages = [], isLoading, currentSession, onViewReport }) => { // Receive onViewReport from DashboardPage
    const hasMessages = messages.length > 0;

    return (
        <div className="relative min-h-[200px] space-y-1">
            {/* Empty state */}
            {!hasMessages && !isLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 animate-fadeIn">
                    {currentSession ? (
                        <>
                            <ChatBubbleLeftRightIcon className="h-12 w-12 mb-3 opacity-40" />
                            <p className="text-sm font-medium">Start your conversation about your data</p>
                            <p className="text-xs mt-1.5">{currentSession.title}</p>
                        </>
                    ) : (
                        <>
                            <ChatBubbleLeftRightIcon className="h-12 w-12 mb-3 opacity-40" />
                            <p className="text-sm font-medium">Select or create a chat session</p>
                            <p className="text-xs mt-1.5">Each chat keeps context between messages</p>
                        </>
                    )}
                </div>
            )}

            {/* Messages List */}
            <div className="space-y-6 py-2">
                {messages.map((msg) => {
                    // Use the message's unique _id from the database as the key
                    const key = msg._id;
                    if (!key) {
                         // Log error but potentially still render with a less stable key
                         console.error("CRITICAL: Rendering message without a unique _id!", msg);
                         // return null; // Or render an error placeholder
                    }
                    return (
                        <div key={key || `msg-${Math.random()}`} className="transform transition-all duration-300 ease-out">
                            <MessageBubble
                                message={msg}
                                // Pass the original onViewReport prop directly down
                                onViewReport={onViewReport}
                            />
                        </div>
                    );
                })}
            </div>

            {/* Loading indicator (keep as is) */}
            {isLoading && messages.length > 0 && !messages[messages.length - 1]?.isLoading && messages[messages.length - 1]?.status !== 'processing' && (
                 <div className="flex justify-start items-center gap-x-3 py-3 pl-9 animate-fadeIn">
                     <div className="bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 rounded-lg p-2.5 shadow-soft-sm dark:shadow-soft-dark-sm">
                         <Spinner size="sm" variant="circle" color="text-blue-500 dark:text-blue-400" />
                     </div>
                     <span className="text-xs italic text-gray-500 dark:text-gray-400 font-medium">
                         Processing your request...
                     </span>
                 </div>
             )}
        </div>
    );
};

export default ChatInterface;