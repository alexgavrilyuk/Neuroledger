import React, { useEffect } from 'react';
import { useChat } from '../context/ChatContext';
import { formatDistanceToNow } from 'date-fns';
import ChatSessionItem from './ChatSessionItem';

/**
 * Displays a list of chat sessions and provides options to create/manage them
 */
const ChatSessionList = () => {
  const { 
    sessions, 
    currentSession, 
    loadSessions, 
    setCurrentSession, 
    createNewSession,
    loading
  } = useChat();

  // Load sessions on component mount
  useEffect(() => {
    loadSessions();
  }, []);

  // Handle creating a new chat session
  const handleCreateSession = async () => {
    await createNewSession();
  };

  return (
    <div className="w-full h-full flex flex-col bg-gray-50 dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white">Chat Sessions</h2>
      </div>
      
      <div className="p-3">
        <button
          onClick={handleCreateSession}
          className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition-colors flex items-center justify-center"
          disabled={loading}
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          New Chat
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        {loading && sessions.length === 0 ? (
          <div className="flex justify-center p-4">
            <div className="animate-pulse text-gray-500 dark:text-gray-400">Loading sessions...</div>
          </div>
        ) : sessions.length === 0 ? (
          <div className="p-4 text-center text-gray-500 dark:text-gray-400">
            No chat sessions yet. Create one to get started.
          </div>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {sessions.map(session => (
              <ChatSessionItem 
                key={session._id}
                session={session}
                isActive={currentSession?._id === session._id}
                onClick={() => setCurrentSession(session)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default ChatSessionList; 