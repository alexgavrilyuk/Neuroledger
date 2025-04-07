import React from 'react';
import { ChatProvider } from './context/ChatContext';
import ChatSessionList from './components/ChatSessionList';
import ChatDetail from './components/ChatDetail';

/**
 * Main chat page component that combines the session list and chat detail view
 */
const ChatPage = () => {
  return (
    <ChatProvider>
      <div className="flex h-full">
        {/* Sidebar with chat sessions */}
        <div className="w-1/4 border-r border-gray-200 dark:border-gray-700 h-full">
          <ChatSessionList />
        </div>
        
        {/* Main chat area */}
        <div className="flex-1 h-full">
          <ChatDetail />
        </div>
      </div>
    </ChatProvider>
  );
};

export default ChatPage; 