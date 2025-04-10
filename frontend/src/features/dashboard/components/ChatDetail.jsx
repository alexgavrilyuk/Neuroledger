import React, { useRef, useEffect } from 'react';
import { useChat } from '../context/ChatContext';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import { HiOutlineChevronDoubleDown } from 'react-icons/hi';

/**
 * Component for displaying the main chat area with messages and input
 */
const ChatDetail = ({ onViewReport }) => {
  const { messages, currentSession, loading } = useChat();
  const messagesEndRef = useRef(null);
  
  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  if (!currentSession) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
        <div className="text-center">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            No chat selected
          </h3>
          <p className="text-gray-500 dark:text-gray-400">
            Select a chat from the sidebar or create a new one to get started.
          </p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col h-full">
      {/* Chat header */}
      <div className="border-b border-gray-200 dark:border-gray-700 p-4">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">
          {currentSession.title}
        </h2>
      </div>
      
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <p className="text-gray-500 dark:text-gray-400">
                No messages yet. Start the conversation!
              </p>
            </div>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <ChatMessage 
                key={message._id} 
                message={message} 
                onViewReport={onViewReport}
              />
            ))}
            {/* Invisible element for scrolling to bottom */}
            <div ref={messagesEndRef} />
            
            {/* Scroll to bottom button - only shown when not at bottom */}
            {messages.length > 5 && (
              <button 
                className="fixed bottom-32 right-10 bg-gray-200 dark:bg-gray-700 p-2 rounded-full shadow-md text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })}
              >
                <HiOutlineChevronDoubleDown size={20} />
              </button>
            )}
          </>
        )}
      </div>
      
      {/* Input area */}
      <div className="border-t border-gray-200 dark:border-gray-700 p-4">
        <ChatInput />
      </div>
    </div>
  );
};

export default ChatDetail; 