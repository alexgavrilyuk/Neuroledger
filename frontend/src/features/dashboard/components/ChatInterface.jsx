// frontend/src/features/dashboard/components/ChatInterface.jsx
import React from 'react';
import MessageBubble from './MessageBubble';
import Spinner from '../../../shared/ui/Spinner';
import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline';

const ChatInterface = ({ messages = [], isLoading, onViewReport }) => {
    const hasMessages = messages.length > 0;

    return (
        <div className="relative min-h-[200px] space-y-1">
            {/* Empty state with subtle animation when no messages */}
            {!hasMessages && !isLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 animate-fadeIn">
                    <ChatBubbleLeftRightIcon className="h-12 w-12 mb-3 opacity-40" />
                    <p className="text-sm font-medium">Ask a question about your data to get started</p>
                    <p className="text-xs mt-1.5">Select a dataset before sending your prompt</p>
                </div>
            )}

            {/* Messages with improved spacing and animations */}
            <div className="space-y-6 py-2">
                {messages.map((msg) => (
                    <div
                        key={msg.id || `${msg.type}-${Date.now() * Math.random()}`}
                        className="transform transition-all duration-300 ease-out"
                    >
                        <MessageBubble
                            message={msg}
                            onViewReport={onViewReport}
                        />
                    </div>
                ))}
            </div>

            {/* Enhanced loading indicator - shown only if the most recent message isn't already a loading placeholder */}
            {isLoading && messages[messages.length - 1]?.isLoading !== true && (
                <div className="flex justify-start items-center gap-x-3 py-3 pl-9 animate-fadeIn">
                    <div className="bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 rounded-lg p-2.5 shadow-soft-sm dark:shadow-soft-dark-sm">
                        <Spinner
                            size="sm"
                            variant="circle"
                            color="text-blue-500 dark:text-blue-400"
                        />
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