import React from 'react';
import { ChatProvider } from '../context/ChatContext';
import { ChatSessionList, ChatDetail } from '../components';

/**
 * Main chat page component that combines the session list and chat detail view
 */
const ChatPage = () => {
  // Handler for opening the report viewer
  const handleViewReport = (reportInfo) => {
    // This could be implemented to show the report viewer directly
    // or could use a modal/context state to manage this
    console.log('View report:', reportInfo);
  };

  return (
    <ChatProvider>
      <div className="flex h-full">
        {/* Sidebar with chat sessions */}
        <div className="w-1/4 border-r border-gray-200 dark:border-gray-700 h-full">
          <ChatSessionList />
        </div>
        
        {/* Main chat area */}
        <div className="flex-1 h-full">
          <ChatDetail onViewReport={handleViewReport} />
        </div>
      </div>
    </ChatProvider>
  );
};

export default ChatPage; 