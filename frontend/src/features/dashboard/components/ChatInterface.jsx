// frontend/src/features/dashboard/components/ChatInterface.jsx
// ** NEW FILE **
import React from 'react';
import MessageBubble from './MessageBubble';
import Spinner from '../../../shared/ui/Spinner'; // Import Spinner

const ChatInterface = ({ messages = [], isLoading }) => {
    return (
        <div className="space-y-4">
            {messages.map((msg) => (
                 // Use msg.id as key if available, otherwise fallback to index+type
                <MessageBubble key={msg.id || `${msg.type}-${Date.now() * Math.random()}`} message={msg} />
            ))}
             {/* Display a generic loading indicator at the end if the last message isn't already marked as loading */}
            {isLoading && messages[messages.length - 1]?.isLoading !== true && (
                <div className="flex justify-center py-2">
                    <Spinner size="sm" />
                </div>
            )}
        </div>
    );
};

export default ChatInterface;