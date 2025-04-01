// frontend/src/features/dashboard/components/ChatInterface.jsx
// ** UPDATED FILE - Pass onViewReport handler down **
import React from 'react';
import MessageBubble from './MessageBubble';
import Spinner from '../../../shared/ui/Spinner';

const ChatInterface = ({ messages = [], isLoading, onViewReport }) => { // Added onViewReport prop
    return (
        <div className="space-y-4">
            {messages.map((msg) => (
                <MessageBubble
                    key={msg.id || `${msg.type}-${Date.now() * Math.random()}`}
                    message={msg}
                    onViewReport={onViewReport} // Pass the handler down
                />
            ))}
             {/* Generic loading indicator at the end if API call is in progress AND the last message isn't already a loading placeholder */}
            {isLoading && messages[messages.length - 1]?.isLoading !== true && (
                <div className="flex justify-start items-center gap-x-3 py-2 pl-9"> {/* Align with AI icon */}
                     <Spinner size="sm" />
                     <span className="text-xs italic text-gray-500 dark:text-gray-400">Processing...</span>
                </div>
            )}
        </div>
    );
};

export default ChatInterface;